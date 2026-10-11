"""Scoring: strict exactness AND graded similarity, per answer (the group's open
question — Nancy leans toward testing both, so every answer gets both).

Metrics emitted per answer:

- ``exact``       raw string equality with the expected text (0/1)
- ``normalized``  equality after normalisation: unicode quotes/dashes folded,
                  Arabic/Hebrew combining marks + annotation symbols removed and
                  alef/maqaf variants folded (so vocalised ↔ unvocalised scripture
                  matches), case-folded, punctuation stripped, whitespace collapsed
                  (0/1) — see ``strip_script_marks``
- ``token_f1``    bag-of-words F1 between normalised answer and expected text
                  (0..1) — the v1 "semantic similarity" stand-in; embedding- or
                  judge-based semantic scoring is a later, pluggable metric
- ``correct``     the per-task headline judgment (see below)

Per-task headline rule (the spec's contract — designed to resist evasive answers so
that containment alone cannot game provenance honesty, within the SCOPE noted below):

- retrieve_quote / complete_unit : ``normalized`` match (exact + token-F1 alongside)
- verify_source                  : parsed leading Yes/No equals expected
- identify_version               : the answer, normalised, EQUALS the version label
                                   (exact + normalized reported) — an evasive
                                   "KJV or WEB" or "not the KJV, the ASV" scores 0
- cite_passage                   : the SINGLE extracted citation EQUALS ground truth
                                   (boundary-aware, not containment); a multi-candidate
                                   hedge scores 0, a repeated correct citation does not
- identify_source                : work present AND a single citation equals ground
                                   truth (same anti-hedge rule as cite_passage)

SCOPE / known gaps (the first run is ``retrieve_quote``-only, so these affect no
reported number; tracked for the Spec 2 scoring-contract revision):
- the citation anti-hedge counts only FORMALLY-SHAPED citation candidates, so a
  PROSE hedge ("it could be Jude 1:3, or perhaps chapter 1 verse 4") is not caught.
- ``verify_source`` uses the first Yes/No token and ``identify_source``'s work check
  is substring containment — both are gameable by negation ("it is NOT from X");
  since every corpus embeds the work in the citation, the work check collapses into
  the citation check. These tasks must be hardened before any verify_source /
  identify_source number is reported.
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

# The RTL Unicode blocks (U+0590–U+08FF is Hebrew + Arabic + their extensions — and also
# Syriac/Thaana/N'Ko/Samaritan/Mandaic, whose marks we strip too; harmless for this
# benchmark's Arabic/Hebrew corpora; plus U+FB1D–U+FB4F Hebrew/Arabic presentation forms).
# Combining marks (category Mn) ANYWHERE in these blocks are deleted — a strict superset
# of the QUL mark set, so a search-on answer carrying marks from another Uthmani
# digitization (U+0617–U+061A, U+0656–U+065F, Arabic Extended-A U+08D3–U+08FF) is still
# folded, not split mid-word. The ranges are script-scoped, so Latin combining marks
# (U+0300–U+036F) are untouched and Latin output is byte-for-byte unchanged.
#
# NOT handled here (deliberately): invisible bidi/joiner/BOM formatting from the General
# Punctuation block (U+200C–U+200F, U+FEFF, U+00AD) that can ride along in web-fetched RTL
# answers. Deleting them globally would change the Latin path (soft hyphen currently folds
# to a space, which the committed first-run relies on), breaking the Latin-invariance
# contract — the re-score regression guard enforces this. They are a Phase-3 answer-review
# watch item (a split answer is visible there), not a Phase-1 concern (no committed corpus
# text carries them).
_SCRIPT_BLOCKS = ((0x0590, 0x08FF), (0xFB1D, 0xFB4F))
# Editorial code points in those blocks that are NOT category Mn and so must be deleted
# explicitly: the Arabic tatweel (Lm) and the Qur'anic annotation block U+06D6–U+06ED,
# which mixes Mn marks with the rub-el-hizb / sajdah symbols (So) and small waw/yeh (Lm).
_SCRIPT_EDITORIAL = frozenset("ـ") | frozenset(chr(c) for c in range(0x06D6, 0x06EE))


def _in_script_blocks(ch: str) -> bool:
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in _SCRIPT_BLOCKS)


def strip_script_marks(text: str) -> str:
    """Fold Arabic/Hebrew letter variants and remove their combining marks so quote
    scoring compares bare consonantal text. Latin (and every other script) is
    untouched. Applied to BOTH the answer and the expected text, so the direction of
    vocalisation does not matter (a vocalised model answer vs. an unvocalised expected
    scores the same as the reverse)."""
    text = text.replace("ٱ", "ا")  # Arabic alef-wasla -> bare alef (atomic;
    #                                           alef-madda/hamza fold via NFKD + marks)
    text = text.replace("־", " ")  # Hebrew maqaf -> word boundary (NOT deleted:
    #                                      it joins words, so it must stay a separator)
    # delete combining marks (Mn) + the non-Mn editorial code points, but only within
    # the RTL blocks — so the mark/annotation stripping never reaches Latin.
    return "".join(
        ch for ch in text
        if not (
            _in_script_blocks(ch)
            and (unicodedata.category(ch) == "Mn" or ch in _SCRIPT_EDITORIAL)
        )
    )

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
    text = strip_script_marks(text)  # Arabic/Hebrew marks BEFORE the punctuation pass,
    #                                  so they are removed, not turned into word splits
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
# Citation span extractors (prefix is case-insensitive so lowercase answers are
# still extracted and lowercase hedges are still counted). The extractor is chosen
# by the SHAPE of the ground-truth citation — a colon citation only counts colon
# spans, so an incidental "ASV 1901" or "Chapter 1" is not a spurious candidate.
_COLON_CITE = re.compile(r"(?:[A-Za-z0-9][^\s,:]*\s+){0,8}\d+[ab]?\s*:\s*\d+")
# the (?![Pp]ara) guard stops the greedy prefix from swallowing an earlier
# "para. N", so each paragraph citation in a hedge is its own candidate
_PARA_CITE = re.compile(r"(?:(?![Pp]ara)[A-Za-z0-9][^\s,]*,?\s+){0,8}[Pp]ara\.?\s*\d+")
# number-only (hadith "Sahih al-Bukhari 1"): >=1 leading word + a TERMINAL number
_NUM_CITE = re.compile(r"(?:[A-Za-z][^\s,:]*\s+){1,8}\d+(?![\d:ab])")


def _shape_rx(expected_citation: str) -> "re.Pattern[str]":
    if re.search(r"\d\s*:\s*\d", expected_citation):
        return _COLON_CITE
    if re.search(r"[Pp]ara", expected_citation):
        return _PARA_CITE
    return _NUM_CITE


def _citation_candidates(answer: str, expected_citation: str) -> set[str]:
    rx = _shape_rx(expected_citation)
    return {normalize(m.group(0)) for m in rx.finditer(answer)}


def _bounded_equal(answer: str, expected: str) -> bool:
    """The full normalized expected citation appears with word boundaries (so
    ``Jude 1:3`` does not match ``Jude 1:30``), not mere substring containment."""
    ne = normalize(expected)
    return re.search(r"(?<!\w)" + re.escape(ne) + r"(?!\w)", normalize(answer)) is not None


def _single_citation_correct(answer: str, expected_citation: str) -> tuple[int, int]:
    """Returns (correct, n_candidates). A multi-candidate answer scores 0; otherwise
    the single candidate must EQUAL ground truth (boundary-aware, not containment).

    Spans that all assert the EXPECTED citation count as ONE candidate however many
    times the model repeats it ("It is Jude 1:3. Jude 1:3 warns…") — repetition is
    not a hedge; only distinct OTHER citations are."""
    cands = _citation_candidates(answer, expected_citation)
    ne = normalize(expected_citation)
    boundary = re.compile(r"(?<!\w)" + re.escape(ne) + r"(?!\w)")
    matching = {c for c in cands if boundary.search(c)}
    others = cands - matching
    n = (1 if matching else 0) + len(others)
    if n > 1:
        return 0, n  # offered more than one DISTINCT citation candidate -> hedge
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
    answers_path: Path, scores_path: Path, expected: dict[tuple[str, str], int] | None = None,
    expected_tradition: dict[tuple[str, str, str], int] | None = None,
    panel: dict[str, dict] | None = None,
    expected_digest: str | None = None,
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
    # bind to the question set the roster was built from: scoring run A's answers
    # against run B's questions would silently produce a wrong roster / panel
    if expected_digest is not None:
        answers_digest = next(iter(digests))
        if answers_digest != expected_digest:
            raise ScoreError(
                f"{answers_path}: answers' question_set_digest {answers_digest} does not match "
                f"the --questions digest {expected_digest} — scoring answers against a different "
                "question set than they were collected for; point --questions at the matching set"
            )

    scores_path.parent.mkdir(parents=True, exist_ok=True)
    per_cell: dict[tuple[str, str], dict] = {}  # (model_id, task) -> accumulators
    per_trad: dict[tuple[str, str, str], dict] = {}  # (model_id, tradition, task) -> {n, correct}
    usage: dict[str, dict] = {}  # model_id -> {calls, in, out, model, served_by{host:count}}
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
            # token usage for cost accounting (recorded per answer row by collect)
            u = d.get("usage") or {}
            um = usage.setdefault(
                d["model_id"], {"calls": 0, "in": 0, "out": 0, "model": d.get("model"), "served_by": {}}
            )
            um["calls"] += 1
            um["in"] += int(u.get("in", 0) or 0)
            um["out"] += int(u.get("out", 0) or 0)
            host = u.get("provider")  # OpenRouter reports the upstream serving host
            if host:
                um["served_by"][host] = um["served_by"].get(host, 0) + 1
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
            cell = {"n": 0, "accuracy": None}  # no data (not a 0% score)
        if (model_id, task) in expected:
            cell["expected_n"] = expected[(model_id, task)]
            cell["missing"] = max(expected[(model_id, task)] - cell["n"], 0)
        summary["models"].setdefault(model_id, {})[task] = cell
    # _overall from RAW counts (not a lossy round(accuracy*n) reconstruction)
    for model_id in summary["models"]:
        cells = [acc for (m, _), acc in per_cell.items() if m == model_id]
        total_n = sum(c["n"] for c in cells)
        total_correct = sum(c["correct"] for c in cells)
        ov = {"n": total_n, "accuracy": round(total_correct / total_n, 4) if total_n else None}
        exp_total = sum(v for (m, _), v in expected.items() if m == model_id)
        if exp_total:
            ov["expected_n"] = exp_total
            ov["missing"] = max(exp_total - total_n, 0)
        summary["models"][model_id]["_overall"] = ov
    # per-model x tradition x task (each observation counted once per listed
    # tradition, so a tradition's n can exceed the overall count); overall-once
    # lives in summary["models"]. A tradition-aware roster surfaces missing/failed
    # cells here too (a fully-failed model x tradition x task is not dropped).
    expected_tradition = expected_tradition or {}
    all_trad_cells = set(per_trad) | set(expected_tradition)
    for (model_id, trad, task) in sorted(all_trad_cells):
        tacc = per_trad.get((model_id, trad, task))
        if tacc:
            cell = {"n": tacc["n"], "accuracy": round(tacc["correct"] / tacc["n"], 4)}
        else:
            cell = {"n": 0, "accuracy": None}
        if (model_id, trad, task) in expected_tradition:
            cell["expected_n"] = expected_tradition[(model_id, trad, task)]
            cell["missing"] = max(expected_tradition[(model_id, trad, task)] - cell["n"], 0)
        summary["by_tradition"].setdefault(model_id, {}).setdefault(trad, {})[task] = cell
    for model_id, trads in summary["by_tradition"].items():
        for trad, tasks in trads.items():
            raw = [per_trad.get((model_id, trad, t), {"n": 0, "correct": 0}) for t in tasks]
            tn = sum(c["n"] for c in raw)
            tc = sum(c["correct"] for c in raw)
            ov = {"n": tn, "accuracy": round(tc / tn, 4) if tn else None}
            exp_total = sum(v for (m, tr, _), v in expected_tradition.items() if m == model_id and tr == trad)
            if exp_total:
                ov["expected_n"] = exp_total
                ov["missing"] = max(exp_total - tn, 0)
            tasks["_overall"] = ov

    # Token usage totals (cost accounting). Prices are NOT invented: a cost appears
    # only for models whose panel entry supplied price_in/price_out ($ per 1M tokens).
    panel = panel or {}
    per_model_usage: dict[str, dict] = {}
    total = {"calls": 0, "in": 0, "out": 0}
    cost_total = 0.0
    n_priced = 0
    model_ids = sorted(set(usage) | set(panel))
    for model_id in model_ids:
        um = usage.get(model_id, {"calls": 0, "in": 0, "out": 0})
        row = {"calls": um["calls"], "in": um["in"], "out": um["out"]}
        p = panel.get(model_id, {})
        if p.get("price_in") is not None and p.get("price_out") is not None:
            row["cost_usd"] = round(um["in"] / 1e6 * p["price_in"] + um["out"] / 1e6 * p["price_out"], 6)
            cost_total += row["cost_usd"]
            n_priced += 1
        per_model_usage[model_id] = row
        for k in total:
            total[k] += um.get(k, 0)
    # a TOTAL cost is reported only when EVERY model is priced — a subtotal over a
    # subset of the panel would misrepresent itself as the run's cost
    if model_ids and n_priced == len(model_ids):
        total["cost_usd"] = round(cost_total, 6)
    summary["usage"] = {"per_model": per_model_usage, "total": total}

    # Panel composition, so the ≥3-model / ≥2-provider bar is checkable from the
    # committed artifact itself (no secrets — provider, model and endpoint host only).
    # Only emitted when a run config was supplied: without it there is no provider/
    # endpoint to prove, and a table of blanks under a "proof" heading would mislead.
    if panel:
        summary["panel"] = {}
        for model_id in sorted(set(usage) | set(panel)):
            um = usage.get(model_id, {})
            p = panel.get(model_id, {})
            summary["panel"][model_id] = {
                "provider": p.get("provider"),
                "model": p.get("model") or um.get("model"),
                "endpoint": p.get("endpoint"),
                "served_by": sorted(um.get("served_by", {})) or None,
            }
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
    ranked = sorted(
        models.items(),
        key=lambda kv: -kv[1]["_overall"]["accuracy"] if kv[1]["_overall"]["accuracy"] is not None else 1,
    )
    for model_id, cells in ranked:
        row = [model_id] + [_cell_str(cells.get(t)) for t in tasks]
        ov = cells["_overall"]
        overall = "**n/a**" if ov["accuracy"] is None else f"**{ov['accuracy']:.0%}**"
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
                ov = cells["_overall"]
                acc = "n/a" if ov["accuracy"] is None else f"{ov['accuracy']:.0%}"
                row.append(f"**{acc}** (n={ov['n']})")
                lines.append("| " + " | ".join(row) + " |")

    panel = summary.get("panel") or {}
    if panel:
        lines += ["", "### Panel (committed-artifact proof of the ≥3-model / ≥2-provider bar)"]
        lines += ["| model_id | provider | model | endpoint | served_by |", "|" + "---|" * 5]
        for mid in sorted(panel):
            p = panel[mid]
            served = ", ".join(p.get("served_by") or []) or "—"
            lines.append(
                f"| {mid} | {p.get('provider') or '—'} | {p.get('model') or '—'} "
                f"| {p.get('endpoint') or '—'} | {served} |"
            )

    usage = summary.get("usage") or {}
    if usage.get("per_model"):
        per = usage["per_model"]
        t = usage["total"]
        # show the cost column whenever ANY model is priced; unpriced models and (under
        # partial pricing) the total render "n/a" rather than a misleading $0.0000
        has_cost = any("cost_usd" in u for u in per.values())
        lines += ["", "### Token usage", "| model_id | calls | in | out |" + (" cost (USD) |" if has_cost else "")]
        lines += ["|" + "---|" * (5 if has_cost else 4)]
        for mid in sorted(per):
            u = per[mid]
            row = f"| {mid} | {u['calls']} | {u['in']:,} | {u['out']:,} |"
            if has_cost:
                row += f" ${u['cost_usd']:.4f} |" if "cost_usd" in u else " n/a |"
            lines.append(row)
        trow = f"| **total** | {t['calls']} | {t['in']:,} | {t['out']:,} |"
        if has_cost:
            trow += f" ${t['cost_usd']:.4f} |" if "cost_usd" in t else " n/a (partial pricing) |"
        lines.append(trow)
    return "\n".join(lines) + "\n"
