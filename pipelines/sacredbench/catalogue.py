"""The source catalogue: ``texts/raw/**/source.yaml`` as a *targets* manifest.

The real ``texts/raw`` tree is grouped **one directory per tradition**, each
holding many works, versions, and source shapes (Protestant = KJV/ASV/WEB; Sunni
= Quran + nine hadith collections; LDS = five works; Talmud = dozens of tractate
shards; Roman Catholic = encyclicals + the restricted NABRE). A single flat
record cannot describe that, so each tradition directory carries one committed
``source.yaml`` with a ``targets:`` list; every target is one
``(work, version, language)`` unit:

    source_url: <optional provenance URL for the whole directory>
    notes: <optional free text>
    targets:
      - payload: "kjv.json"          # glob, relative to this source.yaml
        converter: bible_flat        # key into convert.CONVERTERS (bodies land in later phases)
        work: "The Bible"
        version: "KJV"
        language: en
        document_type: scripture
        tradition: ["Protestant Christian"]   # a bare string is accepted too
        license: public-domain                 # public-domain | open | restricted
        license_detail: "KJV — public domain"  # optional: the real upstream string, verbatim

``license`` is the three-value gate. ``restricted`` targets (copyrighted
translations whose payloads are git-ignored and local-only) are excluded from
``convert``/``generate`` unless ``--include-restricted`` is passed; ``validate``
is unaffected by license.

**Standardized-path convention.** A target's converted output lives under
``texts/standardized/<source-id>/<target-slug>/`` mirroring
``texts/raw/<source-id>``. That lets ``generate`` recover a standardized
document's license from its path alone — the interchange ``Document`` format
stays unchanged (it carries no ``license``).

Loading is fail-fast: a malformed target or unknown ``license`` raises
``CatalogueError`` naming the file and the offending target.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

LICENSES = ("public-domain", "open", "restricted")

#: Default roots, resolved relative to the repo root (the CLI runs from there).
RAW_ROOT = Path("texts/raw")
STANDARDIZED_ROOT = Path("texts/standardized")

_TARGET_REQUIRED = (
    "payload",
    "converter",
    "work",
    "version",
    "language",
    "document_type",
    "tradition",
    "license",
)
_TARGET_STR_FIELDS = ("payload", "converter", "work", "version", "language", "document_type")


class CatalogueError(Exception):
    """A ``source.yaml`` does not conform to the catalogue format."""


def _slugify(text: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")


@dataclass(frozen=True)
class Target:
    """One ``(work, version, language)`` conversion unit within a ``source.yaml``."""

    source_id: str  # POSIX path of the source dir relative to the raw root (may contain '/')
    payload: str  # glob, relative to the source.yaml directory
    converter: str  # key into convert.CONVERTERS (converter bodies land in later phases)
    work: str
    version: str
    language: str
    document_type: str
    tradition: tuple[str, ...]
    license: str
    license_detail: str | None = None

    @property
    def slug(self) -> str:
        """Filesystem-safe id for the target's standardized output directory."""
        return _slugify(f"{self.work}-{self.version}-{self.language}")

    def standardized_dir(self, standardized_root: Path = STANDARDIZED_ROOT) -> Path:
        return standardized_root / self.source_id / self.slug

    def payload_paths(self, raw_root: Path = RAW_ROOT) -> list[Path]:
        """Resolve this target's payload glob against its source directory."""
        return sorted((raw_root / self.source_id).glob(self.payload))


@dataclass(frozen=True)
class Source:
    """One committed ``source.yaml`` (one tradition directory)."""

    source_id: str
    yaml_path: Path
    targets: tuple[Target, ...]
    source_url: str | None = None
    notes: str | None = None


