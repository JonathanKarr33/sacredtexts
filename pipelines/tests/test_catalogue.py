"""Tests for the source catalogue: schema/loader, discovery, license gating, and
path->license recovery, plus a git check-ignore guard for the reachability rules."""

from __future__ import annotations

import subprocess
from pathlib import Path
from textwrap import dedent

import pytest

from sacredbench import catalogue as cat

REPO_ROOT = Path(__file__).resolve().parents[2]


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(text), encoding="utf-8")
    return path


def _fixture_tree(root: Path) -> Path:
    """A miniature texts/raw with one open target and one restricted target."""
    raw = root / "texts" / "raw"
    _write(
        raw / "Protestant Christian" / "source.yaml",
        """
        targets:
          - payload: kjv.json
            converter: bible_flat
            work: The Bible
            version: KJV
            language: en
            document_type: scripture
            tradition: [Protestant Christian]
            license: public-domain
            license_detail: public domain
        """,
    )
    _write(raw / "Protestant Christian" / "kjv.json", "[]")
    _write(
        raw / "Roman Catholic" / "source.yaml",
        """
        targets:
          - payload: encyclicals/en/*.json
            converter: encyclicals
            work: Papal Encyclicals
            version: Vatican English
            language: en
            document_type: encyclical
            tradition: [Roman Catholic]
            license: open
          - payload: nabre.json
            converter: nabre
            work: The Bible
            version: NABRE
            language: en
            document_type: scripture
            tradition: [Roman Catholic]
            license: restricted
        """,
    )
    _write(raw / "Roman Catholic" / "encyclicals" / "en" / "a.json", "{}")
    _write(raw / "Roman Catholic" / "nabre.json", "{}")
    return raw


# --- loader / schema ---------------------------------------------------------


def test_load_valid_source(tmp_path):
    raw = _fixture_tree(tmp_path)
    src = cat.load_source(raw / "Roman Catholic" / "source.yaml", raw)
    assert src.source_id == "Roman Catholic"
    assert [t.license for t in src.targets] == ["open", "restricted"]
    assert src.targets[0].tradition == ("Roman Catholic",)


def test_bare_string_tradition_normalized(tmp_path):
    y = _write(
        tmp_path / "texts" / "raw" / "X" / "source.yaml",
        """
        targets:
          - payload: a.json
            converter: c
            work: W
            version: V
            language: en
            document_type: scripture
            tradition: X
            license: open
        """,
    )
    src = cat.load_source(y, tmp_path / "texts" / "raw")
    assert src.targets[0].tradition == ("X",)


@pytest.mark.parametrize(
    "body, needle",
    [
        ("targets: []", "non-empty list"),
        ("foo: bar", "non-empty list"),
        (
            "targets:\n  - payload: a.json\n    converter: c\n    work: W\n"
            "    version: V\n    language: en\n    document_type: scripture\n"
            "    tradition: [X]",
            "missing required field 'license'",
        ),
        (
            "targets:\n  - payload: a.json\n    converter: c\n    work: W\n"
            "    version: V\n    language: en\n    document_type: scripture\n"
            "    tradition: [X]\n    license: bogus",
            "unknown license",
        ),
        (
            "targets:\n  - payload: a.json\n    converter: c\n    work: W\n"
            "    version: V\n    language: en\n    document_type: scripture\n"
            "    tradition: []\n    license: open",
            "tradition must be",
        ),
        (
            "targets:\n  - payload: '   '\n    converter: c\n    work: W\n"
            "    version: V\n    language: en\n    document_type: scripture\n"
            "    tradition: [X]\n    license: open",
            "payload",
        ),
    ],
)
def test_malformed_fails_naming_file_and_target(tmp_path, body, needle):
    y = _write(tmp_path / "texts" / "raw" / "X" / "source.yaml", body)
    with pytest.raises(cat.CatalogueError) as e:
        cat.load_source(y, tmp_path / "texts" / "raw")
    assert needle in str(e.value)
    assert "source.yaml" in str(e.value)  # names the file


