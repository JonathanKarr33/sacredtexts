"""Run configuration (YAML): the model panel and run parameters.

    concurrency: 8
    models:
      - id: haiku            # short id used in results files
        provider: anthropic  # anthropic | openai | gemini
        model: claude-haiku-5-5
        max_tokens: 1024
      - id: gemma-4
        provider: openai     # any OpenAI-chat-compatible host
        base_url: https://openrouter.ai/api/v1
        api_key_env: OPENROUTER_API_KEY
        model: google/gemma-4-27b-it
        max_tokens: 1024

Fail-fast: unknown providers, duplicate ids, and missing required keys raise
``ConfigError`` at load time, before any provider call.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

PROVIDERS = ("anthropic", "openai", "gemini")
# Tool-use settings a panel entry may request. Today only web search, which is an
# Anthropic server-side tool — so it is valid only on provider=anthropic (fail-fast).
TOOLS = ("web_search",)
_ANTHROPIC_ONLY_TOOLS = frozenset({"web_search"})


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class ModelSpec:
    id: str
    provider: str
    model: str
    max_tokens: int = 1024
    base_url: str | None = None
    api_key_env: str | None = None
    # optional USD price per 1M tokens; both must be given to compute a cost
    price_in: float | None = None
    price_out: float | None = None
    # tool-use settings (e.g. ("web_search",)); part of the model's panel identity
    tools: tuple[str, ...] = ()


@dataclass(frozen=True)
class RunConfig:
    models: tuple[ModelSpec, ...]
    concurrency: int = 8


def _parse_tools(raw, provider: str, i: int, path: Path) -> tuple[str, ...]:
    """Validate a model entry's optional ``tools`` list, fail-fast. ``None`` → no tools.
    A non-list, an unrecognised value, or an Anthropic-only tool on another provider is a
    ``ConfigError`` — never silently ignored (the YAML key is otherwise unchecked today)."""
    if raw is None:
        return ()
    if not isinstance(raw, list):
        raise ConfigError(f"{path}: models[{i}] 'tools' must be a list, got {type(raw).__name__}")
    tools: list[str] = []
    for t in raw:
        if t not in TOOLS:
            raise ConfigError(
                f"{path}: models[{i}] unknown tool {t!r} (supported: {TOOLS})"
            )
        if t in _ANTHROPIC_ONLY_TOOLS and provider != "anthropic":
            raise ConfigError(
                f"{path}: models[{i}] tool {t!r} is an Anthropic server-side tool and "
                f"requires provider 'anthropic', not {provider!r}"
            )
        tools.append(t)
    # order-independent identity: a model's tools are a set, serialised sorted
    return tuple(sorted(set(tools)))


def load_config(path: Path) -> RunConfig:
    if not Path(path).exists():
        raise ConfigError(
            f"{path}: run config not found — copy configs/models.example.yaml to "
            "configs/models.yaml and set your panel (keys come from the environment)"
        )
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict) or not isinstance(data.get("models"), list) or not data["models"]:
        raise ConfigError(f"{path}: config must have a non-empty 'models' list")
    specs: list[ModelSpec] = []
    for i, m in enumerate(data["models"]):
        if not isinstance(m, dict):
            raise ConfigError(f"{path}: models[{i}] is not a mapping")
        for key in ("id", "provider", "model"):
            if not m.get(key):
                raise ConfigError(f"{path}: models[{i}] missing required key '{key}'")
        if m["provider"] not in PROVIDERS:
            raise ConfigError(
                f"{path}: models[{i}] unknown provider {m['provider']!r} (supported: {PROVIDERS})"
            )
        price_in, price_out = m.get("price_in"), m.get("price_out")
        if (price_in is None) != (price_out is None):
            raise ConfigError(
                f"{path}: models[{i}] must set both price_in and price_out (USD per 1M tokens) or neither"
            )
        for pk, pv in (("price_in", price_in), ("price_out", price_out)):
            if pv is not None and (not isinstance(pv, (int, float)) or pv < 0):
                raise ConfigError(f"{path}: models[{i}] {pk} must be a non-negative number")
        tools = _parse_tools(m.get("tools"), m["provider"], i, path)
        specs.append(
            ModelSpec(
                id=str(m["id"]),
                provider=m["provider"],
                model=str(m["model"]),
                max_tokens=int(m.get("max_tokens", 1024)),
                base_url=m.get("base_url"),
                api_key_env=m.get("api_key_env"),
                price_in=float(price_in) if price_in is not None else None,
                price_out=float(price_out) if price_out is not None else None,
                tools=tools,
            )
        )
    ids = [s.id for s in specs]
    if len(set(ids)) != len(ids):
        raise ConfigError(f"{path}: duplicate model ids in config")
    concurrency = int(data.get("concurrency", 8))
    if concurrency < 1:
        raise ConfigError(f"{path}: concurrency must be >= 1")
    return RunConfig(models=tuple(specs), concurrency=concurrency)
