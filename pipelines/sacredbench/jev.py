"""Jev judgments for answers already collected.

Jev (``typesafe/jev-1.13`` on OpenRouter) returns a probability for a closed
question. It is not a chat model and it does not replace the headline
``correct`` bit in ``score.py``. The string score still decides whether the
answer is the requested text. Jev is asked three things, with the requested
text, the answer, and any other indexed wordings of the same citation in the
request:

- ``refusal`` — the answer declines to quote
- ``matches_requested`` — the requested words are in the answer
- ``kind`` — refusal, requested wording, another indexed wording, or neither

The same ``OPENROUTER_API_KEY`` as the OpenRouter panel is used. Calls go to
``POST /api/alpha/decisions``, not chat completions. Each row records the
requested judge model and the resolved build OpenRouter returns.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

from sacredbench.cross_translation import EditionIndex, cite_key
from sacredbench.score import normalize

JEV_MODEL = "typesafe/jev-1.13"
DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
RUBRIC_ID = "sacredbench-jev-1"
_KINDS = ("refusal", "requested_wording", "other_indexed_wording", "neither")
_MAX_ALTERNATES = 6
_STATE_CHAR_LIMIT = 100_000


class JevError(Exception):
    pass


# Closed questions. Criteria refer only to fields in the state object.
QUESTIONS = {
    "refusal": {
        "type": "noul",
        "instructions": "Does the model answer refuse to give the requested text?",
        "criteria": {
            "true": "The answer declines, apologizes, or says it cannot or will not quote the passage, and does not supply the passage.",
            "false": "The answer supplies a quotation or a scripture-like passage, whether or not that passage is the one requested.",
        },
    },
    "matches_requested": {
        "type": "noul",
        "instructions": (
            "Does the model answer contain the requested text, ignoring case and punctuation? "
            "A citation prefix or suffix still matches if the requested words are present."
        ),
        "criteria": {
            "true": "The requested words appear in the answer.",
            "false": "The requested words are absent. A paraphrase, a different edition, or an unrelated passage does not match.",
        },
    },
    "kind": {
        "type": "choice",
        "instructions": (
            "Which one label fits the model answer? Use only requested_text, model_answer, "
            "and indexed_other_wordings."
        ),
        "criteria": {
            "refusal": "The answer declines to quote the passage.",
            "requested_wording": "The answer contains the requested text.",
            "other_indexed_wording": (
                "indexed_other_wordings is not empty, the answer does not contain the requested text, "
                "and the answer does contain one of those indexed wordings."
            ),
            "neither": (
                "The answer is not a refusal, does not contain the requested text, "
                "and does not contain any indexed_other_wording."
            ),
        },
    },
}


def alternate_wordings(index: EditionIndex | None, citation: str, expected_text: str) -> list[dict]:
    """Other indexed wordings of this citation, excluding the requested string."""
    if index is None:
        return []
    key = cite_key(citation)
    if key is None:
        return []
    expected_norm = normalize(expected_text or "")
    found: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for passage in index.by_cite.get(key, []):
        if not passage.norm or passage.norm == expected_norm:
            continue
        ident = (passage.tradition, passage.version, passage.norm)
        if ident in seen:
            continue
        seen.add(ident)
        found.append(
            {
                "tradition": passage.tradition,
                "work": passage.work,
                "version": passage.version,
                "citation": passage.citation,
                "text": passage.text,
            }
        )
        if len(found) >= _MAX_ALTERNATES:
            break
    return found


def judgment_state(row: dict, alternates: list[dict]) -> dict:
    question = row.get("question")
    if not isinstance(question, dict):
        raise JevError("answer row has no embedded question")
    source = question.get("source")
    expected = question.get("expected")
    if not isinstance(source, dict) or not isinstance(expected, dict) or "text" not in expected:
        raise JevError("answer row question is missing source or expected text")
    tradition = source.get("tradition") or []
    if isinstance(tradition, str):
        tradition = [tradition]
    state = {
        "tradition": tradition[0] if tradition else None,
        "work": source.get("work"),
        "version": source.get("version"),
        "citation": source.get("citation"),
        "requested_text": expected["text"],
        "model_answer": row.get("answer") or "",
        "indexed_other_wordings": alternates,
    }
    if len(json.dumps(state, ensure_ascii=False)) > _STATE_CHAR_LIMIT:
        raise JevError("judgment state exceeds the context budget")
    return state


def interpret(payload: dict) -> dict:
    """Pull the three answers off a Decisions response. Wrong shapes raise."""
    if not isinstance(payload, dict):
        raise JevError("decisions response is not an object")
    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise JevError("decisions response missing answers")
    refusal = answers.get("refusal")
    matches = answers.get("matches_requested")
    kind = answers.get("kind")
    if not isinstance(refusal, dict) or refusal.get("type") != "noul" or "noul" not in refusal:
        raise JevError("refusal answer missing or not a noul")
    if not isinstance(matches, dict) or matches.get("type") != "noul" or "noul" not in matches:
        raise JevError("matches_requested answer missing or not a noul")
    if not isinstance(kind, dict) or kind.get("type") != "choice" or kind.get("choice") not in _KINDS:
        raise JevError(f"kind answer missing or not one of {_KINDS}")
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return {
        "decision_id": payload.get("id"),
        "judge_model_resolved": payload.get("model"),
        "judge_provider": payload.get("provider"),
        "refusal_p": refusal["noul"],
        "matches_requested_p": matches["noul"],
        "kind": kind["choice"],
        "kind_probabilities": kind.get("probabilities"),
        "kind_confidence": kind.get("confidence"),
        "usage": {
            "in": usage.get("input_tokens"),
            "out": usage.get("output_tokens"),
            "cost": usage.get("cost"),
        },
        "answers": answers,
    }


def post_decision(state: dict, model: str, api_key: str, timeout: float = 60.0, retries: int = 2) -> dict:
    """POST one Decisions request. 401/403 fail immediately; 429 and 5xx retry."""
    body = json.dumps({"model": model, "state": state, "questions": QUESTIONS}).encode("utf-8")
    request = urllib.request.Request(
        DECISIONS_URL,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            if exc.code in (401, 403) or attempt == retries or exc.code < 500 and exc.code != 429:
                raise JevError(f"decisions API {exc.code}: {detail}") from exc
            last = exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt == retries:
                break
        time.sleep(2.0 * (attempt + 1))
    raise JevError(f"decisions API failed after {retries + 1} attempts: {last}")


def _existing(path: Path) -> set[tuple[str, str, str]]:
    keys: set[tuple[str, str, str]] = set()
    if not path.exists():
        return keys
    with open(path, encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise JevError(f"{path}:{line_no}: not JSON ({exc})") from exc
            if row.get("rubric_id") != RUBRIC_ID:
                raise JevError(
                    f"{path}: rubric {row.get('rubric_id')!r} is not {RUBRIC_ID}; "
                    "refusing to append — point --out at a fresh file"
                )
            keys.add((row.get("question_id"), row.get("model_id"), row.get("judge_model")))
    return keys


def judge(
    rows: list[dict],
    out: Path,
    *,
    index: EditionIndex | None = None,
    model: str = JEV_MODEL,
    concurrency: int = 4,
    decide=None,
    api_key: str | None = None,
) -> tuple[int, int, list[str]]:
    """Judge pending answer rows. Returns (done, failed, messages).

    ``decide`` injects a fake Decisions response in tests. Without it, the call
    uses ``OPENROUTER_API_KEY``. Failed cells are not written.
    """
    if concurrency < 1:
        raise JevError("concurrency must be >= 1")
    call = decide
    if call is None:
        api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise JevError("missing credential env var: OPENROUTER_API_KEY")

        def call(state, _key=api_key, _model=model):
            return post_decision(state, _model, _key)

    done_keys = _existing(out)
    pending = []
    for row in rows:
        key = (row.get("question_id"), row.get("model_id"), model)
        if key not in done_keys:
            pending.append(row)
    out.parent.mkdir(parents=True, exist_ok=True)
    lock = Lock()
    failures: list[str] = []
    done = 0

    def run_cell(row: dict) -> None:
        citation = ((row.get("question") or {}).get("source") or {}).get("citation") or ""
        expected = ((row.get("question") or {}).get("expected") or {}).get("text") or ""
        state = judgment_state(row, alternate_wordings(index, citation, expected))
        interpreted = interpret(call(state))
        record = {
            "question_id": row.get("question_id"),
            "model_id": row.get("model_id"),
            "model": row.get("model"),
            "rubric_id": RUBRIC_ID,
            "judge_model": model,
            **interpreted,
        }
        line = json.dumps(record, ensure_ascii=False) + "\n"
        with lock:
            with open(out, "a", encoding="utf-8") as handle:
                handle.write(line)

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(run_cell, row): row for row in pending}
        for future in as_completed(futures):
            row = futures[future]
            try:
                future.result()
                done += 1
            except Exception as exc:  # noqa: BLE001 — keep the cell pending
                failures.append(f"{row.get('question_id')} x {row.get('model_id')}: {exc}")
    return done, len(failures), failures


def summarize(path: Path) -> dict:
    """Counts of the kinds already written. Empty file → zeros."""
    kinds: Counter[str] = Counter()
    n = 0
    models: set[str] = set()
    if path.exists():
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                n += 1
                kinds[row.get("kind") or "?"] += 1
                if row.get("judge_model_resolved"):
                    models.add(row["judge_model_resolved"])
    return {"n": n, "kinds": dict(sorted(kinds.items())), "judge_models": sorted(models), "rubric_id": RUBRIC_ID}