# --- discovery / selection ---------------------------------------------------


def test_discovery_and_selection(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    assert len(sources) == 2
    assert len(cat.all_targets(sources)) == 3
    default = cat.select_targets(sources)
    assert all(t.license != "restricted" for t in default)
    assert len(default) == 2
    with_restricted = cat.select_targets(sources, include_restricted=True)
    assert len(with_restricted) == 3
    assert any(t.license == "restricted" for t in with_restricted)


def test_discovery_empty_root_fails(tmp_path):
    (tmp_path / "texts" / "raw").mkdir(parents=True)
    with pytest.raises(cat.CatalogueError):
        cat.discover_catalogue(tmp_path / "texts" / "raw")


# --- path -> license recovery ------------------------------------------------


def test_license_for_raw_path(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    assert cat.license_for_raw_path(raw / "Roman Catholic" / "nabre.json", sources, raw) == "restricted"
    assert cat.license_for_raw_path(raw / "Protestant Christian" / "kjv.json", sources, raw) == "public-domain"
    assert cat.license_for_raw_path(raw / "Roman Catholic" / "encyclicals" / "en" / "a.json", sources, raw) == "open"
    assert cat.license_for_raw_path(raw / "nope.json", sources, raw) is None


def test_slug_and_standardized_dir():
    t = cat.Target(
        source_id="Roman Catholic", payload="nabre.json", converter="nabre",
        work="The Bible", version="NABRE", language="en", document_type="scripture",
        tradition=("Roman Catholic",), license="restricted",
    )
    assert t.slug == "the-bible-nabre-en"
    assert t.standardized_dir(Path("texts/standardized")) == Path(
        "texts/standardized/Roman Catholic/the-bible-nabre-en"
    )


def test_license_for_standardized_path_and_filter(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    std = tmp_path / "texts" / "standardized"
    open_t = next(t for t in cat.all_targets(sources) if t.license == "open")
    restricted_t = next(t for t in cat.all_targets(sources) if t.license == "restricted")
    open_doc = open_t.standardized_dir(std) / "doc.json"
    restricted_doc = restricted_t.standardized_dir(std) / "doc.json"
    outside = std / "loose.json"
    for p in (open_doc, restricted_doc, outside):
        _write(p, "{}")

    assert cat.license_for_standardized_path(open_doc, sources, std) == "open"
    assert cat.license_for_standardized_path(restricted_doc, sources, std) == "restricted"
    assert cat.license_for_standardized_path(outside, sources, std) is None

    kept = cat.filter_standardized_paths([std], sources, include_restricted=False, standardized_root=std)
    assert restricted_doc not in kept
    assert open_doc in kept and outside in kept  # unmatched files are kept

    kept_all = cat.filter_standardized_paths([std], sources, include_restricted=True, standardized_root=std)
    assert restricted_doc in kept_all


# --- gitignore reachability (regression guard for the real repo) -------------


def _check_ignored(rel: str) -> bool:
    r = subprocess.run(
        ["git", "check-ignore", "-q", rel], cwd=REPO_ROOT, capture_output=True
    )
    return r.returncode == 0


def test_real_source_yaml_are_trackable_and_payloads_ignored():
    for rel in [
        "texts/raw/Protestant Christian/source.yaml",
        "texts/raw/Sunni Islam/source.yaml",
        "texts/raw/Judaism/source.yaml",
        "texts/raw/Roman Catholic/source.yaml",
        "texts/raw/Greek Orthodox/source.yaml",
        "texts/raw/The Church of Jesus Christ of Latter-Day Saints/source.yaml",
    ]:
        assert (REPO_ROOT / rel).exists(), f"missing committed catalogue file: {rel}"
        assert not _check_ignored(rel), f"source.yaml must be trackable: {rel}"
    for rel in [
        "texts/raw/Roman Catholic/nabre.json",
        "texts/raw/Greek Orthodox/septuagint.json",
        "texts/standardized/Judaism/anything.json",
    ]:
        assert _check_ignored(rel), f"restricted/standardized path must be ignored: {rel}"
