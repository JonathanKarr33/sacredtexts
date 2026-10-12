"""FAccT card labels. Synthetic verses. The headline exact bit is full-string equality."""

from sacredbench.facct import build_facct, is_refusal, label_answer, license_for
from sacredbench.cross_translation import index_documents
from sacredbench.schema import Document, Entry

STEM = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november"


def _docs():
    return [
        Document(
            tradition=["Protestant Christian"], work="The Bible", version="KJV",
            language="en", document_type="scripture",
            entries=[Entry(unit_type="verse", citation="Isaiah 1:1", text=f"day time {STEM}")],
        ),
        Document(
            tradition=["Protestant Christian"], work="The Bible", version="ASV (1901)",
            language="en", document_type="scripture",
            entries=[Entry(unit_type="verse", citation="Isaiah 1:1", text=f"pavilion {STEM}")],
        ),
        Document(
            tradition=["The Church of Jesus Christ of Latter-Day Saints"],
            work="Book of Mormon", version="2013 edition",
            language="en", document_type="scripture",
            entries=[Entry(unit_type="verse", citation="1 Nephi 1:1", text=f"day time {STEM}")],
        ),
    ]


def _row(answer, tradition="Protestant Christian", version="KJV", citation="Isaiah 1:1",
         expected=None, document_type="scripture", work="The Bible", model="m", qid="q1"):
    return {
        "question_id": qid,
        "model_id": model,
        "task": "retrieve_quote",
        "answer": answer,
        "question": {
            "task": "retrieve_quote",
            "expected": {"text": expected or f"day time {STEM}"},
            "source": {
                "tradition": [tradition],
                "work": work,
                "version": version,
                "language": "en",
                "document_type": document_type,
                "citation": citation,
            },
        },
    }


def test_labels_cover_the_ways_a_zero_happens():
    index = index_documents(_docs())
    exact = label_answer(_row(f"day time {STEM}"), index)
    assert exact["label"] == "exact" and exact["plural_gold"]

    extra = label_answer(_row(f"Isaiah 1:1. day time {STEM}"), index)
    assert extra["label"] == "right_verse_plus_extra"

    other = label_answer(_row(f"pavilion {STEM}"), index)
    assert other["label"] == "other_edition"
    assert other["any_indexed_edition"]

    refusal = label_answer(_row("I'm sorry, but I can't provide that."), index)
    assert refusal["label"] == "refusal"

    blank = label_answer(_row("   "), index)
    assert blank["label"] == "empty"

    made_up = label_answer(_row("a fluent verse that shares no words with the gold line at all"), index)
    assert made_up["label"] == "fabrication"

    near = label_answer(_row(f"day time {STEM}".replace("november", "december")), index)
    assert near["label"] == "near_miss"
    assert is_refusal("I can't reliably reproduce the exact text of paragraph 12.")
    assert is_refusal("I\u2019m sorry, but I can\u2019t provide that.")
    assert is_refusal(
        "I can't reliably reproduce the exact text from memory. " + " ".join(["detail"] * 90)
    )
    assert not is_refusal(" ".join(["word"] * 12) + " I cannot stay")


def test_card_counts_languages_that_were_not_sampled():
    report = build_facct(
        _docs(),
        [_row(f"day time {STEM}"), _row("I'm sorry, I can't provide that.", model="m2", qid="q1")],
        {("The Bible", "KJV", "en"): "public-domain"},
        ["en", "ar", "he"],
    )
    assert report["answers"]["labels"]["exact"] == 1
    assert report["answers"]["labels"]["refusal"] == 1
    assert report["coverage"]["by_language"] == {"ar": 0, "en": 1, "he": 0}
    assert report["coverage"]["plural_gold_questions"] == 1
    assert report["counterfactual_bible"]["headline_miss_but_some_edition_contained"] == 0
    assert report["by_license"]["public-domain"]["n"] == 2
    assert report["card"]["community_review"].startswith("Not attached")
    assert "exact recitation of the named edition" in report["card"]["claim"]
    assert any("Temperature is absent" in line for line in report["card"]["threats"])
    assert any("empty seat" in line for line in report["card"]["refused"])
    assert [item["label"] for item in report["items"]] == ["exact", "refusal"]
    assert report["items"][0]["detail"].startswith("same words as")
    assert license_for(
        {"work": "Rerum Novarum", "version": "Vatican", "language": "en", "document_type": "encyclical"},
        {},
    ) == "open"
