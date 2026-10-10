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
from sacredbench.generate import Question
from sacredbench.providers import ProviderError, complete


def existing_keys(answers_path: Path) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    if not answers_path.exists():
        return keys
    with open(answers_path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                d = json.loads(line)
                keys.add((d["question_id"], d["model_id"]))
    return keys


def collect(
    questions: list[Question],
    config: RunConfig,
    answers_path: Path,
    on_result=None,
) -> tuple[int, int, list[str]]:
    """Run all pending (question, model) cells. Returns (done, failed, failure_messages)."""
    done_keys = existing_keys(answers_path)
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
            "task": q.task,
            "answer": text,
            "usage": usage,
            "attempts": attempts,
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
            except (ProviderError, Exception) as e:  # noqa: BLE001 — record, keep cell pending
                failures.append(f"{q.id} x {m.id}: {e}")

    return done, len(failures), failures
