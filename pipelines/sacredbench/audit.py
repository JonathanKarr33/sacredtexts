"""Copyright audit for committed artifacts.

The copyright gate (Spec 1) says no text derived from a ``restricted`` source
(NABRE, the TLG Greek Orthodox extracts) may be committed to this public repo.
This audit enforces it mechanically rather than by a pre-commit promise: it reads a
set of committed artifacts (standardized documents and the run evidence —
``questions.jsonl`` / ``answers.jsonl``), recovers each one's source
``(work, version, language)``, and fails if any maps to a ``restricted`` catalogue
target. Since restricted payloads are never committed, origin is the enforceable
proxy for "contains restricted text": an artifact derived from a restricted source
is exactly what must not be here.

Run it over the evidence before committing, and in the test gate:

    uv --project pipelines run python -m sacredbench audit runs/<id> texts/standardized
"""

from __future__ import annotations

import json
from pathlib import Path

from sacredbench import catalogue as cat


class AuditError(Exception):
    """A committed artifact is derived from a restricted source."""


def restricted_keys(sources: list[cat.Source]) -> set[tuple[str, str, str]]:
    """The ``(work, version, language)`` of every restricted catalogue target."""
    return {
        (t.work, t.version, t.language)
        for t in cat.all_targets(sources)
        if t.license == "restricted"
    }


def _iter_source_dicts(path: Path):
    """Yield the ``source`` metadata of every record in a standardized document or
    an evidence row (questions/answers jsonl)."""
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return
    try:
        objs = [json.loads(text)]  # a single JSON object (standardized Document)
    except json.JSONDecodeError:
        objs = [json.loads(line) for line in text.splitlines() if line.strip()]  # jsonl
    for d in objs:
        if not isinstance(d, dict):
            continue
        src = d.get("source")
        if not isinstance(src, dict):
            q = d.get("question")
            src = q.get("source") if isinstance(q, dict) else None
        if isinstance(src, dict):
            yield src


def audit_paths(paths: list[Path], sources: list[cat.Source]) -> list[str]:
    """Return a list of violations: committed artifacts derived from a restricted source."""
    restricted = restricted_keys(sources)
    violations: list[str] = []
    for p in paths:
        p = Path(p)
        files = sorted(f for f in p.rglob("*") if f.suffix in (".json", ".jsonl")) if p.is_dir() else [p]
        for f in files:
            if f.suffix not in (".json", ".jsonl"):
                continue
            for src in _iter_source_dicts(f):
                key = (src.get("work"), src.get("version"), src.get("language"))
                if key in restricted:
                    violations.append(f"{f}: derived from restricted source {key}")
                    break  # one violation per file is enough
    return violations
