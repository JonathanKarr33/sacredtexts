"""Converters from known source-JSON shapes into the standard flat format.

Derived from the REAL reference data in Religion-at-Notre-Dame/catholic_text_json
(not its docs — load-bearing details like ``paragraph: null`` only show up in the
data itself):

- ``nabre``: one file per book, ``{book, chapters: [{chapter, verses: [{verse, text}]}]}``.
  All given book files merge into ONE standard document (the work is the Bible in
  one translation); citations are ``<Book> <chapter>:<verse>``.
- ``encyclicals``: one file per encyclical, ``{pope, title, publicationDate,
  language, vaticanUrl, paragraphs: [{paragraph, text}]}``. Each becomes its OWN
  standard document; ``paragraph`` may be null, so citations fall back to the
  1-based running position.

Converters are fail-fast: unexpected shapes raise ``ConvertError`` naming the file.
Adding a source format = one function + one registry line.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from sacredbench.schema import Document, Entry


class ConvertError(Exception):
    """Source data did not match the declared format."""


def _load_json(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ConvertError(f"{path}: not valid JSON ({e})") from e


# --- NABRE-style Bible books --------------------------------------------------


def _split_camel_book(name: str) -> str:
    """``1Corinthians`` -> ``1 Corinthians``, ``SongofSongs`` left as-is unless camel-cased."""
    name = re.sub(r"(?<=\d)(?=[A-Z])", " ", name)
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)


def convert_nabre(
    paths: list[Path],
    tradition: list[str],
    version: str = "NABRE",
    work: str = "The Bible",
    language: str = "en",
    source_url: str | None = None,
) -> list[Document]:
    """Merge NABRE-shaped book files into one standard scripture document."""
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            found = sorted(p.glob("*.json"))
            if not found:
                raise ConvertError(f"{p}: no .json book files in directory")
            files.extend(found)
        else:
            files.append(p)
    entries: list[Entry] = []
    for path in files:
        data = _load_json(path)
        book = data.get("book")
        chapters = data.get("chapters")
        if not isinstance(book, str) or not isinstance(chapters, list):
            raise ConvertError(f"{path}: expected {{book, chapters}} (nabre format)")
        book_name = _split_camel_book(book)
        for ch in chapters:
            ch_num = ch.get("chapter")
            verses = ch.get("verses")
            if not isinstance(ch_num, int) or not isinstance(verses, list):
                raise ConvertError(f"{path}: chapter entry missing 'chapter'/'verses'")
            for v in verses:
                v_num, text = v.get("verse"), v.get("text")
                if not isinstance(v_num, int) or not isinstance(text, str):
                    raise ConvertError(f"{path}: {book} {ch_num} has a malformed verse")
                if not text.strip():
                    continue  # the data has rare empty placeholder verses
                entries.append(
                    Entry(unit_type="verse", citation=f"{book_name} {ch_num}:{v_num}", text=text.strip())
                )
    if not entries:
        raise ConvertError("nabre conversion produced no entries")
    return [
        Document(
            tradition=tradition,
            work=work,
            version=version,
            language=language,
            document_type="scripture",
            source_url=source_url,
            entries=entries,
        )
    ]


# --- Papal encyclicals --------------------------------------------------------


def convert_encyclicals(paths: list[Path], tradition: list[str]) -> list[Document]:
    """Each encyclical file becomes its own standard document (version = Vatican edition year)."""
    files: list[Path] = []
    for p in paths:
        if p.is_dir():
            found = sorted(f for f in p.rglob("*.json") if f.name != "index.json")
            if not found:
                raise ConvertError(f"{p}: no encyclical .json files in directory")
            files.extend(found)
        else:
            files.append(p)
    docs: list[Document] = []
    for path in files:
        data = _load_json(path)
        title, paragraphs = data.get("title"), data.get("paragraphs")
        if not isinstance(title, str) or not isinstance(paragraphs, list):
            raise ConvertError(f"{path}: expected {{title, paragraphs}} (encyclicals format)")
        pope = data.get("pope", "")
        date = data.get("publicationDate", "")
        entries: list[Entry] = []
        for i, para in enumerate(paragraphs, start=1):
            text = para.get("text")
            if not isinstance(text, str):
                raise ConvertError(f"{path}: paragraphs[{i - 1}] has no text")
            if not text.strip():
                continue
            num = para.get("paragraph")
            label = str(num) if num is not None else str(i)
            entries.append(
                Entry(unit_type="paragraph", citation=f"{title}, para. {label}", text=text.strip())
            )
        if not entries:
            raise ConvertError(f"{path}: encyclical has no non-empty paragraphs")
        docs.append(
            Document(
                tradition=tradition,
                work=title,
                version=f"Vatican English text ({pope}, {date})".strip(),
                language=data.get("language", "en"),
                document_type="encyclical",
                source_url=data.get("vaticanUrl"),
                entries=entries,
            )
        )
    return docs


CONVERTERS = {
    "nabre": convert_nabre,
    "encyclicals": convert_encyclicals,
}
