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
        requested_as: ["the King James Version", "the KJV", "the King James Bible"]  # names used (>=1)
        canonical_language: en                 # the language this text is canonically in

``requested_as`` is the non-empty list of names a person would use for this edition; ``generate``
renders ``<edition>`` as a seeded uniform choice from it. ``canonical_language`` is the language this
text is canonically in (its authoritative wording — ``en`` for the KJV, not only a composition
language); a text is in the question pool only when ``language == canonical_language``.
Both are catalogue facts, not ``Document`` facts, and reach ``generate`` through
``metadata_for_standardized_path`` — recovered from the document's path like ``license``, since a
standardized ``Document`` carries neither and some converters (``encyclicals``) re-stamp
``work``/``version`` per document, so a ``(work, version, language)`` key cannot resolve them.
``text_metadata`` is a separate, *nominal* catalogue-wide view (keyed on each target's own tuple) that
exists to fail-fast on a cross-source metadata conflict — not the per-document resolution channel.

``license`` is the three-value gate. ``restricted`` targets (copyrighted
translations whose payloads are git-ignored and local-only) are excluded from
``convert``/``generate`` unless ``--include-restricted`` is passed; ``validate``
is unaffected by license.

**Standardized-path convention.** A target's converted output lives under
``texts/standardized/<source-id>/<target-slug>/`` mirroring
``texts/raw/<source-id>``. That lets ``generate`` recover a standardized
document's ``license`` *and* its text metadata (``requested_as`` /
``canonical_language``) from its path alone — the interchange ``Document`` format
stays unchanged (it carries neither).

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
    "requested_as",
    "canonical_language",
)
_TARGET_STR_FIELDS = (
    "payload",
    "converter",
    "work",
    "version",
    "language",
    "document_type",
    "canonical_language",
)
_PROVENANCE_REQUIRED = ("retrieved_from", "fetch_method", "fetch_date")


class CatalogueError(Exception):
    """A ``source.yaml`` does not conform to the catalogue format."""


class CatalogueMissing(CatalogueError):
    """No catalogue could be discovered (absent root, or no ``source.yaml``).

    A distinct type so callers can fail loudly instead of silently running with
    the license gate disabled — never swallowed by substring-matching a message.
    """


def _slugify(text: str) -> str:
    """Lowercase alnum, runs of anything else collapsed to a single hyphen."""
    out: list[str] = []
    prev_dash = False
    for c in text.lower():
        if c.isalnum():
            out.append(c)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


@dataclass(frozen=True)
class Provenance:
    """Where a payload came from, how, and when (spec requires this on every source)."""

    retrieved_from: str  # URL / repo (optionally @commit)
    fetch_method: str
    fetch_date: str  # YYYY-MM-DD, or "unknown" when the upstream drop recorded none


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
    provenance: Provenance
    requested_as: tuple[str, ...]  # names a person uses for this edition (>=1); seeded choice at generate
    canonical_language: str  # language this text is canonically in; in default pool iff language == this
    license_detail: str | None = None

    @property
    def slug(self) -> str:
        """Filesystem-safe id for the target's standardized output directory."""
        return _slugify(f"{self.work}-{self.version}-{self.language}")

    @property
    def text_key(self) -> tuple[str, str, str]:
        """The ``(work, version, language)`` tuple that groups documents into one text."""
        return (self.work, self.version, self.language)

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
    provenance: Provenance
    source_url: str | None = None
    notes: str | None = None


def _parse_provenance(raw: object, where: str) -> Provenance:
    if not isinstance(raw, dict):
        raise CatalogueError(f"{where}: 'provenance' must be a mapping with {_PROVENANCE_REQUIRED}")
    for key in _PROVENANCE_REQUIRED:
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            raise CatalogueError(f"{where}: provenance.{key} must be a non-empty string")
    return Provenance(
        retrieved_from=raw["retrieved_from"],
        fetch_method=raw["fetch_method"],
        fetch_date=raw["fetch_date"],
    )


