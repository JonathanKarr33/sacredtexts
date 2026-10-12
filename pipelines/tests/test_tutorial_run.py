"""Invariants over the committed `tutorial-2026-10-11` evidence (Spec 8, Phase 3).

The committed tutorial run is the KJV / Qur'an / Talmud, web-search on-vs-off panel. These
guard the properties the merged viewer and the copyright/secret posture depend on, and they
re-score the committed answers to prove the non-Latin scoring is reproducible. All read-only
over committed evidence (re-score writes to a tmp path); each skips cleanly if the run is absent.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from sacredbench.score import score_file

REPO_ROOT = Path(__file__).resolve().parents[2]
RUN = REPO_ROOT / "runs" / "tutorial-2026-10-11"
FIRST_RUN_KEY = "anthropic\u0000claude-haiku-5-5"


def _load_summary():
    p = RUN / "summary.json"
    if not p.exists():
        pytest.skip("tutorial run evidence not present")
    return json.loads(p.read_text(encoding="utf-8"))


def _standings_key(entry: dict) -> str:
    # mirrors apps/viewer/src/lib/aggregate.ts : `${provider}\u0000${model}`
    return f"{entry['provider']}\u0000{entry['model']}"


def test_panel_has_four_distinct_standings_identities():
    panel = _load_summary()["panel"]
    assert len(panel) == 4
    keys = [_standings_key(e) for e in panel.values()]
    # search-on vs. off never collapse into one standings row
    assert len(set(keys)) == 4
    # and none collides with the earlier first-run bare claude-haiku-5-5 row
    assert FIRST_RUN_KEY not in keys


def test_panel_is_secret_free_carries_api_model_and_is_unpriced():
    summary = _load_summary()
    panel = summary["panel"]
    for entry in panel.values():
        # only non-secret identity fields
        assert set(entry) <= {"provider", "model", "api_model", "endpoint", "served_by"}
        assert entry["api_model"]  # true API model recoverable
    # unpriced: no cost figure anywhere in the summary
    assert "cost" not in json.dumps(summary).lower()
    # generated_at present and ISO-parseable (Issue #7)
    from datetime import datetime
    assert datetime.fromisoformat(summary["generated_at"])


def test_committed_run_has_no_secrets():
    """Scan committed text for actual key *material*, not variable-name mentions. Naming the
    `ANTHROPIC_API_KEY` env var in the README is legitimate documentation; a leaked key value
    (Anthropic/OpenAI `sk-...`, or a populated bearer/authorization token) is not."""
    import re
    if not (RUN / "summary.json").exists():
        pytest.skip("tutorial run evidence not present")
    # real key material: sk- prefixes (Anthropic sk-ant-..., OpenAI sk-...) and bearer tokens
    # with an actual value. Case-sensitive so prose words don't match.
    leak_patterns = [
        re.compile(r"sk-[A-Za-z0-9_-]{16,}"),
        re.compile(r"(?i)bearer\s+[A-Za-z0-9._-]{16,}"),
        re.compile(r"(?i)authorization\s*[:=]\s*\S"),
    ]
    for name in ("summary.json", "summary.md", "README.md"):
        blob = (RUN / name).read_text(encoding="utf-8")
        for pat in leak_patterns:
            m = pat.search(blob)
            assert m is None, f"{name} contains secret-ish material matching {pat.pattern!r}"


def test_rescoring_committed_answers_reproduces_scores(tmp_path):
    answers = RUN / "answers.jsonl"
    committed = RUN / "scores.jsonl"
    if not answers.exists() or not committed.exists():
        pytest.skip("tutorial run evidence not present")
    out = tmp_path / "scores.jsonl"
    score_file(answers, out)  # per-answer scores need no roster/panel
    # byte-for-byte over the real Arabic/Hebrew/Latin answers — non-Latin scoring is reproducible
    assert out.read_text(encoding="utf-8") == committed.read_text(encoding="utf-8")


def test_committed_questions_cover_three_traditions_and_scripts():
    q = RUN / "questions.jsonl"
    if not q.exists():
        pytest.skip("tutorial run evidence not present")
    rows = [json.loads(l) for l in q.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(rows) == 100
    trads = {t for r in rows for t in r["source"]["tradition"]}
    assert {"Judaism", "Sunni Islam", "Protestant Christian"} <= trads

    def script(text: str) -> str:
        for ch in text:
            o = ord(ch)
            if 0x0600 <= o <= 0x06FF or 0x0750 <= o <= 0x077F:
                return "Arabic"
            if 0x0590 <= o <= 0x05FF or 0xFB1D <= o <= 0xFB4F:
                return "Hebrew"
        return "Latin"

    scripts = {script(r["expected"]["text"]) for r in rows}
    assert {"Arabic", "Hebrew", "Latin"} <= scripts  # all three scripts in expected text
