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
    # Shared verses dominate the pool; only 2 verses are version-unique. With the
    # ambiguity exclusion the identify_version pool is exactly those 2, so the
    # emitted set is deterministic and must be exactly them (if the exclusion were
    # removed the pool would be ~26 and the emitted set would differ).
    shared = [f"{WORDS} shared verse {i}" for i in range(12)]
    uniq_a, uniq_b = f"{WORDS} only in kjv", f"{WORDS} only in asv"
    kjv = _doc("The Bible", "KJV", shared + [uniq_a])
    asv = _doc("The Bible", "ASV", shared + [uniq_b])
    qs = generate([kjv, asv], per_task=2, seed=3)
    iv_texts = {q.prompt.split('"')[1] for q in qs if q.task == "identify_version"}
    assert iv_texts == {uniq_a, uniq_b}  # exactly the version-unique verses, no shared


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
    negatives = [q for q in qs if q.task == "verify_source" and q.expected["answer"] == "no"]
    assert negatives  # the test must not go vacuous
    for q in negatives:
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
    assert "verify_source_negatives" in m and "tasks_by_count" in m


def test_digest_reflects_full_content_not_just_ids():
    # changing a field that the id does NOT encode (unit_type) must change the digest
    base = [Entry("verse", f"W 1:{i}", f"{WORDS} t{i}") for i in range(10)]
    changed = [Entry("line", f"W 1:{i}", f"{WORDS} t{i}") for i in range(10)]  # unit_type differs
    d1 = Document(tradition=["T"], work="W", version="V", language="en", document_type="scripture", entries=base)
    d2 = Document(tradition=["T"], work="W", version="V", language="en", document_type="scripture", entries=changed)
    q1 = generate([d1], per_task=5, seed=1)
    q2 = generate([d2], per_task=5, seed=1)
    assert question_set_digest(q1) != question_set_digest(q2)  # prompt unit_type differs
    assert corpus_hash([d1]) != corpus_hash([d2])  # unit_type is in the corpus hash


# --- quotas / task filter ----------------------------------------------------


def test_tasks_filter_restricts_output():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    qs = generate(docs, per_task=4, tasks=("retrieve_quote",))
    assert {q.task for q in qs} == {"retrieve_quote"}
    assert len(qs) == 4


def test_quotas_override_per_task():
    docs = [make_doc("Book of Orchards"), make_doc("Book of Roads")]
    qs = generate(docs, per_task=4, quotas={"retrieve_quote": 7, "verify_source": 0})
    counts = {t: sum(1 for q in qs if q.task == t) for t in {q.task for q in qs}}
    assert counts["retrieve_quote"] == 7
    assert "verify_source" not in counts  # quota 0 -> skipped
    assert counts["cite_passage"] == 4  # others fall back to per_task


def test_unknown_task_fails():
    with pytest.raises(GenerateError):
        generate([make_doc()], per_task=2, tasks=("nope",))


# --- negative-ratio fail-fast ------------------------------------------------


def test_insufficient_negative_pool_fails_fast():
    # a single work -> no wrong work exists, so a requested negative share can't be met
    a = _doc("Solo", "V", [f"{WORDS} a{i}" for i in range(30)])
    b = _doc("Solo", "V2", [f"{WORDS} a{i}" for i in range(30)])  # same work, different version
    # len(works)==1 so negatives are off entirely -> no failure, all positive
    qs = [q for q in generate([a, b], per_task=6, tasks=("verify_source",)) if q.task == "verify_source"]
    assert all(q.expected["answer"] == "yes" for q in qs)

    # two works but B contains ALL of A and vice-versa -> no eligible negatives
    x = _doc("X", "V", [f"{WORDS} same {i}" for i in range(30)], tradition=("TX",))
    y = _doc("Y", "V", [f"{WORDS} same {i}" for i in range(30)], tradition=("TY",))
    with pytest.raises(GenerateError) as e:
        generate([x, y], per_task=10, negatives_share=0.5, tasks=("verify_source",), seed=1)
    assert "negative" in str(e.value)


# --- balancing with list-valued traditions -----------------------------------


def test_balancing_on_primary_tradition_is_deterministic():
    # documents with multi-element tradition lists: balancing buckets on the primary
    a = Document(tradition=["Alpha", "Shared"], work="A", version="V", language="en",
                 document_type="scripture",
                 entries=[Entry("verse", f"A 1:{i}", f"{WORDS} a{i}") for i in range(30)])
    b = Document(tradition=["Beta", "Shared"], work="B", version="V", language="en",
                 document_type="scripture",
                 entries=[Entry("verse", f"B 1:{i}", f"{WORDS} b{i}") for i in range(30)])
    q1 = generate([a, b], per_task=8, tasks=("retrieve_quote",), seed=4)
    q2 = generate([b, a], per_task=8, tasks=("retrieve_quote",), seed=4)
    assert [q.id for q in q1] == [q.id for q in q2]  # input order independent
    prim = [q.source["tradition"][0] for q in q1]
    assert set(prim) == {"Alpha", "Beta"} and abs(prim.count("Alpha") - prim.count("Beta")) <= 1


# --- duplicate-id guard ------------------------------------------------------


def test_duplicate_ids_from_colliding_shards_deduped():
    # two shards sharing (work, version, language, citation, text) under different
    # traditions would yield identical ids; generate must emit each id once
    shard1 = Document(tradition=["T1"], work="W", version="V", language="en",
                      document_type="scripture",
                      entries=[Entry("verse", f"W 1:{i}", f"{WORDS} t{i}") for i in range(15)])
    shard2 = Document(tradition=["T2"], work="W", version="V", language="en",
                      document_type="scripture",
                      entries=[Entry("verse", f"W 1:{i}", f"{WORDS} t{i}") for i in range(15)])
    qs = generate([shard1, shard2], per_task=5, seed=1)
    ids = [q.id for q in qs]
    assert len(ids) == len(set(ids))  # no duplicate ids
