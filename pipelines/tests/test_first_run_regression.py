"""Regression guards for the `normalize()` change (Spec 8, Phase 1).

Two invariants over the committed English `first-run-2026-10-11` evidence:

1. **Scoring invariance (strong, always runs):** re-scoring the committed `answers.jsonl` to a
   scratch path reproduces the committed `scores.jsonl` byte-for-byte — proof that the
   Arabic/Hebrew normalisation change did not move Latin scoring over ~400 real answers. Writes
   only to a tmp path; never touches the committed evidence.
2. **Generation invariance (runs when the corpus is built):** regenerating the question set from
   the manifest's parameters and the converted inputs reproduces the committed question-set
   digest. Skipped when `texts/standardized/` is absent (it is gitignored / rebuilt by
   `convert`), matching the repo's "skip when evidence absent" test pattern.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from sacredbench import catalogue as cat
from sacredbench import schema
from sacredbench.generate import generate as run_generate
from sacredbench.generate import question_set_digest
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


def test_first_run_question_set_digest_regenerates():
    manifest_path = RUN / "questions.jsonl.manifest.json"
    if not manifest_path.exists():
        pytest.skip("first-run manifest not present")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    inputs = [REPO_ROOT / p for p in manifest["inputs"]]
    if not all(p.exists() for p in inputs):
        pytest.skip("standardized corpus not built (run `convert`)")
    sources = cat.discover_catalogue(REPO_ROOT / "texts" / "raw")
    files = cat.expand_json(inputs)
    kept = cat.filter_standardized_paths(
        files, sources, include_restricted=False,
        standardized_root=REPO_ROOT / "texts" / "standardized",
    )
    docs = schema.load_documents(kept)
    questions = run_generate(
        docs,
        per_task=manifest["per_task"],
        seed=manifest["seed"],
        negatives_share=manifest["negatives_share"],
        quotas=manifest["quotas"] or None,
        tasks=tuple(manifest["tasks_requested"]),
    )
    assert question_set_digest(questions) == manifest["question_set_digest"]
