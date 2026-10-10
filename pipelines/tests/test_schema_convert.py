import json

import pytest

from sacredbench.convert import ConvertError, convert_encyclicals, convert_nabre
from sacredbench.schema import SchemaError, load_document, parse_document, write_document
from tests.conftest import ENCYCLICAL_SHAPE, NABRE_SHAPE, make_doc


def test_document_roundtrip(tmp_path):
    doc = make_doc(n=3)
    path = tmp_path / "doc.json"
    write_document(doc, path)
    loaded = load_document(path)
    assert loaded == doc


def test_parse_normalises_string_tradition():
    data = make_doc(n=2).to_json_dict()
    data["source"]["tradition"] = "solo"
    assert parse_document(data).tradition == ["solo"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.pop("source"),
        lambda d: d["source"].pop("version"),
        lambda d: d.update(entries=[]),
        lambda d: d["entries"][0].pop("citation"),
        lambda d: d["entries"][0].update(text="  "),
    ],
)
def test_parse_fails_fast(mutate):
    data = make_doc(n=2).to_json_dict()
    mutate(data)
    with pytest.raises(SchemaError):
        parse_document(data)


def test_convert_nabre(tmp_path):
    p = tmp_path / "1Orchards.json"
    p.write_text(json.dumps(NABRE_SHAPE))
    [doc] = convert_nabre([p], tradition=["testfaith"], version="TestV")
    # camel-case book split, chapter:verse citations, empty verse dropped
    assert [e.citation for e in doc.entries] == [
        "1 Orchards 1:1",
        "1 Orchards 1:2",
        "1 Orchards 2:1",
    ]
    assert doc.document_type == "scripture" and doc.version == "TestV"


def test_convert_nabre_rejects_wrong_shape(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"paragraphs": []}))
    with pytest.raises(ConvertError):
        convert_nabre([p], tradition=["t"])


def test_convert_encyclicals(tmp_path):
    p = tmp_path / "de-testibus.json"
    p.write_text(json.dumps(ENCYCLICAL_SHAPE))
    [doc] = convert_encyclicals([p], tradition=["catholic"])
    # null paragraph -> positional label; blank paragraph dropped
    assert [e.citation for e in doc.entries] == ["De Testibus, para. 1", "De Testibus, para. 2"]
    assert doc.work == "De Testibus"
    assert doc.document_type == "encyclical"
    assert doc.source_url == "https://example.org/de-testibus"
