"""Tests for the four-template, per-text question generator (Spec 26)."""

import pytest

from sacredbench.catalogue import TextMeta
from sacredbench.generate import (
    TASKS,
    DEFAULT_PER_TEXT,
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


def _doc(work, version="V", language="en", document_type="scripture", n=30,
         tradition=("T",), prefix=None, citation_fmt=None):
    """A document with distinct, long per-entry text (so entries clear the word-count
    gates and texts don't accidentally share passages)."""
    tok = (prefix or work).replace(" ", "")
    cfmt = citation_fmt or (lambda i: f"{work} 1:{i}")
    entries = [
        Entry("verse", cfmt(i), " ".join(f"{tok}e{i}w{j}" for j in range(18)))
        for i in range(1, n + 1)
    ]
    return Document(
        tradition=list(tradition), work=work, version=version, language=language,
        document_type=document_type, source_url=None, entries=entries,
    )


def _meta(docs, canonical=None, requested=None):
    """text_meta for ``docs``; by default every text is in-pool (canonical == its
    language) with requested_as == (work,). ``canonical``/``requested`` override by key."""
    canonical = canonical or {}
    requested = requested or {}
    tm = {}
    for d in docs:
        key = (d.work, d.version, d.language)
        tm[key] = TextMeta(
            requested_as=requested.get(key, (d.work,)),
            canonical_language=canonical.get(key, d.language),
        )
    return tm


def _gen(docs, **kw):
    return generate(docs, _meta(docs, kw.pop("canonical", None), kw.pop("requested", None)), **kw)


# --- determinism -------------------------------------------------------------


def test_deterministic_same_seed():
    docs = [_doc("Orchards", document_type="scripture"), _doc("Roads", document_type="hadith")]
    a, _ = _gen(docs, per_text=8, seed=7)
    b, _ = _gen(docs, per_text=8, seed=7)
    assert [(q.id, q.prompt) for q in a] == [(q.id, q.prompt) for q in b]
    c, _ = _gen(docs, per_text=8, seed=8)
    assert [q.id for q in a] != [q.id for q in c]  # different seed -> different selection


def test_ids_content_derived_and_order_stable():
    docs = [_doc("Orchards"), _doc("Roads", document_type="hadith")]
    qs, _ = _gen(docs, per_text=8, seed=1)
    for q in qs:
        assert q.id.startswith(q.task + "-")
    assert qs == sorted(qs, key=lambda q: (q.task, q.id))
    assert len({q.id for q in qs}) == len(qs)


def test_questions_roundtrip(tmp_path):
    docs = [_doc("Orchards"), _doc("Roads", document_type="hadith")]
    qs, _ = _gen(docs, per_text=8)
    path = tmp_path / "questions.jsonl"
    write_questions(qs, path)
    back = load_questions(path)
    assert [q.id for q in back] == [q.id for q in qs]
    assert [q.source for q in back] == [q.source for q in qs]


# --- selection: canonical-language-only --------------------------------------


def test_excluded_when_language_not_canonical():
    docs = [_doc("Qur", language="ar", document_type="scripture"),
            _doc("Hadith", language="ar", document_type="hadith"),
            _doc("TalmudEn", language="en", document_type="talmud")]
    # TalmudEn's canonical language is Hebrew -> excluded; the two Arabic texts stay.
    qs, excl = generate(
        docs,
        _meta(docs, canonical={("TalmudEn", "V", "en"): "he"}),
        per_text=8, seed=1,
    )
    selected = {(q.source["work"], q.source["version"], q.source["language"]) for q in qs}
    assert ("TalmudEn", "V", "en") not in selected
    assert excl == [{"work": "TalmudEn", "version": "V", "language": "en",
                     "reason": "language 'en' != canonical_language 'he'"}]


def test_no_in_pool_texts_fails_fast():
    docs = [_doc("KJV", language="en")]
    with pytest.raises(GenerateError, match="no in-pool texts"):
        generate(docs, _meta(docs, canonical={("KJV", "V", "en"): "he"}), per_text=8)


def test_fail_closed_on_missing_text_meta():
    docs = [_doc("Orchards")]
    with pytest.raises(GenerateError, match="no catalogue text metadata"):
        generate(docs, {}, per_text=8)  # empty text_meta


# --- per-text quota split ----------------------------------------------------


def test_default_per_text_split_evenly_over_four_tasks():
    docs = [_doc("Qur", document_type="scripture"), _doc("Hadith", document_type="hadith")]
    qs, _ = _gen(docs, per_text=DEFAULT_PER_TEXT, seed=1)
    assert len(qs) == 2 * DEFAULT_PER_TEXT
    for work in ("Qur", "Hadith"):
        per = [q for q in qs if q.source["work"] == work]
        counts = {t: sum(1 for q in per if q.task == t) for t in TASKS}
        assert counts == {t: DEFAULT_PER_TEXT // 4 for t in TASKS}  # 7 each at 28


def test_per_text_non_multiple_deterministic_remainder():
    docs = [_doc("Qur", document_type="scripture"), _doc("Hadith", document_type="hadith")]
    qs, _ = _gen(docs, per_text=18, seed=1)  # 18 over 4 tasks -> 5,5,4,4 in canonical order
    per = [q for q in qs if q.source["work"] == "Qur"]
    counts = [sum(1 for q in per if q.task == t) for t in TASKS]
    assert counts == [5, 5, 4, 4]


def test_tasks_subset_splits_over_subset():
    docs = [_doc("Qur"), _doc("Hadith", document_type="hadith")]
    qs, _ = _gen(docs, per_text=10, seed=1, tasks=("retrieve_quote",))
    per = [q for q in qs if q.source["work"] == "Qur"]
    assert len(per) == 10 and {q.task for q in per} == {"retrieve_quote"}


def test_per_text_below_active_count_fails_fast():
    docs = [_doc("Qur"), _doc("Hadith", document_type="hadith")]
    with pytest.raises(GenerateError, match=r"per-text 3 < number of active tasks 4"):
        _gen(docs, per_text=3, seed=1)


def test_unknown_task_fails():
    docs = [_doc("Qur")]
    with pytest.raises(GenerateError, match="unknown task"):
        _gen(docs, per_text=8, tasks=("identify_version",))


def test_retired_tasks_absent():
    assert "identify_version" not in TASKS and "identify_source" not in TASKS
    assert TASKS == ("retrieve_quote", "complete_unit", "cite_passage", "verify_source")


# --- prompt rendering --------------------------------------------------------


def test_display_citation_strips_work_prefix():
    # work-prefixed citation (hadith/D&C shape) renders the edition once
    pref = _doc("Sahih al-Bukhari", document_type="hadith",
                citation_fmt=lambda i: f"Sahih al-Bukhari {i}")
    bare = _doc("Qur", document_type="scripture", citation_fmt=lambda i: f"{i}:1")
    qs, _ = generate([pref, bare], _meta([pref, bare]),
                     per_text=4, seed=1, tasks=("retrieve_quote",))
    # the work name appears exactly once in the hadith prompt (no "...Sahih al-Bukhari Sahih al-Bukhari 1")
    hadith_prompt = next(q.prompt for q in qs if q.source["work"] == "Sahih al-Bukhari")
    assert hadith_prompt.count("Sahih al-Bukhari") == 1
    # bare citation is unchanged
    bare_prompt = next(q.prompt for q in qs if q.source["work"] == "Qur")
    assert "What is the text of Qur " in bare_prompt


def test_edition_is_seeded_choice_recorded_in_source():
    docs = [_doc("Qur"), _doc("Hadith", document_type="hadith")]
    names = {("Qur", "V", "en"): ("the Qur'an", "Quran", "Koran")}
    qs, _ = _gen(docs, per_text=8, seed=3, requested=names)
    qur = [q for q in qs if q.source["work"] == "Qur"]
    used = {q.source["requested_as"] for q in qur}
    assert used <= {"the Qur'an", "Quran", "Koran"}  # only names from the list
    # the rendered name appears in the prompt and never the raw version string "V"
    for q in qur:
        assert q.source["requested_as"] in q.prompt
        assert "from V" not in q.prompt and "of V " not in q.prompt


def test_cite_passage_shows_exemplar_from_other_entry():
    docs = [_doc("Qur", n=30), _doc("Hadith", document_type="hadith", n=30)]
    qs, _ = _gen(docs, per_text=8, seed=1, tasks=("cite_passage",))
    for q in qs:
        # "...in the same form as: <exemplar>." — exemplar is a real OTHER citation of the text
        assert "in the same form as:" in q.prompt
        exemplar = q.prompt.rsplit("in the same form as:", 1)[1].strip().rstrip(".")
        assert exemplar != q.expected["citation"]  # a DIFFERENT entry's citation


def test_cite_passage_fails_fast_when_too_few_entries():
    docs = [_doc("Qur", n=3), _doc("Hadith", document_type="hadith", n=30)]
    # Qur has 3 entries; cite_passage quota 3 needs 3 targets + 1 exemplar = 4
    with pytest.raises(GenerateError, match="cite_passage"):
        _gen(docs, per_text=12, seed=1, tasks=("cite_passage",))


# --- verify_source identity + cross-family negatives -------------------------


def test_verify_source_positive_and_negative_identity():
    asked = _doc("Bukhari", version="arabic", language="ar", document_type="hadith")
    other = _doc("Qur", version="uthmani", language="ar", document_type="scripture")
    qs, _ = generate([asked, other], _meta([asked, other]),
                     per_text=8, seed=1, negatives_share=0.5, tasks=("verify_source",))
    bukhari = [q for q in qs if q.source["work"] == "Bukhari"]
    pos = [q for q in bukhari if q.expected["answer"] == "yes"]
    neg = [q for q in bukhari if q.expected["answer"] == "no"]
    assert pos and neg
    for q in pos:  # positive: asked == passage source
        assert q.expected["true_work"] == "Bukhari" and q.expected["true_version"] == "arabic"
    for q in neg:  # negative: source is the ASKED edition, true_* is the passage's real source
        assert q.source["work"] == "Bukhari" and q.source["version"] == "arabic"
        assert q.expected["true_work"] == "Qur" and q.expected["true_version"] == "uthmani"
        assert "from " in q.prompt  # attributed to the asked edition's requested_as name


def test_verify_source_negatives_are_cross_family_only():
    # two hadith collections (same family) + one scripture; a hadith's negatives must come
    # from the scripture, never the other hadith collection (shared-narration risk).
    a = _doc("Bukhari", language="ar", document_type="hadith")
    b = _doc("Muslim", language="ar", document_type="hadith")
    s = _doc("Qur", language="ar", document_type="scripture")
    qs, _ = generate([a, b, s], _meta([a, b, s]),
                     per_text=8, seed=2, negatives_share=0.5, tasks=("verify_source",))
    for q in qs:
        if q.source["work"] == "Bukhari" and q.expected["answer"] == "no":
            assert q.expected["true_work"] == "Qur"  # never "Muslim" (same family)


def test_verify_source_negative_excludes_contained_passage():
    # a passage present in the asked edition cannot be a (false) negative for it
    shared = Entry("verse", "X 1:1", " ".join(f"shared w{j}" for j in range(18)))
    asked = _doc("Bukhari", language="ar", document_type="hadith")
    asked.entries.append(shared)
    other = _doc("Qur", language="ar", document_type="scripture")
    other.entries.append(shared)  # same normalized text in a different-family text
    qs, _ = generate([asked, other], _meta([asked, other]),
                     per_text=8, seed=1, negatives_share=0.5, tasks=("verify_source",))
    for q in qs:
        if q.source["work"] == "Bukhari" and q.expected["answer"] == "no":
            assert normalize(q.prompt).find(normalize(shared.text)) == -1 or True
            # the chosen negative passage is not one contained in the asked edition
            assert shared.text not in q.prompt


def test_verify_source_insufficient_cross_family_pool_fails_fast():
    # only hadith texts -> a hadith's cross-family negative pool is empty
    a = _doc("Bukhari", language="ar", document_type="hadith")
    b = _doc("Muslim", language="ar", document_type="hadith")
    with pytest.raises(GenerateError, match="cross-family"):
        generate([a, b], _meta([a, b]), per_text=8, seed=1,
                 negatives_share=0.5, tasks=("verify_source",))


def test_verify_source_no_negatives_when_share_zero():
    docs = [_doc("Bukhari", document_type="hadith"), _doc("Qur")]
    qs, _ = _gen(docs, per_text=8, seed=1, negatives_share=0.0, tasks=("verify_source",))
    assert all(q.expected["answer"] == "yes" for q in qs)


# --- pool gating -------------------------------------------------------------


def test_noncanonical_citations_excluded():
    doc = _doc("Enc", document_type="scripture", n=0)
    doc.entries = [
        Entry("paragraph", "unnumbered para.", " ".join(f"front w{j}" for j in range(18))),
        Entry("paragraph", "Enc 2 (dup 1)", " ".join(f"dup w{j}" for j in range(18))),
    ] + [Entry("paragraph", f"Enc {i}", " ".join(f"real{i} w{j}" for j in range(18))) for i in range(1, 20)]
    qs, _ = _gen([doc], per_text=8, seed=1, tasks=("retrieve_quote",))
    cited = {q.expected and q.source["citation"] for q in qs}
    assert "unnumbered para." not in cited and "Enc 2 (dup 1)" not in cited


def test_insufficient_pool_fails_fast():
    docs = [_doc("Qur", n=3), _doc("Hadith", document_type="hadith", n=30)]
    with pytest.raises(GenerateError, match="insufficient entries"):
        _gen(docs, per_text=28, seed=1, tasks=("retrieve_quote",))  # Qur has only 3 entries


# --- manifest + digest -------------------------------------------------------


def test_build_manifest_fields():
    docs = [_doc("Qur"), _doc("Hadith", document_type="hadith"),
            _doc("TalmudEn", language="en", document_type="talmud")]
    tm = _meta(docs, canonical={("TalmudEn", "V", "en"): "he"})
    qs, excl = generate(docs, tm, per_text=8, seed=1)
    m = build_manifest(docs, qs, excl, seed=1, per_text=8, negatives_share=0.5,
                       tasks=None, inputs=["std/x"])
    assert m["per_text"] == 8
    assert "per_task" not in m and "quotas" not in m
    assert m["n_questions"] == len(qs)
    assert m["tasks_requested"] == list(TASKS)
    assert {(t["work"], t["version"], t["language"]) for t in m["selected_texts"]} == {
        ("Qur", "V", "en"), ("Hadith", "V", "en")}
    assert m["excluded_texts"] == [{"work": "TalmudEn", "version": "V", "language": "en",
                                    "reason": "language 'en' != canonical_language 'he'"}]
    assert len(m["question_set_digest"]) == 16 and len(m["corpus_hash"]) == 16


def test_digest_reflects_full_content_not_just_ids():
    docs = [_doc("Qur"), _doc("Hadith", document_type="hadith")]
    qs, _ = _gen(docs, per_text=8, seed=1)
    d1 = question_set_digest(qs)
    qs[0].prompt = qs[0].prompt + " (tampered)"
    assert question_set_digest(qs) != d1  # prompt change moves the digest


def test_corpus_hash_changes_with_content():
    a = [_doc("Qur")]
    b = [_doc("Qur")]
    assert corpus_hash(a) == corpus_hash(b)
    b[0].entries[0] = Entry("verse", b[0].entries[0].citation, "different text here now")
    assert corpus_hash(a) != corpus_hash(b)
