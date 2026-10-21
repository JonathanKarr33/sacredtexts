"""Regression guard for the committed Spec-26 `original-2026-10-21` evidence.

This run is the current reference evidence (four templates, 17 original-language-only texts,
three-model panel) and the **generation-invariance anchor** that replaced the retired first-run
generator guard (`test_first_run_regression.py`). Two invariants:

- **Scoring invariance (always runs):** re-scoring the committed `answers.jsonl` to a scratch
  path reproduces the committed `scores.jsonl` byte-for-byte — proof that scoring changes did
  not move the only committed evidence that exercises Arabic/Aramaic `normalize()`, the
  leading-stance `parse_yes_no`, and `cite_passage`/`complete_unit` over 1,427 real answers.
- **Generation invariance (skips if `texts/standardized/` is absent, i.e. in a fresh clone /
  CI where the rebuilt corpus is gitignored):** regenerating the question set from the committed
  manifest's own inputs/seed/per_text/negatives_share reproduces the pinned question-set digest
  `ca5b5d5372f81603`. This is what Phase 2's retirement note promised was "digest-pinned here".

Both write only to tmp paths; neither touches the committed evidence.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import hashlib

from sacredbench import catalogue as cat
from sacredbench import cli
from sacredbench.score import _citation_candidates, score_file

REPO_ROOT = Path(__file__).resolve().parents[2]
RUN = REPO_ROOT / "runs" / "original-2026-10-21"
PINNED_DIGEST = "eaf8c68e82cc0cb5"

# Pre-registered cite_passage decline survey (Spec 26 round-1b, fold B). Every cite_passage answer
# that yields ZERO citation candidates was hand-surveyed: a first-person inability to cite
# ("I can't confirm/pinpoint the number") is a decline and its phrasing was added to
# _DECLINE_CUES_RAW; a confident non-existence claim ("Not found in the KJV") or a bare book-name
# attempt stays incorrect. This pins the surveyed population by count + SHA so any change to those
# committed answers forces a fresh survey rather than silently shifting the decline set.
SURVEY_COUNT = 29
SURVEY_SHA256 = "ccc7184e739314b033c585aed4e2415af8dba9171400b1e1be664c28b3d9eabc"


def test_rescoring_committed_original_run_reproduces_scores(tmp_path):
    answers = RUN / "answers.jsonl"
    committed = RUN / "scores.jsonl"
    if not answers.exists() or not committed.exists():
        pytest.skip("original-2026-10-21 evidence not present")
    out = tmp_path / "scores.jsonl"
    score_file(answers, out)  # no roster/panel needed to reproduce per-answer scores
    # byte-for-byte, order included (score_file preserves input-row order).
    assert out.read_text(encoding="utf-8") == committed.read_text(encoding="utf-8")


def test_cite_passage_decline_survey_is_pinned():
    """The hand-surveyed zero-citation-candidate cite_passage set is fixed (count + SHA)."""
    answers = RUN / "answers.jsonl"
    if not answers.exists():
        pytest.skip("original-2026-10-21 evidence not present")
    rows = [json.loads(l) for l in answers.open(encoding="utf-8") if l.strip()]
    zero = [
        r for r in rows
        if r["task"] == "cite_passage"
        and not _citation_candidates(r.get("answer") or "", r["question"]["expected"]["citation"])
    ]
    assert len(zero) == SURVEY_COUNT
    ids = sorted(f"{r['model_id']}\0{r['question_id']}\0{r.get('answer') or ''}" for r in zero)
    sha = hashlib.sha256("\n".join(ids).encode()).hexdigest()
    assert sha == SURVEY_SHA256


def test_regenerating_original_run_reproduces_digest(tmp_path, monkeypatch):
    """Regenerate from the committed manifest's own params and match the pinned digest."""
    manifest_path = RUN / "questions.jsonl.manifest.json"
    standardized = REPO_ROOT / "texts" / "standardized"
    if not manifest_path.exists() or not standardized.exists():
        pytest.skip("original-2026-10-21 manifest or rebuilt corpus not present")
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    # The committed manifest is self-consistent with the pinned digest.
    assert m["question_set_digest"] == PINNED_DIGEST

    # Drive the real CLI generate path from the manifest's recorded inputs — relative
    # catalogue paths (cat.RAW_ROOT / cat.STANDARDIZED_ROOT) resolve from the repo root.
    monkeypatch.chdir(REPO_ROOT)
    out = tmp_path / "questions.jsonl"
    cli.generate(
        inputs=[Path(p) for p in m["inputs"]],
        out=out,
        per_text=m["per_text"],
        tasks=None,  # the committed run used no --tasks subset (all four templates)
        seed=m["seed"],
        negatives_share=m["negatives_share"],
        raw_root=cat.RAW_ROOT,
        standardized_root=cat.STANDARDIZED_ROOT,
        include_restricted=False,
    )
    regenerated = json.loads(
        (tmp_path / "questions.jsonl.manifest.json").read_text(encoding="utf-8")
    )
    assert regenerated["question_set_digest"] == PINNED_DIGEST
    assert regenerated["corpus_hash"] == m["corpus_hash"]
