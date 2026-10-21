"""Question generation from the four working-group templates (2026-10-20).

Deterministic (seeded) sampling over the standard-format documents — no LLM in
the loop, so the question set is reproducible and auditable against the sources.

The question set is **original-language-only**: a text (one ``(work, version,
language)`` group) is in the pool only when ``language == canonical_language``
(the catalogue's ``canonical_language`` fact, recovered per document by path —
see ``catalogue.metadata_for_standardized_path``). There is no
``--include-translations``; a text that fails the rule is excluded and recorded
in the manifest with its reason.

Each in-pool text gets ``per_text`` questions (default 28), split as evenly as
possible over the active templates (``per_text // n`` each, the remainder going
to the first tasks in canonical order). Four templates (task -> what a correct
answer contains):

- ``retrieve_quote``  "What is the text of <edition> <citation>?"       -> the exact text
- ``complete_unit``   "Please complete this quote from <edition>: …"    -> the remainder
- ``cite_passage``    "Where in <edition> can I find this quote? …"     -> the citation
- ``verify_source``   "Is this text from <edition>? …"                  -> yes / no

Contract details that keep the benchmark honest:

- ``<edition>`` is a **seeded uniform choice** from the text's ``requested_as``
  names (recorded in ``question.source.requested_as``) — prompts read the way a
  person asks, never the raw ``version`` string.
- ``retrieve_quote`` renders a **display citation**: a leading ``work`` prefix is
  stripped from the stored citation so the edition name appears once (hadith and
  D&C citations are work-prefixed).
- ``cite_passage`` shows the **citation form by example** — an exemplar citation
  from a *different* seeded entry of the same text — so the model answers in the
  shape the scorer extracts. Needs >=2 entries per text (fail-fast otherwise).
- **False-premise** ``verify_source``: the question belongs to the **asked**
  edition (``source`` records it — with an empty ``citation``, since the prompt
  shows a passage, not a citation — and uses its ``requested_as`` name). A positive
  presents a passage from the asked edition; a negative presents a real passage
  from a *different in-pool text*, attributed to the asked edition
  (``expected.answer == "no"``; ``expected.true_work``/``true_version``/
  ``true_language``/``true_citation`` name the passage's real source). Negatives are
  drawn from a **different family** — the nine hadith collections are one family
  (``document_type == hadith_collection``), otherwise a text's family is its
  ``work`` (so the KJV/ASV/WEB Bible editions never serve as each other's negatives,
  but a different work such as Book of Mormon may). Candidates exclude any passage
  whose text also occurs in the asked edition (containment over all entries), and a
  **same-language** partner is preferred; a text with no same-language different-family
  partner (e.g. Talmud Aramaic) falls back to cross-language, recorded per text in the
  manifest.
- Only **canonically cited** units are sampled — front-matter ``unnumbered para.``
  and ``(dup N)`` units (see the encyclicals converter) are not benchmark items.
- **Stable content-derived IDs**, a **deterministic order**, with fail-fast on an
  insufficient pool.
- ``generate`` also produces a **manifest** (seed, params, corpus hash, the
  selected texts and the excluded ones with reasons) and a **question-set digest**
  that ``collect`` binds into its answers and ``score`` validates.
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from sacredbench.catalogue import TextMeta
from sacredbench.schema import Document, Entry
from sacredbench.score import normalize

TASKS = ("retrieve_quote", "complete_unit", "cite_passage", "verify_source")

#: Default questions per text (7 per template over the four tasks).
DEFAULT_PER_TEXT = 28

# Entries shorter than this are too generic to identify. Word count, not characters.
MIN_WORDS_IDENTIFIABLE = 12
MIN_WORDS_COMPLETABLE = 16


class GenerateError(Exception):
    pass


@dataclass
class Question:
    id: str
    task: str
    prompt: str
    expected: dict  # task-specific ground truth (see score.py)
    source: dict  # {tradition, work, version, language, document_type, citation, requested_as}


def _is_canonical_citation(citation: str) -> bool:
    """Front-matter ('unnumbered para.') and disambiguated ('(dup N)') units are
    not citable benchmark items — see the encyclicals converter."""
    return "unnumbered para." not in citation and "(dup " not in citation


def _text_key(doc: Document) -> tuple[str, str, str]:
    return (doc.work, doc.version, doc.language)


def _display_citation(citation: str, work: str) -> str:
    """Strip a leading ``work`` prefix from a stored citation so the rendered prompt
    names the edition once (hadith citations are ``"Sahih al-Bukhari 1"``, D&C
    ``"Doctrine and Covenants 1:1"``). Bare citations (``"7:70"``) are unchanged."""
    prefix = work + " "
    return citation[len(prefix):] if citation.startswith(prefix) else citation


def _source_dict(doc: Document, citation: str, requested_as: str) -> dict:
    return {
        "tradition": doc.tradition,
        "work": doc.work,
        "version": doc.version,
        "language": doc.language,
        "document_type": doc.document_type,
        "citation": citation,
        "requested_as": requested_as,  # the seeded name rendered as <edition>
    }


def _qid(task: str, asked: tuple[str, str, str], passage_doc: Document, entry: Entry) -> str:
    """Content-derived id: task + asked edition + the passage's true source + text.

    Including the asked edition (which differs from the passage's source only for a
    verify_source negative) keeps positives and negatives on the same passage distinct."""
    key = "\0".join(
        [task, *asked, passage_doc.work, passage_doc.version, passage_doc.language,
         entry.citation, entry.text]
    )
    return f"{task}-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]}"


def _split_quota(per_text: int, n_tasks: int) -> list[int]:
    """Split ``per_text`` over ``n_tasks`` as evenly as possible: ``per_text // n``
    each, with the remainder going one-each to the first ``per_text % n`` tasks."""
    base, rem = divmod(per_text, n_tasks)
    return [base + (1 if i < rem else 0) for i in range(n_tasks)]


def _choose_name(meta: TextMeta, rng: random.Random) -> str:
    """Seeded uniform choice of a ``requested_as`` name rendered as ``<edition>``."""
    return rng.choice(meta.requested_as)


def _family(doc: Document) -> str:
    """Negative-sampling family: the nine hadith collections are ONE family (so a hadith is
    never a false negative for another, given their shared variant-wording narrations);
    every other text's family is its ``work`` (so the KJV/ASV/WEB Bible editions never serve
    as each other's negatives, but a different work — Book of Mormon — may)."""
    return "hadith_collection" if doc.document_type == "hadith_collection" else doc.work


