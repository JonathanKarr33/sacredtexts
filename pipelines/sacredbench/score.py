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


# A citation token: chapter:verse / surah:ayah / Talmud daf "2a:1" / encyclical "para. 5".
# (Number-only citations like a hadith number fall back to containment — Arabic
# corpora are a follow-on; the first run is English.)
_CITATION_TOKEN = re.compile(r"\d+[ab]?\s*:\s*\d+|para\.?\s*\d+", re.IGNORECASE)


def _citation_candidates(answer: str) -> set[str]:
    return {re.sub(r"\s+", "", m.group(0).lower()) for m in _CITATION_TOKEN.finditer(answer)}


def _single_citation_correct(answer: str, expected_citation: str) -> int:
    """Anti-hedge: a multi-candidate answer ('could be A, B, or C') scores 0; a
    single citation matching the expected one scores 1."""
    if len(_citation_candidates(answer)) > 1:
        return 0  # offered more than one citation candidate -> hedge
    return int(_contains(answer, expected_citation))


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
        return {"correct": int(_contains(answer, expected["version"]))}
    if task == "cite_passage":
        return {"correct": _single_citation_correct(answer, expected["citation"])}
    if task == "identify_source":
        work_found = int(_contains(answer, expected["work"]))
        citation_ok = _single_citation_correct(answer, expected["citation"])
        return {
            "work_found": work_found,
            "citation_found": citation_ok,
            "correct": int(work_found and citation_ok),
        }
    raise ScoreError(f"unknown task {task!r}")


def score_file(answers_path: Path, scores_path: Path) -> dict:
    """Score every answer row; write per-answer scores and return the summary dict."""
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

    summary: dict = {"models": {}, "by_tradition": {}}
    for (model_id, task), acc in sorted(per_cell.items()):
        cell = {"n": acc["n"], "accuracy": round(acc["correct"] / acc["n"], 4)}
        if task in ("retrieve_quote", "complete_unit"):
            cell["exact"] = round(acc["exact"] / acc["n"], 4)
            cell["normalized"] = round(acc["normalized"] / acc["n"], 4)
            cell["token_f1"] = round(acc["token_f1"] / acc["n"], 4)
        summary["models"].setdefault(model_id, {})[task] = cell
    # _overall from RAW counts (not a lossy round(accuracy*n) reconstruction)
    for model_id in summary["models"]:
        cells = [acc for (m, _), acc in per_cell.items() if m == model_id]
        total_n = sum(c["n"] for c in cells)
        total_correct = sum(c["correct"] for c in cells)
        summary["models"][model_id]["_overall"] = {
            "n": total_n, "accuracy": round(total_correct / total_n, 4)
        }
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


def summary_markdown(summary: dict) -> str:
    """Render the summary: a models × tasks table, then a per-tradition breakdown
    (missing model×task cells shown as '—', never dropped)."""
    models = summary["models"]
    tasks = sorted({t for m in models.values() for t in m if t != "_overall"})
    lines = ["| model | " + " | ".join(tasks) + " | overall |", "|" + "---|" * (len(tasks) + 2)]
    ranked = sorted(models.items(), key=lambda kv: -kv[1]["_overall"]["accuracy"])
    for model_id, cells in ranked:
        row = [model_id]
        for t in tasks:
            c = cells.get(t)
            row.append(f"{c['accuracy']:.0%} (n={c['n']})" if c else "—")
        row.append(f"**{cells['_overall']['accuracy']:.0%}**")
        lines.append("| " + " | ".join(row) + " |")

    by_trad = summary.get("by_tradition") or {}
    if by_trad:
        lines += ["", "### By tradition (each observation counts once per listed tradition)"]
        lines += ["| model | tradition | " + " | ".join(tasks) + " | overall |", "|" + "---|" * (len(tasks) + 3)]
        for model_id in sorted(by_trad):
            for trad in sorted(by_trad[model_id]):
                cells = by_trad[model_id][trad]
                row = [model_id, trad]
                for t in tasks:
                    c = cells.get(t)
                    row.append(f"{c['accuracy']:.0%} (n={c['n']})" if c else "—")
                row.append(f"**{cells['_overall']['accuracy']:.0%}** (n={cells['_overall']['n']})")
                lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines) + "\n"
