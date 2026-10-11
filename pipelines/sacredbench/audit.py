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
import re
from pathlib import Path

from sacredbench import catalogue as cat

# origin is the always-on gate; when a restricted PAYLOAD is present locally (never
# in CI / a fresh clone), the audit ALSO scans committed text for restricted units,
# so a restricted unit mislabeled with a public (work, version, language) is caught.
_MIN_FINGERPRINT = 60  # chars of normalized text — long enough to not false-positive


class AuditError(Exception):
    """A committed artifact is derived from a restricted source."""


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def restricted_text_fingerprints(
    sources: list[cat.Source], raw_root: Path = cat.RAW_ROOT, min_len: int = _MIN_FINGERPRINT
) -> set[str]:
    """Normalized unit texts of every restricted target whose payload is present
    locally. Empty when the held-back payloads are absent (CI / fresh clone), so the
    content scan is simply skipped there and only the origin gate runs."""
    from sacredbench import convert as conv

    fps: set[str] = set()
    for t in cat.all_targets(sources):
        if t.license != "restricted":
            continue
        paths = t.payload_paths(raw_root)
        if not paths or not all(p.exists() for p in paths):
            continue  # payload held back — nothing to fingerprint
        for doc in conv.convert_target(paths, t):
            for e in doc.entries:
                n = _norm(e.text)
                if len(n) >= min_len:
                    fps.add(n)
    return fps


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


def audit_paths(
    paths: list[Path], sources: list[cat.Source], restricted_texts: set[str] | None = None
) -> list[str]:
    """Return a list of violations in the given artifacts. Two layers:

    - **origin** (always): the artifact's source ``(work, version, language)`` maps
      to a ``restricted`` catalogue target.
    - **content** (when ``restricted_texts`` is supplied): the artifact's text
      contains a restricted unit's normalized text — catching a restricted unit
      mislabeled with a public source, which the origin layer alone cannot see.
    """
    restricted = restricted_keys(sources)
    fingerprints = restricted_texts or set()
    violations: list[str] = []
    for p in paths:
        p = Path(p)
        files = sorted(f for f in p.rglob("*") if f.suffix in (".json", ".jsonl")) if p.is_dir() else [p]
        for f in files:
            if f.suffix not in (".json", ".jsonl"):
                continue
            flagged = False
            for src in _iter_source_dicts(f):
                key = (src.get("work"), src.get("version"), src.get("language"))
                if key in restricted:
                    violations.append(f"{f}: derived from restricted source {key}")
                    flagged = True
                    break  # one origin violation per file is enough
            if flagged or not fingerprints:
                continue
            blob = _norm(f.read_text(encoding="utf-8"))
            for fp in fingerprints:
                if fp in blob:
                    violations.append(f"{f}: contains restricted text (…{fp[:48]}…)")
                    break  # one content violation per file is enough
    return violations
