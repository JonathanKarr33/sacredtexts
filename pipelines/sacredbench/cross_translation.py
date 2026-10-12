"""When a missed quote is another edition, or another tradition's wording.

The 100-question ``retrieve_quote`` set and its headline score stay as they are
(exact / normalized / token-F1, with LLM-as-a-judge still the pluggable semantic
metric in ``score.py``). This reading is extra. It asks a different question of
the same answers: the model was asked for one tradition's text of a citation and
returned a string that is some other indexed wording of that same citation.

Two kinds of miss:

- ``other_edition`` — same tradition, different version (asked for the ASV,
  answered with the KJV).
- ``other_tradition`` — the matched wording is not any edition of the tradition
  that was asked for. The clear case in the first run is Isaiah 4:6: the
  Protestant KJV has "day time"; the Latter-day Saint 2013 KJV has "daytime";
  the answer is the latter and the headline score is 0.

A string that also lives under a second tradition (a Book of Mormon verse that
is a KJV verse, or an LDS KJV line identical to the Protestant KJV) is recorded
on the match. It does not by itself make the label ``other_tradition``.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from sacredbench.schema import Document
from sacredbench.score import normalize, token_f1


class CrossTranslationError(Exception):
    pass


# normalize() turns an apostrophe into a space, so "Solomon's Song" is
# "solomon s song". The two KJV files name that book differently.
_BOOK_ALIAS = {
    "solomon s song": "song of solomon",
}

_CITE = re.compile(r"^(?P<book>.+?)\s+(?P<ch>\d+)\s*:\s*(?P<vs>\d+)\s*$")

# A near miss counts only when it is almost the other wording and clearly
# closer to that wording than to the text that was asked for.
_CLOSER_F1 = 0.95
_CLOSER_MARGIN = 0.05

_BIBLE_THREE = ("KJV", "ASV (1901)", "WEB")
_LDS_KJV = "KJV (LDS 2013 edition)"


@dataclass(frozen=True)
class Passage:
    tradition: str
    work: str
    version: str
    citation: str
    text: str
    norm: str
    cite_key: tuple[str, int, int] | None
    book: str | None


@dataclass
class EditionIndex:
    passages: list[Passage]
    by_cite: dict[tuple[str, int, int], list[Passage]]
    by_norm: dict[str, list[Passage]]


def cite_key(citation: str) -> tuple[str, int, int] | None:
    """``(book, chapter, verse)`` for a verse citation, else None.

    Book names are folded with the scorer's ``normalize`` plus the Song of
    Solomon alias, so the Protestant KJV and the LDS KJV line up.
    """
    match = _CITE.match(citation.strip())
    if not match:
        return None
    book = normalize(match.group("book"))
    book = _BOOK_ALIAS.get(book, book)
    return book, int(match.group("ch")), int(match.group("vs"))


def _book_display(citation: str) -> str | None:
    match = _CITE.match(citation.strip())
    return match.group("book") if match else None


def index_documents(docs: list[Document]) -> EditionIndex:
    passages: list[Passage] = []
    by_cite: dict[tuple[str, int, int], list[Passage]] = defaultdict(list)
    by_norm: dict[str, list[Passage]] = defaultdict(list)
    for doc in docs:
        tradition = doc.tradition[0]
        for entry in doc.entries:
            key = cite_key(entry.citation)
            passage = Passage(
                tradition=tradition,
                work=doc.work,
                version=doc.version,
                citation=entry.citation,
                text=entry.text,
                norm=normalize(entry.text),
                cite_key=key,
                book=_book_display(entry.citation),
            )
            passages.append(passage)
            if key is not None:
                by_cite[key].append(passage)
            if passage.norm:
                by_norm[passage.norm].append(passage)
    return EditionIndex(passages=passages, by_cite=dict(by_cite), by_norm=dict(by_norm))


def _location(passage: Passage) -> dict:
    return {
        "tradition": passage.tradition,
        "work": passage.work,
        "version": passage.version,
        "citation": passage.citation,
        "text": passage.text,
    }


def _same_words_elsewhere(index: EditionIndex, passage: Passage) -> list[dict]:
    """Other traditions that store this same normalized wording, any citation."""
    found: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()
    if not passage.norm:
        return found
    for other in index.by_norm.get(passage.norm, []):
        if other.tradition == passage.tradition:
            continue
        ident = (other.tradition, other.work, other.version, other.citation)
        if ident in seen:
            continue
        seen.add(ident)
        found.append(_location(other))
    return found


def classify_quote(
    answer: str,
    tradition: str,
    version: str,
    citation: str,
    expected_text: str,
    index: EditionIndex,
) -> dict:
    """Label one retrieve-quote answer against the indexed editions.

    ``requested`` wins whenever the asked-for text is contained after
    normalisation, even if another edition's text is also contained.
    """
    answer_norm = normalize(answer or "")
    expected_norm = normalize(expected_text or "")
    base = {
        "label": "unmatched",
        "match_kind": None,
        "matched": [],
        "same_words_also_in": [],
    }
    if expected_norm and expected_norm in answer_norm:
        base["label"] = "requested"
        base["match_kind"] = "contained"
        return base

    key = cite_key(citation)
    if key is None:
        return base
    editions = index.by_cite.get(key, [])
    if not editions:
        return base

    contained = [
        passage
        for passage in editions
        if (
            passage.norm
            and passage.norm != expected_norm
            and len(passage.norm.split()) >= 4
            and passage.norm in answer_norm
        )
    ]
    kind = "contained"
    chosen = contained
    if not chosen:
        scored = [(token_f1(answer or "", passage.text), passage) for passage in editions]
        requested_f1 = max(
            (f1 for f1, passage in scored if passage.tradition == tradition and passage.version == version),
            default=0.0,
        )
        best_f1 = max((f1 for f1, _ in scored), default=0.0)
        if best_f1 >= _CLOSER_F1 and best_f1 >= requested_f1 + _CLOSER_MARGIN:
            kind = "closer"
            chosen = [passage for f1, passage in scored if f1 == best_f1 and passage.norm != expected_norm]
    if not chosen:
        return base

    same_tradition_norms = {passage.norm for passage in chosen if passage.tradition == tradition}
    other_tradition = [
        passage
        for passage in chosen
        if passage.tradition != tradition and passage.norm not in same_tradition_norms
    ]
    other_edition = [passage for passage in chosen if passage.tradition == tradition and passage.version != version]
    if other_tradition:
        label = "other_tradition"
        primary = other_tradition
    elif other_edition:
        label = "other_edition"
        primary = other_edition
    else:
        return base

    # De-duplicate identical (tradition, version) rows. OT and NT files share a version.
    deduped: list[Passage] = []
    seen: set[tuple[str, str, str]] = set()
    for passage in primary:
        ident = (passage.tradition, passage.version, passage.norm)
        if ident in seen:
            continue
        seen.add(ident)
        deduped.append(passage)
    also: list[dict] = []
    also_seen: set[tuple[str, str, str, str]] = set()
    for passage in deduped:
        for loc in _same_words_elsewhere(index, passage):
            ident = (loc["tradition"], loc["work"], loc["version"], loc["citation"])
            if ident in also_seen:
                continue
            also_seen.add(ident)
            also.append(loc)
    return {
        "label": label,
        "match_kind": kind,
        "matched": [_location(passage) for passage in deduped],
        "same_words_also_in": also,
    }


def _rows_for_versions(index: EditionIndex, versions: tuple[str, ...]) -> dict[tuple, dict[str, str]]:
    grouped: dict[tuple, dict[str, str]] = {}
    for key, passages in index.by_cite.items():
        for passage in passages:
            if passage.work == "The Bible" and passage.version in versions:
                grouped.setdefault(key, {})[passage.version] = passage.norm
    return grouped


def bible_agreement(index: EditionIndex) -> dict:
    """How often KJV, ASV, and WEB still match after the scorer's normalisation."""
    grouped = _rows_for_versions(index, _BIBLE_THREE)
    shared = {key: norms for key, norms in grouped.items() if set(norms) == set(_BIBLE_THREE)}
    same = sum(1 for norms in shared.values() if len(set(norms.values())) == 1)
    return {
        "versions": list(_BIBLE_THREE),
        "verses_in_all_three": len(shared),
        "same_after_normalize": same,
        "differ": len(shared) - same,
    }


