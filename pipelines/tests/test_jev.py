"""Jev judgments. The Decisions API is injected; no network and no key."""

import json

import pytest

from sacredbench.config import ConfigError, load_config
from sacredbench.cross_translation import index_documents
from sacredbench.jev import (
    JEV_MODEL,
    JevError,
    alternate_wordings,
    interpret,
    judge,
    judgment_state,
)
from sacredbench.providers import sampling_kwargs
from sacredbench.schema import Document, Entry
from sacredbench.config import ModelSpec


def _payload(kind="neither", refusal=0.1, matches=0.2):
    return {
        "id": "gen-dec-1",
        "model": "typesafe/jev-1.13-20260917",
        "provider": "TypeSafe",
        "answers": {
            "refusal": {"type": "noul", "noul": refusal},
            "matches_requested": {"type": "noul", "noul": matches},
            "kind": {
                "type": "choice",
                "choice": kind,
                "probabilities": {kind: 0.8},
                "confidence": 0.7,
            },
        },
        "usage": {"input_tokens": 12, "output_tokens": 0, "cost": 0.000001},
    }


def _row(answer="some other sentence entirely", citation="Isaiah 1:1", expected="the requested line of scripture here"):
    return {
        "question_id": "retrieve_quote-aaaa",
        "model_id": "m1",
        "model": "google/gemma-3-4b-it",
        "answer": answer,
        "question": {
            "expected": {"text": expected},
            "source": {
                "tradition": ["Protestant Christian"],
                "work": "The Bible",
                "version": "KJV",
                "citation": citation,
            },
        },
    }


def test_interpret_keeps_the_resolved_build_and_rejects_a_bad_kind():
    parsed = interpret(_payload())
    assert parsed["judge_model_resolved"] == "typesafe/jev-1.13-20260917"
    assert parsed["kind"] == "neither"
    assert parsed["usage"]["cost"] == 0.000001
    bad = _payload()
    bad["answers"]["kind"]["choice"] = "maybe"
    with pytest.raises(JevError, match="kind"):
        interpret(bad)


def test_state_includes_other_indexed_wordings_of_the_same_citation():
    docs = [
        Document(
            tradition=["Protestant Christian"], work="The Bible", version="KJV",
            language="en", document_type="scripture",
            entries=[Entry("verse", "Isaiah 1:1", "day time wording of this verse alone")],
        ),
        Document(
            tradition=["The Church of Jesus Christ of Latter-Day Saints"],
            work="The Bible", version="KJV (LDS 2013 edition)",
            language="en", document_type="scripture",
            entries=[Entry("verse", "Isaiah 1:1", "daytime wording of this verse alone")],
        ),
    ]
    index = index_documents(docs)
    alts = alternate_wordings(index, "Isaiah 1:1", "day time wording of this verse alone")
    assert len(alts) == 1
    assert alts[0]["version"] == "KJV (LDS 2013 edition)"
    state = judgment_state(_row(expected="day time wording of this verse alone"), alts)
    assert state["indexed_other_wordings"][0]["text"].startswith("daytime")
    assert state["requested_text"].startswith("day time")


def test_judge_is_resumable_and_records_the_model(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    out = tmp_path / "judgments.jsonl"
    seen = {}

    def decide(state):
        seen["state"] = state
        return _payload(kind="refusal", refusal=0.9)

    row = _row(answer="I'm sorry, I can't provide that.")
    done, failed, _ = judge([row], out, decide=decide, concurrency=1)
    assert done == 1 and failed == 0
    written = json.loads(out.read_text().splitlines()[0])
    assert written["judge_model"] == JEV_MODEL
    assert written["judge_model_resolved"] == "typesafe/jev-1.13-20260917"
    assert written["model"] == "google/gemma-3-4b-it"
    assert written["kind"] == "refusal"
    assert seen["state"]["model_answer"].startswith("I'm sorry")

    done2, failed2, _ = judge([row], out, decide=decide, concurrency=1)
    assert done2 == 0 and failed2 == 0
    assert len(out.read_text().splitlines()) == 1

    with pytest.raises(JevError, match="OPENROUTER_API_KEY"):
        judge([row], tmp_path / "fresh.jsonl")


def test_failed_cell_is_not_written(tmp_path):
    out = tmp_path / "judgments.jsonl"

    def decide(state):
        raise JevError("decisions API 500: no")

    done, failed, messages = judge([_row()], out, decide=decide, concurrency=1)
    assert done == 0 and failed == 1 and "500" in messages[0]
    assert not out.exists() or out.read_text() == ""


def test_temperature_is_optional_and_bounded(tmp_path):
    assert sampling_kwargs(ModelSpec(id="m", provider="openai", model="x")) == {}
    assert sampling_kwargs(ModelSpec(id="m", provider="openai", model="x", temperature=0.0)) == {
        "temperature": 0.0
    }
    path = tmp_path / "models.yaml"
    path.write_text(
        "models:\n  - id: a\n    provider: openai\n    model: slug\n    temperature: 0\n"
    )
    spec = load_config(path).models[0]
    assert spec.temperature == 0.0
    path.write_text(
        "models:\n  - id: a\n    provider: openai\n    model: slug\n    temperature: 3\n"
    )
    with pytest.raises(ConfigError, match="temperature"):
        load_config(path)
