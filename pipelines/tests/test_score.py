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
    # no run config → usage is still emitted (evidence-derived) but no panel "proof"
    assert "usage" in summary and "panel" not in summary
    assert "Panel" not in md


def test_usage_totals_and_optional_cost(tmp_path):
    answers = tmp_path / "answers.jsonl"
    rows = [
        _row("retrieve_quote-0", "deadbeef", model_id="a", model="m-a",
             usage={"in": 1000, "out": 2000, "provider": "HostX"}),
        _row("retrieve_quote-1", "deadbeef", model_id="b", model="m-b",
             usage={"in": 500, "out": 500}),  # no serving-host field
    ]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    # prices only for model 'a' → only 'a' gets a cost; totals still sum tokens
    panel = {"a": {"provider": "openai", "model": "m-a", "endpoint": "h", "price_in": 1.0, "price_out": 2.0}}
    summary = score_file(answers, tmp_path / "scores.jsonl", panel=panel)
    u = summary["usage"]
    assert u["per_model"]["a"] == {"calls": 1, "in": 1000, "out": 2000, "cost_usd": 1000/1e6*1.0 + 2000/1e6*2.0}
    assert u["per_model"]["b"] == {"calls": 1, "in": 500, "out": 500}  # no cost without prices
    assert u["total"]["in"] == 1500 and u["total"]["out"] == 2500 and u["total"]["calls"] == 2
    assert u["total"]["cost_usd"] == summary["usage"]["per_model"]["a"]["cost_usd"]
    # panel: provider proof from config, serving host from the answers' usage
    assert summary["panel"]["a"]["provider"] == "openai"
    assert summary["panel"]["a"]["served_by"] == ["HostX"]
    assert "cost" in summary_markdown(summary).lower()


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


# --- single-candidate (anti-hedge) citation scoring --------------------------


def test_cite_passage_single_candidate():
    assert score_answer("cite_passage", "The citation is Jude 1:3.", {"citation": "Jude 1:3"})["correct"] == 1
    # same-number hedge
    assert score_answer("cite_passage", "It could be Jude 1:3, Jude 1:4, or Jude 1:5.",
                        {"citation": "Jude 1:3"})["correct"] == 0
    # CROSS-BOOK hedge (same verse numbers) must also fail — not numeric-only
    assert score_answer("cite_passage", "It could be John 1:1, Genesis 1:1, or Micah 1:1.",
                        {"citation": "John 1:1"})["correct"] == 0
    assert score_answer("cite_passage", "Either Jude 1:3 or John 1:3.",
                        {"citation": "Jude 1:3"})["correct"] == 0
    # near-miss must not pass via substring containment
    assert score_answer("cite_passage", "Jude 1:30", {"citation": "Jude 1:3"})["correct"] == 0


def test_cite_passage_incidental_numbers_not_false_hedge():
    # the extractor keys on the ground-truth SHAPE (colon), so an incidental version
    # year or "Chapter 1" is not a spurious second candidate for a correct answer
    assert score_answer("cite_passage", "The citation is Jude 1:3 (ASV 1901).", {"citation": "Jude 1:3"})["correct"] == 1
    assert score_answer("cite_passage", "The quote is from Jude 1:3. It appears in Chapter 1.", {"citation": "Jude 1:3"})["correct"] == 1


def test_cite_passage_lowercase_hedge_caught():
    # lowercase hedges must still be multi-candidate (case-insensitive extraction)
    assert score_answer("cite_passage", "it could be john 1:1 or genesis 1:1", {"citation": "John 1:1"})["correct"] == 0
    assert score_answer("cite_passage", "perhaps sahih al-bukhari 1, or sahih muslim 2", {"citation": "Sahih al-Bukhari 1"})["correct"] == 0


def test_cite_passage_paragraph_shape():
    # encyclical citations ("<Title>, para. N") — single correct vs hedge
    assert score_answer("cite_passage", "The citation is Rerum Novarum, para. 5.",
                        {"citation": "Rerum Novarum, para. 5"})["correct"] == 1
    assert score_answer("cite_passage", "maybe Rerum Novarum, para. 5 or Rerum Novarum, para. 6",
                        {"citation": "Rerum Novarum, para. 5"})["correct"] == 0
    assert score_answer("cite_passage", "Either Rerum Novarum para. 5 or Quadragesimo Anno para. 5",
                        {"citation": "Rerum Novarum, para. 5"})["correct"] == 0


