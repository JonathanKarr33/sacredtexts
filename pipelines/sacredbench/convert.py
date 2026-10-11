"""Converters from known source-JSON shapes into the standard flat format.

Every converter implements one dispatch contract so the catalogue drives them
uniformly:

    convert_target(paths, target) -> list[Document]

where ``paths`` are the target's resolved payload files and ``target`` is a
``catalogue.Target`` carrying ``work``/``version``/``language``/``document_type``/
``tradition``. Shapes are derived from the REAL reference data (not docs — e.g.
LDS D&C is 2-level ``{section: {verse: text}}`` while the other LDS works are
3-level ``{book: {chapter: {verse: text}}}``, and Pearl of Great Price carries
``last_modified``/``version`` metadata keys).

Registered converters (English corpora land here in Phase 2; Arabic/Talmud in
Phase 3):

- ``bible_flat``: Protestant KJV/ASV/WEB — a flat list
  ``[{book, chapter, verse, text}]`` → one scripture document per version file.
- ``lds_nested``: LDS works — nested ``{book: {[heading], chapter: {verse: text}}}``
  (or 2-level ``{section: {verse: text}}`` for D&C) → one document per file.
- ``encyclicals``: Vatican encyclicals — one ``{title, paragraphs}`` file becomes
  its own document (work = title, version = Vatican edition).
- ``nabre`` (restricted): NABRE book files ``{book, chapters: [...]}`` merge into
  one scripture document.

Converters are fail-fast: an unexpected shape raises ``ConvertError`` naming the
file. Adding a source format = one function + one ``CONVERTERS`` registry line.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

from sacredbench.schema import Document, Entry

if TYPE_CHECKING:
    from sacredbench.catalogue import Target


class ConvertError(Exception):
    """Source data did not match the declared format."""


def _load_json(path: Path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ConvertError(f"{path}: not valid JSON ({e})") from e


def _doc(target: "Target", entries: list[Entry], source_url: str | None = None) -> Document:
    """Build a Document from a target's catalogue metadata."""
    return Document(
        tradition=list(target.tradition),
        work=target.work,
        version=target.version,
        language=target.language,
        document_type=target.document_type,
        source_url=source_url,
        entries=entries,
    )


def _split_camel_book(name: str) -> str:
    """``1Corinthians`` -> ``1 Corinthians`` (NABRE book names are camel-run)."""
    name = re.sub(r"(?<=\d)(?=[A-Z])", " ", name)
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)


def _require_unique_citations(entries: list[Entry], where: str) -> None:
    """Every citation in a document must identify exactly one unit (benchmark
    ground-truth needs this). Fail-fast on a duplicate, naming the file+citation."""
    seen: set[str] = set()
    for e in entries:
        if e.citation in seen:
            raise ConvertError(f"{where}: duplicate citation {e.citation!r} (citations must be unique)")
        seen.add(e.citation)


#: LDS files carry these scalar top-level keys alongside the scripture books.
_LDS_METADATA_KEYS = {"last_modified", "version"}


# --- Protestant flat-list Bibles (bible_flat) --------------------------------


def convert_bible_flat(paths: list[Path], target: "Target") -> list[Document]:
    """Each flat-list file ``[{book, chapter, verse, text}]`` → one scripture doc."""
    docs: list[Document] = []
    for path in paths:
        data = _load_json(path)
        if not isinstance(data, list) or not data:
            raise ConvertError(f"{path}: expected a non-empty list of verse records (bible_flat)")
        entries: list[Entry] = []
        for i, row in enumerate(data):
            if not isinstance(row, dict):
                raise ConvertError(f"{path}: record {i} is not an object")
            book, chapter, verse, text = row.get("book"), row.get("chapter"), row.get("verse"), row.get("text")
            if not (isinstance(book, str) and isinstance(chapter, int) and isinstance(verse, int) and isinstance(text, str)):
                raise ConvertError(f"{path}: record {i} is not {{book:str, chapter:int, verse:int, text:str}}")
            if not text.strip():
                continue
            entries.append(Entry(unit_type="verse", citation=f"{book} {chapter}:{verse}", text=text.strip()))
        if not entries:
            raise ConvertError(f"{path}: produced no entries")
        _require_unique_citations(entries, str(path))
        docs.append(_doc(target, entries))
    return docs


# --- LDS nested scriptures (lds_nested) --------------------------------------


def _lds_entries(data: dict, target: "Target", path: Path) -> list[Entry]:
    entries: list[Entry] = []
    for book_name, book_val in data.items():
        if book_name in _LDS_METADATA_KEYS:
            continue  # known scalar metadata (last_modified, version)
        if not isinstance(book_val, dict):
            raise ConvertError(f"{path}: unexpected non-object top-level key {book_name!r}")
        # 'heading' is an editorial summary (book- AND chapter-level), never scripture.
        items = [(k, v) for k, v in book_val.items() if k != "heading"]
        if not items:
            continue
        if all(isinstance(v, str) for _, v in items):
            # 2-level: this top key is itself a section -> {verse: text} (D&C). Prefix
            # the work so the citation is self-identifying (e.g. not a bare "1:1").
            for verse, text in items:
                if not text.strip():
                    continue
                entries.append(
                    Entry(unit_type="verse", citation=f"{target.work} {book_name}:{verse}", text=text.strip())
                )
        elif all(isinstance(v, dict) for _, v in items):
            # 3-level: book -> chapter -> {verse: text}
            for chapter, verses in items:
                for verse, text in verses.items():
                    if verse == "heading":
                        continue  # chapter-level editorial summary, not a verse
                    if not isinstance(text, str):
                        raise ConvertError(f"{path}: {book_name} {chapter}:{verse} is not text")
                    if not text.strip():
                        continue
                    entries.append(
                        Entry(unit_type="verse", citation=f"{book_name} {chapter}:{verse}", text=text.strip())
                    )
        else:
            raise ConvertError(
                f"{path}: book {book_name!r} mixes verse-strings and chapter-objects (unexpected LDS shape)"
            )
    return entries


