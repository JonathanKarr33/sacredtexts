"""Web-search tool: config validation, collect fingerprint, provider seam, and the
tools-aware panel identity (Spec 8, Phase 2). No live API calls — the Anthropic SDK is
faked at its lazy import site."""

from __future__ import annotations

import json
import sys
import types
from datetime import datetime
from pathlib import Path

import pytest

from sacredbench import collect as collect_mod
from sacredbench import providers
from sacredbench.collect import CollectError, _panel_fingerprint, collect
from sacredbench.config import ConfigError, ModelSpec, RunConfig, load_config
from sacredbench.generate import Question
from sacredbench.providers import ProviderError, complete
from sacredbench.score import score_file

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "configs" / "models.example.yaml"


# --- config validation -------------------------------------------------------


def test_example_panel_loads_as_four_entries():
    cfg = load_config(EXAMPLE)
    assert [m.id for m in cfg.models] == ["opus-search", "opus", "haiku-search", "haiku"]
    by_id = {m.id: m for m in cfg.models}
    assert by_id["opus-search"].tools == ("web_search",) and by_id["opus"].tools == ()
    assert by_id["haiku-search"].tools == ("web_search",) and by_id["haiku"].tools == ()
    assert all(m.price_in is None and m.price_out is None for m in cfg.models)  # unpriced


def _write(tmp_path, models) -> Path:
    import yaml
    p = tmp_path / "cfg.yaml"
    p.write_text(yaml.safe_dump({"models": models}))
    return p


def test_web_search_on_non_anthropic_rejected(tmp_path):
    cfg = _write(tmp_path, [{"id": "a", "provider": "openai", "model": "m",
                            "base_url": "https://x/v1", "api_key_env": "K", "tools": ["web_search"]}])
    with pytest.raises(ConfigError, match="requires provider 'anthropic'"):
        load_config(cfg)


def test_unknown_tool_rejected(tmp_path):
    cfg = _write(tmp_path, [{"id": "a", "provider": "anthropic", "model": "m", "tools": ["code_exec"]}])
    with pytest.raises(ConfigError, match="unknown tool"):
        load_config(cfg)


def test_non_list_tools_rejected(tmp_path):
    cfg = _write(tmp_path, [{"id": "a", "provider": "anthropic", "model": "m", "tools": "web_search"}])
    with pytest.raises(ConfigError, match="'tools' must be a list"):
        load_config(cfg)


# --- collect panel fingerprint -----------------------------------------------


def test_fingerprint_distinguishes_tools():
    on = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=("web_search",))
    off = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=())
    assert _panel_fingerprint(on) != _panel_fingerprint(off)
    assert _panel_fingerprint(on).endswith("|web_search") and _panel_fingerprint(off).endswith("|")


def test_flipped_tools_resume_refused(tmp_path, monkeypatch):
    answers = tmp_path / "answers.jsonl"
    q = Question(id="retrieve_quote-aaaaaa", task="retrieve_quote", prompt="p",
                 expected={"text": "x"},
                 source={"tradition": ["T"], "work": "W", "version": "V", "language": "ar",
                         "document_type": "scripture", "citation": "W 1:1"})
    monkeypatch.setattr(collect_mod, "complete", lambda m, p, retries=2: ("a", {"in": 1, "out": 1}, 1))
    on = RunConfig(models=(ModelSpec(id="m", provider="anthropic", model="claude-haiku-5-5", tools=("web_search",)),), concurrency=1)
    off = RunConfig(models=(ModelSpec(id="m", provider="anthropic", model="claude-haiku-5-5", tools=()),), concurrency=1)
    collect([q], on, answers)  # collected WITH web search
    with pytest.raises(CollectError, match="different panel identity"):
        collect([q], off, answers)  # resume WITHOUT -> refused


# --- provider seam (fake SDK at the lazy import site) ------------------------


class _Block:
    def __init__(self, type_, text=""):
        self.type, self.text = type_, text


class _Usage:
    def __init__(self, in_=3, out=4, web=None):
        self.input_tokens, self.output_tokens = in_, out
        self.server_tool_use = types.SimpleNamespace(web_search_requests=web) if web is not None else None


class _Resp:
    def __init__(self, content, usage, stop_reason="end_turn"):
        self.content, self.usage, self.stop_reason = content, usage, stop_reason


def _install_fake_anthropic(monkeypatch, resp):
    """Fake the SDK the way `_anthropic` imports it: `import anthropic` inside the function
    (so patching sys.modules is required; there is no module-level import to setattr)."""
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        return resp

    client_obj = types.SimpleNamespace(messages=types.SimpleNamespace(create=create))
    fake = types.ModuleType("anthropic")
    fake.Anthropic = lambda **kw: client_obj
    monkeypatch.setitem(sys.modules, "anthropic", fake)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    return captured


