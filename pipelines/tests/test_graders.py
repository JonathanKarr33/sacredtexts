"""Named-grader registry + selection (Spec 15, phase 2)."""
from __future__ import annotations

import pytest

from sacredbench.graders import (
    DEFAULT_EVALUATORS,
    GRADERS,
    Grader,
    GraderError,
    resolve_evaluators,
    submetrics_for,
)
from sacredbench.score import score_answer


def test_default_set_is_the_deterministic_inline_graders():
    assert set(DEFAULT_EVALUATORS) == {"strict", "containment"}
    for name in DEFAULT_EVALUATORS:
        g = GRADERS[name]
        assert g.default and g.inline and g.verdict is not None


def test_resolution_comma_repeat_dedupe_and_order():
    assert [g.name for g in resolve_evaluators(["strict,containment"])] == ["strict", "containment"]
    assert [g.name for g in resolve_evaluators(["strict", "containment"])] == ["strict", "containment"]
    # dedupe, order-stable
    assert [g.name for g in resolve_evaluators(["containment", "strict", "containment"])] == [
        "containment", "strict",
    ]
    # None ⇒ default
    assert [g.name for g in resolve_evaluators(None)] == list(DEFAULT_EVALUATORS)


def test_unknown_and_empty_fail_fast():
    with pytest.raises(GraderError, match="unknown evaluator"):
        resolve_evaluators(["bogus"])
    with pytest.raises(GraderError, match="empty"):
        resolve_evaluators([""])


def test_submetrics_are_canonical_and_selection_scoped():
    both = resolve_evaluators(["strict", "containment"])
    assert submetrics_for(both) == ("exact", "normalized", "token_f1", "contains_reference")
    assert submetrics_for(resolve_evaluators(["strict"])) == ("exact", "normalized", "token_f1")
    assert submetrics_for(resolve_evaluators(["containment"])) == ("token_f1", "contains_reference")


def test_headline_is_or_over_selected_verdicts():
    exp = {"text": "the keeper planted twelve trees"}
    wrapped = "﴾the keeper planted twelve trees﴿ (note)"  # contained, not normalized-equal
    # default: OR ⇒ correct via containment
    assert score_answer("retrieve_quote", wrapped, exp)["correct"] == 1
    # strict only: normalized==0 ⇒ incorrect, and NO contains_reference key emitted
    strict = score_answer("retrieve_quote", wrapped, exp, resolve_evaluators(["strict"]))
    assert strict["correct"] == 0 and "contains_reference" not in strict
    assert set(strict) == {"exact", "normalized", "token_f1", "correct", "outcome"}
    # containment only: correct via containment, no exact/normalized
    cont = score_answer("retrieve_quote", wrapped, exp, resolve_evaluators(["containment"]))
    assert cont["correct"] == 1 and set(cont) == {"token_f1", "contains_reference", "correct", "outcome"}


def test_strict_only_emits_no_spurious_contains_reference_in_summary(tmp_path):
    # the latent bug this guards: a static _SUBMETRICS + pre-seeded accumulator would emit
    # contains_reference: 0.0 under --evaluator strict. The derived submetric set prevents it.
    import json
    from sacredbench.score import score_file
    rows = [{
        "question_id": "retrieve_quote-x", "model_id": "m", "task": "retrieve_quote",
        "answer": "something", "question_set_digest": "d",
        "question": {"expected": {"text": "the exact reference text"}},
    }]
    (tmp_path / "a.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    summary = score_file(tmp_path / "a.jsonl", tmp_path / "s.jsonl", evaluators=["strict"])
    cell = summary["models"]["m"]["retrieve_quote"]
    assert "contains_reference" not in cell
    assert set(cell) >= {"n", "accuracy", "exact", "normalized", "token_f1"}


def test_separate_pass_grader_is_expressible_but_not_inline():
    # A paid/separate-pass grader (the future Jev judge, #21): no inline callable, non-default.
    jev = Grader("jev", ("jev_verdict", "jev_prob"), verdict=None, default=False, inline=False)
    assert jev.verdict is None and not jev.inline and not jev.default
    # it cannot be run inline by `score`
    GRADERS["jev"] = jev
    try:
        with pytest.raises(GraderError, match="separate-pass"):
            resolve_evaluators(["jev"])
        # ...and never joins the default set
        assert "jev" not in DEFAULT_EVALUATORS
    finally:
        del GRADERS["jev"]
    # the merge path: a later pass updates a row's open metrics map with the grader's declared keys
    row_metrics = {"exact": 0, "normalized": 0, "token_f1": 0.5, "contains_reference": 0, "correct": 0}
    row_metrics.update({"jev_verdict": 1, "jev_prob": 0.87})
    assert row_metrics["jev_verdict"] == 1 and row_metrics["jev_prob"] == 0.87
