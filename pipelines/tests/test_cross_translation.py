"""Cross-translation labels. Synthetic verses only — no committed scripture."""

from sacredbench.cross_translation import (
    bible_agreement,
    build_report,
    cite_key,
    classify_quote,
    index_documents,
    kjv_vs_lds,
    same_words_other_tradition,
)
from sacredbench.schema import Document, Entry

# Long enough that a one-word swap stays above the closer-match threshold.
_STEM = (
    "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima "
    "mike november oscar papa quebec romeo sierra tango"
)


def _doc(tradition: str, work: str, version: str, verses: list[tuple[str, str]]) -> Document:
    return Document(
        tradition=[tradition],
        work=work,
        version=version,
        language="en",
        document_type="scripture",
        entries=[Entry(unit_type="verse", citation=cite, text=text) for cite, text in verses],
    )


def _index():
    protestant_kjv = _doc(
        "Protestant Christian",
        "The Bible",
        "KJV",
        [
            ("Isaiah 1:1", f"And there shall be a shadow in the day time {_STEM}"),
            ("Isaiah 1:2", f"For as the rain cometh down {_STEM}"),
            ("Isaiah 1:3", f"And he said unto them {_STEM}"),
            ("Song of Solomon 1:1", f"Let him kiss me {_STEM}"),
        ],
    )
    protestant_asv = _doc(
        "Protestant Christian",
        "The Bible",
        "ASV (1901)",
        [
            ("Isaiah 1:1", f"And there shall be a pavilion in the daytime {_STEM}"),
            ("Isaiah 1:2", f"For as the rain comes down {_STEM}"),
            ("Isaiah 1:3", f"And he said to them something else entirely {_STEM}"),
        ],
    )
    protestant_web = _doc(
        "Protestant Christian",
        "The Bible",
        "WEB",
        [
            ("Isaiah 1:1", f"There will be a pavilion in the daytime {_STEM}"),
            ("Isaiah 1:2", f"For as the rain comes down {_STEM}"),
            ("Isaiah 1:3", f"He said to them {_STEM}"),
        ],
    )
    lds_kjv = _doc(
        "The Church of Jesus Christ of Latter-Day Saints",
        "The Bible",
        "KJV (LDS 2013 edition)",
        [
            ("Isaiah 1:1", f"And there shall be a shadow in the daytime {_STEM}"),
            ("Isaiah 1:2", f"For as the rain cometh down {_STEM}"),
            ("Isaiah 1:3", f"And he said unto them {_STEM}"),
            ("Solomon's Song 1:1", f"Let him kiss me {_STEM}"),
        ],
    )
    bom = _doc(
        "The Church of Jesus Christ of Latter-Day Saints",
        "Book of Mormon",
        "2013 edition",
        [("1 Nephi 1:1", f"For as the rain cometh down {_STEM}")],
    )
    docs = [protestant_kjv, protestant_asv, protestant_web, lds_kjv, bom]
    return index_documents(docs), docs


def test_song_of_solomon_alias():
    assert cite_key("Solomon's Song 1:1") == cite_key("Song of Solomon 1:1")
    assert cite_key("Fides et Ratio, para. 48") is None


def test_other_tradition_when_only_the_other_church_wording_matches():
    index, _docs = _index()
    # Protestant KJV says "day time". The LDS edition says "daytime". The answer is the LDS line.
    result = classify_quote(
        f"And there shall be a shadow in the daytime {_STEM}",
        "Protestant Christian",
        "KJV",
        "Isaiah 1:1",
        f"And there shall be a shadow in the day time {_STEM}",
        index,
    )
    assert result["label"] == "other_tradition"
    assert result["match_kind"] == "contained"
    assert result["matched"][0]["version"] == "KJV (LDS 2013 edition)"
    assert result["matched"][0]["tradition"].startswith("The Church")


def test_other_edition_when_asked_for_asv_and_given_kjv():
    index, _docs = _index()
    result = classify_quote(
        f"For as the rain cometh down {_STEM}",
        "Protestant Christian",
        "ASV (1901)",
        "Isaiah 1:2",
        f"For as the rain comes down {_STEM}",
        index,
    )
    assert result["label"] == "other_edition"
    assert result["match_kind"] == "contained"
    assert {m["version"] for m in result["matched"]} == {"KJV"}
    # The LDS KJV and the Book of Mormon store that same KJV string.
    traditions = {loc["tradition"] for loc in result["same_words_also_in"]}
    works = {loc["work"] for loc in result["same_words_also_in"]}
    assert any(t.startswith("The Church") for t in traditions)
    assert "Book of Mormon" in works


def test_requested_text_wins_over_a_shared_edition():
    index, _docs = _index()
    result = classify_quote(
        f'Prefix. For as the rain comes down {_STEM}',
        "Protestant Christian",
        "ASV (1901)",
        "Isaiah 1:2",
        f"For as the rain comes down {_STEM}",
        index,
    )
    assert result["label"] == "requested"


def test_closer_other_edition_without_full_containment():
    index, _docs = _index()
    # One word off the KJV ("they" / "he"), far from the ASV wording.
    answer = f"And they said unto them {_STEM}"
    result = classify_quote(
        answer,
        "Protestant Christian",
        "ASV (1901)",
        "Isaiah 1:3",
        f"And he said to them something else entirely {_STEM}",
        index,
    )
    assert result["label"] == "other_edition"
    assert result["match_kind"] == "closer"
    assert result["matched"][0]["version"] == "KJV"


def test_corpus_counts_editions_and_shared_quotations():
    index, docs = _index()
    three = bible_agreement(index)
    assert three["verses_in_all_three"] == 3
    assert three["same_after_normalize"] == 0
    assert three["differ"] == 3

    aligned = kjv_vs_lds(index)
    # Isaiah 1:2, 1:3, and Song of Solomon 1:1 match. Isaiah 1:1 differs (day time / daytime).
    assert aligned["shared_citations"] == 4
    assert aligned["same_after_normalize"] == 3
    assert aligned["differ"] == 1

    shared = same_words_other_tradition(index, min_tokens=12)
    assert shared["works"]["Book of Mormon"]["verses"] == 1
    assert shared["works"]["Book of Mormon"]["bible_books"] == {"Isaiah": 1}

    report = build_report(docs, [
        {
            "question_id": "q1",
            "model_id": "m",
            "answer": f"And there shall be a shadow in the daytime {_STEM}",
            "question": {
                "expected": {"text": f"And there shall be a shadow in the day time {_STEM}"},
                "source": {
                    "tradition": ["Protestant Christian"],
                    "work": "The Bible",
                    "version": "KJV",
                    "language": "en",
                    "citation": "Isaiah 1:1",
                },
            },
        }
    ])
    assert report["answers"]["labels"]["other_tradition"] == 1
    assert report["answers"]["n"] == 1
    assert "LLM-as-a-judge" in report["note"]
