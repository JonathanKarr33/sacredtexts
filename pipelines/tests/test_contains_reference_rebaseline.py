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
# Rebaselined headline accuracies (secondary pin), per run.
EXPECTED_ACCURACY = {
    "first-run-2026-10-11": {("claude-haiku", "retrieve_quote"): 0.25},
    "tutorial-2026-10-11": {
        ("haiku-search", "retrieve_quote"): 0.52,
        ("haiku", "retrieve_quote"): 0.47,
        ("opus-search", "retrieve_quote"): 0.74,
        ("opus", "retrieve_quote"): 0.66,
    },
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
def test_rebaselined_headline_accuracy(run):
    p = REPO_ROOT / "runs" / run / "summary.json"
    if not p.exists():
        pytest.skip(f"{run} evidence not present")
    summary = json.loads(p.read_text(encoding="utf-8"))
    for (model_id, task), acc in EXPECTED_ACCURACY[run].items():
        assert summary["models"][model_id][task]["accuracy"] == acc


def test_first_run_overall_and_lds_tradition_pinned():
    p = REPO_ROOT / "runs" / "first-run-2026-10-11" / "summary.json"
    if not p.exists():
        pytest.skip("first-run evidence not present")
    summary = json.loads(p.read_text(encoding="utf-8"))
    # the single flip lifts claude-haiku's overall and the LDS tradition cell (18/25 -> 19/25)
    assert summary["models"]["claude-haiku"]["_overall"]["accuracy"] == 0.25
    lds = "The Church of Jesus Christ of Latter-Day Saints"
    assert summary["by_tradition"]["claude-haiku"][lds]["retrieve_quote"]["accuracy"] == 0.76
    assert summary["by_tradition"]["claude-haiku"][lds]["_overall"]["accuracy"] == 0.76
