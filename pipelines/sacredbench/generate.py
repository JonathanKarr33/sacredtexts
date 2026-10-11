"""Question generation from the working group's six candidate templates (Sep 8).

Deterministic (seeded) sampling over the standard-format documents — no LLM in
the loop, so the question set is reproducible and auditable against the sources.

Task types (template -> what a correct answer contains):

- ``identify_version``  "Which version of <work> says <text>?"            -> the version
- ``retrieve_quote``    "Please give me the <version> quote for <cite>"   -> the exact text
- ``verify_source``     "Is <text> from <work>?"                          -> yes / no
- ``complete_unit``     "Please complete this <unit_type>: <beginning>"   -> the remainder
- ``cite_passage``      "What is the source citation for this passage
                         from <work>? <text>"                             -> the citation
- ``identify_source``   "Where is this quote from? <text>"                -> work + citation

Contract details that keep the benchmark honest:

- **Version-gated** ``identify_version`` is emitted only for works that have >=2
  converted versions in the corpus (live for the Bible via KJV/ASV/WEB), and only
  for passages whose text is unique to one version (a verse identical across KJV
  and ASV has two correct answers, so it is excluded).
- **False-premise** ``verify_source`` negatives attribute a real passage to the
  WRONG work; a negative is excluded when its text also occurs in that wrong work
  (the "no" ground truth would be wrong).
- Only **canonically cited** units are sampled — front-matter ``unnumbered para.``
  and ``(dup N)`` units (see the encyclicals converter) are not benchmark items.
- **Stable content-derived IDs** (task + source coordinates + text), a
  **deterministic order**, configurable **per-task quotas** and a
  **tradition-balanced** selection over the unbalanced corpus, with fail-fast on an
  insufficient pool.
- ``generate`` also produces a **manifest** (seed, params, corpus hash) and a
  **question-set digest** that ``collect`` binds into its answers and ``score``
  validates, so a resumed or scored run cannot silently mix question sets.
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from sacredbench.schema import Document, Entry
from sacredbench.score import normalize

TASKS = (
    "identify_version",
    "retrieve_quote",
    "verify_source",
    "complete_unit",
    "cite_passage",
    "identify_source",
)

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
    source: dict  # {tradition, work, version, language, document_type, citation}


def _is_canonical_citation(citation: str) -> bool:
    """Front-matter ('unnumbered para.') and disambiguated ('(dup N)') units are
    not citable benchmark items — see the encyclicals converter."""
    return "unnumbered para." not in citation and "(dup " not in citation


def _source_dict(doc: Document, entry: Entry) -> dict:
    return {
        "tradition": doc.tradition,
        "work": doc.work,
        "version": doc.version,
        "language": doc.language,
        "document_type": doc.document_type,
        "citation": entry.citation,
    }


def _qid(task: str, doc: Document, entry: Entry, neg_work: str | None = None) -> str:
    key = "\0".join(
        [task, doc.work, doc.version, doc.language, entry.citation, entry.text, neg_work or ""]
    )
    return f"{task}-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]}"


_ANSWER_ONLY = "Answer with only the requested answer and no commentary."


def _build(task: str, doc: Document, entry: Entry, neg_work: str | None = None) -> Question:
    qid = _qid(task, doc, entry, neg_work)
    src = _source_dict(doc, entry)
    if task == "identify_version":
        prompt = (
            f'Which version (edition or translation) of {doc.work} says: "{entry.text}"? '
            f"{_ANSWER_ONLY}"
        )
        expected = {"version": doc.version}
    elif task == "retrieve_quote":
        prompt = (
            f"Please give me the {doc.version} quote for {entry.citation}. "
            f"Reply with the exact text of that {entry.unit_type} and nothing else."
        )
        expected = {"text": entry.text}
    elif task == "verify_source":
        work = neg_work or doc.work
        prompt = f'Is the following text from {work}? "{entry.text}" Answer Yes or No.'
        expected = {"answer": "no" if neg_work else "yes", "true_work": doc.work}
    elif task == "complete_unit":
        words = entry.text.split()
        head = " ".join(words[: len(words) // 2])
        prompt = (
            f"Please complete this {entry.unit_type} from {doc.work} ({doc.version}): "
            f'"{head}" Reply with only the remaining words of the {entry.unit_type}.'
        )
        expected = {"text": " ".join(words[len(words) // 2 :]), "full_text": entry.text}
    elif task == "cite_passage":
        prompt = (
            f'What is the source citation for this passage from {doc.work}? "{entry.text}" '
            f"{_ANSWER_ONLY}"
        )
        expected = {"citation": entry.citation}
    elif task == "identify_source":
        prompt = f'Where is this quote from? "{entry.text}" Name the work and the citation. {_ANSWER_ONLY}'
        expected = {"work": doc.work, "citation": entry.citation}
    else:
        raise GenerateError(f"unknown task {task!r}")
    return Question(id=qid, task=task, prompt=prompt, expected=expected, source=src)


def _balanced_sample(
    pool: list[tuple[Document, Entry]], quota: int, rng: random.Random, task: str
) -> list[tuple[Document, Entry]]:
    """Sample ``quota`` items balanced across traditions (round-robin over each
    tradition's shuffled sub-pool). Balancing is on the **primary (first-listed)**
    tradition of each document — today's corpora have single-element tradition
    lists, so primary == the tradition; Phase 6 aggregates once per *listed*
    tradition, a separate axis. Fail-fast if the whole pool is too small."""
    if len(pool) < quota:
        raise GenerateError(
            f"task {task}: pool of {len(pool)} < quota {quota} (insufficient entries)"
        )
    by_tradition: dict[str, list[tuple[Document, Entry]]] = {}
    for d, e in pool:
        by_tradition.setdefault(d.tradition[0], []).append((d, e))
    traditions = sorted(by_tradition)
    # sort each sub-pool by content, then shuffle, in a fixed tradition order — so
    # the selection depends only on content and seed, never on input document order
    for t in traditions:
        by_tradition[t].sort(key=lambda de: (de[0].work, de[0].version, de[0].language, de[1].citation, de[1].text))
        rng.shuffle(by_tradition[t])
    chosen: list[tuple[Document, Entry]] = []
    cursor = {t: 0 for t in traditions}
    while len(chosen) < quota:
        progressed = False
        for t in traditions:
            if len(chosen) >= quota:
                break
            items = by_tradition[t]
            if cursor[t] < len(items):
                chosen.append(items[cursor[t]])
                cursor[t] += 1
                progressed = True
        if not progressed:  # every tradition exhausted before quota (shouldn't happen: len>=quota)
            break
    return chosen


def generate(
    docs: list[Document],
    per_task: int,
    seed: int = 20261010,
    negatives_share: float = 0.5,
    quotas: dict[str, int] | None = None,
    tasks: tuple[str, ...] | None = None,
) -> list[Question]:
    """Sample questions per task over all documents.

    ``quotas`` overrides ``per_task`` per task; ``tasks`` restricts to a subset
    (default all six). Deterministic for a given (docs, seed). Tasks are
    version-gated and both overlap hazards are excluded."""
    active = tuple(tasks) if tasks else TASKS
    unknown = set(active) - set(TASKS)
    if unknown:
        raise GenerateError(f"unknown task(s) {sorted(unknown)} (known: {list(TASKS)})")
    bad_quota = set(quotas or {}) - set(TASKS)
    if bad_quota:
        raise GenerateError(f"unknown quota task(s) {sorted(bad_quota)} (known: {list(TASKS)})")
    if not docs:
        raise GenerateError("no documents to generate from")
    rng = random.Random(seed)

    # identifiable, canonically-cited entries, deduplicated by content BEFORE
    # sampling (colliding shards sharing (work, version, language, citation, text)
    # collapse to one candidate) so quotas are met exactly and ids stay unique.
    pool: list[tuple[Document, Entry]] = []
    seen_content: set[tuple[str, str, str, str, str]] = set()
    for d in docs:
        for e in d.entries:
            if not _is_canonical_citation(e.citation) or len(e.text.split()) < MIN_WORDS_IDENTIFIABLE:
                continue
            key = (d.work, d.version, d.language, e.citation, e.text)
            if key in seen_content:
                continue
            seen_content.add(key)
            pool.append((d, e))
    if not pool:
        raise GenerateError(f"no entries with >= {MIN_WORDS_IDENTIFIABLE} words and a canonical citation")

    works = sorted({d.work for d in docs})
    versions_per_work: dict[str, set[str]] = {}
    for d in docs:
        versions_per_work.setdefault(d.work, set()).add(d.version)
    multi_version_works = {w for w, vs in versions_per_work.items() if len(vs) >= 2}

    # normalized-text membership per work (for the verify_source negative overlap),
    # and per (work -> text -> versions) for the identify_version ambiguity exclusion.
    work_texts: dict[str, set[str]] = {}
    version_texts: dict[str, dict[str, set[str]]] = {w: {} for w in multi_version_works}
    for d in docs:
        nt_set = work_texts.setdefault(d.work, set())
        for e in d.entries:
            nt = normalize(e.text)
            nt_set.add(nt)
            if d.work in multi_version_works:
                version_texts[d.work].setdefault(nt, set()).add(d.version)

    questions: list[Question] = []
    for task in TASKS:
        if task not in active:
            continue
        quota = (quotas or {}).get(task, per_task)
        if quota <= 0:
            continue
        task_pool = pool
        if task == "complete_unit":
            task_pool = [(d, e) for d, e in pool if len(e.text.split()) >= MIN_WORDS_COMPLETABLE]
        elif task == "identify_version":
            if not multi_version_works:
                continue  # version-gated: skip when no work has >=2 versions
            # only passages whose text is unique to ONE version of the work
            task_pool = [
                (d, e)
                for d, e in pool
                if d.work in multi_version_works
                and len(version_texts[d.work].get(normalize(e.text), ())) == 1
            ]
            if not task_pool:
                continue  # every multi-version passage is ambiguous -> task not applicable
        sample = _balanced_sample(task_pool, quota, rng, task)

        n_negatives = int(quota * negatives_share) if task == "verify_source" else 0
        if n_negatives > 0:
            # a false-premise negative needs a wrong work that does NOT also contain
            # the passage; fail fast if the requested ratio can't be met
            annotated = [
                (doc, entry, sorted(w for w in works if w != doc.work and normalize(entry.text) not in work_texts[w]))
                for doc, entry in sample
            ]
            eligible = [i for i, (_, _, cands) in enumerate(annotated) if cands]
            if len(eligible) < n_negatives:
                raise GenerateError(
                    f"verify_source: need {n_negatives} false-premise negatives "
                    f"(negatives_share={negatives_share} of {quota}) but only {len(eligible)} of "
                    f"the sampled items have an eligible wrong work (corpus has {len(works)} work(s)); "
                    "lower --negatives-share or add works"
                )
            neg_idx = set(eligible[:n_negatives])
            for i, (doc, entry, cands) in enumerate(annotated):
                neg_work = rng.choice(cands) if i in neg_idx else None
                questions.append(_build(task, doc, entry, neg_work=neg_work))
        else:
            for doc, entry in sample:
                questions.append(_build(task, doc, entry))

    if not questions:
        raise GenerateError("generation produced no questions")
    # stable, deterministic order; ids are unique by construction (pool is
    # content-deduplicated), verified here as a fail-fast invariant.
    questions.sort(key=lambda q: (q.task, q.id))
    ids = [q.id for q in questions]
    if len(ids) != len(set(ids)):
        raise GenerateError("internal: duplicate question ids after content-dedup")
    return questions


# --- manifest + question-set digest ------------------------------------------


def question_set_digest(questions: list[Question]) -> str:
    """Content digest of the full question set (order-independent): binds collect/score.

    Hashes each question's complete canonical JSON (id, task, prompt, expected,
    source), so any change to a prompt or source field — not just the id — changes
    the digest and a resumed/scored run against it is refused."""
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
    for d in sorted(docs, key=lambda d: (d.work, d.version, d.language)):
        meta = f"{d.work}\0{d.version}\0{d.language}\0{d.document_type}\0{','.join(d.tradition)}\0{len(d.entries)}\0"
        h.update(meta.encode("utf-8"))
        for e in d.entries:
            h.update(f"{e.unit_type}\0{e.citation}\0{e.text}\0".encode("utf-8"))
    return h.hexdigest()[:16]


def build_manifest(
    docs: list[Document], questions: list[Question], seed: int, per_task: int,
    negatives_share: float, quotas: dict[str, int] | None, tasks: tuple[str, ...] | None = None,
) -> dict:
    by_task = {t: sum(1 for q in questions if q.task == t) for t in sorted({q.task for q in questions})}
    realized_negatives = sum(
        1 for q in questions if q.task == "verify_source" and q.expected.get("answer") == "no"
    )
    return {
        "seed": seed,
        "per_task": per_task,
        "negatives_share": negatives_share,
        "quotas": quotas or {},
        "tasks_requested": list(tasks) if tasks else list(TASKS),
        "tasks_by_count": by_task,
        "verify_source_negatives": realized_negatives,
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
