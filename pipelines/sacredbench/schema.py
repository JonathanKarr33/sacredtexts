"""The standardised flat JSON format for sacred texts (working group, Sep 8 draft).

One document per (work, version, language):

    {
      "source": {
        "tradition": ["<faith tradition or community>", ...],
        "work": "<title of the work>",
        "version": "<edition, translation, or textual version>",
        "language": "<language of the text>",
        "document_type": "<scripture | encyclical | hadith_collection | ...>",
        "source_url": "<optional URL or repository reference>"
      },
      "entries": [
        {"unit_type": "<verse | ayah | line | shabad | sutra | paragraph>",
         "citation": "<traditional citation for this unit>",
         "text": "<EXACT TEXT OF THIS UNIT>"}
      ]
    }

``tradition`` is a list (David Smiley / Waleed feedback: traditions share texts —
the Bible belongs to many Christian communities). A bare string is accepted on
load and normalised to a one-element list.

Validation is fail-fast: a malformed document raises ``SchemaError`` naming the
offending field; nothing is silently defaulted or skipped.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


class SchemaError(Exception):
    """A document does not conform to the standard flat format."""


_SOURCE_REQUIRED = ("tradition", "work", "version", "language", "document_type")
_ENTRY_REQUIRED = ("unit_type", "citation", "text")


@dataclass
class Entry:
    unit_type: str
    citation: str
    text: str


@dataclass
class Document:
    tradition: list[str]
    work: str
    version: str
    language: str
    document_type: str
    source_url: str | None = None
    entries: list[Entry] = field(default_factory=list)

    def to_json_dict(self) -> dict:
        source: dict = {
            "tradition": self.tradition,
            "work": self.work,
            "version": self.version,
            "language": self.language,
            "document_type": self.document_type,
        }
        if self.source_url:
            source["source_url"] = self.source_url
        return {
            "source": source,
            "entries": [
                {"unit_type": e.unit_type, "citation": e.citation, "text": e.text}
                for e in self.entries
            ],
        }


def parse_document(data: dict, where: str = "<memory>") -> Document:
    """Parse + validate one standard-format document. Raises ``SchemaError``."""
    if not isinstance(data, dict):
        raise SchemaError(f"{where}: top level must be an object, got {type(data).__name__}")
    source = data.get("source")
    if not isinstance(source, dict):
        raise SchemaError(f"{where}: missing or non-object 'source'")
    for key in _SOURCE_REQUIRED:
        if key not in source:
            raise SchemaError(f"{where}: source missing required field '{key}'")
    tradition = source["tradition"]
    if isinstance(tradition, str):
        tradition = [tradition]
    if not (isinstance(tradition, list) and tradition and all(isinstance(t, str) for t in tradition)):
        raise SchemaError(f"{where}: source.tradition must be a non-empty string or list of strings")
    entries_raw = data.get("entries")
    if not isinstance(entries_raw, list) or not entries_raw:
        raise SchemaError(f"{where}: 'entries' must be a non-empty list")
    entries: list[Entry] = []
    for i, e in enumerate(entries_raw):
        if not isinstance(e, dict):
            raise SchemaError(f"{where}: entries[{i}] is not an object")
        for key in _ENTRY_REQUIRED:
            if not isinstance(e.get(key), str) or not e[key].strip():
                raise SchemaError(f"{where}: entries[{i}] missing or empty field '{key}'")
        entries.append(Entry(unit_type=e["unit_type"], citation=e["citation"], text=e["text"]))
    return Document(
        tradition=tradition,
        work=str(source["work"]),
        version=str(source["version"]),
        language=str(source["language"]),
        document_type=str(source["document_type"]),
        source_url=source.get("source_url"),
        entries=entries,
    )


def load_document(path: Path) -> Document:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return parse_document(data, where=str(path))


def load_documents(paths: list[Path]) -> list[Document]:
    """Load documents from files and/or directories (``*.json``, recursive)."""
    docs: list[Document] = []
    for p in paths:
        if p.is_dir():
            files = sorted(p.rglob("*.json"))
            if not files:
                raise SchemaError(f"{p}: directory contains no .json files")
            docs.extend(load_document(f) for f in files)
        else:
            docs.append(load_document(p))
    return docs


def write_document(doc: Document, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc.to_json_dict(), f, ensure_ascii=False, indent=1)
        f.write("\n")
