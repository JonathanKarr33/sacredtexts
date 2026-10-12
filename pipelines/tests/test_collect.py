"""Collection resume semantics behind a FAKE provider (no SDKs, no network):
a dead-key cell stays pending and the run reports failures; a fixed re-run fills
exactly the missing cells once; and resuming against a different question set is
refused via the bound question-set digest."""

from __future__ import annotations

import json

import pytest

from sacredbench import collect as collect_mod
from sacredbench.collect import CollectError, collect
from sacredbench.config import ModelSpec, RunConfig
from sacredbench.generate import Question
from sacredbench.providers import ProviderError


def _q(qid: str) -> Question:
    return Question(
        id=qid, task="retrieve_quote", prompt=f"prompt for {qid}",
        expected={"text": "x"},
        source={"tradition": ["T"], "work": "W", "version": "V", "language": "en",
                "document_type": "scripture", "citation": "W 1:1"},
    )


def _config(*ids: str) -> RunConfig:
    return RunConfig(
        models=tuple(ModelSpec(id=i, provider="anthropic", model="m-" + i) for i in ids),
        concurrency=1,
    )


def _fake(dead: set[str]):
    def fake(model, prompt, retries=2):
        if model.id in dead:
            raise ProviderError(f"dead key for {model.id}")
        # the real `complete` seam returns usage ALREADY normalized to {in, out}
        # (providers.py); the fake must match that contract, not the provider-native shape
        return (f"ans:{prompt}", {"in": 1, "out": 1}, 1)

    return fake


def _rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def test_dead_cell_stays_pending_then_refilled_once(tmp_path, monkeypatch):
    questions = [_q("retrieve_quote-aaaaaa"), _q("retrieve_quote-bbbbbb")]
    config = _config("good", "dead")
    answers = tmp_path / "answers.jsonl"

    # round 1: the "dead" model fails every cell -> those stay pending, run reports failures
    monkeypatch.setattr(collect_mod, "complete", _fake({"dead"}))
    done, failed, messages = collect(questions, config, answers)
    assert done == 2 and failed == 2 and len(messages) == 2  # 2 good written, 2 dead failed
    rows = _rows(answers)
    assert {(r["question_id"], r["model_id"]) for r in rows} == {
        ("retrieve_quote-aaaaaa", "good"), ("retrieve_quote-bbbbbb", "good"),
    }

    # round 2: dead key fixed -> fills EXACTLY the 2 missing cells, re-runs nothing
    monkeypatch.setattr(collect_mod, "complete", _fake(set()))
    done2, failed2, _ = collect(questions, config, answers)
    assert done2 == 2 and failed2 == 0  # only the 2 previously-failed cells
    rows2 = _rows(answers)
    keys = [(r["question_id"], r["model_id"]) for r in rows2]
    assert len(keys) == 4 and len(set(keys)) == 4  # all four cells, exactly once


def test_resume_against_different_question_set_refused(tmp_path, monkeypatch):
    answers = tmp_path / "answers.jsonl"
    config = _config("good")
    monkeypatch.setattr(collect_mod, "complete", _fake(set()))
    collect([_q("retrieve_quote-aaaaaa")], config, answers)  # stamps digest of set A
    with pytest.raises(CollectError) as e:
        collect([_q("retrieve_quote-zzzzzz")], config, answers)  # set B -> different digest
    assert "refusing to resume" in str(e.value)


def test_resume_under_changed_panel_identity_refused(tmp_path, monkeypatch):
    answers = tmp_path / "answers.jsonl"
    monkeypatch.setattr(collect_mod, "complete", _fake(set()))
    qs = [_q("retrieve_quote-aaaaaa")]
    collect(qs, _config("m"), answers)  # model id "m" -> model "m-m", provider anthropic
    # same id, different model string -> panel identity changed -> refuse resume
    changed = RunConfig(models=(ModelSpec(id="m", provider="anthropic", model="other-model"),), concurrency=1)
    with pytest.raises(CollectError, match="different panel identity"):
        collect(qs, changed, answers)
    # the recorded row carries the fingerprint + provider
    row = _rows(answers)[0]
    # fingerprint is provider|model|base_url|tools (tools empty here -> trailing "|")
    assert row["provider"] == "anthropic" and row["panel_fingerprint"] == "anthropic|m-m||"


def test_legacy_answers_without_digest_refused(tmp_path, monkeypatch):
    answers = tmp_path / "answers.jsonl"
    answers.write_text(json.dumps({"question_id": "retrieve_quote-aaaaaa", "model_id": "good"}) + "\n")
    monkeypatch.setattr(collect_mod, "complete", _fake(set()))
    with pytest.raises(CollectError):
        collect([_q("retrieve_quote-aaaaaa")], _config("good"), answers)


def test_digest_stamped_into_rows(tmp_path, monkeypatch):
    from sacredbench.generate import question_set_digest
    answers = tmp_path / "answers.jsonl"
    monkeypatch.setattr(collect_mod, "complete", _fake(set()))
    qs = [_q("retrieve_quote-aaaaaa")]
    collect(qs, _config("good"), answers)
    row = _rows(answers)[0]
    assert row["question_set_digest"] == question_set_digest(qs)
