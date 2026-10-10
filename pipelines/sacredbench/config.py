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


@dataclass(frozen=True)
class RunConfig:
    models: tuple[ModelSpec, ...]
    concurrency: int = 8


def load_config(path: Path) -> RunConfig:
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
        specs.append(
            ModelSpec(
                id=str(m["id"]),
                provider=m["provider"],
                model=str(m["model"]),
                max_tokens=int(m.get("max_tokens", 1024)),
                base_url=m.get("base_url"),
                api_key_env=m.get("api_key_env"),
            )
        )
    ids = [s.id for s in specs]
    if len(set(ids)) != len(ids):
        raise ConfigError(f"{path}: duplicate model ids in config")
    concurrency = int(data.get("concurrency", 8))
    if concurrency < 1:
        raise ConfigError(f"{path}: concurrency must be >= 1")
    return RunConfig(models=tuple(specs), concurrency=concurrency)
