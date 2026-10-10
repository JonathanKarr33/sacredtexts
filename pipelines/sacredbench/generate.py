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

``verify_source`` also generates FALSE-PREMISE negatives (Phase 1 objective:
"reject false premises and incorrect texts"): a real passage attributed to the
WRONG work (requires >=2 works in the corpus). Negatives are real text —
fabricated-text generation is a later, LLM-assisted stage.

Each question carries the exact expected answer and full source coordinates, so
scoring never has to re-derive anything.
"""

from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path

from sacredbench.schema import Document, Entry

TASKS = (
    "identify_version",
    "retrieve_quote",
    "verify_source",
    "complete_unit",
    "cite_passage",
    "identify_source",
)

# Entries shorter than this are too generic to identify ("may mercy, peace, and
# love be yours in abundance" is identifiable; "Jesus wept." famously is too, but
# a bare "Amen." is not). Word count, not characters.
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


def _source_dict(doc: Document, entry: Entry) -> dict:
    return {
        "tradition": doc.tradition,
        "work": doc.work,
        "version": doc.version,
        "language": doc.language,
        "document_type": doc.document_type,
        "citation": entry.citation,
    }


_ANSWER_ONLY = "Answer with only the requested answer and no commentary."


def _build(task: str, doc: Document, entry: Entry, idx: int, neg_work: str | None = None) -> Question:
    qid = f"{task}-{idx:05d}"
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


def generate(
    docs: list[Document],
    per_task: int,
    seed: int = 20261010,
    negatives_share: float = 0.5,
) -> list[Question]:
    """Sample ``per_task`` questions per task type over all documents.

    ``negatives_share`` of ``verify_source`` questions are false-premise negatives
    (real text, wrong work) when the corpus has >=2 works; with a single work every
    verify question is a positive, and that is reported loudly by the CLI.
    """
    if not docs:
        raise GenerateError("no documents to generate from")
    rng = random.Random(seed)
    pool: list[tuple[Document, Entry]] = [
        (d, e) for d in docs for e in d.entries if len(e.text.split()) >= MIN_WORDS_IDENTIFIABLE
    ]
    if len(pool) < per_task:
        raise GenerateError(
            f"only {len(pool)} entries with >= {MIN_WORDS_IDENTIFIABLE} words; "
            f"cannot sample {per_task} per task"
        )
    works = sorted({d.work for d in docs})
    questions: list[Question] = []
    idx = 0
    for task in TASKS:
        if task == "complete_unit":
            task_pool = [(d, e) for d, e in pool if len(e.text.split()) >= MIN_WORDS_COMPLETABLE]
        else:
            task_pool = pool
        if len(task_pool) < per_task:
            raise GenerateError(f"task {task}: pool of {len(task_pool)} < per_task {per_task}")
        sample = rng.sample(task_pool, per_task)
        for i, (doc, entry) in enumerate(sample):
            neg_work = None
            if task == "verify_source" and len(works) >= 2 and i < int(per_task * negatives_share):
                neg_work = rng.choice([w for w in works if w != doc.work])
            questions.append(_build(task, doc, entry, idx, neg_work=neg_work))
            idx += 1
    return questions


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
