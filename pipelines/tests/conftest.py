"""Synthetic fixtures. Real-SHAPE (verified against catholic_text_json) but
synthetic TEXT — no copyrighted translation is committed to this public repo."""

from __future__ import annotations

import pytest

from sacredbench.schema import Document, Entry

LONG = (
    "And in the first days the keeper of the orchard planted twelve trees upon "
    "the eastern slope and watered each one at morning and at evening without fail"
)
LONG2 = (
    "Blessed is the traveller who shares bread with the stranger at the gate, "
    "for the road remembers every kindness shown beneath the open sky"
)


def make_doc(
    work: str = "Book of Orchards", n: int = 30, version: str = "Test Edition",
    tradition: list[str] | None = None,
) -> Document:
    entries = [
        Entry(
            unit_type="verse",
            citation=f"{work} 1:{i}",
            text=f"{LONG if i % 2 else LONG2} (unit {i} of {work.lower()})",
        )
        for i in range(1, n + 1)
    ]
    return Document(
        tradition=tradition or ["testfaith"],
        work=work,
        version=version,
        language="en",
        document_type="scripture",
        entries=entries,
    )


@pytest.fixture
def two_work_docs() -> list[Document]:
    return [make_doc("Book of Orchards"), make_doc("Book of Roads")]


# The real nabre.json is a TOP-LEVEL LIST of book objects (one file, many books);
# verse text can embed heading strings, which are kept verbatim.
NABRE_SHAPE = [
    {
        "book": "1Orchards",
        "chapters": [
            {
                "chapter": 1,
                "verses": [
                    {"verse": 1, "text": "Preamble. The Making of Orchards " + LONG},
                    {"verse": 2, "text": LONG2},
                    {"verse": 3, "text": ""},
                ],
            },
            {"chapter": 2, "verses": [{"verse": 1, "text": LONG}]},
        ],
    },
    {"book": "2Orchards", "chapters": [{"chapter": 1, "verses": [{"verse": 1, "text": LONG2}]}]},
]

ENCYCLICAL_SHAPE = {
    "type": "papalEncyclical",
    "pope": "Test Pope",
    "title": "De Testibus",
    "publicationDate": "1900-01-01",
    "vaticanUrl": "https://example.org/de-testibus",
    "language": "en",
    "paragraphs": [
        {"paragraph": None, "text": LONG},
        {"paragraph": 2, "text": LONG2},
        {"paragraph": None, "text": "  "},
    ],
}
