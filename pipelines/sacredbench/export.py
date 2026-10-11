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

Shards within a group are ordered **deterministically by their first citation**,
with each shard's native unit order preserved. This is not a general "canonical
unit order" (citations sort lexicographically), but it is deterministic, and for
the one real multi-shard work — the LDS KJV Bible — it places the Old Testament
before the New (``Genesis 1:1`` < ``Matthew 1:1``). Single-shard works (the vast
majority) keep their converter's native order exactly. ``source_url`` is a
best-effort single value (the first shard that declares one), since one
interchange document cannot carry a per-shard URL.

The **round-trip** is semantic (an assembled document carries no shard-boundary
metadata): ``roundtrip_ok`` regroups by key and verifies each input shard is
reproduced in its assembled document — every shard entry present at a strictly
increasing position (catching loss *and* reordering), no entries invented, and
metadata/tradition preserved. It is designed to return ``False`` on a lossy or
reordering assembler, not merely on a corrupt one.
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
        citations = [e.citation for e in entries]
        if len(citations) != len(set(citations)):
            dupes = sorted({c for c in citations if citations.count(c) > 1})
            raise ExportError(
                f"{key}: assembled document has duplicate citation(s) {dupes[:3]} — shards "
                "disagree on the text of a citation (ground truth must be unique)"
            )
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
    # deterministic output order independent of input order
    return sorted(assembled, key=lambda d: (d.work, d.version, d.language))


def roundtrip_ok(docs: list[Document]) -> bool:
    """Inverse-grouping round-trip: every input shard is reproduced in its
    assembled document. Returns ``False`` on a lossy or reordering assembler.

    Checks, per shard (located in the assembled set by ``(work, version,
    language)``): metadata agrees, the shard's traditions are a subset of the
    assembled union, and every shard entry ``(citation, text)`` appears in the
    assembled document at a strictly increasing position (loss or reordering →
    ``False``). Globally, the assembled set invents no entries (its total entry
    count does not exceed the shards' total).
    """
    assembled = assemble(docs)
    by_key = {(d.work, d.version, d.language): d for d in assembled}
    if sum(len(d.entries) for d in assembled) > sum(len(d.entries) for d in docs):
        return False  # entries invented
    for shard in docs:
        target = by_key.get((shard.work, shard.version, shard.language))
        if target is None or target.document_type != shard.document_type:
            return False
        if not set(shard.tradition) <= set(target.tradition):
            return False
        position = {(e.citation, e.text): i for i, e in enumerate(target.entries)}
        last = -1
        for e in shard.entries:
            p = position.get((e.citation, e.text))
            if p is None or p <= last:
                return False  # lost, or out of order
            last = p
    return True


def check_filename_collisions(docs: list[Document]) -> None:
    """Fail-fast if two distinct documents slugify to the same interchange filename."""
    by_name: dict[str, tuple[str, str, str]] = {}
    for d in docs:
        name = interchange_filename(d)
        key = (d.work, d.version, d.language)
        if name in by_name and by_name[name] != key:
            raise ExportError(
                f"interchange filename collision {name!r}: {by_name[name]} and {key}"
            )
        by_name[name] = key
