"""Spec 15 — durable witness that the contains_reference rebaseline moved ONLY what it should.

Once the metrics dict changed, the two byte-for-byte re-score guards (`test_first_run_regression`,
`test_tutorial_run`) became circular — they re-score the committed answers and compare to the
committed `scores.jsonl`, both of which this PR regenerated, so they can no longer witness "nothing
else moved". This file is that witness, over the committed run evidence:

1. **Durable oracle** — a SHA-256 of the canonical `(model_id, question_id) -> (exact, normalized,
   token_f1)` projection, frozen from the PRE-change committed `scores.jsonl` (captured via
   `git show HEAD:…` at authoring time, before regeneration). This PR does not touch those three
   fields, so the regenerated projection must hash identically. Proves the similarity tiers did not
   move on any of the ~400 cells per run.
2. **Exact flip set** — the headline (`correct`) flips 0->1 on EXACTLY the pre-registered
   (model_id, question_id) pairs, not an aggregate (compensating changes can preserve a total).
3. **Self-contained invariants** — for every text-retrieval row `correct == (normalized or
   contains_reference)` and `contains_reference` is a superset of `normalized`; `correct` equals
   `normalized` everywhere except the flipped pairs.
4. **Pinned per-cell summary values** — the rebaselined headline accuracies.

Read-only; skips cleanly if a run's evidence is absent.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

# Frozen oracles + flip sets, captured from the PRE-change committed scores.jsonl (Spec 15).
PRECHANGE_PROJECTION_SHA256 = {
    "first-run-2026-10-11": "0229fa150d20155b9621be6197eeaa59c9277861605853375aa67d91bed8a470",
    "tutorial-2026-10-11": "64e5b6602e8d032e08fac71e36deda43b72b6ee424a02865b4a4d6bc34dd80f3",
}
FLIP_SET = {
    "first-run-2026-10-11": {
        ("claude-haiku", "retrieve_quote-88403db0a16b"),
    },
    "tutorial-2026-10-11": {
        ("haiku-search", "retrieve_quote-07ca676a80ab"),
        ("haiku-search", "retrieve_quote-1d74fc87541b"),
        ("haiku-search", "retrieve_quote-25ae2e85e747"),
        ("haiku-search", "retrieve_quote-4c99a8581f81"),
        ("haiku-search", "retrieve_quote-5384ab60ec95"),
        ("haiku-search", "retrieve_quote-732d66e552f2"),
        ("haiku-search", "retrieve_quote-77bcd8c4be1e"),
        ("haiku-search", "retrieve_quote-7c4d9a37b9c2"),
        ("haiku-search", "retrieve_quote-98dd7af93ecf"),
        ("haiku-search", "retrieve_quote-c211a13b8670"),
        ("haiku-search", "retrieve_quote-c557e75e3df0"),
        ("haiku-search", "retrieve_quote-f0c6eb9da8cc"),
        ("opus-search", "retrieve_quote-219c7089a034"),
        ("opus-search", "retrieve_quote-4ad4392645da"),
        ("opus-search", "retrieve_quote-642fbf516c7a"),
        ("opus-search", "retrieve_quote-81d89ab2a113"),
        ("opus-search", "retrieve_quote-8586e176e947"),
        ("opus-search", "retrieve_quote-bb2aca3787b1"),
        ("opus-search", "retrieve_quote-e9045b3e5dec"),
        ("opus-search", "retrieve_quote-eec71d77817a"),
    },
}
# Rebaselined headline accuracies (secondary pin), per run. SECOND rebaseline (Spec 15 phase 3):
# accuracy now EXCLUDES refusals — accuracy = correct/(correct+incorrect) — so every value MOVED up
# from the phase-1 pins (correct/n). The companion coverage = (correct+incorrect)/n is pinned below.
EXPECTED_ACCURACY = {
    "first-run-2026-10-11": {("claude-haiku", "retrieve_quote"): 0.5556},  # was 0.25 (correct/n)
    "tutorial-2026-10-11": {
        ("haiku-search", "retrieve_quote"): 0.80,  # was 0.52
        ("haiku", "retrieve_quote"): 0.7121,        # was 0.47
        ("opus-search", "retrieve_quote"): 0.9737,  # was 0.74
        ("opus", "retrieve_quote"): 1.0,            # was 0.66 — perfect WHEN it answers (cov 0.66)
    },
}
# Coverage pins (the honest companion that stops "opus 100%" from being misread as a clean sweep:
# opus answers 66% of the time, opus-search 76%). coverage = (correct+incorrect)/n.
EXPECTED_COVERAGE = {
    "first-run-2026-10-11": {("claude-haiku", "retrieve_quote"): 0.45},
    "tutorial-2026-10-11": {
        ("haiku-search", "retrieve_quote"): 0.65,
        ("haiku", "retrieve_quote"): 0.66,
        ("opus-search", "retrieve_quote"): 0.76,
        ("opus", "retrieve_quote"): 0.66,
    },
}

# Pre-registered refusal set (Spec 15 phase 3, decision #2). FROZEN from a hand-survey of both
# answers.jsonl BEFORE the matcher was written (genuine pre-registration — see the review doc and
# codev/state/aspir-15_thread.md for the calibration method). A cell is `refused` iff a decline cue
# opens the answer (first 60 normalized chars) AND the reference is not word-bounded-contained;
# deliver-then-caveat answers (verse, then "(couldn't verify)") are NOT refusals. The matcher in
# sacredbench/outcomes.classify_refusal must reproduce this set EXACTLY. Pinned by per-model count
# (readable) + a SHA-256 of the sorted (model_id, question_id) pairs (catches any single-cell drift).
REFUSED_COUNTS = {
    # first-run llama-3.1-8b is 20 (not 18): the iter-2 review surfaced two genuine "I can neither
    # provide … nor …" declines (retrieve_quote-22fab64cec81, -74d14c70efb0) the first survey missed;
    # the cue was added and the set re-pinned (llama accuracy 0.0122→0.0125, coverage 0.82→0.80).
    "first-run-2026-10-11": {"claude-haiku": 55, "gpt-oss-20b": 66, "llama-3.1-8b": 20},
    "tutorial-2026-10-11": {"haiku": 34, "opus": 34, "haiku-search": 35, "opus-search": 24},
}
REFUSED_SET_SHA256 = {
    "first-run-2026-10-11": "8f6a7dcc2157705029bf4f43c024b48807737bafbfdc33fed6d370bdf6db583b",
    "tutorial-2026-10-11": "5d8856fa9a7c7c319e0fcc26d0eaf659af308d4397b9ff6d33b633fa1afee6dd",
}


def _load_scores(run: str):
    p = REPO_ROOT / "runs" / run / "scores.jsonl"
    if not p.exists():
        pytest.skip(f"{run} evidence not present")
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


@pytest.mark.parametrize("run", list(PRECHANGE_PROJECTION_SHA256))
def test_similarity_projection_unchanged(run):
    scores = _load_scores(run)
    rows = sorted(
        ((s["model_id"], s["question_id"], s["task"]),
         s["metrics"].get("exact"), s["metrics"].get("normalized"), s["metrics"].get("token_f1"))
        for s in scores
    )
    digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    assert digest == PRECHANGE_PROJECTION_SHA256[run], (
        "exact/normalized/token_f1 projection changed — the rebaseline moved a similarity tier it "
        "must not touch"
    )


@pytest.mark.parametrize("run", list(FLIP_SET))
def test_headline_flips_exactly_the_registered_cells(run):
    scores = _load_scores(run)
    # a flipped cell: headline now correct while strict normalized is 0 (pre-change correct==normalized)
    flipped = {
        (s["model_id"], s["question_id"])
        for s in scores
        if s["task"] in ("retrieve_quote", "complete_unit")
        and s["metrics"]["correct"] == 1 and s["metrics"].get("normalized") == 0
    }
    assert flipped == FLIP_SET[run]


@pytest.mark.parametrize("run", list(FLIP_SET))
def test_contains_reference_invariants(run):
    scores = _load_scores(run)
    for s in scores:
        m = s["metrics"]
        if s["task"] in ("retrieve_quote", "complete_unit"):
            assert "contains_reference" in m
            # superset of normalized
            if m.get("normalized") == 1:
                assert m["contains_reference"] == 1
            # headline is exactly normalized OR contains_reference
            assert m["correct"] == int(bool(m.get("normalized")) or bool(m["contains_reference"]))
            # correct == normalized except on the flipped cells
            if (s["model_id"], s["question_id"]) not in FLIP_SET[run]:
                assert m["correct"] == m.get("normalized")
        else:
            assert "contains_reference" not in m  # provenance tasks untouched


@pytest.mark.parametrize("run", list(EXPECTED_ACCURACY))
def test_rebaselined_headline_accuracy_and_coverage(run):
    p = REPO_ROOT / "runs" / run / "summary.json"
    if not p.exists():
        pytest.skip(f"{run} evidence not present")
    summary = json.loads(p.read_text(encoding="utf-8"))
    for (model_id, task), acc in EXPECTED_ACCURACY[run].items():
        assert summary["models"][model_id][task]["accuracy"] == acc
    for (model_id, task), cov in EXPECTED_COVERAGE[run].items():
        assert summary["models"][model_id][task]["coverage"] == cov


@pytest.mark.parametrize("run", list(REFUSED_COUNTS))
def test_refused_set_matches_preregistration(run):
    """The matcher reproduces the hand-frozen refused set EXACTLY — per-model counts and the
    (model_id, question_id) membership (via SHA). Guards against the matcher drifting from the
    pre-registered ground truth (over- or under-matching declines)."""
    import hashlib

    scores = _load_scores(run)
    refused = sorted(
        (s["model_id"], s["question_id"])
        for s in scores
        if s["metrics"].get("outcome") == "refused"
    )
    counts = {}
    for mid, _ in refused:
        counts[mid] = counts.get(mid, 0) + 1
    assert counts == REFUSED_COUNTS[run], "per-model refused counts drifted from pre-registration"
    digest = hashlib.sha256(json.dumps(refused, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    assert digest == REFUSED_SET_SHA256[run], "refused (model_id, question_id) membership drifted"


@pytest.mark.parametrize("run", list(FLIP_SET))
def test_outcome_exclusive_and_refused_keeps_submetrics(run):
    """Every text-retrieval row carries outcome ∈ {correct, incorrect, refused}; a refused row has
    headline correct=0 yet KEEPS its submetrics (so the phase-1 projection oracle is preserved); a
    correct row has correct=1; an incorrect row has correct=0 and is not refused."""
    scores = _load_scores(run)
    for s in scores:
        if s["task"] not in ("retrieve_quote", "complete_unit"):
            continue
        m = s["metrics"]
        assert m["outcome"] in ("correct", "incorrect", "refused")
        if m["outcome"] == "refused":
            assert m["correct"] == 0
            # submetrics preserved on refused rows (the oracle depends on this)
            for k in ("exact", "normalized", "token_f1", "contains_reference"):
                assert k in m
        elif m["outcome"] == "correct":
            assert m["correct"] == 1
        else:
            assert m["correct"] == 0


def test_first_run_overall_and_lds_tradition_pinned():
    p = REPO_ROOT / "runs" / "first-run-2026-10-11" / "summary.json"
    if not p.exists():
        pytest.skip("first-run evidence not present")
    summary = json.loads(p.read_text(encoding="utf-8"))
    # SECOND rebaseline: accuracy excludes the 55 claude-haiku refusals (25 correct / 45 graded).
    ov = summary["models"]["claude-haiku"]["_overall"]
    assert ov["accuracy"] == 0.5556 and ov["coverage"] == 0.45
    assert ov["correct"] == 25 and ov["incorrect"] == 20 and ov["refused"] == 55
    lds = "The Church of Jesus Christ of Latter-Day Saints"
    lds_rq = summary["by_tradition"]["claude-haiku"][lds]["retrieve_quote"]
    # 25 LDS cells: 5 refused, 19 correct, 1 incorrect -> accuracy 19/20, coverage 20/25
    assert lds_rq["accuracy"] == 0.95 and lds_rq["coverage"] == 0.8
    assert lds_rq["refused"] == 5
    assert summary["by_tradition"]["claude-haiku"][lds]["_overall"]["accuracy"] == 0.95
