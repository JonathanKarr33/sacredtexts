"""Scoring: strict exactness AND graded similarity, per answer (the group's open
question — Nancy leans toward testing both, so every answer gets both).

Metrics emitted per answer:

- ``exact``       raw string equality with the expected text (0/1)
- ``normalized``  equality after normalisation: unicode quotes/dashes folded,
                  case-folded, punctuation stripped, whitespace collapsed (0/1)
- ``token_f1``    bag-of-words F1 between normalised answer and expected text
                  (0..1) — the v1 "semantic similarity" stand-in; embedding- or
                  judge-based semantic scoring is a later, pluggable metric
- ``correct``     the per-task headline judgment (see below)

Per-task headline rule:

- retrieve_quote / complete_unit : ``normalized`` match (strict reported alongside)
- verify_source                  : parsed leading Yes/No equals expected
- identify_version               : normalised expected version appears in answer
- cite_passage                   : normalised citation appears in answer
- identify_source                : work AND citation both appear (citation
                                   matching is lenient on punctuation only —
                                   "Jude 1:3" != "Jude 1:4" stays wrong)
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


class ScoreError(Exception):
    pass


_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WS_RE = re.compile(r"\s+")

# Similarity sub-metrics reported per task (the spec's per-task contract table).
_SUBMETRICS = {
    "retrieve_quote": ("exact", "normalized", "token_f1"),
    "complete_unit": ("exact", "normalized", "token_f1"),
    "identify_version": ("exact", "normalized"),
}


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-")
    text = _PUNCT_RE.sub(" ", text.casefold())
    return _WS_RE.sub(" ", text).strip()


def token_f1(answer: str, expected: str) -> float:
    a, e = normalize(answer).split(), normalize(expected).split()
    if not a or not e:
        return 0.0
    overlap = sum((Counter(a) & Counter(e)).values())
    if overlap == 0:
        return 0.0
    precision, recall = overlap / len(a), overlap / len(e)
    return 2 * precision * recall / (precision + recall)


def parse_yes_no(answer: str) -> str | None:
    m = re.search(r"\b(yes|no)\b", normalize(answer))
    return m.group(1) if m else None


def _contains(answer: str, needle: str) -> bool:
    return normalize(needle) in normalize(answer)


# A citation SPAN: the numeric/para token WITH its leading work/book words
# ("John 1:1", "1 Nephi 3:7", "Taanit 2a:1", "2:255", "Rerum Novarum, para. 5"),
# so a cross-book hedge ("John 1:1, Genesis 1:1, or Micah 1:1") is three distinct
# candidates, not one. (Number-only citations, e.g. a bare hadith number, are not
# span-extracted — Arabic corpora are a follow-on; the first run is English.)
_COLON_CITE = re.compile(r"(?:[A-Z0-9][^\s,:]*\s+){0,8}\d+[ab]?\s*:\s*\d+")
_PARA_CITE = re.compile(r"(?:[A-Z0-9][^\s,]*,?\s+){0,8}[Pp]ara\.?\s*\d+")
# Number-only citation (hadith "Sahih al-Bukhari 1"): >=1 capitalized leading word
# and a TERMINAL number — not a chapter:verse (guarded by the negative lookahead),
# so it never double-counts a colon citation.
_NUM_CITE = re.compile(r"(?:[A-Z][^\s,:]*\s+){1,8}\d+(?![\d:ab])")


def _citation_candidates(answer: str) -> set[str]:
    spans: set[str] = set()
    for rx in (_COLON_CITE, _PARA_CITE, _NUM_CITE):
        for m in rx.finditer(answer):
            spans.add(normalize(m.group(0)))
    return spans


def _bounded_equal(answer: str, expected: str) -> bool:
    """The full normalized expected citation appears with word boundaries (so
    ``Jude 1:3`` does not match ``Jude 1:30``), not mere substring containment."""
    ne = normalize(expected)
    return re.search(r"(?<!\w)" + re.escape(ne) + r"(?!\w)", normalize(answer)) is not None


def _single_citation_correct(answer: str, expected_citation: str) -> tuple[int, int]:
    """Returns (correct, n_candidates). A multi-candidate answer scores 0; otherwise
    the single candidate must EQUAL ground truth (boundary-aware, not containment)."""
    n = len(_citation_candidates(answer))
    if n > 1:
        return 0, n  # offered more than one citation candidate -> hedge
    return int(_bounded_equal(answer, expected_citation)), n


def score_answer(task: str, answer: str, expected: dict) -> dict:
    """Score one model answer. Returns the metrics dict described in the module docstring."""
    if task in ("retrieve_quote", "complete_unit"):
        target = expected["text"]
        exact = int(answer.strip() == target.strip())
        norm = int(normalize(answer) == normalize(target))
        f1 = token_f1(answer, target)
        return {"exact": exact, "normalized": norm, "token_f1": round(f1, 4), "correct": norm}
    if task == "verify_source":
        parsed = parse_yes_no(answer)
        correct = int(parsed == expected["answer"])
        return {"parsed": parsed, "expected": expected["answer"], "correct": correct}
    if task == "identify_version":
        # the answer must BE the version label (exact/normalized), so an evasive
        # "KJV or WEB" or "not the KJV, it's the ASV" does not score correct
        version = expected["version"]
        exact = int(answer.strip() == version)
        norm = int(normalize(answer) == normalize(version))
        return {"exact": exact, "normalized": norm, "correct": norm}
    if task == "cite_passage":
        correct, n = _single_citation_correct(answer, expected["citation"])
        return {"correct": correct, "n_candidates": n}
    if task == "identify_source":
        work_found = int(_contains(answer, expected["work"]))
        citation_ok, n = _single_citation_correct(answer, expected["citation"])
        return {
            "work_found": work_found,
            "citation_found": citation_ok,
            "n_candidates": n,
            "correct": int(work_found and citation_ok),
        }
    raise ScoreError(f"unknown task {task!r}")


def score_file(
    answers_path: Path, scores_path: Path, expected: dict[tuple[str, str], int] | None = None
) -> dict:
    """Score every answer row; write per-answer scores and return the summary dict.

    Scoring sees only successful answer rows (``collect`` leaves failed cells
    pending and exits non-zero). Pass ``expected`` — a ``{(model_id, task): count}``
    roster (the panel × question set) — to **represent missing/failed cells**: each
    cell then reports ``expected_n`` and ``missing``, and a model whose cells ALL
    failed still appears (``n=0``, everything missing) instead of vanishing. Without
    it, the summary reflects only what is present (a model missing some tasks renders
    ``—`` for them)."""
    if not answers_path.exists():
        raise ScoreError(f"{answers_path}: no answers file")
    rows = []
    with open(answers_path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            d = json.loads(line)
            for key in ("question_id", "model_id", "task", "answer", "question"):
                if key not in d:
                    raise ScoreError(f"{answers_path}:{line_no}: answer row missing '{key}'")
            rows.append(d)
    if not rows:
        raise ScoreError(f"{answers_path}: no answer rows")

    # all answers must come from one question set (collect stamps the digest on
    # every row); a missing digest means a foreign/pre-digest file
    digests = {d.get("question_set_digest") for d in rows}
    if None in digests or "" in digests:
        raise ScoreError(
            f"{answers_path}: answer row(s) carry no question_set_digest — refusing a "
            "foreign/legacy answers file"
        )
    if len(digests) > 1:
        raise ScoreError(
            f"{answers_path}: mixes {len(digests)} question sets {sorted(digests)} — "
            "answers from different generate runs must not be scored together"
        )

    scores_path.parent.mkdir(parents=True, exist_ok=True)
    per_cell: dict[tuple[str, str], dict] = {}  # (model_id, task) -> accumulators
    per_trad: dict[tuple[str, str, str], dict] = {}  # (model_id, tradition, task) -> {n, correct}
    with open(scores_path, "w", encoding="utf-8") as out:
        for d in rows:
            metrics = score_answer(d["task"], d["answer"], d["question"]["expected"])
            out.write(
                json.dumps(
                    {
                        "question_id": d["question_id"],
                        "model_id": d["model_id"],
                        "task": d["task"],
                        "metrics": metrics,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            acc = per_cell.setdefault(
                (d["model_id"], d["task"]),
                {"n": 0, "correct": 0, "exact": 0, "normalized": 0, "token_f1": 0.0},
            )
            acc["n"] += 1
            acc["correct"] += metrics["correct"]
            acc["exact"] += metrics.get("exact", 0)
            acc["normalized"] += metrics.get("normalized", 0)
            acc["token_f1"] += metrics.get("token_f1", 0.0)
            # tradition breakdown: count this observation once PER listed tradition
            for trad in d.get("question", {}).get("source", {}).get("tradition", []) or []:
                tacc = per_trad.setdefault((d["model_id"], trad, d["task"]), {"n": 0, "correct": 0})
                tacc["n"] += 1
                tacc["correct"] += metrics["correct"]

    expected = expected or {}
    summary: dict = {"models": {}, "by_tradition": {}}
    # every (model, task) that was answered OR was expected (so a fully-failed
    # model/task is represented, not dropped)
    all_cells = set(per_cell) | set(expected)
    for (model_id, task) in sorted(all_cells):
        acc = per_cell.get((model_id, task))
        if acc:
            cell = {"n": acc["n"], "accuracy": round(acc["correct"] / acc["n"], 4)}
            for sm in _SUBMETRICS.get(task, ()):
                cell[sm] = round(acc[sm] / acc["n"], 4)
        else:
            cell = {"n": 0, "accuracy": 0.0}
        if (model_id, task) in expected:
            cell["expected_n"] = expected[(model_id, task)]
            cell["missing"] = max(expected[(model_id, task)] - cell["n"], 0)
        summary["models"].setdefault(model_id, {})[task] = cell
    # _overall from RAW counts (not a lossy round(accuracy*n) reconstruction)
    for model_id in summary["models"]:
        cells = [acc for (m, _), acc in per_cell.items() if m == model_id]
        total_n = sum(c["n"] for c in cells)
        total_correct = sum(c["correct"] for c in cells)
        ov = {"n": total_n, "accuracy": round(total_correct / total_n, 4) if total_n else 0.0}
        exp_total = sum(v for (m, _), v in expected.items() if m == model_id)
        if exp_total:
            ov["expected_n"] = exp_total
            ov["missing"] = max(exp_total - total_n, 0)
        summary["models"][model_id]["_overall"] = ov
    # per-model x tradition x task (each observation counted once per listed
    # tradition, so a tradition's n can exceed the overall count); overall-once
    # lives in summary["models"].
    for (model_id, trad, task), tacc in sorted(per_trad.items()):
        cell = {"n": tacc["n"], "accuracy": round(tacc["correct"] / tacc["n"], 4)}
        summary["by_tradition"].setdefault(model_id, {}).setdefault(trad, {})[task] = cell
    for model_id, trads in summary["by_tradition"].items():
        for trad, tasks in trads.items():
            raw = [per_trad[(model_id, trad, t)] for t in tasks]  # raw counts, not rounded
            tn = sum(c["n"] for c in raw)
            tc = sum(c["correct"] for c in raw)
            tasks["_overall"] = {"n": tn, "accuracy": round(tc / tn, 4)}
    return summary


def _cell_str(c: dict | None) -> str:
    """Render one table cell: '—' if absent, 'miss N' if expected-but-unanswered,
    'acc% (n=N)' otherwise, with a '−missing' suffix when some cells are missing."""
    if c is None:
        return "—"
    if c["n"] == 0:
        return f"miss {c['missing']}" if c.get("missing") else "—"
    s = f"{c['accuracy']:.0%} (n={c['n']})"
    if c.get("missing"):
        s += f" −{c['missing']}"
    return s


def summary_markdown(summary: dict) -> str:
    """Render the summary: a models × tasks table, then a per-tradition breakdown.
    Missing model×task cells are shown ('—' / 'miss N'), never dropped."""
    models = summary["models"]
    tasks = sorted({t for m in models.values() for t in m if t != "_overall"})
    lines = ["| model | " + " | ".join(tasks) + " | overall |", "|" + "---|" * (len(tasks) + 2)]
    ranked = sorted(models.items(), key=lambda kv: -kv[1]["_overall"]["accuracy"])
    for model_id, cells in ranked:
        row = [model_id] + [_cell_str(cells.get(t)) for t in tasks]
        ov = cells["_overall"]
        overall = f"**{ov['accuracy']:.0%}**"
        if ov.get("missing"):
            overall += f" −{ov['missing']}"
        row.append(overall)
        lines.append("| " + " | ".join(row) + " |")

    by_trad = summary.get("by_tradition") or {}
    if by_trad:
        lines += ["", "### By tradition (each observation counts once per listed tradition)"]
        lines += ["| model | tradition | " + " | ".join(tasks) + " | overall |", "|" + "---|" * (len(tasks) + 3)]
        for model_id in sorted(by_trad):
            for trad in sorted(by_trad[model_id]):
                cells = by_trad[model_id][trad]
                row = [model_id, trad] + [_cell_str(cells.get(t)) for t in tasks]
                row.append(f"**{cells['_overall']['accuracy']:.0%}** (n={cells['_overall']['n']})")
                lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines) + "\n"
