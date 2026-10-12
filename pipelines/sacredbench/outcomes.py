"""Outcome classification (Spec 15, decision #2): refusal is an OUTCOME, not a grader.

Every answered cell gets ``outcome`` ∈ {``correct``, ``incorrect``, ``refused``}. A **refusal** is
detected here, in the outcome layer, and **short-circuits the headline verdict** — a cell the model
declined to answer is neither right nor wrong, so it is excluded from accuracy (``accuracy =
correct/(correct+incorrect)``) and surfaced as ``coverage`` / ``refused_rate`` instead. Graders
(``graders.py``) only ever decide correct-vs-incorrect for the cells that were actually answered.

Refusal rule (deterministic, pre-registered against the committed runs' ``answers.jsonl`` — see
``tests/test_contains_reference_rebaseline.py`` for the frozen (model_id, question_id) set and the
per-model counts this matcher must reproduce):

    a cell is ``refused`` iff a **decline cue appears in the leading segment of the answer**
    (the first ``LEADING_WINDOW`` normalized characters) **AND** the expected reference is **not**
    delivered.

Both halves matter:

- *decline cue* — a conservative set of first-person inability / non-delivery / refusal markers
  (``DECLINE_CUES``). They are matched against the normalized answer, so case and punctuation
  (including the apostrophe in ``can't``) fold automatically.
- *leading segment* — the cue must OPEN the answer, not trail it. An answer that delivers the verse
  and then appends a caveat ("…verse… (I couldn't retrieve the source to verify)") is an ANSWER with
  a disclaimer, not a refusal; its cue sits past the delivered text, outside the leading window. In
  the committed runs 262/266 declines open at character 0; the window only has to clear the longest
  genuine preamble ("I'm sorry, but I am unable…", "Let me try to get the segment. I couldn't…").
- *reference not delivered* — a decline-prefixed answer that still contains the reference
  (word-bounded) IS a correct retrieval ("I can't be certain, but it's: <verse>"), so the containment
  half keeps it out of the refused set. For ``verify_source`` and the other provenance tasks a leading
  decline alone is the refusal — a genuine verdict/citation leads with its answer, not a decline — and
  ``score._with_outcome`` applies verify_source's refusal ungated (so an incidental Yes/No inside a
  decline cannot score correct) while gating the delivered-result tasks on ``not correct``.

This module is deliberately thin: the primitives (``normalize``, ``_bounded_equal``, ``parse_yes_no``)
live in ``score.py`` and are imported lazily so there is no import cycle (``score`` imports this inside
``score_answer``).
"""

from __future__ import annotations

from functools import lru_cache

# The leading segment (in normalized characters) a decline cue must fall within to count as a
# refusal. Round and robust: it clears the genuine preambles (longest observed ≈ 39) while excluding
# the deliver-then-caveat cells (earliest trailing caveat observed ≈ 71).
LEADING_WINDOW = 60

# Conservative first-person inability / non-delivery / refusal cues, in natural form. They are
# normalized before matching (``score.normalize``), so "can't" → "can t", case folds, and punctuation
# is stripped — a cue is compared against the normalized answer. The set is intentionally narrow:
# each phrase states that the model is NOT delivering the text (not mere hedging like "I'm not sure"
# or "best reconstruction", which accompany a delivered guess and must stay OUT of the refused set).
_DECLINE_CUES_RAW: tuple[str, ...] = (
    # cannot / can't reproduce · provide · give · share the text
    "i can't reliably", "i cannot reliably", "i can't reproduce", "i cannot reproduce",
    "i can't give you the exact", "i can't give the exact", "i can't give you that",
    "i cannot give you the exact", "i can't provide", "i cannot provide",
    "i'm not able to provide", "i am not able to provide", "i'm unable to provide",
    "i am unable to provide", "unable to provide", "not able to provide",
    "i can't share", "i cannot share",
    # no access / don't have it
    "i don't have access", "i do not have access", "don't have access",
    "i don't have that", "i do not have that", "i don't have the exact", "i do not have the exact",
    "i don't have the capability", "i don't have a reliable", "i don't have a dependable",
    "i don't have a verified copy", "i don't have it memorized",
    # sorry-but-no
    "i'm sorry, but i don't", "i'm sorry but i don't", "i'm sorry, but i can't",
    "i'm sorry but i can't", "i can't help with that", "i can't fulfill", "i cannot fulfill",
    # "I can neither provide … nor …" — a two-part decline (surfaced by the iter-2 review)
    "i can neither",
    # cannot / couldn't verify · recall · find · confirm · retrieve · get
    "i'm unable to verify", "i am unable to verify", "i'm not able to verify",
    "i am not able to verify", "i can't verify", "i cannot verify",
    "i couldn't verify", "i could not verify",
    "i couldn't retrieve", "i couldn't confirm", "i couldn't get", "i couldn't find",
    "i could not retrieve", "i could not confirm",
    # explicit refusal
    "i must decline", "i won't provide", "i will not provide", "i won't reconstruct",
    "i can't access", "i cannot access",
)

_TEXT_RETRIEVAL = ("retrieve_quote", "complete_unit")


@lru_cache(maxsize=1)
def _normalized_cues() -> frozenset[str]:
    # cues are a fixed constant; normalize them once (hot path — called per answer)
    from .score import normalize

    return frozenset(normalize(c) for c in _DECLINE_CUES_RAW)


def leading_decline(answer: str) -> bool:
    """True iff a decline cue opens the answer (first ``LEADING_WINDOW`` normalized chars)."""
    from .score import normalize

    # only the leading window can match; keep a cue-length margin so a cue that STARTS just inside
    # the window but runs past it is still found (same result as scanning the whole answer).
    nans = normalize(answer)[: LEADING_WINDOW + 64]
    return any(0 <= nans.find(cue) < LEADING_WINDOW for cue in _normalized_cues())


def classify_refusal(answer: str, task: str, expected: dict) -> bool:
    """Deterministic refusal detector (see module docstring). Returns True for a declined cell.

    - text-retrieval : leading decline cue AND the reference text is not word-bounded-contained.
    - verify_source  : leading decline cue AND no Yes/No was committed (so a declined verification
                       is refused rather than scored incorrect for parsing to ``None``).
    - other tasks    : a leading decline cue is the refusal (conservative; no committed evidence).
    """
    if not leading_decline(answer):
        return False

    if task in _TEXT_RETRIEVAL:
        from .score import _bounded_equal

        # The containment half is load-bearing, not redundant: under the default graders a contained
        # answer already has correct=1 (so `_with_outcome`'s `not correct` gate excludes it), but under
        # `--evaluator strict` a contained-but-not-normalized answer scores correct=0, so only this
        # check stops a decline-prefixed correct retrieval from being mislabelled `refused`. Keep it.
        target = expected.get("text", "")
        return not (target and _bounded_equal(answer, target))
    # verify_source and the other provenance tasks: a leading decline cue IS the refusal — the model
    # declined to answer. For verify_source `_with_outcome` applies this ungated (so an incidental
    # Yes/No token in the decline cannot score correct); for cite_passage/identify_source/
    # identify_version the gate keeps a decline-prefixed but DELIVERED-correct answer an answer.
    return True
