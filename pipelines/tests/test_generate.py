import pytest

from sacredbench.generate import (
    TASKS,
    GenerateError,
    build_manifest,
    corpus_hash,
    generate,
    load_questions,
    question_set_digest,
    write_questions,
)
from sacredbench.schema import Document, Entry
from sacredbench.score import normalize
from tests.conftest import make_doc

# 17 words so entries clear MIN_WORDS_IDENTIFIABLE (12) and MIN_WORDS_COMPLETABLE (16)
WORDS = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho"


def _doc(work, version, texts, tradition=("T",), citations=None):
    cites = citations or [f"{work} 1:{i}" for i in range(1, len(texts) + 1)]
    return Document(
        tradition=list(tradition), work=work, version=version, language="en",
        document_type="scripture",
        entries=[Entry("verse", c, t) for c, t in zip(cites, texts)],
    )


# --- determinism -------------------------------------------------------------


def test_deterministic_same_seed():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    a = generate(docs, per_task=5, seed=7)
    b = generate(docs, per_task=5, seed=7)
    assert [(q.id, q.prompt) for q in a] == [(q.id, q.prompt) for q in b]
    c = generate(docs, per_task=5, seed=8)
    assert [q.id for q in a] != [q.id for q in c]  # different seed -> different selection


def test_ids_are_content_derived_and_stable():
    docs = [make_doc("Book of Orchards")]
    qs = generate(docs, per_task=5, seed=1)
    for q in qs:
        assert q.id.startswith(q.task + "-")
    # order is deterministic (sorted by task, then content-derived id)
    assert qs == sorted(qs, key=lambda q: (q.task, q.id))


def test_questions_roundtrip(tmp_path):
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    qs = generate(docs, per_task=3)
    path = tmp_path / "questions.jsonl"
    write_questions(qs, path)
    assert load_questions(path) == qs


# --- version gating ----------------------------------------------------------


def test_identify_version_skipped_for_single_version_corpus():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]  # each one version
    qs = generate(docs, per_task=4)
    assert all(q.task != "identify_version" for q in qs)
    assert {q.task for q in qs} == set(TASKS) - {"identify_version"}


def test_identify_version_present_for_multi_version_work():
    kjv = _doc("The Bible", "KJV", [f"{WORDS} kjv {i}" for i in range(20)])
    asv = _doc("The Bible", "ASV", [f"{WORDS} asv {i}" for i in range(20)])
    qs = generate([kjv, asv], per_task=4)
    iv = [q for q in qs if q.task == "identify_version"]
    assert iv  # version-gate active
    assert {q.task for q in qs} == set(TASKS)


def test_identify_version_excludes_text_shared_across_versions():
    # one verse identical across versions (ambiguous) must never be an identify_version item
    shared = f"{WORDS} shared verse text"
    kjv = _doc("The Bible", "KJV", [shared] + [f"{WORDS} kjv {i}" for i in range(20)])
    asv = _doc("The Bible", "ASV", [shared] + [f"{WORDS} asv {i}" for i in range(20)])
    qs = generate([kjv, asv], per_task=8, seed=3)
    for q in (q for q in qs if q.task == "identify_version"):
        assert normalize(q.expected.get("version", "")) != ""
        assert normalize(shared) not in normalize(q.prompt)


# --- verify_source negatives -------------------------------------------------


def test_single_work_has_no_negatives():
    qs = [q for q in generate([make_doc()], per_task=6) if q.task == "verify_source"]
    assert all(q.expected["answer"] == "yes" for q in qs)


def test_verify_source_negatives_exclude_overlapping_text():
    # work B contains ALL of work A's texts -> a negative for A's text must never be
    # attributed to B (B genuinely contains it)
    a_texts = [f"{WORDS} shared {i}" for i in range(20)]
    a = _doc("Work A", "V", a_texts, tradition=("TA",))
    b = _doc("Work B", "V", a_texts, tradition=("TB",))  # identical texts
    c = _doc("Work C", "V", [f"{WORDS} cee {i}" for i in range(20)], tradition=("TC",))
    qs = generate([a, b, c], per_task=12, seed=5)
    work_texts = {"Work A": set(), "Work B": set(), "Work C": set()}
    for d in (a, b, c):
        for e in d.entries:
            work_texts[d.work].add(normalize(e.text))
    for q in qs:
        if q.task == "verify_source" and q.expected["answer"] == "no":
            true_work = q.expected["true_work"]
            neg_work = q.prompt.split(" from ", 1)[1].split("?")[0].strip()
            text = normalize(q.prompt.split('"')[1])
            assert text not in work_texts[neg_work]  # negative text absent from attributed work


# --- balancing + insufficient pool -------------------------------------------


def test_tradition_balanced_selection():
    # three traditions of very different sizes; a balanced sample draws from each
    big = _doc("Big", "V", [f"{WORDS} big {i}" for i in range(50)], tradition=("BigTrad",))
    mid = _doc("Mid", "V", [f"{WORDS} mid {i}" for i in range(50)], tradition=("MidTrad",))
    small = _doc("Small", "V", [f"{WORDS} small {i}" for i in range(50)], tradition=("SmallTrad",))
    qs = generate([big, mid, small], per_task=9, seed=2)
    rq = [q for q in qs if q.task == "retrieve_quote"]
    traditions = [q.source["tradition"][0] for q in rq]
    assert set(traditions) == {"BigTrad", "MidTrad", "SmallTrad"}  # every tradition represented
    # round-robin keeps them within 1 of each other
    counts = [traditions.count(t) for t in {"BigTrad", "MidTrad", "SmallTrad"}]
    assert max(counts) - min(counts) <= 1


def test_insufficient_pool_fails_fast():
    with pytest.raises(GenerateError) as e:
        generate([make_doc(n=3)], per_task=50)
    assert "insufficient" in str(e.value) or "<" in str(e.value)


def test_noncanonical_citations_excluded():
    # unnumbered / (dup N) units are not sampled
    good = [Entry("paragraph", f"Enc, para. {i}", f"{WORDS} body {i}") for i in range(1, 11)]
    bad = [
        Entry("paragraph", "Enc, unnumbered para. 1", f"{WORDS} frontmatter"),
        Entry("paragraph", "Enc, para. 5 (dup 2)", f"{WORDS} footnote"),
    ]
    doc = Document(tradition=["T"], work="Enc", version="V", language="en",
                   document_type="encyclical", entries=good + bad)
    qs = generate([doc], per_task=5, seed=1)
    cited = {q.source["citation"] for q in qs}
    assert not any("unnumbered" in c or "(dup" in c for c in cited)


# --- manifest + digest -------------------------------------------------------


def test_question_set_digest_and_corpus_hash():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    qs = generate(docs, per_task=4, seed=1)
    assert question_set_digest(qs) == question_set_digest(list(reversed(qs)))  # order-independent
    qs2 = generate(docs, per_task=4, seed=2)
    assert question_set_digest(qs) != question_set_digest(qs2)  # different set -> different digest
    # corpus edit changes the corpus hash
    edited = [make_doc("Book of Orchards"), make_doc("Book of Roads", n=29)]
    assert corpus_hash(docs) != corpus_hash(edited)


def test_build_manifest_fields():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    qs = generate(docs, per_task=4, seed=1)
    m = build_manifest(docs, qs, seed=1, per_task=4, negatives_share=0.5, quotas=None)
    assert m["seed"] == 1 and m["per_task"] == 4 and m["n_questions"] == len(qs)
    assert m["question_set_digest"] == question_set_digest(qs)
    assert m["corpus_hash"] == corpus_hash(docs)
