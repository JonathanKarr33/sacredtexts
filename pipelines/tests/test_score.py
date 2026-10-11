import json

import pytest

from sacredbench.score import (
    ScoreError,
    normalize,
    parse_yes_no,
    score_answer,
    score_file,
    summary_markdown,
    token_f1,
)


def _row(qid, digest, **over):
    r = {
        "question_id": qid, "model_id": "m1", "task": "retrieve_quote",
        "answer": "x", "question": {"expected": {"text": "x"}},
    }
    if digest is not None:
        r["question_set_digest"] = digest
    r.update(over)
    return r


def test_normalize_folds_unicode_and_punct():
    assert normalize("“Love one’s neighbour!”") == normalize('"Love one\'s neighbour"')
    assert normalize("A  B\n C") == "a b c"


def test_token_f1_bounds():
    assert token_f1("the keeper planted trees", "the keeper planted trees") == 1.0
    assert token_f1("entirely different words here", "the keeper planted trees") == 0.0
    assert 0.0 < token_f1("the keeper planted", "the keeper planted trees") < 1.0


@pytest.mark.parametrize("ans,expected", [("Yes.", "yes"), ("no,", "no"), ("NO!", "no"), ("maybe", None)])
def test_parse_yes_no(ans, expected):
    assert parse_yes_no(ans) == expected


def test_retrieve_quote_tiers():
    exp = {"text": "The keeper planted twelve trees."}
    exact = score_answer("retrieve_quote", "The keeper planted twelve trees.", exp)
    assert exact == {"exact": 1, "normalized": 1, "token_f1": 1.0, "correct": 1}
    punct = score_answer("retrieve_quote", "the keeper planted twelve trees", exp)
    assert (punct["exact"], punct["normalized"], punct["correct"]) == (0, 1, 1)
    wrong = score_answer("retrieve_quote", "something else entirely different", exp)
    assert wrong["correct"] == 0 and wrong["token_f1"] == 0.0


def test_verify_and_citation_tasks():
    assert score_answer("verify_source", "No, it is not.", {"answer": "no", "true_work": "X"})["correct"] == 1
    assert score_answer("cite_passage", "That is Jude 1:3.", {"citation": "Jude 1:3"})["correct"] == 1
    assert score_answer("cite_passage", "That is Jude 1:4.", {"citation": "Jude 1:3"})["correct"] == 0
    both = score_answer(
        "identify_source", "From the Book of Roads, Book of Roads 1:2.",
        {"work": "Book of Roads", "citation": "Book of Roads 1:2"},
    )
    assert both["correct"] == 1


def test_score_file_and_summary(tmp_path):
    answers = tmp_path / "answers.jsonl"
    rows = [
        {
            "question_id": "retrieve_quote-00000", "model_id": "m1", "task": "retrieve_quote",
            "answer": "alpha beta gamma", "question_set_digest": "deadbeef",
            "question": {"expected": {"text": "alpha beta gamma"}},
        },
        {
            "question_id": "verify_source-00001", "model_id": "m1", "task": "verify_source",
            "answer": "Yes", "question_set_digest": "deadbeef",
            "question": {"expected": {"answer": "no", "true_work": "W"}},
        },
    ]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    summary = score_file(answers, tmp_path / "scores.jsonl")
    m1 = summary["models"]["m1"]
    assert m1["retrieve_quote"]["accuracy"] == 1.0
    assert m1["verify_source"]["accuracy"] == 0.0
    assert m1["_overall"]["n"] == 2 and m1["_overall"]["accuracy"] == 0.5
    md = summary_markdown(summary)
    assert "m1" in md and "retrieve_quote" in md


def test_score_rejects_missing_digest(tmp_path):
    answers = tmp_path / "answers.jsonl"
    answers.write_text(json.dumps(_row("retrieve_quote-0", digest=None)) + "\n")
    with pytest.raises(ScoreError) as e:
        score_file(answers, tmp_path / "scores.jsonl")
    assert "digest" in str(e.value)


def test_score_rejects_mixed_digests(tmp_path):
    answers = tmp_path / "answers.jsonl"
    answers.write_text(
        json.dumps(_row("retrieve_quote-0", digest="aaaa")) + "\n"
        + json.dumps(_row("retrieve_quote-1", digest="bbbb")) + "\n"
    )
    with pytest.raises(ScoreError) as e:
        score_file(answers, tmp_path / "scores.jsonl")
    assert "mixes" in str(e.value)