@dataclass
class _Text:
    """One in-pool text: a (work, version, language) group with its metadata, its
    content-sorted canonical entry pool (deduplicated across colliding shards) and
    precomputed normalisations."""

    key: tuple[str, str, str]
    rep_doc: Document  # a representative document for work/version/language/tradition/document_type
    meta: TextMeta
    entries: list[Entry]  # canonical, >= MIN_WORDS_IDENTIFIABLE, content-sorted, deduped
    entry_norms: list[str]  # normalize(e.text) parallel to ``entries`` (precomputed once)
    all_norm: frozenset[str]  # normalize over ALL raw entries — the containment set for negatives

    @property
    def family(self) -> str:
        return _family(self.rep_doc)

    @property
    def language(self) -> str:
        return self.key[2]


def _build_texts(docs: list[Document], text_meta: dict[tuple[str, str, str], TextMeta]) -> tuple[list[_Text], list[dict]]:
    """Group documents into texts, attach metadata (fail-closed), and split into the
    in-pool texts (``language == canonical_language``) and the excluded ones. Excluded
    entries are aggregated to the catalogue **target** (``meta.target_key``), so a
    converter that re-stamps work/version per document (encyclicals) yields one excluded
    entry, not hundreds."""
    groups: dict[tuple[str, str, str], list[Document]] = {}
    for d in docs:
        groups.setdefault(_text_key(d), []).append(d)

    texts: list[_Text] = []
    excluded_by_target: dict[tuple[str, str, str], dict] = {}
    for key in sorted(groups):
        work, version, language = key
        meta = text_meta.get(key)
        if meta is None:
            raise GenerateError(
                f"no catalogue text metadata for (work, version, language)={key!r} "
                "(fail-closed) — a standardized document maps to no catalogue target"
            )
        if language != meta.canonical_language:
            tw, tv, tl = meta.target_key
            excluded_by_target.setdefault(meta.target_key, {
                "work": tw, "version": tv, "language": tl,
                "reason": f"language {language!r} != canonical_language {meta.canonical_language!r}",
            })
            continue
        group = groups[key]
        rep = min(group, key=lambda d: (tuple(d.tradition), d.document_type))
        # the containment set is over ALL raw entries (not just the canonical/long pool),
        # so a passage present in this edition under any citation is never a false negative.
        all_norm = {normalize(e.text) for d in group for e in d.entries}
        # canonical, identifiable entries, deduplicated by content across shards
        seen: set[tuple[str, str]] = set()
        entries: list[Entry] = []
        for d in group:
            for e in d.entries:
                if not _is_canonical_citation(e.citation) or len(e.text.split()) < MIN_WORDS_IDENTIFIABLE:
                    continue
                ckey = (e.citation, e.text)
                if ckey in seen:
                    continue
                seen.add(ckey)
                entries.append(e)
        entries.sort(key=lambda e: (e.citation, e.text))
        texts.append(_Text(
            key=key, rep_doc=rep, meta=meta, entries=entries,
            entry_norms=[normalize(e.text) for e in entries], all_norm=frozenset(all_norm),
        ))
    excluded = [excluded_by_target[k] for k in sorted(excluded_by_target)]
    return texts, excluded


