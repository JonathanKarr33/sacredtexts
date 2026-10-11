"""Arabic/Hebrew normalisation (Spec 8, Phase 1).

`normalize()` must score Qur'an (Arabic) and Talmud (Hebrew/Aramaic) quotes fairly:
combining marks (harakat / niqqud / cantillation), tatweel, and the Qur'anic annotation
symbols are removed and letter variants folded, so a vocalised and an unvocalised spelling
of the same text are equal — in BOTH directions (a vocalised answer vs. an unvocalised
expected, and the reverse). Latin output must be byte-for-byte unchanged, and the scoring
contract (`_SUBMETRICS`, the `retrieve_quote` headline rule) must not move.

Real fixtures are read from the committed, open-licensed corpora (the QUL Uthmani Qur'an and
the Davidson VOCALISED Aramaic Shevuot file — the latter is deliberately excluded from the
conversion catalogue and is used here only as a mark fixture, never converted into the
corpus). Both files are public-domain / open and already tracked in the repo.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pytest

from sacredbench.score import normalize, score_answer, strip_script_marks, token_f1

REPO_ROOT = Path(__file__).resolve().parents[2]
QUL = REPO_ROOT / "texts" / "raw" / "Sunni Islam" / "quran_uthmani_from_qul.json.json"
SHEVUOT_VOCALIZED = (
    REPO_ROOT / "texts" / "raw" / "Judaism" / "Talmud Bavli"
    / "Shevuot - he - William Davidson Edition - Vocalized Aramaic.json"
)

# code points that must NOT survive normalisation of Arabic/Hebrew text
_MARK = re.compile(
    "[ً-ٰٕـۖ-ۭ"
    "֑-־ׇֿׁׂׅׄ]"
)


def _strip_combining(s: str) -> str:
    """A naive 'unvocalised' form: drop every Arabic/Hebrew mark the fixture carries, so a
    test can compare the real vocalised text against its bare-consonant spelling."""
    return _MARK.sub("", s)


# --- Arabic ------------------------------------------------------------------


def test_arabic_vocalized_equals_plain_basmala():
    vocal = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
    plain = "بسم الله الرحمن الرحيم"
    assert normalize(vocal) == normalize(plain)
    assert token_f1(vocal, plain) == 1.0


def test_arabic_folds_alef_variants_and_tatweel():
    # alef-madda/hamza-above/hamza-below/wasla all fold to a bare alef; tatweel vanishes
    assert normalize("أإآاٱ") == normalize("ااااا")
    assert normalize("مـحـمـد") == normalize("محمد")


@pytest.mark.parametrize("verse_key", ["2:2", "7:206"])  # 2:2 has U+06DB; 7:206 has sajdah U+06E9
def test_real_qul_ayah_marks_removed_without_splitting(verse_key):
    data = json.loads(QUL.read_text(encoding="utf-8"))
    text = data[verse_key]["text"]
    # the raw ayah really does carry annotation marks (guards the fixture)
    assert any(_MARK.match(c) or unicodedata.category(c).startswith("M") for c in text)
    norm = normalize(text)
    # no combining mark / tatweel / annotation code point survives
    assert not _MARK.search(norm)
    assert not any(unicodedata.category(c).startswith("M") for c in norm)
    # a bare-consonant spelling of the same ayah is scored equal (not split into letters)
    assert normalize(text) == normalize(_strip_combining(text))
    assert token_f1(text, _strip_combining(text)) == 1.0


# --- Hebrew ------------------------------------------------------------------


def test_real_vocalized_talmud_line_equals_plain():
    data = json.loads(SHEVUOT_VOCALIZED.read_text(encoding="utf-8"))
    line = None
    for section in data["text"]:
        for raw in section or []:
            clean = re.sub(r"<[^>]+>", "", raw).strip()
            if clean and any(0x0591 <= ord(c) <= 0x05C7 for c in clean):
                line = clean
                break
        if line:
            break
    assert line is not None, "expected a vocalised line in the Shevuot fixture"
    assert normalize(line) == normalize(_strip_combining(line))
    assert token_f1(line, _strip_combining(line)) == 1.0


def test_hebrew_maqaf_becomes_word_boundary():
    # the maqaf (U+05BE) joins words like a hyphen; it must become a SPACE so adjacent
    # words don't concatenate (and niqqud is stripped around it)
    assert normalize("עַל־כֵּן") == "על כן"
    assert normalize("עַל־כֵּן").count(" ") == 1


# --- asymmetric direction (the contrast-preserving property) -----------------


def test_retrieve_quote_scores_equal_regardless_of_vocalisation_direction():
    # Qur'an: expected is vocalised (QUL), a model answers in plain Arabic -> still correct
    ayah_vocal = json.loads(QUL.read_text(encoding="utf-8"))["1:2"]["text"]
    ayah_plain = _strip_combining(ayah_vocal)
    r = score_answer("retrieve_quote", ayah_plain, {"text": ayah_vocal})
    assert r["normalized"] == 1 and r["correct"] == 1 and r["token_f1"] == 1.0
    # Talmud: expected is unvocalised (catalogued Aramaic), a search-on model answers in
    # VOCALISED text -> must NOT be penalised (this is the direction that would otherwise
    # invert the web-search contrast)
    data = json.loads(SHEVUOT_VOCALIZED.read_text(encoding="utf-8"))
    vocal = next(
        re.sub(r"<[^>]+>", "", raw).strip()
        for section in data["text"] for raw in (section or [])
        if re.sub(r"<[^>]+>", "", raw).strip()
        and any(0x0591 <= ord(c) <= 0x05C7 for c in re.sub(r"<[^>]+>", "", raw))
    )
    plain = _strip_combining(vocal)
    r = score_answer("retrieve_quote", vocal, {"text": plain})
    assert r["normalized"] == 1 and r["correct"] == 1 and r["token_f1"] == 1.0


# --- Latin invariance --------------------------------------------------------


@pytest.mark.parametrize(
    "text,expected",
    [
        ("The keeper planted twelve trees.", "the keeper planted twelve trees"),
        ("“Love one’s neighbour!”", "love one s neighbour"),
        ("A  B\n C", "a b c"),
        # pre-existing behaviour: NFKD splits Latin diacritics at the punctuation pass;
        # the Arabic/Hebrew change must NOT alter this (strip_script_marks is a no-op here)
        ("naïve café résumé", "nai ve cafe re sume"),
    ],
)
def test_latin_output_unchanged(text, expected):
    assert normalize(text) == expected


def test_strip_script_marks_is_a_noop_on_latin():
    for s in ["Hello, world!", "café", "coöperate", "John 3:16"]:
        assert strip_script_marks(unicodedata.normalize("NFKD", s)) == unicodedata.normalize("NFKD", s)
