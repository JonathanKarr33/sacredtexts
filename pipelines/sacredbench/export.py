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
        # Total, input-independent order: the shards' full citation sequences, then
        # their tradition lists and source_url, so even shards with identical
        # citations (differing only in metadata) sort deterministically.
        shards = sorted(
            groups[key],
            key=lambda d: ([e.citation for e in d.entries], list(d.tradition), d.source_url or ""),
        )
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

    Checks, per ``(work, version, language)`` group: ``document_type`` agrees, the
    assembled ``tradition`` equals the **exact union** of the shards' traditions,
    the assembled entry set equals the **exact deduplicated** shard entry set
    (comparing all of ``(citation, text, unit_type)`` — so nothing is lost *or*
    invented, even when the input has duplicate entries), and every shard entry
    appears at a strictly increasing position (catching reordering).
    """
    assembled = assemble(docs)
    by_key = {(d.work, d.version, d.language): d for d in assembled}

    shards_by_key: dict[tuple[str, str, str], list[Document]] = {}
    for d in docs:
        shards_by_key.setdefault((d.work, d.version, d.language), []).append(d)
    if set(by_key) != set(shards_by_key):  # a key appeared or vanished
        return False

    for key, shards in shards_by_key.items():
        target = by_key[key]
        expected_tradition: set[str] = set()
        expected_entries: set[tuple[str, str, str]] = set()
        seen_ct: set[tuple[str, str]] = set()
        for s in shards:
            if s.document_type != target.document_type:
                return False
            expected_tradition |= set(s.tradition)
            for e in s.entries:
                ct = (e.citation, e.text)
                if ct in seen_ct:
                    continue  # mirror assemble's (citation, text) dedup
                seen_ct.add(ct)
                expected_entries.add((e.citation, e.text, e.unit_type))
        if set(target.tradition) != expected_tradition:
            return False
        target_entries = [(e.citation, e.text, e.unit_type) for e in target.entries]
        if len(target_entries) != len(expected_entries) or set(target_entries) != expected_entries:
            return False  # loss, invention, or a duplicate
        position = {e: i for i, e in enumerate(target_entries)}
        for shard in shards:
            last = -1
            for e in shard.entries:
                p = position.get((e.citation, e.text, e.unit_type))
                if p is None or p <= last:
                    return False  # reordered
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
