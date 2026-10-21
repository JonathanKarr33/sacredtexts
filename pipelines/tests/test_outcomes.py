"""Unit tests for the refusal matcher (Spec 15 phase 3, sacredbench.outcomes).

The pre-registered refused SET over the committed runs is pinned in
test_contains_reference_rebaseline.py; these tests exercise the matcher's logic directly.
"""
from __future__ import annotations

import pytest

from sacredbench.outcomes import LEADING_WINDOW, classify_refusal, leading_decline

EXP = {"text": "The keeper planted twelve trees."}


@pytest.mark.parametrize(
    "answer",
    [
        "I can't reliably reproduce that verse from memory.",
        "I cannot provide the exact text.",
        "I'm sorry, but I don't have that paragraph.",
        "I don't have access to that text.",
        "I couldn't retrieve the exact line from the edition.",
        "I couldn't verify the exact text of that passage.",
        "I can't help with that.",
        "I must decline to reproduce it.",
        "I can neither provide a quote from the Talmud nor a translation of it.",
    ],
)
def test_leading_declines_are_refusals(answer):
    assert leading_decline(answer) is True
    assert classify_refusal(answer, "retrieve_quote", EXP) is True


def test_decline_prefixed_but_delivers_is_not_refused():
    # containment half: delivers the verse despite a decline prefix -> NOT refused (mirrors the real
    # opus-search Ketubot 8a:8 cell retrieve_quote-4ad4392645da, which leads "I couldn't confirm…")
    ans = "I couldn't confirm the exact wording, but it is: The keeper planted twelve trees."
    assert leading_decline(ans) is True
    assert classify_refusal(ans, "retrieve_quote", EXP) is False


def test_deliver_then_caveat_is_not_refused():
    # the cue TRAILS the delivered verse (past the leading window) -> an answer with a disclaimer,
    # not a refusal. Mirrors the real tutorial cell fb0ce4da6218 (verse, then "(couldn't retrieve)").
    wrong = {"text": "a completely unrelated reference phrase goes here"}
    ans = ("The keeper planted twelve trees and watered them each morning without fail. "
           "(Note: I couldn't retrieve the source to verify.)")
    assert leading_decline(ans) is False  # cue sits past LEADING_WINDOW (verse delivered first)
    assert classify_refusal(ans, "retrieve_quote", wrong) is False


def test_cue_inside_delivered_verse_is_not_a_refusal():
    # "cannot" / "I will not" occur INSIDE real scripture; a delivered verse is never a refusal
    assert leading_decline("The social question cannot be reduced to economics.") is False
    assert classify_refusal("I will not forget thy word, O Lord.", "retrieve_quote",
                            {"text": "something else entirely"}) is False


def test_hedge_without_decline_cue_is_not_refused():
    # pure hedging ("I'm not sure", "best guess") is an attempt, not a refusal — those cues are
    # deliberately absent from the decline set
    ans = "I'm not certain, but my best guess is: The keeper planted nine trees."
    assert leading_decline(ans) is False
    assert classify_refusal(ans, "retrieve_quote", EXP) is False


def test_verify_source_refusal_is_parsed_based_not_classify_refusal():
    # Spec 26: verify_source refusal is "no leading verdict committed" (parsed is None), decided in
    # score._with_outcome — NOT classify_refusal (which now governs only text-retrieval / cite_passage).
    from sacredbench.score import score_answer

    # leads with the verdict (trailing decline) -> graded, even with a real decline cue present
    assert score_answer("verify_source", "No, I cannot verify that this is from X.",
                        {"answer": "no"})["outcome"] == "correct"
    # leads with a decline, verdict buried after "but" -> no leading verdict -> refused
    assert score_answer("verify_source", "I can't verify that, but no.", {"answer": "no"})["outcome"] == "refused"
    # a clean leading verdict -> graded
    assert score_answer("verify_source", "Yes, that is correct.", {"answer": "yes"})["outcome"] == "correct"


def test_leading_window_boundary():
    # a cue just inside the window is a refusal; padded past it is not
    pad = "x" * (LEADING_WINDOW - 5)
    assert leading_decline(pad + " i cannot provide this") is True
    far = "y" * (LEADING_WINDOW + 10)
    assert leading_decline(far + " i cannot provide this") is False