def test_web_search_tool_passed_only_when_enabled(monkeypatch):
    resp = _Resp([_Block("text", "the answer")], _Usage(web=2))
    captured = _install_fake_anthropic(monkeypatch, resp)
    on = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=("web_search",))
    text, usage, attempts = complete(on, "prompt")
    assert text == "the answer"
    assert captured["tools"] == [providers.WEB_SEARCH_TOOL]  # tool passed
    assert usage["web_search_requests"] == 2                  # request count recorded

    captured.clear()
    off = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=())
    complete(off, "prompt")
    assert "tools" not in captured                            # not passed when disabled


def test_extracts_text_alongside_tool_and_citation_blocks(monkeypatch):
    content = [
        _Block("server_tool_use"), _Block("web_search_tool_result"),
        _Block("text", "In the beginning "), _Block("text", "was the Word."),
    ]
    _install_fake_anthropic(monkeypatch, _Resp(content, _Usage()))
    on = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=("web_search",))
    text, _, _ = complete(on, "prompt")
    assert text == "In the beginning was the Word."  # only the text blocks, joined


@pytest.mark.parametrize("stop_reason", ["max_tokens", "pause_turn", "refusal", "model_context_window_exceeded"])
def test_incomplete_turn_fails_loud_not_committed(monkeypatch, stop_reason):
    # an incomplete turn (truncation, or a paused server-tool turn) must NOT commit its
    # partial text and must NOT retry (re-billing the web search) — it fails loud.
    _install_fake_anthropic(monkeypatch, _Resp([_Block("text", "partial")], _Usage(), stop_reason=stop_reason))
    on = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=("web_search",))
    with pytest.raises(ProviderError, match="incomplete turn"):
        complete(on, "prompt")


def test_terminal_stop_reasons_succeed(monkeypatch):
    for sr in ("end_turn", "stop_sequence"):
        _install_fake_anthropic(monkeypatch, _Resp([_Block("text", "ok")], _Usage(), stop_reason=sr))
        off = ModelSpec(id="x", provider="anthropic", model="claude-haiku-5-5", tools=())
        text, _, _ = complete(off, "prompt")
        assert text == "ok"


# --- tools-aware panel identity in summary.json ------------------------------


def _answer(qid, model_id, api_model, digest="d"):
    return {
        "question_id": qid, "model_id": model_id, "task": "retrieve_quote",
        "model": api_model, "question_set_digest": digest,
        "answer": "x", "usage": {"in": 1, "out": 1},
        "question": {"expected": {"text": "x"}, "source": {"tradition": ["T"]}},
    }


def test_panel_identity_marks_both_variants_and_avoids_first_run_collision(tmp_path):
    answers = tmp_path / "answers.jsonl"
    rows = [_answer("retrieve_quote-0", "haiku-search", "claude-haiku-5-5"),
            _answer("retrieve_quote-1", "haiku", "claude-haiku-5-5")]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    # panel as cli.py builds it: marked model + raw api_model
    panel = {
        "haiku-search": {"provider": "anthropic", "model": "claude-haiku-5-5 [web_search]",
                         "api_model": "claude-haiku-5-5", "endpoint": "api.anthropic.com"},
        "haiku": {"provider": "anthropic", "model": "claude-haiku-5-5 [no-tools]",
                  "api_model": "claude-haiku-5-5", "endpoint": "api.anthropic.com"},
    }
    summary = score_file(answers, tmp_path / "scores.jsonl", panel=panel)
    p = summary["panel"]

    def key(mid):
        return f"{p[mid]['provider']}\u0000{p[mid]['model']}"

    # the two variants get distinct standings keys...
    assert key("haiku-search") != key("haiku")
    # ...and NEITHER collides with first-run's bare committed key (no silent row replacement)
    first_run_key = "anthropic\u0000claude-haiku-5-5"
    assert key("haiku-search") != first_run_key and key("haiku") != first_run_key
    # api_model keeps the true model recoverable (equal for both); no secrets present
    assert p["haiku-search"]["api_model"] == p["haiku"]["api_model"] == "claude-haiku-5-5"
    # panel carries only non-secret identity fields
    assert set(p["haiku"]) == {"provider", "model", "api_model", "endpoint", "served_by"}
    # generated_at present and ISO-parseable (Issue #7 half)
    assert datetime.fromisoformat(summary["generated_at"])
