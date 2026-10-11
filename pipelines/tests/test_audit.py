"""Copyright audit: clean artifacts pass; an artifact derived from a restricted
source (e.g. NABRE) fails. Uses the real committed catalogue (NABRE + Greek Orthodox
are the restricted targets)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from sacredbench import catalogue as cat
from sacredbench.audit import _norm, audit_paths, restricted_keys

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW = REPO_ROOT / "texts" / "raw"


def test_restricted_keys_from_real_catalogue():
    keys = restricted_keys(cat.discover_catalogue(RAW))
    assert ("The Bible", "NABRE", "en") in keys  # NABRE is restricted
    assert all(isinstance(k, tuple) and len(k) == 3 for k in keys)


def _question_row(work, version, language="en"):
    return {
        "id": "retrieve_quote-x", "task": "retrieve_quote", "prompt": "p",
        "expected": {"text": "t"},
        "source": {"tradition": ["T"], "work": work, "version": version,
                   "language": language, "document_type": "scripture", "citation": "c"},
    }


def test_committed_run_evidence_is_clean():
    # every COMMITTED file under runs/ must pass the audit (globs tracked run dirs,
    # so a second committed run is covered too — not one hardcoded path)
    tracked = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "ls-files", "runs/"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    paths = [REPO_ROOT / p for p in tracked if p.endswith((".json", ".jsonl"))]
    if not paths:
        import pytest
        pytest.skip("no committed run evidence")
    assert audit_paths(paths, cat.discover_catalogue(RAW)) == []


def test_content_layer_catches_restricted_text_under_a_public_label(tmp_path):
    # a restricted unit MISLABELED with a public (work, version, language): origin
    # alone can't see it; the content layer (fingerprints) must. This is the plan's
    # "would fail on injected restricted text".
    sources = cat.discover_catalogue(RAW)
    secret = "this exact wording belongs to a copyrighted restricted translation and must never be committed here"
    fp = _norm(secret)
    row = _question_row("The Bible", "KJV")  # public ORIGIN
    row["expected"]["text"] = secret         # ...but restricted TEXT
    p = tmp_path / "questions.jsonl"
    p.write_text(json.dumps(row) + "\n")
    # without fingerprints: origin is public -> clean (content scan skipped)
    assert audit_paths([p], sources) == []
    # with the restricted fingerprint supplied: caught
    v = audit_paths([p], sources, {fp})
    assert len(v) == 1 and "restricted text" in v[0]


def test_clean_evidence_passes(tmp_path):
    sources = cat.discover_catalogue(RAW)
    p = tmp_path / "questions.jsonl"
    p.write_text(json.dumps(_question_row("The Bible", "KJV")) + "\n")  # public-domain
    assert audit_paths([p], sources) == []


def test_restricted_origin_fails(tmp_path):
    sources = cat.discover_catalogue(RAW)
    p = tmp_path / "questions.jsonl"
    p.write_text(
        json.dumps(_question_row("The Bible", "KJV")) + "\n"
        + json.dumps(_question_row("The Bible", "NABRE")) + "\n"  # restricted!
    )
    violations = audit_paths([p], sources)
    assert len(violations) == 1 and "NABRE" in violations[0] and str(p) in violations[0]


def test_audit_detects_restricted_in_answer_row_and_standardized_doc(tmp_path):
    sources = cat.discover_catalogue(RAW)
    # an answer row nests source under "question"
    ans = tmp_path / "answers.jsonl"
    ans.write_text(json.dumps({"question_id": "q", "model_id": "m", "task": "retrieve_quote",
                               "answer": "a", "question": _question_row("The Bible", "NABRE")}) + "\n")
    # a standardized document is a single JSON object with top-level "source"
    doc = tmp_path / "std.json"
    doc.write_text(json.dumps({
        "source": {"tradition": ["Greek Orthodox"], "work": "Septuagint & Greek New Testament",
                   "version": "TLG", "language": "grc", "document_type": "scripture"},
        "entries": [{"unit_type": "verse", "citation": "x", "text": "y"}],
    }))
    v = audit_paths([tmp_path], sources)  # scans the dir recursively
    assert len(v) == 2  # both the answer row and the standardized doc flagged