def load_source(yaml_path: Path, raw_root: Path = RAW_ROOT) -> Source:
    """Parse and validate one ``source.yaml``. Raises ``CatalogueError`` fail-fast."""
    where = str(yaml_path)
    with open(yaml_path, encoding="utf-8") as f:
        try:
            data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise CatalogueError(f"{where}: invalid YAML ({e})") from e
    if not isinstance(data, dict):
        raise CatalogueError(f"{where}: top level must be a mapping")
    try:
        source_id = yaml_path.parent.resolve().relative_to(Path(raw_root).resolve()).as_posix()
    except ValueError as e:
        raise CatalogueError(f"{where}: not located under raw root {raw_root}") from e
    if "provenance" not in data:
        raise CatalogueError(f"{where}: missing required 'provenance' block")
    source_provenance = _parse_provenance(data["provenance"], where)
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
        requested_as = t["requested_as"]
        if not (
            isinstance(requested_as, list)
            and requested_as
            and all(isinstance(x, str) and x.strip() for x in requested_as)
        ):
            raise CatalogueError(
                f"{where}: targets[{i}].requested_as must be a non-empty list of non-empty strings"
            )
        detail = t.get("license_detail")
        if detail is not None and not isinstance(detail, str):
            raise CatalogueError(f"{where}: targets[{i}].license_detail must be a string")
        provenance = (
            _parse_provenance(t["provenance"], f"{where}: targets[{i}]")
            if "provenance" in t
            else source_provenance
        )
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
                provenance=provenance,
                requested_as=tuple(name.strip() for name in requested_as),
                canonical_language=t["canonical_language"],
                license_detail=detail,
            )
        )
    # Targets that share a standardized directory (slug) must agree on the facts that
    # are recovered by path, or that recovery would be ambiguous: license (a collision
    # could expose restricted text) and the text metadata (requested_as / canonical_language)
    # that generation recovers per standardized path. The error names the fields that differ.
    by_slug: dict[str, list[Target]] = {}
    for t in targets:
        by_slug.setdefault(t.slug, []).append(t)
    for slug, group in by_slug.items():
        differing = [
            field
            for field in ("license", "requested_as", "canonical_language")
            if len({getattr(t, field) for t in group}) > 1
        ]
        if differing:
            raise CatalogueError(
                f"{where}: targets sharing standardized slug {slug!r} disagree on "
                f"{' / '.join(differing)} — they would collide in one directory"
            )
    return Source(
        source_id=source_id,
        yaml_path=yaml_path,
        targets=tuple(targets),
        provenance=source_provenance,
        source_url=data.get("source_url"),
        notes=data.get("notes"),
    )


def discover_catalogue(raw_root: Path = RAW_ROOT) -> list[Source]:
    """Load every ``texts/raw/**/source.yaml``.

    Raises ``CatalogueMissing`` (a ``CatalogueError``) if the root or the manifests
    are absent — callers must handle that loudly, never by disabling the gate.
    """
    if not Path(raw_root).exists():
        raise CatalogueMissing(f"{raw_root}: raw texts root not found")
    yamls = sorted(Path(raw_root).glob("**/source.yaml"))
    if not yamls:
        raise CatalogueMissing(f"{raw_root}: no source.yaml found under the raw root")
    return [load_source(y, raw_root) for y in yamls]


def all_targets(sources: list[Source]) -> list[Target]:
    return [t for s in sources for t in s.targets]


@dataclass(frozen=True)
class TextMeta:
    """Per-text catalogue facts that ``generate`` needs but a ``Document`` does not carry."""

    requested_as: tuple[str, ...]  # names a person uses; <edition> is a seeded choice from these
    canonical_language: str  # in the default pool iff a text's language == this
    target_key: tuple[str, str, str]  # the catalogue TARGET's (work, version, language)
    # — stable across documents a converter re-stamps (e.g. every encyclical resolves to the
    # one Papal Encyclicals target), so exclusions aggregate to the target, not the document.


def text_metadata(sources: list[Source]) -> dict[tuple[str, str, str], TextMeta]:
    """A catalogue-wide ``(work, version, language)`` -> :class:`TextMeta` view.

    **Conflict-detecting across sources.** ``load_source``'s slug-agreement check runs
    per ``source.yaml``; ``discover_catalogue`` never cross-checks, so two *different*
    files could declare the same ``(work, version, language)`` with different metadata.
    This raises ``CatalogueError`` on such a global conflict rather than silently letting
    the last target win.

    This is a *nominal* view keyed on each target's own tuple. It is **not** the channel
    generation uses to resolve a standardized document, because converters such as
    ``encyclicals`` re-stamp ``work``/``version`` per document, so an emitted document's
    tuple need not appear here — use :func:`metadata_for_standardized_path` for that.
    """
    meta: dict[tuple[str, str, str], TextMeta] = {}
    for t in all_targets(sources):
        tm = TextMeta(requested_as=t.requested_as, canonical_language=t.canonical_language, target_key=t.text_key)
        prev = meta.get(t.text_key)
        if prev is not None and prev != tm:
            raise CatalogueError(
                f"catalogue targets share (work, version, language)={t.text_key!r} across "
                "sources but disagree on requested_as / canonical_language — ambiguous metadata"
            )
        meta[t.text_key] = tm
    return meta


