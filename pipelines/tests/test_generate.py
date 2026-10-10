import pytest

from sacredbench.generate import TASKS, GenerateError, generate, load_questions, write_questions
from tests.conftest import make_doc


def test_deterministic(two_work_docs):
    a = generate(two_work_docs, per_task=5, seed=7)
    b = generate(two_work_docs, per_task=5, seed=7)
    assert [(q.id, q.prompt) for q in a] == [(q.id, q.prompt) for q in b]
    c = generate(two_work_docs, per_task=5, seed=8)
    assert [q.prompt for q in a] != [q.prompt for q in c]


def test_all_tasks_covered_and_expected_present(two_work_docs):
    qs = generate(two_work_docs, per_task=4)
    assert {q.task for q in qs} == set(TASKS)
    for q in qs:
        assert q.prompt and q.expected and q.source["citation"]


def test_verify_source_negatives(two_work_docs):
    qs = [q for q in generate(two_work_docs, per_task=10) if q.task == "verify_source"]
    negatives = [q for q in qs if q.expected["answer"] == "no"]
    positives = [q for q in qs if q.expected["answer"] == "yes"]
    assert negatives and positives
    for q in negatives:
        # the wrong work is named in the prompt; the true work is retained for audit
        assert q.expected["true_work"] not in q.prompt.split('"')[0]


def test_single_work_has_no_negatives():
    qs = [q for q in generate([make_doc()], per_task=6) if q.task == "verify_source"]
    assert all(q.expected["answer"] == "yes" for q in qs)


def test_pool_too_small_fails():
    with pytest.raises(GenerateError):
        generate([make_doc(n=3)], per_task=50)


def test_questions_roundtrip(tmp_path, two_work_docs):
    qs = generate(two_work_docs, per_task=3)
    path = tmp_path / "questions.jsonl"
    write_questions(qs, path)
    assert load_questions(path) == qs