def load_source(yaml_path: Path, raw_root: Path = RAW_ROOT) -> Source:
    """Parse and validate one ``source.yaml``. Raises ``CatalogueError`` fail-fast."""
    where = str(yaml_path)
    with open(yaml_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise CatalogueError(f"{where}: top level must be a mapping")
    try:
        source_id = yaml_path.parent.resolve().relative_to(Path(raw_root).resolve()).as_posix()
    except ValueError as e:
        raise CatalogueError(f"{where}: not located under raw root {raw_root}") from e
    targets_raw = data.get("targets")
    if not isinstance(targets_raw, list) or not targets_raw:
        raise CatalogueError(f"{where}: 'targets' must be a non-empty list")
    targets: list[Target] = []
    for i, t in enumerate(targets_raw):
        if not isinstance(t, dict):
            raise CatalogueError(f"{where}: targets[{i}] is not a mapping")
        for key in _TARGET_REQUIRED:
            if key not in t:
                raise CatalogueError(f"{where}: targets[{i}] missing required field '{key}'")
        for key in _TARGET_STR_FIELDS:
            if not isinstance(t[key], str) or not t[key].strip():
                raise CatalogueError(f"{where}: targets[{i}].{key} must be a non-empty string")
        tradition = t["tradition"]
        if isinstance(tradition, str):
            tradition = [tradition]
        if not (isinstance(tradition, list) and tradition and all(isinstance(x, str) for x in tradition)):
            raise CatalogueError(
                f"{where}: targets[{i}].tradition must be a non-empty string or list of strings"
            )
        license_ = t["license"]
        if license_ not in LICENSES:
            raise CatalogueError(
                f"{where}: targets[{i}] unknown license {license_!r} (allowed: {', '.join(LICENSES)})"
            )
        detail = t.get("license_detail")
        if detail is not None and not isinstance(detail, str):
            raise CatalogueError(f"{where}: targets[{i}].license_detail must be a string")
        targets.append(
            Target(
                source_id=source_id,
                payload=t["payload"],
                converter=t["converter"],
                work=t["work"],
                version=t["version"],
                language=t["language"],
                document_type=t["document_type"],
                tradition=tuple(tradition),
                license=license_,
                license_detail=detail,
            )
        )
    return Source(
        source_id=source_id,
        yaml_path=yaml_path,
        targets=tuple(targets),
        source_url=data.get("source_url"),
        notes=data.get("notes"),
    )


def discover_catalogue(raw_root: Path = RAW_ROOT) -> list[Source]:
    """Load every ``texts/raw/**/source.yaml``. Fail-fast if the root or files are absent."""
    if not Path(raw_root).exists():
        raise CatalogueError(f"{raw_root}: raw texts root not found")
    yamls = sorted(Path(raw_root).glob("**/source.yaml"))
    if not yamls:
        raise CatalogueError(f"{raw_root}: no source.yaml found under the raw root")
    return [load_source(y, raw_root) for y in yamls]


def all_targets(sources: list[Source]) -> list[Target]:
    return [t for s in sources for t in s.targets]


def select_targets(sources: list[Source], include_restricted: bool = False) -> list[Target]:
    """Targets to convert/generate: ``restricted`` excluded unless ``include_restricted``."""
    return [t for t in all_targets(sources) if include_restricted or t.license != "restricted"]


def license_for_raw_path(path: Path, sources: list[Source], raw_root: Path = RAW_ROOT) -> str | None:
    """License of a raw payload file via the target whose payload glob matches it.

    Returns ``None`` if no target matches (the path is outside the catalogue).
    If several targets match, the most conservative (``restricted``) wins.
    """
    resolved = Path(path).resolve()
    matched: list[str] = []
    for t in all_targets(sources):
        for f in t.payload_paths(raw_root):
            if f.resolve() == resolved:
                matched.append(t.license)
                break
    if not matched:
        return None
    return "restricted" if "restricted" in matched else matched[0]


def license_for_standardized_path(
    path: Path, sources: list[Source], standardized_root: Path = STANDARDIZED_ROOT
) -> str | None:
    """License of a standardized document, recovered from its path.

    Matches the deepest target ``standardized_dir`` that contains ``path``.
    Returns ``None`` if the path is under no target directory.
    """
    resolved = Path(path).resolve()
    best_depth = -1
    best_license: str | None = None
    for t in all_targets(sources):
        target_dir = t.standardized_dir(standardized_root).resolve()
        if resolved == target_dir or target_dir in resolved.parents:
            depth = len(target_dir.parts)
            if depth > best_depth:
                best_depth, best_license = depth, t.license
    return best_license


def expand_json(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files.extend(sorted(p.rglob("*.json")))
        else:
            files.append(p)
    return files


def filter_standardized_paths(
    paths: list[Path],
    sources: list[Source],
    include_restricted: bool = False,
    standardized_root: Path = STANDARDIZED_ROOT,
) -> list[Path]:
    """Drop standardized files that map to a ``restricted`` target (unless opted in).

    Files outside every target directory have no recoverable license and are kept
    (the hard copyright backstop is the committed-artifact audit, not this filter).
    """
    kept: list[Path] = []
    for f in expand_json(paths):
        license_ = license_for_standardized_path(f, sources, standardized_root)
        if license_ == "restricted" and not include_restricted:
            continue
        kept.append(f)
    return kept