def test_identify_source_single_candidate():
    ok = score_answer("identify_source", "From Jude, Jude 1:3.", {"work": "Jude", "citation": "Jude 1:3"})
    assert ok["correct"] == 1
    hedge = score_answer(
        "identify_source", "From Jude — maybe Jude 1:3 or Jude 1:4.",
        {"work": "Jude", "citation": "Jude 1:3"},
    )
    assert hedge["correct"] == 0 and hedge["work_found"] == 1  # work right, citation hedged


def test_hadith_citation_single_and_hedge():
    # hadith citations have no colon ("Sahih al-Bukhari 1") — still anti-hedged
    assert score_answer("cite_passage", "Sahih al-Bukhari 1", {"citation": "Sahih al-Bukhari 1"})["correct"] == 1
    hedge = score_answer("cite_passage", "Sahih al-Bukhari 1 or Sahih Muslim 2",
                         {"citation": "Sahih al-Bukhari 1"})
    assert hedge["correct"] == 0 and hedge["n_candidates"] == 2


def test_repeated_correct_citation_is_not_a_hedge():
    # a correct citation stated more than once is ONE candidate, not a hedge
    assert score_answer("cite_passage", "The citation is John 3:16 (John 3:16).", {"citation": "John 3:16"})["correct"] == 1
    assert score_answer("cite_passage", "This is Jude 1:3. Jude 1:3 warns believers.", {"citation": "Jude 1:3"})["correct"] == 1
    assert score_answer("cite_passage", "Rerum Novarum, para. 5. Yes, Rerum Novarum, para. 5.", {"citation": "Rerum Novarum, para. 5"})["correct"] == 1
    assert score_answer("cite_passage", "Sahih al-Bukhari 1. That is Sahih al-Bukhari 1.", {"citation": "Sahih al-Bukhari 1"})["correct"] == 1
    # but a repeat plus a DIFFERENT citation is still a hedge
    assert score_answer("cite_passage", "John 3:16. Or maybe John 3:17.", {"citation": "John 3:16"})["correct"] == 0


def test_identify_version_label_metrics():
    ok = score_answer("identify_version", "KJV", {"version": "KJV"})
    assert ok == {"exact": 1, "normalized": 1, "correct": 1}
    assert score_answer("identify_version", "kjv.", {"version": "KJV"})["normalized"] == 1  # normalized label
    # evasive / multi-label answers score 0
    assert score_answer("identify_version", "KJV, ASV, or WEB", {"version": "KJV"})["correct"] == 0
    assert score_answer("identify_version", "Not the KJV; it is the ASV.", {"version": "KJV"})["correct"] == 0


# --- raw-count overall + tradition aggregation -------------------------------


def _answer(qid, model, task, answer, expected, tradition, digest="d"):
    return {
        "question_id": qid, "model_id": model, "task": task, "answer": answer,
        "question_set_digest": digest,
        "question": {"expected": expected, "source": {"tradition": tradition}},
    }


def test_overall_is_raw_count(tmp_path):
    answers = tmp_path / "answers.jsonl"
    rows = [
        _answer("cite_passage-0", "m1", "cite_passage", "X 1:1", {"citation": "X 1:1"}, ["A"]),
        _answer("cite_passage-1", "m1", "cite_passage", "nope", {"citation": "X 1:2"}, ["A"]),
        _answer("cite_passage-2", "m1", "cite_passage", "nope", {"citation": "X 1:3"}, ["A"]),
        _answer("verify_source-0", "m1", "verify_source", "Yes", {"answer": "yes"}, ["A"]),
    ]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    summary = score_file(answers, tmp_path / "scores.jsonl")
    ov = summary["models"]["m1"]["_overall"]
    assert ov["n"] == 4 and ov["accuracy"] == round(2 / 4, 4)  # 1 cite + 1 verify correct, raw