def _sample(pool: list[Entry], quota: int, rng: random.Random, what: str) -> list[Entry]:
    """Deterministically sample ``quota`` distinct entries (content-sorted then
    shuffled, so selection depends only on content + seed). Fail-fast if too small."""
    if len(pool) < quota:
        raise GenerateError(f"{what}: pool of {len(pool)} < quota {quota} (insufficient entries)")
    ordered = sorted(pool, key=lambda e: (e.citation, e.text))
    rng.shuffle(ordered)
    return ordered[:quota]


def generate(
    docs: list[Document],
    text_meta: dict[tuple[str, str, str], TextMeta],
    per_text: int = DEFAULT_PER_TEXT,
    seed: int = 20261010,
    negatives_share: float = 0.5,
    tasks: tuple[str, ...] | None = None,
) -> tuple[list[Question], list[dict]]:
    """Sample ``per_text`` questions for each in-pool text over the active tasks.

    Returns ``(questions, excluded)`` where ``excluded`` lists the texts dropped by
    the ``language == canonical_language`` rule (with their reason). Deterministic for
    a given ``(docs, text_meta, seed)``."""
    active = tuple(t for t in TASKS if tasks is None or t in tasks)
    if tasks is not None:
        unknown = set(tasks) - set(TASKS)
        if unknown:
            raise GenerateError(f"unknown task(s) {sorted(unknown)} (known: {list(TASKS)})")
    if not active:
        raise GenerateError("no active tasks selected")
    if per_text < len(active):
        raise GenerateError(
            f"--per-text {per_text} < number of active tasks {len(active)}; each task needs >= 1"
        )
    if not docs:
        raise GenerateError("no documents to generate from")

    rng = random.Random(seed)
    texts, excluded = _build_texts(docs, text_meta)
    if not texts:
        raise GenerateError("no in-pool texts (language == canonical_language) to generate from")

    task_quota = dict(zip(active, _split_quota(per_text, len(active))))

    questions: list[Question] = []
    for t in sorted(texts, key=lambda t: t.key):
        for task in active:
            quota = task_quota[task]
            if quota <= 0:
                continue
            if task == "retrieve_quote":
                for e in _sample(t.entries, quota, rng, f"{t.key} retrieve_quote"):
                    name = _choose_name(t.meta, rng)
                    dc = _display_citation(e.citation, t.rep_doc.work)
                    prompt = (
                        f"What is the text of {name} {dc}? "
                        f"Reply with the exact text of that {e.unit_type} and nothing else."
                    )
                    questions.append(Question(
                        id=_qid(task, t.key, t.rep_doc, e), task=task, prompt=prompt,
                        expected={"text": e.text},
                        source=_source_dict(t.rep_doc, e.citation, name),
                    ))
            elif task == "complete_unit":
                pool = [e for e in t.entries if len(e.text.split()) >= MIN_WORDS_COMPLETABLE]
                for e in _sample(pool, quota, rng, f"{t.key} complete_unit"):
                    name = _choose_name(t.meta, rng)
                    words = e.text.split()
                    head = " ".join(words[: len(words) // 2])
                    rest = " ".join(words[len(words) // 2 :])
                    prompt = (
                        f'Please complete this quote from {name}: "{head}" '
                        "Reply with only the remaining words."
                    )
                    questions.append(Question(
                        id=_qid(task, t.key, t.rep_doc, e), task=task, prompt=prompt,
                        expected={"text": rest, "full_text": e.text},
                        source=_source_dict(t.rep_doc, e.citation, name),
                    ))
            elif task == "cite_passage":
                # needs >= quota entries to sample targets, and >= 2 so each target has a
                # DIFFERENT entry to use as the format exemplar (the exemplar may itself be
                # another target entry — just not this one).
                if len(t.entries) < max(quota, 2):
                    raise GenerateError(
                        f"{t.key} cite_passage: needs >= max(quota {quota}, 2) entries for "
                        f"targets + a distinct exemplar but has {len(t.entries)}"
                    )
                targets = _sample(t.entries, quota, rng, f"{t.key} cite_passage")
                for e in targets:
                    name = _choose_name(t.meta, rng)
                    # an exemplar citation from a different seeded entry of the same text
                    others = [o for o in t.entries if (o.citation, o.text) != (e.citation, e.text)]
                    example = rng.choice(others)
                    prompt = (
                        f'Where in {name} can I find this quote? "{e.text}" '
                        f"Answer with the citation only, in the same form as: {example.citation}."
                    )
                    questions.append(Question(
                        id=_qid(task, t.key, t.rep_doc, e), task=task, prompt=prompt,
                        expected={"citation": e.citation},
                        source=_source_dict(t.rep_doc, e.citation, name),
                    ))
            elif task == "verify_source":
                _append_verify_source(questions, t, texts, quota, negatives_share, rng)

    if not questions:
        raise GenerateError("generation produced no questions")
    questions.sort(key=lambda q: (q.task, q.id))
    ids = [q.id for q in questions]
    if len(ids) != len(set(ids)):
        raise GenerateError("internal: duplicate question ids after content-dedup")
    return questions, excluded


def _verify_expected(answer: str, src: Document, entry: Entry) -> dict:
    # verify_source shows a passage, not a citation, so the passage's full provenance
    # (including its real citation) is ground truth in `expected`; `source.citation` is
    # left empty, because a negative's passage has no citation in the ASKED edition.
    return {"answer": answer, "true_work": src.work, "true_version": src.version,
            "true_language": src.language, "true_citation": entry.citation}


def _append_verify_source(
    questions: list[Question],
    asked: _Text,
    texts: list[_Text],
    quota: int,
    negatives_share: float,
    rng: random.Random,
) -> None:
    """Build this text's verify_source questions: ``n_neg = int(quota * share)``
    cross-family negatives, the rest positives. The question is always about the
    ``asked`` edition; a negative presents a passage from a **different-family** text
    (families: the nine hadith collections are one; otherwise a text's ``work``), not
    already present in the asked edition (containment over all entries). Negatives prefer
    a **same-language** partner; a text with no same-language different-family partner falls
    back to cross-language (a trivially-rejectable, flagged case)."""
    n_neg = int(quota * negatives_share)
    n_pos = quota - n_neg

    # positives: passages genuinely from the asked edition
    for e in _sample(asked.entries, n_pos, rng, f"{asked.key} verify_source (+)"):
        name = _choose_name(asked.meta, rng)
        prompt = f'Is the following text from {name}? "{e.text}" Answer Yes or No.'
        questions.append(Question(
            id=_qid("verify_source", asked.key, asked.rep_doc, e), task="verify_source",
            prompt=prompt, expected=_verify_expected("yes", asked.rep_doc, e),
            source=_source_dict(asked.rep_doc, "", name),
        ))

    if n_neg <= 0:
        return
    # candidates: different-family passages not contained in the asked edition, split by
    # whether they share the asked edition's language.
    same_lang: list[tuple[_Text, Entry]] = []
    cross_lang: list[tuple[_Text, Entry]] = []
    for other in texts:
        if other.family == asked.family:
            continue
        bucket = same_lang if other.language == asked.language else cross_lang
        for e, ne in zip(other.entries, other.entry_norms):
            if ne in asked.all_norm:
                continue
            bucket.append((other, e))
    if len(same_lang) + len(cross_lang) < n_neg:
        raise GenerateError(
            f"{asked.key} verify_source: need {n_neg} cross-family false-premise negatives "
            f"(negatives_share={negatives_share} of {quota}) but only "
            f"{len(same_lang) + len(cross_lang)} eligible different-family passages exist; "
            "lower --negatives-share or add texts"
        )
    for bucket in (same_lang, cross_lang):
        bucket.sort(key=lambda oe: (oe[0].key, oe[1].citation, oe[1].text))
        rng.shuffle(bucket)
    chosen = (same_lang + cross_lang)[:n_neg]  # same-language first
    for other, e in chosen:
        name = _choose_name(asked.meta, rng)
        prompt = f'Is the following text from {name}? "{e.text}" Answer Yes or No.'
        questions.append(Question(
            id=_qid("verify_source", asked.key, other.rep_doc, e), task="verify_source",
            prompt=prompt, expected=_verify_expected("no", other.rep_doc, e),
            source=_source_dict(asked.rep_doc, "", name),
        ))


# --- manifest + question-set digest ------------------------------------------


def question_set_digest(questions: list[Question]) -> str:
    """Content digest of the full question set (order-independent): binds collect/score."""
    h = hashlib.sha256()
    blobs = sorted(json.dumps(asdict(q), ensure_ascii=False, sort_keys=True) for q in questions)
    for blob in blobs:
        h.update(blob.encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()[:16]


def corpus_hash(docs: list[Document]) -> str:
    """Content hash of the input corpus; any edit — including metadata or unit_type
    — changes it (manifest provenance)."""
    h = hashlib.sha256()
    for d in sorted(docs, key=lambda d: (d.work, d.version, d.language, tuple(d.tradition), d.document_type)):
        meta = f"{d.work}\0{d.version}\0{d.language}\0{d.document_type}\0{','.join(d.tradition)}\0{len(d.entries)}\0"
        h.update(meta.encode("utf-8"))
        for e in d.entries:
            h.update(f"{e.unit_type}\0{e.citation}\0{e.text}\0".encode("utf-8"))
    return h.hexdigest()[:16]


def build_manifest(
    docs: list[Document], questions: list[Question], excluded: list[dict], seed: int,
    per_text: int, negatives_share: float, tasks: tuple[str, ...] | None = None,
    inputs: list[str] | None = None,
) -> dict:
    by_task = {t: sum(1 for q in questions if q.task == t) for t in sorted({q.task for q in questions})}
    negatives = [q for q in questions if q.task == "verify_source" and q.expected.get("answer") == "no"]
    # per asked text, how many of its negatives are cross-language (the passage's true
    # language differs from the asked edition's) — a trivially-rejectable, flagged case.
    cross_language: dict[tuple[str, str, str], int] = {}
    for q in negatives:
        if q.source["language"] != q.expected.get("true_language"):
            k = (q.source["work"], q.source["version"], q.source["language"])
            cross_language[k] = cross_language.get(k, 0) + 1
    selected = sorted({(q.source["work"], q.source["version"], q.source["language"]) for q in questions})
    return {
        "seed": seed,
        "inputs": list(inputs or []),  # the generate invocation's input paths (scoping)
        "per_text": per_text,
        "negatives_share": negatives_share,
        "tasks_requested": list(tasks) if tasks else list(TASKS),
        "tasks_by_count": by_task,
        "verify_source_negatives": len(negatives),
        "verify_source_cross_language_negatives": [
            {"work": w, "version": v, "language": lg, "count": cross_language[(w, v, lg)]}
            for (w, v, lg) in sorted(cross_language)
        ],
        "selected_texts": [{"work": w, "version": v, "language": lg} for (w, v, lg) in selected],
        "excluded_texts": excluded,  # catalogue TARGETS dropped by language != canonical_language
        "corpus_hash": corpus_hash(docs),
        "question_set_digest": question_set_digest(questions),
        "n_questions": len(questions),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def manifest_path(questions_path: Path) -> Path:
    return questions_path.with_suffix(questions_path.suffix + ".manifest.json")


def write_questions(questions: list[Question], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for q in questions:
            f.write(json.dumps(asdict(q), ensure_ascii=False) + "\n")


def load_questions(path: Path) -> list[Question]:
    out: list[Question] = []
    with open(path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.strip():
                continue
            d = json.loads(line)
            missing = {"id", "task", "prompt", "expected", "source"} - set(d)
            if missing:
                raise GenerateError(f"{path}:{line_no}: question missing fields {sorted(missing)}")
            out.append(Question(**d))
    if not out:
        raise GenerateError(f"{path}: no questions")
    return out
