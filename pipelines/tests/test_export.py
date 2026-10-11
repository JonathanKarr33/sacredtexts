"""Tests for the interchange exporter: assembly (ordering, dedup, tradition
union), the semantic round-trip, and a real multi-shard work (LDS KJV OT+NT)."""

from __future__ import annotations

from pathlib import Path

import pytest

from sacredbench import catalogue as cat
from sacredbench.convert import convert_target
from sacredbench import export as exp
from sacredbench.export import (
    ExportError,
    assemble,
    check_filename_collisions,
    interchange_filename,
    roundtrip_ok,
)
from sacredbench.schema import Document, Entry, load_document, write_document

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW = REPO_ROOT / "texts" / "raw"


def _doc(work, version, lang, tradition, entries, document_type="scripture", source_url=None):
    return Document(
        tradition=list(tradition), work=work, version=version, language=lang,
        document_type=document_type, source_url=source_url,
        entries=[Entry(unit_type="verse", citation=c, text=t) for c, t in entries],
    )


def test_merge_collision_union_and_order():
    nt = _doc("The Bible", "KJV", "en", ["Protestant"], [("Matthew 1:1", "nt")])
    ot = _doc("The Bible", "KJV", "en", ["LDS"], [("Genesis 1:1", "ot")])
    [d] = assemble([nt, ot])  # input order NT, OT — but shards sort by first citation
    assert d.work == "The Bible" and d.version == "KJV" and d.language == "en"
    assert [e.citation for e in d.entries] == ["Genesis 1:1", "Matthew 1:1"]  # OT before NT
    assert d.tradition == ["LDS", "Protestant"]  # tradition union, in sorted-shard order


def test_stable_output_order_across_keys_regardless_of_input():
    a = _doc("Alpha", "V", "en", ["A"], [("1:1", "x")])
    b = _doc("Beta", "V", "en", ["B"], [("2:1", "y")])
    # distinct keys: output order must be deterministic (sorted by key), not input order
    assert [d.work for d in assemble([b, a])] == ["Alpha", "Beta"]
    assert assemble([a, b]) == assemble([b, a])


def test_dedup_repeated_citation_text():
    a = _doc("W", "V", "en", ["A"], [("1:1", "x"), ("1:2", "y")])
    b = _doc("W", "V", "en", ["A"], [("1:1", "x"), ("1:3", "z")])  # 1:1,x repeats
    [d] = assemble([a, b])
    assert [e.citation for e in d.entries] == ["1:1", "1:2", "1:3"]


def test_distinct_versions_not_merged():
    a = _doc("The Bible", "KJV", "en", ["Protestant"], [("Genesis 1:1", "x")])
    b = _doc("The Bible", "KJV (LDS 2013 edition)", "en", ["LDS"], [("Genesis 1:1", "y")])
    assert len(assemble([a, b])) == 2


def test_document_type_disagreement_fails():
    a = _doc("W", "V", "en", ["A"], [("1:1", "x")], document_type="scripture")
    b = _doc("W", "V", "en", ["A"], [("2:1", "y")], document_type="encyclical")
    with pytest.raises(ExportError):
        assemble([a, b])


def test_conflicting_citation_text_across_shards_fails():
    # same citation, different text, in two shards of one key -> ambiguous ground truth
    a = _doc("W", "V", "en", ["A"], [("1:1", "x")])
    b = _doc("W", "V", "en", ["A"], [("1:1", "DIFFERENT")])
    with pytest.raises(ExportError):
        assemble([a, b])


def test_roundtrip_ok_true_and_lossless(tmp_path):
    a = _doc("W", "V", "en", ["A"], [("2:1", "b")])
    b = _doc("W", "V", "en", ["B"], [("1:1", "a")])
    assert roundtrip_ok([a, b])
    for d in assemble([a, b]):
        p = tmp_path / interchange_filename(d)
        write_document(d, p)
        assert load_document(p) == d  # survives write/read


def test_roundtrip_ok_detects_lossy_assemble(monkeypatch):
    """The check must be non-vacuous: a lossy/reordering assembler makes it False."""
    a = _doc("W", "V", "en", ["A"], [("1:1", "x"), ("1:2", "y")])

    def lossy(docs):
        d = assemble(docs)[0]
        d.entries.pop()  # drop an entry
        return [d]

    monkeypatch.setattr(exp, "assemble", lossy)
    assert roundtrip_ok([a]) is False

    def reordering(docs):
        d = assemble(docs)[0]
        d.entries.reverse()  # reverse order
        return [d]

    monkeypatch.setattr(exp, "assemble", reordering)
    assert roundtrip_ok([a]) is False


def test_interchange_filename():
    d = _doc("The Bible", "KJV (LDS 2013 edition)", "en", ["LDS"], [("Genesis 1:1", "x")])
    assert interchange_filename(d) == "the-bible-kjv-lds-2013-edition-en.json"


def test_filename_collision_detected():
    # "A B" and "A-B" slugify identically but are distinct works
    a = _doc("A B", "V", "en", ["x"], [("1:1", "p")])
    b = _doc("A-B", "V", "en", ["x"], [("1:1", "q")])
    with pytest.raises(ExportError):
        check_filename_collisions([a, b])


def test_real_lds_kjv_ot_nt_merge():
    """The real multi-shard case: LDS KJV OT and NT are two targets sharing one
    (work, version, language); assembly merges them into one ordered document."""
    srcs = cat.discover_catalogue(RAW)
    lds_kjv = [
        t for t in cat.all_targets(srcs)
        if t.work == "The Bible" and t.version == "KJV (LDS 2013 edition)"
    ]
    assert len(lds_kjv) == 2  # OT + NT targets
    shards = [convert_target(t.payload_paths(RAW), t)[0] for t in lds_kjv]
    [merged] = assemble(shards)
    assert len(merged.entries) == 23145 + 7957  # OT + NT, no overlap
    assert merged.entries[0].citation == "Genesis 1:1"  # OT first (sorted by first citation)
    assert merged.entries[-1].citation == "Revelation 22:21"
    assert merged.tradition == ["The Church of Jesus Christ of Latter-Day Saints"]
    assert roundtrip_ok(shards)
