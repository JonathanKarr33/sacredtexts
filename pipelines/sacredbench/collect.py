"""Collection: fan every question out to every configured model.

Discipline ported from the multibench judging workflow:

- **Resumable**: answers append to ``answers.jsonl``; cells already answered
  (question_id, model_id) are skipped on re-run, so a crashed or partial run
  continues instead of re-paying.
- **Concurrency-bounded parallel** over provider calls (``concurrency`` in the
  run config); ``concurrency: 1`` is strictly serial.
- **Failed cells stay pending** and make the run exit non-zero — nothing is
  silently dropped, a re-run retries exactly the missing cells.
"""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from sacredbench.config import RunConfig
from sacredbench.generate import Question, question_set_digest
from sacredbench.providers import complete


class CollectError(Exception):
    """Collection cannot proceed (e.g. resuming against a different question set)."""


def _panel_fingerprint(m) -> str:
    """A model cell's panel identity — so a model id can't be silently re-pointed at a
    different provider/model/host/tools between resumes. The tools setting is part of the
    identity (Spec 8): a web-search-on cell must never be resumed as web-search-off."""
    return f"{m.provider}|{m.model}|{m.base_url or ''}|{','.join(m.tools)}"


def _existing(
    answers_path: Path,
) -> tuple[set[tuple[str, str]], set[str], int, dict[str, set[str]], set[str]]:
    """Return ((question_id, model_id) keys, digests present, rows missing a digest,
    {model_id: panel fingerprints seen}, {model_id with >=1 row carrying NO fingerprint}).

    The last set is the evidence-integrity guard: a row with no ``panel_fingerprint``
    (e.g. a pre-Spec-3 answers file — first-run's rows carry a digest but no fingerprint)
    contributes nothing to the identity-mismatch check below, so without tracking it a
    legacy file could be silently resumed/scored under a *different* tools identity."""
    keys: set[tuple[str, str]] = set()
    digests: set[str] = set()
    missing = 0
    fps: dict[str, set[str]] = {}
    fp_missing: set[str] = set()
    if not answers_path.exists():
        return keys, digests, missing, fps, fp_missing
    with open(answers_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                keys.add((d["question_id"], d["model_id"]))
                if d.get("question_set_digest"):
                    digests.add(d["question_set_digest"])
                else:
                    missing += 1
                fp = d.get("panel_fingerprint")
                if fp:
                    fps.setdefault(d["model_id"], set()).add(fp)
                else:
                    fp_missing.add(d["model_id"])
    return keys, digests, missing, fps, fp_missing


def collect(
    questions: list[Question],
    config: RunConfig,
    answers_path: Path,
    on_result=None,
) -> tuple[int, int, list[str]]:
    """Run all pending (question, model) cells. Returns (done, failed, failure_messages).

    The question-set digest is stamped into every answer row; resuming against an
    ``answers.jsonl`` built for a different question set is refused (``CollectError``)
    so a stale or mixed run can never be silently appended to or scored."""
    digest = question_set_digest(questions)
    done_keys, existing_digests, missing, existing_fps, existing_fp_missing = _existing(answers_path)
    if (existing_digests - {digest}) or missing:
        raise CollectError(
            f"{answers_path} was not built for this question set (current digest {digest}; "
            f"found digest(s) {sorted(existing_digests) or 'none'}, {missing} row(s) with no "
            "digest); refusing to resume — regenerate or point --out at a fresh file"
        )
    # panel-identity binding: a model id already answered under one provider/model must
    # not be resumed under a different one (its old answers would hide under new metadata)
    for m in config.models:
        current = _panel_fingerprint(m)
        # A legacy row with NO fingerprint (first-run shape: digest but no panel_fingerprint)
        # bypasses the mismatch check below, so a partial pre-Spec-3 file could resume under a
        # tools-bearing identity and silently mix web-search-on and -off answers. Refuse it.
        if m.id in existing_fp_missing:
            raise CollectError(
                f"{answers_path}: model id {m.id!r} has answer row(s) with no panel fingerprint "
                "(a pre-Spec-3 answers file); refusing to resume — such rows cannot be identity-"
                "checked and could silently mix web-search-on and -off answers under one id. "
                "Point --out at a fresh file (or re-collect)."
            )
        mismatched = existing_fps.get(m.id, set()) - {current}
        if mismatched:
            raise CollectError(
                f"{answers_path}: model id {m.id!r} has answers from a different panel identity "
                f"{sorted(mismatched)}, but the config now maps it to {current!r}; refusing to "
                "resume under a changed identity — use a fresh --out or a distinct model id"
            )
    cells = [
        (q, m) for q in questions for m in config.models if (q.id, m.id) not in done_keys
    ]
    answers_path.parent.mkdir(parents=True, exist_ok=True)
    write_lock = threading.Lock()
    failures: list[str] = []
    done = 0

    def run_cell(q: Question, m) -> None:
        nonlocal done
        text, usage, attempts = complete(m, q.prompt)  # raises on failure
        row = {
            "question_id": q.id,
            "model_id": m.id,
            "model": m.model,
            "provider": m.provider,
            "panel_fingerprint": _panel_fingerprint(m),
            "task": q.task,
            "answer": text,
            "usage": usage,
            "attempts": attempts,
            "question_set_digest": digest,
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "question": asdict(q),
        }
        with write_lock:
            with open(answers_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            done += 1
            if on_result:
                on_result(q, m, text)

    with ThreadPoolExecutor(max_workers=config.concurrency) as pool:
        futures = {pool.submit(run_cell, q, m): (q, m) for q, m in cells}
        for fut in as_completed(futures):
            q, m = futures[fut]
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001 — record any failure, keep the cell pending
                failures.append(f"{q.id} x {m.id}: {e}")

    return done, len(failures), failures