def convert_lds_nested(paths: list[Path], target: "Target") -> list[Document]:
    """Each nested LDS file → one scripture document (handles 2- and 3-level shapes)."""
    docs: list[Document] = []
    for path in paths:
        data = _load_json(path)
        if not isinstance(data, dict):
            raise ConvertError(f"{path}: expected a nested object (lds_nested)")
        entries = _lds_entries(data, target, path)
        if not entries:
            raise ConvertError(f"{path}: produced no entries")
        _require_unique_citations(entries, str(path))
        docs.append(_doc(target, entries))
    return docs


# --- Papal encyclicals (encyclicals) -----------------------------------------


def convert_encyclicals(paths: list[Path], target: "Target") -> list[Document]:
    """Each ``{title, paragraphs}`` file becomes its own document (work = title)."""
    files = [p for p in paths if p.name != "index.json"]
    if not files:
        raise ConvertError("encyclicals: no encyclical files (only index.json?)")
    docs: list[Document] = []
    for path in files:
        data = _load_json(path)
        if not isinstance(data, dict):
            raise ConvertError(f"{path}: top level must be an object (encyclicals format)")
        title, paragraphs = data.get("title"), data.get("paragraphs")
        if not isinstance(title, str) or not isinstance(paragraphs, list):
            raise ConvertError(f"{path}: expected {{title, paragraphs}} (encyclicals format)")
        pope, date = data.get("pope", ""), data.get("publicationDate", "")
        entries: list[Entry] = []
        # The source `paragraph` field is unreliable — null in thousands of
        # paragraphs and duplicated across others — so cite by stable 1-based
        # position in the document, which is unique by construction.
        for i, para in enumerate(paragraphs, start=1):
            if not isinstance(para, dict):
                raise ConvertError(f"{path}: paragraphs[{i - 1}] is not an object")
            text = para.get("text")
            if not isinstance(text, str):
                raise ConvertError(f"{path}: paragraphs[{i - 1}] has no text")
            if not text.strip():
                continue
            entries.append(Entry(unit_type="paragraph", citation=f"{title}, para. {i}", text=text.strip()))
        if not entries:
            raise ConvertError(f"{path}: encyclical has no non-empty paragraphs")
        _require_unique_citations(entries, str(path))
        docs.append(
            Document(
                tradition=list(target.tradition),
                work=title,
                version=f"Vatican English text ({pope}, {date})".strip(),
                language=target.language,
                document_type=target.document_type,
                source_url=data.get("vaticanUrl"),
                entries=entries,
            )
        )
    return docs


# --- NABRE Bible books (nabre, restricted) -----------------------------------


def convert_nabre(paths: list[Path], target: "Target") -> list[Document]:
    """Merge NABRE-shaped book files ``{book, chapters: [...]}`` into one document."""
    entries: list[Entry] = []
    for path in paths:
        data = _load_json(path)
        if not isinstance(data, dict):
            raise ConvertError(f"{path}: top level must be an object (nabre format)")
        book, chapters = data.get("book"), data.get("chapters")
        if not isinstance(book, str) or not isinstance(chapters, list):
            raise ConvertError(f"{path}: expected {{book, chapters}} (nabre format)")
        book_name = _split_camel_book(book)
        for ch in chapters:
            if not isinstance(ch, dict):
                raise ConvertError(f"{path}: {book} has a non-object chapter entry")
            ch_num, verses = ch.get("chapter"), ch.get("verses")
            if not isinstance(ch_num, int) or not isinstance(verses, list):
                raise ConvertError(f"{path}: chapter entry missing 'chapter'/'verses'")
            for v in verses:
                if not isinstance(v, dict):
                    raise ConvertError(f"{path}: {book} {ch_num} has a non-object verse entry")
                v_num, text = v.get("verse"), v.get("text")
                if not isinstance(v_num, int) or not isinstance(text, str):
                    raise ConvertError(f"{path}: {book} {ch_num} has a malformed verse")
                if not text.strip():
                    continue
                entries.append(Entry(unit_type="verse", citation=f"{book_name} {ch_num}:{v_num}", text=text.strip()))
    if not entries:
        raise ConvertError("nabre conversion produced no entries")
    _require_unique_citations(entries, str(paths[0]) if paths else "nabre")
    return [_doc(target, entries)]


CONVERTERS = {
    "bible_flat": convert_bible_flat,
    "lds_nested": convert_lds_nested,
    "encyclicals": convert_encyclicals,
    "nabre": convert_nabre,
}


def convert_target(paths: list[Path], target: "Target") -> list[Document]:
    """Dispatch a catalogue target to its converter. Fail-fast on an unregistered one."""
    fn = CONVERTERS.get(target.converter)
    if fn is None:
        raise ConvertError(
            f"{target.source_id}: converter {target.converter!r} is not registered "
            "(it lands in a later phase)"
        )
    if not paths:
        raise ConvertError(
            f"{target.source_id}: target {target.work!r} [{target.version}] has no payload files "
            f"(glob {target.payload!r} matched nothing — is the payload present?)"
        )
    return fn(list(paths), target)