def metadata_for_standardized_path(
    path: Path, sources: list[Source], standardized_root: Path = STANDARDIZED_ROOT
) -> TextMeta | None:
    """Per-document ``requested_as`` / ``canonical_language``, recovered from the path.

    This is the channel generation uses: a standardized ``Document`` carries no catalogue
    facts, and ``license`` reaches generation only as a *path* filter (which discards the
    path->doc association), so a name cannot travel with the document. Recovery is by path,
    exactly like :func:`license_for_standardized_path` — the deepest target
    ``standardized_dir`` that contains ``path`` wins. Keying by path (not by the document's
    ``(work, version, language)``) is what makes this robust to converters such as
    ``encyclicals`` that re-stamp ``work``/``version`` per document: every encyclical file
    still lives under the one encyclicals target directory and resolves to its metadata.

    Returns ``None`` when the path is under no target directory; callers fail closed on
    ``None`` (same discipline as ``filter_standardized_paths``). An equal-depth tie between
    two targets with *different* metadata raises ``CatalogueError`` rather than guessing.
    """
    resolved = Path(path).resolve()
    best_depth = -1
    best: TextMeta | None = None
    for t in all_targets(sources):
        target_dir = t.standardized_dir(standardized_root).resolve()
        if resolved == target_dir or target_dir in resolved.parents:
            depth = len(target_dir.parts)
            tm = TextMeta(requested_as=t.requested_as, canonical_language=t.canonical_language, target_key=t.text_key)
            if depth > best_depth:
                best_depth, best = depth, tm
            elif depth == best_depth and best is not None and tm != best:
                raise CatalogueError(
                    f"{path}: two catalogue targets' standardized directories at equal depth "
                    "disagree on text metadata — ambiguous"
                )
    return best


def select_targets(sources: list[Source], include_restricted: bool = False) -> list[Target]:
    """Targets to convert/generate: ``restricted`` excluded unless ``include_restricted``."""
    return [t for t in all_targets(sources) if include_restricted or t.license != "restricted"]


def build_raw_license_index(sources: list[Source], raw_root: Path = RAW_ROOT) -> dict[Path, str]:
    """Resolve every target's payload glob ONCE: ``{resolved raw file -> license}``.

    If several targets claim the same file the most conservative (``restricted``)
    license wins. Hoisting this out of the per-file lookup avoids re-globbing the
    whole catalogue for each input (e.g. the 201-file encyclicals run).
    """
    index: dict[Path, str] = {}
    for t in all_targets(sources):
        for f in t.payload_paths(raw_root):
            key = f.resolve()
            if index.get(key) != "restricted":
                index[key] = t.license
    return index


def license_for_raw_path(
    path: Path,
    sources: list[Source],
    raw_root: Path = RAW_ROOT,
    index: dict[Path, str] | None = None,
) -> str | None:
    """License of a raw payload file via the target whose payload glob matches it.

    Returns ``None`` if no target matches (the path is outside the catalogue).
    Pass a prebuilt ``index`` (``build_raw_license_index``) to avoid re-globbing.
    """
    if index is None:
        index = build_raw_license_index(sources, raw_root)
    return index.get(Path(path).resolve())


def license_for_standardized_path(
    path: Path, sources: list[Source], standardized_root: Path = STANDARDIZED_ROOT
) -> str | None:
    """License of a standardized document, recovered from its path.

    Matches the deepest target ``standardized_dir`` that contains ``path``. On a
    depth tie the most conservative license (``restricted``) wins, so a collision
    can never downgrade a restricted document. Returns ``None`` if the path is
    under no target directory.
    """
    resolved = Path(path).resolve()
    best_depth = -1
    best_license: str | None = None
    for t in all_targets(sources):
        target_dir = t.standardized_dir(standardized_root).resolve()
        if resolved == target_dir or target_dir in resolved.parents:
            depth = len(target_dir.parts)
            if depth > best_depth or (depth == best_depth and t.license == "restricted"):
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
    """Keep standardized files to generate from, dropping ``restricted`` ones.

    **Fail-closed**: a file whose license cannot be recovered from its path raises
    ``CatalogueError`` rather than being silently included. A standardized document
    must live under its target's ``standardized_dir`` (the path convention) so its
    provenance — hence its license — is always known; an unmapped file is a bug or
    a stray artifact, not a pass-through.
    """
    kept: list[Path] = []
    for f in expand_json(paths):
        license_ = license_for_standardized_path(f, sources, standardized_root)
        if license_ is None:
            raise CatalogueError(
                f"{f}: not under any catalogue target's standardized directory "
                f"({standardized_root}/<source-id>/<target-slug>/) — cannot verify its "
                "license, refusing (fail-closed)"
            )
        if license_ == "restricted" and not include_restricted:
            continue
        kept.append(f)
    return kept
