"""Provider seam: one single-turn completion per (question, model).

Ported from multibench ``workflows/judging/judging/providers.py`` @ 14f6c9d4
(subject seam), trimmed to this pipeline's needs: single-turn prompts, no framing
prefix, no judge/schema seam yet (scoring is deterministic in Phase 1).

Kept from the original, deliberately:
- lazy SDK imports (tests mock at this seam without SDKs installed);
- missing credentials fail loud BEFORE any network call;
- bounded retries with linear backoff, then a loud ``ProviderError``;
- an explicit per-call HTTP timeout on EVERY live call (a hung socket must become
  a failed cell, never a wedged run);
- per-call usage extraction for cost accounting.

``provider: openai`` covers every OpenAI-chat-compatible host (OpenAI itself,
OpenRouter, …) via ``base_url`` + ``api_key_env``.
"""

from __future__ import annotations

import os
import time
from typing import Any

from sacredbench.config import ModelSpec

_BACKOFF_BASE_SECONDS = 2.0
REQUEST_TIMEOUT_SECONDS = 300.0


class ProviderError(Exception):
    """A provider call failed (credentials / transport / empty response) — fail loud."""


def _require_env(*names: str) -> None:
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        raise ProviderError(f"missing credential env var(s): {', '.join(missing)}")


def sampling_kwargs(model: ModelSpec) -> dict:
    """Provider sampling args. Temperature is omitted when unset, so the host default stands."""
    if model.temperature is None:
        return {}
    return {"temperature": model.temperature}


def complete(model: ModelSpec, prompt: str, retries: int = 2) -> tuple[str, dict, int]:
    """Single-turn completion. Returns ``(text, usage, attempts)``; raises ``ProviderError``."""
    if model.provider == "anthropic":
        call = _anthropic
    elif model.provider == "openai":
        call = _openai
    elif model.provider == "gemini":
        call = _gemini
    else:
        raise ProviderError(
            f"unsupported provider {model.provider!r} (supported: anthropic, openai, gemini)"
        )
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            text, usage = call(model, prompt)
            if not text.strip():
                raise RuntimeError("empty response")
            return text.strip(), usage, attempt + 1
        except ProviderError:
            raise  # credentials / config: not transient, don't retry
        except Exception as e:  # noqa: BLE001 — transient API/transport; retry then fail
            last = e
            if attempt < retries:
                time.sleep(_BACKOFF_BASE_SECONDS * (attempt + 1))
    raise ProviderError(f"{model.id}: call failed after {retries + 1} attempts: {last}")


def _anthropic(model: ModelSpec, prompt: str) -> tuple[str, dict]:
    _require_env("ANTHROPIC_API_KEY")
    import anthropic

    client = anthropic.Anthropic(timeout=REQUEST_TIMEOUT_SECONDS)
    resp = client.messages.create(
        model=model.model,
        max_tokens=model.max_tokens,
        messages=[{"role": "user", "content": prompt}],
        **sampling_kwargs(model),
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return text, _anthropic_usage(resp)


def _openai(model: ModelSpec, prompt: str) -> tuple[str, dict]:
    env = model.api_key_env or "OPENAI_API_KEY"
    _require_env(env)
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ[env], base_url=model.base_url, timeout=REQUEST_TIMEOUT_SECONDS
    )
    # OpenAI proper only accepts `max_completion_tokens`; OpenAI-compatible hosts
    # (base_url set: OpenRouter etc.) still take legacy `max_tokens`.
    tok_kwarg = "max_tokens" if model.base_url else "max_completion_tokens"
    resp = client.chat.completions.create(
        model=model.model,
        messages=[{"role": "user", "content": prompt}],
        **{tok_kwarg: model.max_tokens},
        **sampling_kwargs(model),
    )
    text = resp.choices[0].message.content or ""
    usage = _openai_usage(resp)
    # OpenRouter reports the actual serving host; record it for provenance.
    provider = getattr(resp, "provider", None)
    if provider:
        usage["provider"] = provider
    return text, usage


def _gemini(model: ModelSpec, prompt: str) -> tuple[str, dict]:
    _require_env("GEMINI_API_KEY")
    from google import genai
    from google.genai import types

    client = genai.Client(
        http_options=types.HttpOptions(timeout=int(REQUEST_TIMEOUT_SECONDS * 1000))
    )
    resp = client.models.generate_content(
        model=model.model,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=model.max_tokens, **sampling_kwargs(model)
        ),
    )
    text = getattr(resp, "text", None) or ""
    return text, _gemini_usage(resp)


# --- Usage extraction (best-effort; defensive) --------------------------------


def _anthropic_usage(resp: Any) -> dict:
    u = getattr(resp, "usage", None)
    if u is None:
        return {}
    return {
        "in": getattr(u, "input_tokens", 0) or 0,
        "out": getattr(u, "output_tokens", 0) or 0,
    }


def _openai_usage(resp: Any) -> dict:
    u = getattr(resp, "usage", None)
    if u is None:
        return {}
    return {
        "in": getattr(u, "prompt_tokens", 0) or 0,
        "out": getattr(u, "completion_tokens", 0) or 0,
    }


def _gemini_usage(resp: Any) -> dict:
    u = getattr(resp, "usage_metadata", None)
    if u is None:
        return {}
    return {
        "in": getattr(u, "prompt_token_count", 0) or 0,
        "out": (getattr(u, "candidates_token_count", 0) or 0)
        + (getattr(u, "thoughts_token_count", 0) or 0),
    }