def kjv_vs_lds(index: EditionIndex) -> dict:
    """Protestant KJV against the Latter-day Saint 2013 KJV, citation by citation."""
    grouped = _rows_for_versions(index, ("KJV", _LDS_KJV))
    shared = {
        key: norms
        for key, norms in grouped.items()
        if set(norms) == {"KJV", _LDS_KJV}
    }
    same = sum(1 for norms in shared.values() if norms["KJV"] == norms[_LDS_KJV])
    return {
        "shared_citations": len(shared),
        "same_after_normalize": same,
        "differ": len(shared) - same,
    }


def same_words_other_tradition(index: EditionIndex, min_tokens: int = 12) -> dict:
    """Passages outside the Protestant KJV whose words are a KJV verse.

    A Book of Mormon verse that quotes Isaiah is a faithful quotation of either
    citation. Asking for one and receiving the other is not a made-up verse.
    """
    kjv_by_norm: dict[str, list[Passage]] = defaultdict(list)
    for passages in index.by_norm.values():
        for passage in passages:
            if passage.work == "The Bible" and passage.version == "KJV":
                kjv_by_norm[passage.norm].append(passage)

    works: dict[str, dict] = {}
    for passage in index.passages:
        if passage.work == "The Bible" or passage.version == "KJV":
            continue
        if len(passage.norm.split()) < min_tokens:
            continue
        hits = kjv_by_norm.get(passage.norm)
        if not hits:
            continue
        slot = works.setdefault(passage.work, {"verses": 0, "bible_books": {}})
        slot["verses"] += 1
        books = {hit.book for hit in hits if hit.book}
        for book in books:
            slot["bible_books"][book] = slot["bible_books"].get(book, 0) + 1
    for slot in works.values():
        slot["bible_books"] = dict(sorted(slot["bible_books"].items(), key=lambda item: (-item[1], item[0])))
    return {
        "min_tokens": min_tokens,
        "against": "The Bible, KJV",
        "works": dict(sorted(works.items())),
    }


