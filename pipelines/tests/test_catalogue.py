"""Tests for the source catalogue: schema/loader (incl. provenance), discovery,
license gating, path->license recovery, the CLI gate (convert/generate), and a
git check-ignore guard for the reachability rules."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from textwrap import dedent

import pytest
from typer.testing import CliRunner

from sacredbench import catalogue as cat
from sacredbench.cli import app

REPO_ROOT = Path(__file__).resolve().parents[2]
runner = CliRunner()

# Column-0 YAML fragments so concatenation stays valid (no dedent games).
PROV = (
    'provenance:\n'
    '  retrieved_from: example.org/repo\n'
    '  fetch_method: downloaded\n'
    '  fetch_date: "2026-01-01"\n'
)


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(text), encoding="utf-8")
    return path


def _fixture_tree(root: Path) -> Path:
    """A miniature texts/raw with one open target and one restricted target."""
    raw = root / "texts" / "raw"
    _write(
        raw / "Protestant Christian" / "source.yaml",
        PROV
        + "targets:\n"
        "  - payload: kjv.json\n"
        "    converter: bible_flat\n"
        "    work: The Bible\n"
        "    version: KJV\n"
        "    language: en\n"
        "    document_type: scripture\n"
        "    tradition: [Protestant Christian]\n"
        "    license: public-domain\n"
        "    license_detail: public domain\n",
    )
    _write(raw / "Protestant Christian" / "kjv.json", "[]")
    _write(
        raw / "Roman Catholic" / "source.yaml",
        PROV
        + "targets:\n"
        "  - payload: encyclicals/en/*.json\n"
        "    converter: encyclicals\n"
        "    work: Papal Encyclicals\n"
        "    version: Vatican English\n"
        "    language: en\n"
        "    document_type: encyclical\n"
        "    tradition: [Roman Catholic]\n"
        "    license: open\n"
        "  - payload: nabre.json\n"
        "    converter: nabre\n"
        "    work: The Bible\n"
        "    version: NABRE\n"
        "    language: en\n"
        "    document_type: scripture\n"
        "    tradition: [Roman Catholic]\n"
        "    license: restricted\n",
    )
    _write(raw / "Roman Catholic" / "encyclicals" / "en" / "a.json", "{}")
    _write(raw / "Roman Catholic" / "nabre.json", "{}")
    return raw


def _std_doc(path: Path, work: str = "W") -> Path:
    """Write a minimal schema-valid standardized document."""
    _write(
        path,
        json.dumps(
            {
                "source": {
                    "tradition": ["T"],
                    "work": work,
                    "version": "V",
                    "language": "en",
                    "document_type": "scripture",
                },
                "entries": [{"unit_type": "verse", "citation": f"{work} 1:1", "text": "hello"}],
            }
        ),
    )
    return path


# --- loader / schema ---------------------------------------------------------


def test_load_valid_source(tmp_path):
    raw = _fixture_tree(tmp_path)
    src = cat.load_source(raw / "Roman Catholic" / "source.yaml", raw)
    assert src.source_id == "Roman Catholic"
    assert [t.license for t in src.targets] == ["open", "restricted"]
    assert src.targets[0].tradition == ("Roman Catholic",)
    assert src.provenance.fetch_date == "2026-01-01"
    assert src.targets[0].provenance.retrieved_from == "example.org/repo"


def test_bare_string_tradition_normalized(tmp_path):
    y = _write(
        tmp_path / "texts" / "raw" / "X" / "source.yaml",
        PROV + _TARGET.replace("tradition: [X]", "tradition: X"),
    )
    src = cat.load_source(y, tmp_path / "texts" / "raw")
    assert src.targets[0].tradition == ("X",)


def test_per_target_provenance_override(tmp_path):
    y = _write(
        tmp_path / "texts" / "raw" / "X" / "source.yaml",
        PROV
        + _TARGET
        + "\n    provenance:\n"
        "      retrieved_from: other.example/held-back\n"
        "      fetch_method: licensed\n"
        "      fetch_date: unknown\n",
    )
    src = cat.load_source(y, tmp_path / "texts" / "raw")
    assert src.targets[0].provenance.retrieved_from == "other.example/held-back"
    assert src.provenance.retrieved_from == "example.org/repo"  # source default unchanged


_TARGET = (
    "targets:\n  - payload: a.json\n    converter: c\n    work: W\n    version: V\n"
    "    language: en\n    document_type: scripture\n    tradition: [X]\n    license: open"
)


@pytest.mark.parametrize(
    "body, needle",
    [
        (PROV + "targets: []", "non-empty list"),
        (PROV + "foo: bar", "non-empty list"),
        ("targets:\n  - {}", "missing required 'provenance'"),  # no provenance block
        (
            "provenance:\n  retrieved_from: x\n  fetch_method: y\n" + _TARGET,
            "provenance.fetch_date",  # provenance missing a key
        ),
        (PROV + _TARGET.replace("    license: open", "    tradition: [X]"), "missing required field 'license'"),
        (PROV + _TARGET.replace("license: open", "license: bogus"), "unknown license"),
        (PROV + _TARGET.replace("tradition: [X]", "tradition: []"), "tradition must be"),
        (PROV + _TARGET.replace("payload: a.json", "payload: '   '"), "payload"),
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


def test_discovery_missing_raises_catalogue_missing(tmp_path):
    (tmp_path / "texts" / "raw").mkdir(parents=True)
    with pytest.raises(cat.CatalogueMissing):
        cat.discover_catalogue(tmp_path / "texts" / "raw")
    with pytest.raises(cat.CatalogueMissing):
        cat.discover_catalogue(tmp_path / "nope")


# --- path -> license recovery ------------------------------------------------


def test_license_for_raw_path_and_index(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    idx = cat.build_raw_license_index(sources, raw)
    assert cat.license_for_raw_path(raw / "Roman Catholic" / "nabre.json", sources, raw, idx) == "restricted"
    assert cat.license_for_raw_path(raw / "Protestant Christian" / "kjv.json", sources, raw, idx) == "public-domain"
    assert cat.license_for_raw_path(raw / "Roman Catholic" / "encyclicals" / "en" / "a.json", sources, raw) == "open"
    assert cat.license_for_raw_path(raw / "nope.json", sources, raw) is None


def test_slug_and_standardized_dir():
    t = cat.Target(
        source_id="Roman Catholic", payload="nabre.json", converter="nabre",
        work="The Bible", version="NABRE", language="en", document_type="scripture",
        tradition=("Roman Catholic",), license="restricted",
        provenance=cat.Provenance("x", "y", "z"),
    )
    assert t.slug == "the-bible-nabre-en"
    assert t.standardized_dir(Path("texts/standardized")) == Path(
        "texts/standardized/Roman Catholic/the-bible-nabre-en"
    )


def test_standardized_filter_drops_restricted_and_fails_closed(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    std = tmp_path / "texts" / "standardized"
    open_t = next(t for t in cat.all_targets(sources) if t.license == "open")
    restricted_t = next(t for t in cat.all_targets(sources) if t.license == "restricted")
    open_doc = _std_doc(open_t.standardized_dir(std) / "doc.json")
    restricted_doc = _std_doc(restricted_t.standardized_dir(std) / "doc.json")

    assert cat.license_for_standardized_path(open_doc, sources, std) == "open"
    assert cat.license_for_standardized_path(restricted_doc, sources, std) == "restricted"

    kept = cat.filter_standardized_paths([std], sources, include_restricted=False, standardized_root=std)
    assert kept == [open_doc]  # restricted dropped
    kept_all = cat.filter_standardized_paths([std], sources, include_restricted=True, standardized_root=std)
    assert set(kept_all) == {open_doc, restricted_doc}

    # fail-closed: a standardized file outside every target dir cannot be verified
    stray = _std_doc(std / "stray.json")
    with pytest.raises(cat.CatalogueError):
        cat.filter_standardized_paths([stray], sources, standardized_root=std)


# --- CLI gate ----------------------------------------------------------------


def test_cli_convert_refuses_restricted_by_default(tmp_path):
    raw = _fixture_tree(tmp_path)
    r = runner.invoke(
        app,
        ["convert", "nabre", str(raw / "Roman Catholic" / "nabre.json"),
         "--out", str(tmp_path / "o.json"), "--tradition", "Roman Catholic", "--raw-root", str(raw)],
    )
    assert r.exit_code != 0
    assert "refusing restricted" in r.output


def test_cli_convert_restricted_opt_in_passes_guard(tmp_path):
    raw = _fixture_tree(tmp_path)
    r = runner.invoke(
        app,
        ["convert", "nabre", str(raw / "Roman Catholic" / "nabre.json"),
         "--out", str(tmp_path / "o.json"), "--tradition", "Roman Catholic",
         "--raw-root", str(raw), "--include-restricted"],
    )
    # guard passes; conversion then fails on the empty payload — but NOT a refusal
    assert "refusing restricted" not in r.output


def test_cli_generate_filters_restricted(tmp_path):
    raw = _fixture_tree(tmp_path)
    sources = cat.discover_catalogue(raw)
    std = tmp_path / "texts" / "standardized"
    restricted_t = next(t for t in cat.all_targets(sources) if t.license == "restricted")
    _std_doc(restricted_t.standardized_dir(std) / "doc.json")

    # default: the only doc is restricted -> filtered out -> nothing to generate
    r = runner.invoke(
        app,
        ["generate", str(std), "--raw-root", str(raw), "--standardized-root", str(std)],
    )
    assert r.exit_code != 0
    assert "restricted and excluded" in r.output

    # opt-in: the restricted doc is included (so the "all excluded" guard does NOT
    # trigger; generation may still fail later on the tiny pool)
    r2 = runner.invoke(
        app,
        ["generate", str(std), "--raw-root", str(raw), "--standardized-root", str(std),
         "--include-restricted"],
    )
    assert "restricted and excluded" not in r2.output


def test_cli_generate_fail_closed_on_unmapped(tmp_path):
    raw = _fixture_tree(tmp_path)
    std = tmp_path / "texts" / "standardized"
    stray = _std_doc(std / "stray.json")
    r = runner.invoke(
        app,
        ["generate", str(stray), "--raw-root", str(raw), "--standardized-root", str(std)],
    )
    assert r.exit_code != 0
    # fail-closed raises CatalogueError (the main() wrapper renders it in real use;
    # CliRunner surfaces it as the raised exception)
    assert isinstance(r.exception, cat.CatalogueError)
    assert "fail-closed" in str(r.exception)


def test_cli_gate_requires_catalogue(tmp_path):
    r = runner.invoke(
        app,
        ["generate", str(tmp_path), "--raw-root", str(tmp_path / "nope")],
    )
    assert r.exit_code != 0
    assert "catalogue" in r.output.lower()


# --- iter-2 review fixes -----------------------------------------------------


def test_slugify_collapses_runs():
    t = cat.Target(
        source_id="x", payload="p", converter="c", work="The Bible",
        version="ASV (1901)", language="en", document_type="scripture",
        tradition=("x",), license="public-domain", provenance=cat.Provenance("a", "b", "c"),
    )
    assert t.slug == "the-bible-asv-1901-en"  # no doubled hyphens


def test_same_slug_license_disagreement_fails(tmp_path):
    item = _TARGET[len("targets:\n"):]  # one list item, same (work, version, language)
    body = PROV + "targets:\n" + item + "\n" + item.replace("license: open", "license: restricted") + "\n"
    y = _write(tmp_path / "texts" / "raw" / "X" / "source.yaml", body)
    with pytest.raises(cat.CatalogueError) as e:
        cat.load_source(y, tmp_path / "texts" / "raw")
    assert "disagree on license" in str(e.value)


def test_malformed_yaml_wrapped(tmp_path):
    y = _write(tmp_path / "texts" / "raw" / "X" / "source.yaml", "targets: [unclosed\n")
    with pytest.raises(cat.CatalogueError) as e:
        cat.load_source(y, tmp_path / "texts" / "raw")
    assert "invalid YAML" in str(e.value)


def test_standardized_tie_prefers_restricted(tmp_path):
    std = tmp_path / "std"
    common = dict(
        source_id="x", payload="p", converter="c", work="W", version="V",
        language="en", document_type="scripture", tradition=("x",),
        provenance=cat.Provenance("a", "b", "c"),
    )
    open_t = cat.Target(license="open", **common)
    restricted_t = cat.Target(license="restricted", **common)
    doc = _std_doc(open_t.standardized_dir(std) / "d.json")  # same dir for both
    # most-conservative wins the depth tie, regardless of target order
    assert cat.license_for_standardized_path(doc, [_src(open_t, restricted_t)], std) == "restricted"
    assert cat.license_for_standardized_path(doc, [_src(restricted_t, open_t)], std) == "restricted"


def _src(*targets: cat.Target) -> cat.Source:
    return cat.Source(
        source_id=targets[0].source_id, yaml_path=Path("x/source.yaml"),
        targets=tuple(targets), provenance=cat.Provenance("a", "b", "c"),
    )


def test_cli_convert_refuses_uncatalogued_path(tmp_path):
    raw = _fixture_tree(tmp_path)
    stray = raw / "Roman Catholic" / "nabre (1).json"  # exists, matched by no glob
    stray.write_text("{}", encoding="utf-8")
    r = runner.invoke(
        app,
        ["convert", "nabre", str(stray), "--out", str(tmp_path / "o.json"),
         "--tradition", "Roman Catholic", "--raw-root", str(raw)],
    )
    assert r.exit_code != 0
    assert "not in the source catalogue" in r.output


def test_cli_generate_reports_missing_path_distinctly(tmp_path):
    raw = _fixture_tree(tmp_path)
    r = runner.invoke(
        app,
        ["generate", str(tmp_path / "texts" / "standardized"),
         "--raw-root", str(raw), "--standardized-root", str(tmp_path / "texts" / "standardized")],
    )
    assert r.exit_code != 0
    assert "input path not found" in r.output  # not a misleading license error


# --- gitignore reachability (regression guard for the real repo) -------------


def _check_ignored(rel: str) -> bool:
    r = subprocess.run(["git", "check-ignore", "-q", rel], cwd=REPO_ROOT, capture_output=True)
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
