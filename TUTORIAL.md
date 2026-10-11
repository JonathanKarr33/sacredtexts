# Sacred Texts Benchmark — Phase 1 end-to-end tutorial

Run the whole benchmark loop from a fresh clone: **convert → validate → generate →
audit → collect → score → view**. Every command is copy-pasteable from the repo
root. Only `collect` calls model APIs (and costs money); everything else is local
and deterministic.

The committed first run lives in [`runs/first-run-2026-10-11/`](runs/first-run-2026-10-11/)
(copyright-audited, public-domain / open English corpora only).

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/) (Python pipeline) and [`pnpm`](https://pnpm.io/)
  (the viewer). Node 20+.
- Model API keys in your **environment** (never in a file): e.g. `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` — only those your panel
  uses. Needed for step 5 (`collect`) only.

```bash
git clone <this repo> && cd sacredtexts   # (or the repo root if nested)
```

## 1. Convert the committed corpora → standardized flat documents

The source catalogue is `texts/raw/**/source.yaml` (one per tradition; each lists
its conversion `targets` with a `license`). Restricted sources (NABRE, the Greek
Orthodox TLG extracts) are excluded by default — you never need them.

```bash
uv --project pipelines run python -m sacredbench convert
```

→ writes `texts/standardized/<source-id>/<target-slug>/…` (gitignored; rebuilt from
`texts/raw`). 221 documents across 7 converters.

## 2. Validate the standardized documents (mechanical, license-agnostic)

```bash
uv --project pipelines run python -m sacredbench validate texts/standardized
```

## 3. Generate the benchmark questions (deterministic, seeded)

The first run is **~100 English `retrieve_quote` questions**, balanced across the
English corpora (Protestant Bibles, LDS editions, papal encyclicals, the Talmud's
English). Same seed ⇒ identical questions (content-derived ids + a question-set
digest, written to a `.manifest.json` sidecar).

```bash
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian" \
  "texts/standardized/The Church of Jesus Christ of Latter-Day Saints" \
  "texts/standardized/Roman Catholic/papal-encyclicals-vatican-english-en" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-english-en" \
  --tasks retrieve_quote --per-task 100 --seed 20261011 \
  --out runs/first-run-2026-10-11/questions.jsonl
```

(The committed `runs/first-run-2026-10-11/questions.jsonl` was produced by exactly
this command.)

## 4. Copyright audit (also runs in the test gate)

Fails if any committed artifact derives from a restricted source:

```bash
uv --project pipelines run python -m sacredbench audit runs/first-run-2026-10-11
```

## 5. Collect answers from the model panel  *(needs API keys — the only paid step)*

```bash
cp configs/models.example.yaml configs/models.yaml   # edit the panel; keys via env
uv --project pipelines run python -m sacredbench collect \
  runs/first-run-2026-10-11/questions.jsonl configs/models.yaml \
  --out runs/first-run-2026-10-11/answers.jsonl
```

Resumable and fail-safe: a failed cell stays pending and the run exits non-zero;
re-run to fill exactly the missing cells. The question-set digest is stamped into
every answer row, so you can't resume against a different question set.

## 6. Score (strict + normalized + token-F1; per-task contract; tradition breakdown)

```bash
uv --project pipelines run python -m sacredbench score \
  runs/first-run-2026-10-11/answers.jsonl \
  --scores-out runs/first-run-2026-10-11/scores.jsonl \
  --summary-out runs/first-run-2026-10-11/summary.json \
  --summary-md  runs/first-run-2026-10-11/summary.md \
  --questions   runs/first-run-2026-10-11/questions.jsonl \
  --config      configs/models.yaml
```

Prints (and writes) the per-model × task accuracy table and a per-tradition
breakdown; `--questions`/`--config` add missing/failed-cell reporting.

## 7. View the results locally

```bash
pnpm -C apps/viewer install
pnpm -C apps/viewer dev          # then open the printed URL
```

- `/local-results` renders a built-in sample run out of the box.
- `/local-results?run=/runs/first-run-2026-10-11` renders **this** run (the dev
  server serves the repo's `runs/` at `/runs/`).

## Re-running the whole thing / tests

```bash
bash .codev/checks/test.sh                      # the pipeline + viewer test gates
uv --project pipelines run pytest pipelines      # Python only
pnpm -C apps/viewer test                         # viewer only
```