def _asked(row: dict) -> dict:
    question = row.get("question")
    if not isinstance(question, dict):
        raise CrossTranslationError("answer row has no embedded question")
    source = question.get("source")
    expected = question.get("expected")
    if not isinstance(source, dict) or not isinstance(expected, dict):
        raise CrossTranslationError("answer row question is missing source or expected")
    tradition = source.get("tradition") or []
    if isinstance(tradition, str):
        tradition = [tradition]
    if not tradition or "text" not in expected or "citation" not in source:
        raise CrossTranslationError("answer row question is missing tradition, citation, or expected text")
    return {
        "tradition": tradition[0],
        "work": source.get("work"),
        "version": source.get("version"),
        "language": source.get("language"),
        "citation": source["citation"],
        "expected_text": expected["text"],
    }


def build_report(docs: list[Document], rows: list[dict], min_tokens: int = 12) -> dict:
    """Corpus measurements plus a label for every answer row."""
    index = index_documents(docs)
    labels: Counter[str] = Counter()
    examples: dict[str, list[dict]] = {"other_tradition": [], "other_edition": []}
    for row in rows:
        asked = _asked(row)
        result = classify_quote(
            row.get("answer") or "",
            asked["tradition"],
            asked["version"] or "",
            asked["citation"],
            asked["expected_text"],
            index,
        )
        labels[result["label"]] += 1
        if result["label"] in examples:
            examples[result["label"]].append(
                {
                    "question_id": row.get("question_id"),
                    "model_id": row.get("model_id"),
                    "match_kind": result["match_kind"],
                    "asked": asked,
                    "answer": row.get("answer") or "",
                    "matched": result["matched"],
                    "same_words_also_in": result["same_words_also_in"],
                }
            )
    return {
        "note": (
            "Extra reading of retrieve_quote answers. It does not change the "
            "headline correct bit, and it does not replace LLM-as-a-judge."
        ),
        "corpus": {
            "scripture_passages": len(index.passages),
            "three_public_domain_bibles": bible_agreement(index),
            "protestant_kjv_vs_lds_kjv": kjv_vs_lds(index),
            "other_tradition_same_words": same_words_other_tradition(index, min_tokens),
        },
        "answers": {
            "n": len(rows),
            "labels": dict(sorted(labels.items())),
            "other_tradition": examples["other_tradition"],
            "other_edition": examples["other_edition"],
        },
    }


