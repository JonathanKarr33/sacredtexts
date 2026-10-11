"""Assemble standardized shard documents into the working group's single
interchange document per ``(work, version, language)``.

A standardized document is already an interchange document (``schema.Document``),
but one work/version may be split across several shards — e.g. the LDS KJV edition
arrives as separate Old- and New-Testament files, and two sources can describe the
same ``(work, version, language)``. ``assemble`` merges the shards of each key
into one document:

- **entries** are the shards' entries concatenated in a deterministic order
  (shards sorted by their first citation, native unit order preserved within each
  shard — so the Bible's OT precedes NT), then **deduplicated by ``(citation,
  text)``** keeping the first occurrence.
- **tradition** is the union of the shards' tradition lists (the spec's
  many-to-many intent: a text shared by several communities keeps all of them).
- ``document_type`` must agree across shards (else ``ExportError``);
  ``source_url`` is the first shard that declares one.

The **round-trip** is semantic: an assembled document carries no shard-boundary
metadata, so the guarantee is that assembling the assembled set reproduces it
exactly (``assemble`` is idempotent and lossless on source metadata + ordered
entries), and that each document survives ``write_document``/``load_document``.
"""

from __future__ import annotations

from sacredbench.schema import Document


class ExportError(Exception):
    """Shards of one work/version could not be assembled."""


def _slugify(text: str) -> str:
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


def interchange_filename(doc: Document) -> str:
    """Stable ``<work>-<version>-<language>.json`` name for an assembled document."""
    return f"{_slugify(f'{doc.work}-{doc.version}-{doc.language}')}.json"


def _tradition_union(shards: list[Document]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for d in shards:
        for t in d.tradition:
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out


def assemble(docs: list[Document]) -> list[Document]:
    """Merge standardized shards into one interchange document per (work, version, language)."""
    groups: dict[tuple[str, str, str], list[Document]] = {}
    order: list[tuple[str, str, str]] = []
    for d in docs:
        key = (d.work, d.version, d.language)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(d)

    assembled: list[Document] = []
    for key in order:
        shards = sorted(groups[key], key=lambda d: d.entries[0].citation if d.entries else "")
        document_types = {d.document_type for d in shards}
        if len(document_types) != 1:
            raise ExportError(
                f"{key}: shards disagree on document_type {sorted(document_types)}"
            )
        entries = []
        seen: set[tuple[str, str]] = set()
        for d in shards:
            for e in d.entries:
                ek = (e.citation, e.text)
                if ek in seen:
                    continue
                seen.add(ek)
                entries.append(e)
        source_url = next((d.source_url for d in shards if d.source_url), None)
        assembled.append(
            Document(
                tradition=_tradition_union(shards),
                work=key[0],
                version=key[1],
                language=key[2],
                document_type=document_types.pop(),
                source_url=source_url,
                entries=entries,
            )
        )
    return assembled


def roundtrip_equal(docs: list[Document]) -> bool:
    """Semantic round-trip: re-assembling the assembled set reproduces it exactly."""
    once = assemble(docs)
    return assemble(once) == once
