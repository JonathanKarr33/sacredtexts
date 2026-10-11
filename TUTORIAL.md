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

Steps 1–2 above are shared. From here there are two tracks: **A** explores the
committed run with no keys and writes no files into the committed evidence;
**B** does your own fresh run (needs keys) under a new `runs/<id>/` directory.
Never `collect`/`score`/`generate` on top of `runs/first-run-2026-10-11/` — it is
the committed reference evidence, already complete, so a `collect` there would just
resume-skip all cells and a keyless `score` would overwrite its panel proof.

## Track A — explore the committed run (no keys, no new files)

The committed run already ships `questions.jsonl`, `answers.jsonl`, `scores.jsonl`,
`summary.json` and `summary.md`. Read the table, the panel proof and the token
totals directly:

```bash
cat runs/first-run-2026-10-11/summary.md
```

Re-derive the scores from the committed answers to a **scratch** path and confirm
they reproduce (reads the committed evidence, writes only to `/tmp`):

```bash
uv --project pipelines run python -m sacredbench score \
  runs/first-run-2026-10-11/answers.jsonl \
  --scores-out /tmp/scores.jsonl --summary-out /tmp/summary.json
diff <(sort /tmp/scores.jsonl) <(sort runs/first-run-2026-10-11/scores.jsonl) && echo "reproduced"
```

Then view it (Track C below): open `/` — the viewer loads the most-recent run under `runs/`.

## Track B — do your own run (needs API keys — the only paid part)

Pick a fresh run directory and keep every artifact under it:

```bash
RUN=runs/my-run

# 3. generate (deterministic; same seed ⇒ identical questions, with a .manifest.json)
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian" \
  "texts/standardized/The Church of Jesus Christ of Latter-Day Saints" \
  "texts/standardized/Roman Catholic/papal-encyclicals-vatican-english-en" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-english-en" \
  --tasks retrieve_quote --per-task 100 --seed 20261011 --out "$RUN/questions.jsonl"

# 4. copyright audit (also runs in the test gate): fail if any artifact derives from
#    a restricted source
uv --project pipelines run python -m sacredbench audit "$RUN"

# 5. collect from the panel (resumable; a failed cell stays pending and the run exits
#    non-zero — re-run to fill exactly the missing cells; the question-set digest is
#    stamped on every row so you can't resume against a different question set)
cp -n configs/models.example.yaml configs/models.yaml   # edit the panel; keys via env
                                                         # (-n: don't clobber an existing one)
uv --project pipelines run python -m sacredbench collect \
  "$RUN/questions.jsonl" configs/models.yaml --out "$RUN/answers.jsonl"

# 6. score (strict + normalized + token-F1; per-task contract; tradition breakdown;
#    --questions/--config add the missing-cell roster + the panel snapshot + usage)
uv --project pipelines run python -m sacredbench score "$RUN/answers.jsonl" \
  --scores-out "$RUN/scores.jsonl" --summary-out "$RUN/summary.json" \
  --summary-md "$RUN/summary.md" --questions "$RUN/questions.jsonl" --config configs/models.yaml

# 7. audit the WHOLE run again — now the answers/scores you'd commit, not just the
#    questions — before committing any evidence
uv --project pipelines run python -m sacredbench audit "$RUN"
```

(The committed `runs/first-run-2026-10-11/` was produced by exactly these commands
with that seed.)

## Track C — view the results locally

```bash
pnpm -C apps/viewer install
pnpm -C apps/viewer dev          # then open the printed URL
```

- `/` loads the **most-recent** run under `runs/` automatically (the committed
  `runs/first-run-2026-10-11/` when it's the only one; your Track B `runs/<id>` once you
  add it). The dev server serves the repo's `runs/` at `/runs/`.
- An empty `runs/` shows an informative empty state.
- The multibrowser surface (`/t/...`, `/results`, `/raw`, `/review*`) has been removed;
  the dedicated leaderboard + error explorer land in the Spec 2 feature phases.

## Re-running the whole thing / tests

```bash
bash .codev/checks/test.sh                      # the pipeline + viewer test gates
uv --project pipelines run pytest pipelines      # Python only
pnpm -C apps/viewer test                         # viewer only
```
