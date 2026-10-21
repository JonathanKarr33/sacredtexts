"""Guards for CODE_WALKTHROUGH.md — the contributor walkthrough (Issue #10).

The walkthrough's whole value is that its `file:line` pointers are real and its
named symbols exist (the issue's hard constraint: "no invented APIs"). Line numbers
drift as code changes, so this test does not pin exact lines; it checks the weaker,
durable invariants that catch the real failure modes — a renamed/moved file, a typo'd
path, a line number past end-of-file, or a symbol the prose leans on that no longer
exists. The symbol names are the stable anchor; a drifted line is a convenience to fix.

Deterministic and offline: it only reads files already in the repo.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DOC = REPO_ROOT / "CODE_WALKTHROUGH.md"

# Inline-code tokens of the form `path:line` where path has a source extension. These
# are precisely the "pointer" claims the doc makes; example/dir paths without a line
# number (and `<placeholder>` paths) are intentionally not matched.
_POINTER_RE = re.compile(
    r"`([\w./-]+\.(?:py|ts|tsx|md|yaml|yml|sh|json)):(\d+)`"
)
_SKIP_DIRS = {".git", "node_modules", "dist", "build", ".venv", "__pycache__", ".codev"}


def _doc_text() -> str:
    assert DOC.exists(), f"{DOC} is missing"
    return DOC.read_text(encoding="utf-8")


def _resolve(rel: str) -> Path | None:
    """Resolve a doc path reference to a real file.

    A slashed path resolves against the repo root; a bare basename resolves iff
    exactly one file with that name exists in the tree (the committed source files
    the doc cites bare — convert.py, score.py, … — are all uniquely named)."""
    if "/" in rel:
        p = REPO_ROOT / rel
        return p if p.is_file() else None
    matches = [
        p
        for p in REPO_ROOT.rglob(rel)
        if p.is_file() and not (_SKIP_DIRS & set(p.relative_to(REPO_ROOT).parts))
    ]
    return matches[0] if len(matches) == 1 else None


def _pointers() -> list[tuple[str, int]]:
    return [(m.group(1), int(m.group(2))) for m in _POINTER_RE.finditer(_doc_text())]


def test_doc_exists_and_links_tutorial():
    text = _doc_text()
    # it must point at TUTORIAL.md rather than duplicate it (issue constraint)
    assert "TUTORIAL.md" in text
    assert "pipelines/README.md" in text


def test_pointer_parsing_did_not_silently_degrade():
    # a floor so a refactor that breaks parsing (or guts the pointers) fails loudly
    # rather than passing vacuously
    assert len(_pointers()) >= 20


@pytest.mark.parametrize("rel,line", _pointers())
def test_pointer_resolves_and_line_in_range(rel: str, line: int):
    target = _resolve(rel)
    assert target is not None, f"CODE_WALKTHROUGH.md references `{rel}:{line}` but no such file exists"
    n_lines = len(target.read_text(encoding="utf-8").splitlines())
    assert 1 <= line <= n_lines, (
        f"CODE_WALKTHROUGH.md points at `{rel}:{line}` but {rel} has {n_lines} lines"
    )


# Symbols the prose leans on by name: (repo-relative file, symbol substring).
_REQUIRED_SYMBOLS = [
    ("pipelines/sacredbench/convert.py", "CONVERTERS = {"),
    ("pipelines/sacredbench/convert.py", "def convert_target("),
    ("pipelines/sacredbench/convert.py", "def convert_nabre("),
    ("pipelines/sacredbench/convert.py", "def convert_sefaria_talmud("),
    ("pipelines/sacredbench/catalogue.py", "LICENSES = ("),
    ("pipelines/sacredbench/catalogue.py", "class Target"),
    ("pipelines/sacredbench/catalogue.py", "def license_for_standardized_path("),
    ("pipelines/sacredbench/catalogue.py", "def filter_standardized_paths("),
    ("pipelines/sacredbench/schema.py", "class Document"),
    ("pipelines/sacredbench/schema.py", "def parse_document("),
    ("pipelines/sacredbench/generate.py", "TASKS = ("),
    ("pipelines/sacredbench/generate.py", "def question_set_digest("),
    ("pipelines/sacredbench/generate.py", "def _build_texts("),
    ("pipelines/sacredbench/score.py", "_SUBMETRICS = {"),
    ("pipelines/sacredbench/score.py", "def score_answer("),
    ("pipelines/sacredbench/score.py", "def normalize("),
    ("pipelines/sacredbench/score.py", "def strip_script_marks("),
    ("pipelines/sacredbench/collect.py", "def _panel_fingerprint("),
    ("pipelines/sacredbench/config.py", "def _parse_tools("),
    ("pipelines/sacredbench/audit.py", "def audit_paths("),
    ("pipelines/sacredbench/audit.py", "def restricted_text_fingerprints("),
    ("apps/viewer/src/lib/explorer.ts", "export function explorerTasks("),
    ("apps/viewer/src/lib/explorer.ts", "export function filterQuestions("),
    ("pipelines/tests/test_first_run_regression.py", "def test_rescoring_committed_run_reproduces_scores("),
]


@pytest.mark.parametrize("rel,symbol", _REQUIRED_SYMBOLS)
def test_referenced_symbol_exists(rel: str, symbol: str):
    f = REPO_ROOT / rel
    assert f.is_file(), f"{rel} is missing"
    assert symbol in f.read_text(encoding="utf-8"), (
        f"CODE_WALKTHROUGH.md relies on `{symbol}` in {rel}, but it is not there"
    )
