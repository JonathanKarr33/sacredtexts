"""Regression guard for the committed English `first-run-2026-10-11` evidence.

**Scoring invariance (always runs):** re-scoring the committed `answers.jsonl` to a scratch
path reproduces the committed `scores.jsonl` byte-for-byte — proof that scoring changes did not
move Latin scoring over ~400 real answers. Writes only to a tmp path; never touches the
committed evidence.

The *generation*-invariance guard that used to live here (regenerate the question set from the
manifest and match the committed digest) was **retired in Spec 26**: it can no longer hold. The
committed first-run set is 100 `retrieve_quote`-only questions under the pre-Spec-26 generator;
Spec 26 both changed the corpus (Phase 1 removed the two `KJV (LDS 2013 edition)` targets) and
reshaped the generator (four templates, per-text quota, no `per_task`/`quotas`), so regenerating
from the committed inputs yields a *different* set and a different digest — a digest mismatch, by
design. The new generation-invariance anchor is the fresh Spec-26 run
(`runs/original-2026-10-21/`), digest-pinned in `test_original_run_regression.py`
(`test_regenerating_original_run_reproduces_digest`). The re-score half below is unaffected and
stays.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from sacredbench.score import score_file

REPO_ROOT = Path(__file__).resolve().parents[2]
RUN = REPO_ROOT / "runs" / "first-run-2026-10-11"


def test_rescoring_committed_run_reproduces_scores(tmp_path):
    answers = RUN / "answers.jsonl"
    committed = RUN / "scores.jsonl"
    if not answers.exists() or not committed.exists():
        pytest.skip("first-run evidence not present")
    out = tmp_path / "scores.jsonl"
    score_file(answers, out)  # no roster/panel needed to reproduce per-answer scores
    # byte-for-byte, order included: score_file preserves input-row order, so this is
    # strictly stronger than a sorted compare and still holds.
    assert out.read_text(encoding="utf-8") == committed.read_text(encoding="utf-8")