def test_tradition_counts_once_per_listed_tradition(tmp_path):
    answers = tmp_path / "answers.jsonl"
    rows = [
        _answer("cite_passage-0", "m1", "cite_passage", "X 1:1", {"citation": "X 1:1"}, ["Shared", "Xtrad"]),
        _answer("cite_passage-1", "m1", "cite_passage", "Y 1:1", {"citation": "Y 1:1"}, ["Shared", "Ytrad"]),
    ]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    summary = score_file(answers, tmp_path / "scores.jsonl")
    assert summary["models"]["m1"]["_overall"]["n"] == 2  # overall counts each once
    by = summary["by_tradition"]["m1"]
    assert by["Shared"]["_overall"]["n"] == 2  # shared tradition sees both
    assert by["Xtrad"]["_overall"]["n"] == 1 and by["Ytrad"]["_overall"]["n"] == 1
    # per-tradition n sums above the overall count (the list-valued rule)
    assert by["Shared"]["_overall"]["n"] + by["Xtrad"]["_overall"]["n"] + by["Ytrad"]["_overall"]["n"] == 4 > 2
    md = summary_markdown(summary)
    assert "By tradition" in md and "Shared" in md


def test_missing_cell_rendered_as_dash(tmp_path):
    # m1 answered retrieve_quote only; m2 answered verify_source only -> each is
    # missing the other's task, shown as '—' (not dropped)
    answers = tmp_path / "answers.jsonl"
    rows = [
        _answer("retrieve_quote-0", "m1", "retrieve_quote", "x", {"text": "x"}, ["A"]),
        _answer("verify_source-0", "m2", "verify_source", "Yes", {"answer": "yes"}, ["A"]),
    ]
    answers.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    summary = score_file(answers, tmp_path / "scores.jsonl")
    assert "retrieve_quote" not in summary["models"]["m2"]  # m2 has no retrieve_quote
    md = summary_markdown(summary)
    assert "—" in md  # the missing cell is represented, not dropped


def test_missing_cells_with_roster(tmp_path):
    # the expected roster surfaces partially- and fully-missing/failed cells
    answers = tmp_path / "answers.jsonl"
    answers.write_text(json.dumps(_answer("retrieve_quote-0", "m1", "retrieve_quote", "x", {"text": "x"}, ["A"])) + "\n")
    expected = {("m1", "retrieve_quote"): 3, ("m1", "verify_source"): 2, ("m2", "retrieve_quote"): 3}
    summary = score_file(answers, tmp_path / "scores.jsonl", expected)
    m1 = summary["models"]["m1"]
    assert m1["retrieve_quote"]["n"] == 1 and m1["retrieve_quote"]["missing"] == 2
    assert m1["verify_source"]["n"] == 0 and m1["verify_source"]["missing"] == 2  # fully-missing task
    assert "m2" in summary["models"]  # a model whose every cell failed still appears
    assert summary["models"]["m2"]["retrieve_quote"]["missing"] == 3
    assert summary["models"]["m2"]["_overall"]["missing"] == 3
    assert "miss" in summary_markdown(summary)


def test_missing_tradition_cell_represented(tmp_path):
    # a tradition-aware roster surfaces a model x tradition x task cell that failed
    # entirely (dropped from by_tradition without the roster)
    answers = tmp_path / "answers.jsonl"
    answers.write_text(json.dumps(_answer("rq-0", "m1", "retrieve_quote", "x", {"text": "x"}, ["A"])) + "\n")
    expected = {("m1", "retrieve_quote"): 2}
    expected_trad = {("m1", "A", "retrieve_quote"): 2, ("m1", "B", "retrieve_quote"): 2}
    summary = score_file(answers, tmp_path / "scores.jsonl", expected, expected_trad)
    by = summary["by_tradition"]["m1"]
    assert by["A"]["retrieve_quote"]["missing"] == 1  # 1 of 2 answered
    assert "B" in by and by["B"]["retrieve_quote"]["n"] == 0  # tradition B fully failed, still shown
    assert by["B"]["retrieve_quote"]["missing"] == 2
