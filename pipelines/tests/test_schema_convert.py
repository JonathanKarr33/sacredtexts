import json
from pathlib import Path

import pytest

from sacredbench import catalogue as cat
from sacredbench.convert import (
    ConvertError,
    convert_bible_flat,
    convert_encyclicals,
    convert_lds_nested,
    convert_nabre,
    convert_target,
)
from sacredbench.schema import SchemaError, load_document, parse_document, write_document
from tests.conftest import ENCYCLICAL_SHAPE, NABRE_SHAPE, make_doc

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW = REPO_ROOT / "texts" / "raw"


def _target(**over) -> cat.Target:
    base = dict(
        source_id="X", payload="x.json", converter="nabre", work="The Bible",
        version="TestV", language="en", document_type="scripture",
        tradition=("testfaith",), license="public-domain",
        provenance=cat.Provenance("a", "b", "c"),
    )
    base.update(over)
    base["tradition"] = tuple(base["tradition"])
    return cat.Target(**base)


def _real_target(source_id: str, **match) -> cat.Target:
    """Pick one real catalogue target by source_id + matching fields."""
    sources = cat.discover_catalogue(RAW)
    for t in cat.all_targets(sources):
        if t.source_id == source_id and all(getattr(t, k) == v for k, v in match.items()):
            return t
    raise AssertionError(f"no catalogue target {source_id} {match}")


# --- schema (unchanged behaviour) --------------------------------------------


def test_document_roundtrip(tmp_path):
    doc = make_doc(n=3)
    path = tmp_path / "doc.json"
    write_document(doc, path)
    assert load_document(path) == doc


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


# --- nabre / encyclicals (adapted to the (paths, target) contract) -----------


def test_convert_nabre(tmp_path):
    p = tmp_path / "1Orchards.json"
    p.write_text(json.dumps(NABRE_SHAPE))
    [doc] = convert_nabre([p], _target(version="TestV"))
    assert [e.citation for e in doc.entries] == ["1 Orchards 1:1", "1 Orchards 1:2", "1 Orchards 2:1"]
    assert doc.document_type == "scripture" and doc.version == "TestV"


def test_convert_nabre_rejects_wrong_shape(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"paragraphs": []}))
    with pytest.raises(ConvertError):
        convert_nabre([p], _target())


def test_convert_encyclicals(tmp_path):
    p = tmp_path / "de-testibus.json"
    p.write_text(json.dumps(ENCYCLICAL_SHAPE))
    [doc] = convert_encyclicals([p], _target(document_type="encyclical"))
    # null paragraph -> non-canonical "unnumbered"; declared number preserved; blank dropped
    assert [e.citation for e in doc.entries] == ["De Testibus, unnumbered para. 1", "De Testibus, para. 2"]
    assert doc.work == "De Testibus"
    assert doc.document_type == "encyclical"
    assert doc.source_url == "https://example.org/de-testibus"


# --- bible_flat (real committed data + malformed) ----------------------------


@pytest.mark.parametrize("version, count", [("KJV", 31102), ("ASV (1901)", 31102), ("WEB", 31098)])
def test_convert_bible_flat_real_three_versions(version, count):
    """All three real Protestant Bibles convert to validate-passing docs of 'The Bible'."""
    t = _real_target("Protestant Christian", version=version)
    [doc] = convert_target(t.payload_paths(RAW), t)
    assert doc.work == "The Bible" and doc.version == version and doc.document_type == "scripture"
    assert len(doc.entries) == count
    assert doc.entries[0].citation == "Genesis 1:1" and doc.entries[0].unit_type == "verse"
    assert doc.entries[-1].citation == "Revelation 22:21"
    parse_document(doc.to_json_dict())  # validate-passing


def test_convert_bible_flat_real_kjv_exact_text():
    t = _real_target("Protestant Christian", version="KJV")
    [doc] = convert_target(t.payload_paths(RAW), t)
    assert doc.entries[0].text == "In the beginning God created the heaven and the earth."


def test_convert_bible_flat_rejects_wrong_shape(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"not": "a list"}))
    with pytest.raises(ConvertError):
        convert_bible_flat([p], _target(converter="bible_flat"))


def test_convert_encyclicals_real():
    """Phase 2 requires confirming encyclicals against the committed source."""
    t = _real_target("Roman Catholic", converter="encyclicals")
    docs = convert_target(t.payload_paths(RAW), t)
    assert len(docs) == 201
    assert sum(len(d.entries) for d in docs) == 10263  # body prose; footnote block excluded
    for d in docs:
        assert all(e.unit_type == "paragraph" for e in d.entries)
        cites = [e.citation for e in d.entries]
        assert len(cites) == len(set(cites))  # unique within each document
        parse_document(d.to_json_dict())  # validate-passing