def load_answer_rows(path: Path) -> list[dict]:
    if not path.exists():
        raise CrossTranslationError(f"{path}: no answers file")
    rows = []
    with open(path, encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise CrossTranslationError(f"{path}:{line_no}: not JSON ({exc})") from exc
            if not isinstance(row, dict) or "question" not in row:
                raise CrossTranslationError(f"{path}:{line_no}: expected an answer row with an embedded question")
            rows.append(row)
    if not rows:
        raise CrossTranslationError(f"{path}: no answer rows")
    return rows


def load_scripture_documents(raw_root: Path) -> list[Document]:
    """Non-restricted scripture, via the catalogue. Restricted translations stay out."""
    from sacredbench import catalogue as cat
    from sacredbench import convert as conv

    sources = cat.discover_catalogue(raw_root)
    targets = [
        target
        for target in cat.select_targets(sources, include_restricted=False)
        if target.document_type == "scripture"
    ]
    docs: list[Document] = []
    for target in targets:
        docs.extend(conv.convert_target(target.payload_paths(raw_root), target))
    if not docs:
        raise CrossTranslationError(f"no scripture documents under {raw_root}")
    return docs


def _n(value: int) -> str:
    return f"{value:,}"


def _pct(part: int, whole: int) -> str:
    if not whole:
        return "0"
    return f"{100 * part / whole:.1f}%"


def _label_line(labels: dict) -> str:
    order = ("requested", "other_tradition", "other_edition", "unmatched")
    parts = [f"{labels[name]} {name.replace('_', ' ')}" for name in order if name in labels]
    extra = [f"{labels[name]} {name.replace('_', ' ')}" for name in labels if name not in order]
    return ", ".join(parts + extra)


def report_markdown(report: dict) -> str:
    """A short reading of the JSON report. Counts come from the report."""
    corpus = report["corpus"]
    three = corpus["three_public_domain_bibles"]
    lds = corpus["protestant_kjv_vs_lds_kjv"]
    shared = corpus["other_tradition_same_words"]
    answers = report["answers"]
    lines = [
        "# Cross-translation reading",
        "",
        report["note"],
        "",
        "Asking for one tradition's scripture and receiving another's wording is a",
        "different miss from a fabricated verse. The headline score still marks both 0.",
        "",
        "## What the index already contains",
        "",
        (
            f"Of {_n(three['verses_in_all_three'])} verses present in KJV, ASV, and WEB, "
            f"{_n(three['same_after_normalize'])} ({_pct(three['same_after_normalize'], three['verses_in_all_three'])}) "
            f"still match after the scorer's normalisation. "
            f"{_n(three['differ'])} do not. A model can quote a real edition and still fail "
            f"the edition it was asked for."
        ),
        "",
        (
            f"The Protestant KJV and the Latter-day Saint 2013 KJV share "
            f"{_n(lds['shared_citations'])} citations. "
            f"{_n(lds['same_after_normalize'])} match. {_n(lds['differ'])} do not. "
            f"Those differences are orthography (a space, a hyphen, an æ), and they are "
            f"enough for a normalized exact match to fail."
        ),
        "",
        (
            f"The same folded string is sometimes a real verse in two traditions "
            f"(at least {shared['min_tokens']} tokens, matched to the Protestant KJV):"
        ),
        "",
    ]
    works = shared["works"]
    if not works:
        lines.append("None.")
    else:
        for work, slot in works.items():
            books = ", ".join(f"{book} {n}" for book, n in slot["bible_books"].items())
            lines.append(f"- **{work}**: {slot['verses']} verses ({books}).")
        if any(sum(slot["bible_books"].values()) > slot["verses"] for slot in works.values()):
            lines.append("")
            lines.append(
                "A verse can match more than one KJV book, so a work's book counts can add up to more than its verse count."
            )
    lines += [
        "",
        "Quoting those words and citing either passage is faithful to the index.",
        "A task that demands one citation treats the other citation as a wrong answer.",
        "",
        "## What the answers did",
        "",
        f"{_n(answers['n'])} answers: {_label_line(answers['labels'])}.",
        "",
    ]
    for label, title in (
        ("other_tradition", "Asked for one tradition, matched another tradition's wording"),
        ("other_edition", "Asked for one edition, matched another edition of that tradition"),
    ):
        lines.append(f"### {title}")
        lines.append("")
        rows = answers[label]
        if not rows:
            lines.append("None.")
            lines.append("")
            continue
        for row in rows:
            asked = row["asked"]
            matched = row["matched"][0]
            lines.append(
                f"- `{row['model_id']}` was asked for **{asked['tradition']}** "
                f"{asked['version']} {asked['citation']} "
                f"(`{row['match_kind']}`). The answer matches **{matched['tradition']}** "
                f"{matched['version']}."
            )
            lines.append(f"  - Asked: {asked['expected_text']}")
            lines.append(f"  - Answer: {row['answer']}")
            lines.append(f"  - Matched: {matched['text']}")
            if row["same_words_also_in"]:
                also = "; ".join(
                    f"{loc['tradition']} / {loc['version']} / {loc['citation']}"
                    for loc in row["same_words_also_in"][:4]
                )
                lines.append(f"  - That matched wording is also stored as: {also}.")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