def test_convert_encyclicals_citations_bind_to_declared_numbers():
    """Body paragraphs are cited by their DECLARED paragraph number (not position),
    front matter is marked non-canonical, and the footnote block is excluded."""
    t = _real_target("Roman Catholic", converter="encyclicals")
    docs = convert_target(t.payload_paths(RAW), t)
    by_work = {d.work: {e.citation: e.text for e in d.entries} for d in docs}

    # Ad Petri Cathedram: 2 null front-matter paragraphs precede declared #2, so a
    # positional citation would mislabel it. The declared-number binding is correct:
    apc = by_work["Ad Petri Cathedram"]
    assert apc["Ad Petri Cathedram, para. 2"].startswith("For these reflections of Ours")
    assert apc["Ad Petri Cathedram, unnumbered para. 1"].startswith("To the Venerable Brethren")

    # Aeterni Patris: the footnote block (numbering restart) is not emitted as prose.
    ap = [d for d in docs if d.work == "Aeterni Patris"][0]
    assert not any("De Trinitate" in e.text and "PL 42" in e.text for e in ap.entries)


# --- lds_nested (real committed data: 3-level, 2-level, metadata skip) --------


def test_convert_lds_nested_three_level_book_of_mormon():
    t = _real_target("The Church of Jesus Christ of Latter-Day Saints", work="Book of Mormon")
    [doc] = convert_target(t.payload_paths(RAW), t)
    assert len(doc.entries) == 6604  # canonical verse count; editorial chapter headings excluded
    assert doc.entries[0].citation == "1 Nephi 1:1"  # book chapter:verse
    assert doc.entries[-1].citation == "Moroni 10:34"
    # chapter-level 'heading' editorial summaries are NOT emitted as verses
    assert not any(":heading" in e.citation or e.citation.endswith("heading") for e in doc.entries)


def test_convert_lds_nested_two_level_doctrine_and_covenants():
    t = _real_target("The Church of Jesus Christ of Latter-Day Saints", work="Doctrine and Covenants")
    [doc] = convert_target(t.payload_paths(RAW), t)
    assert len(doc.entries) == 3654
    # 2-level citation is self-identifying (includes the work), not a bare "1:1"
    assert doc.entries[0].citation == "Doctrine and Covenants 1:1"


def test_convert_lds_nested_skips_metadata_keys():
    t = _real_target("The Church of Jesus Christ of Latter-Day Saints", work="Pearl of Great Price")
    [doc] = convert_target(t.payload_paths(RAW), t)
    assert len(doc.entries) == 635
    # last_modified / version metadata keys never become citations
    cites = {e.citation for e in doc.entries}
    assert not any(c.startswith(("last_modified", "version")) for c in cites)
    assert doc.entries[0].citation == "Moses 1:1"


def test_convert_lds_nested_rejects_mixed_shape(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"Book": {"1": "verse-string", "2": {"1": "chapter-object"}}}))
    with pytest.raises(ConvertError):
        convert_lds_nested([p], _target(converter="lds_nested"))


# --- convert_target dispatch -------------------------------------------------


def test_convert_target_unregistered_converter_fails(tmp_path):
    p = tmp_path / "x.json"
    p.write_text("{}")
    with pytest.raises(ConvertError) as e:
        convert_target([p], _target(converter="quran_qul"))
    assert "not registered" in str(e.value)


def test_convert_target_empty_paths_fails():
    with pytest.raises(ConvertError) as e:
        convert_target([], _target(converter="bible_flat"))
    assert "no payload files" in str(e.value)


# --- fail-fast / post-conditions ---------------------------------------------


def test_duplicate_citations_rejected(tmp_path):
    # two flat records that would yield the same citation
    p = tmp_path / "dup.json"
    p.write_text(json.dumps([
        {"book": "Genesis", "chapter": 1, "verse": 1, "text": "a"},
        {"book": "Genesis", "chapter": 1, "verse": 1, "text": "b"},
    ]))
    with pytest.raises(ConvertError) as e:
        convert_bible_flat([p], _target(converter="bible_flat"))
    assert "duplicate citation" in str(e.value)


@pytest.mark.parametrize(
    "fn_name, payload",
    [
        ("encyclicals", ["a list, not an object"]),
        ("nabre", ["a list, not an object"]),
        ("lds_nested", "a string, not an object"),
    ],
)
def test_converters_fail_fast_naming_file_on_bad_top_level(tmp_path, fn_name, payload):
    """A wrong top-level JSON type raises ConvertError naming the file, not AttributeError."""
    fn = {"encyclicals": convert_encyclicals, "nabre": convert_nabre, "lds_nested": convert_lds_nested}[fn_name]
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(payload))
    with pytest.raises(ConvertError) as e:
        fn([p], _target(converter=fn_name))
    assert "bad.json" in str(e.value)


def test_lds_nested_rejects_unexpected_scalar_book(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"Mystery": "scalar instead of a book object"}))
    with pytest.raises(ConvertError) as e:
        convert_lds_nested([p], _target(converter="lds_nested"))
    assert "non-object top-level key" in str(e.value)
