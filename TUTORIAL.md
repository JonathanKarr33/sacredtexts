# Sacred Texts Benchmark — end-to-end tutorial

Run the whole benchmark loop from a fresh clone: **convert → validate → generate →
audit → collect → score → view**. Every command is copy-pasteable from the repo
root. Only `collect` calls model APIs (and costs money); everything else is local
and deterministic.

This tutorial is built around **three canonical sources in their original languages**
and one question the benchmark is designed to answer: *does giving a model a web-search
tool make it quote scripture more accurately than it can from memory?*

- **The Bible — King James Version** (English, `en`) — the Protestant Christian corpus.
- **The Qur'an — Uthmani text, QUL** (Arabic, `ar`) — vocalised Arabic original.
- **The Talmud Bavli — William Davidson Edition** (Aramaic, `he`) — the Aramaic
  original (© Sefaria, CC-BY-NC 4.0), *not* the English translation.

The task is `retrieve_quote`: given a citation, return **the exact reference text and
nothing else**. The panel runs **two models — one opus-class, one haiku-class — each
both ways: with the Anthropic server-side web-search tool enabled and disabled** (2
models × search-{on,off} = **4 panel entries**). Tools off measures *parametric recall*
(what the model memorised); tools on measures *tool-assisted retrieval*. The tools
setting is part of each entry's identity, so the viewer shows all four side by side and
on/off never collapse into one row.

The committed tutorial run lives in
[`runs/tutorial-2026-10-11/`](runs/tutorial-2026-10-11/) (copyright-audited,
public-domain / openly-licensed original-language corpora only) — read its
[`README.md`](runs/tutorial-2026-10-11/README.md) for the full result and the
headline-vs-`contains-exact` analysis. The earlier
[`runs/first-run-2026-10-11/`](runs/first-run-2026-10-11/) (a different, English-only
panel) is also committed, so the viewer always has at least two runs to compare.

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/) (Python pipeline) and [`pnpm`](https://pnpm.io/)
  (the viewer). Node 20+.
- An `ANTHROPIC_API_KEY` in your **environment** (never in a file) — the tutorial panel
  is all Anthropic (web search is an Anthropic server-side tool). Needed for step 5
  (`collect`) only; Track A and the viewer need no keys.

```bash
git clone <this repo> && cd sacredtexts   # (or the repo root if nested)
```

## 1. Convert the committed corpora → standardized flat documents

The source catalogue is `texts/raw/**/source.yaml` (one per tradition; each lists
its conversion `targets` with a `license`). Restricted sources (NABRE, the Greek
Orthodox TLG extracts) are excluded by default — you never need them. The three
tutorial sources — KJV (`en`), the Qur'an Uthmani QUL (`ar`), and the Talmud Bavli
Aramaic (`he`) — are all public-domain or openly licensed and convert here.

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
Never `collect`/`score`/`generate` on top of `runs/tutorial-2026-10-11/` or
`runs/first-run-2026-10-11/` — they are the committed reference evidence, already
complete, so a `collect` there would just resume-skip all cells and a keyless `score`
would overwrite their panel proof.

## Track A — explore the committed tutorial run (no keys, no new files)

The committed run already ships `questions.jsonl`, `answers.jsonl`, `scores.jsonl`,
`summary.json` and `summary.md`. Read the accuracy table, the panel proof (all four
search-on/off entries), and the token totals directly:

```bash
cat runs/tutorial-2026-10-11/summary.md
```

Re-derive the scores from the committed answers to a **scratch** path and confirm
they reproduce bit-for-bit (reads the committed evidence, writes only to `/tmp`):

```bash
uv --project pipelines run python -m sacredbench score \
  runs/tutorial-2026-10-11/answers.jsonl \
  --scores-out /tmp/scores.jsonl --summary-out /tmp/summary.json
diff <(sort /tmp/scores.jsonl) <(sort runs/tutorial-2026-10-11/scores.jsonl) && echo "reproduced"
```

**What the run shows (and why the headline is misleading).** The strict `retrieve_quote`
headline looks flat-to-down for web search (opus 66% vs opus-search 66%; haiku 47% vs
haiku-search 40%). But counting how often an answer *contains* the exact reference text
inverts that reading: web search retrieves **more** correct scripture (opus 66→74,
haiku 47→52 of 100), and the only reason the headline doesn't move is that a
search-enabled model tends to **wrap** the retrieved quote in citation/attribution prose
("According to Sefaria…", a source URL), which the deliberately strict "and nothing
else" rule scores as wrong. The clearest case is the Aramaic Talmud: opus-search contains
the exact reference in 8/34 cells (~24%) versus **0/34** for opus-off — web search lifted
Aramaic recall from nothing, and the headline hid the entire lift. Full numbers,
per-tradition cuts, and the orthographic-variance caveat are in the run's
[`README.md`](runs/tutorial-2026-10-11/README.md).

Then view it (Track C below): open `/` — the viewer shows the leaderboard for the
most-recent run under `runs/` (by directory mtime, newest first). That is normally this
tutorial run on a fresh clone; if the leaderboard opens on a different run, pick
`tutorial-2026-10-11` from the run selector.

## Track B — do your own run (needs API keys — the only paid part)

These are the **exact commands that produced the committed `runs/tutorial-2026-10-11/`**
— same inputs, `--per-task 100`, and `--seed 20261011`, so `generate` reproduces the
identical question set (digest `37eb58400fdf4ea9`). Keep every artifact under a fresh
run directory:

> **Cost.** `collect` is the only paid step, and this panel is not cheap: the committed
> run spent **~4.24M input / ~249K output tokens and 226 web-search requests** across 400
> cells (200 of them web-search-enabled) — on the order of tens of dollars at list opus
> pricing, billed per web-search request on top of tokens. To try the loop cheaply first,
> drop `--per-task` (e.g. `--per-task 5`); note that **any `--per-task` other than 100
> changes the question set, so its digest will no longer match the committed run.**

```bash
RUN=runs/my-run

# 3. generate (deterministic; same seed ⇒ identical questions, with a .manifest.json)
#    The three tutorial sources in their original languages: KJV (en), Qur'an Uthmani
#    QUL (ar), Talmud Bavli Aramaic (he). Pass the specific target-slug dirs so only
#    these three corpora are drawn from.
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian/the-bible-kjv-en" \
  "texts/standardized/Sunni Islam/the-qur-an-uthmani-qul-ar" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-aramaic-he" \
  --tasks retrieve_quote --per-task 100 --seed 20261011 --out "$RUN/questions.jsonl"

# 4. copyright audit (also runs in the test gate): fail if any artifact derives from
#    a restricted source
uv --project pipelines run python -m sacredbench audit "$RUN"

# 5. collect from the 2×2 panel (2 models × web-search on/off). The example panel is
#    exactly the tutorial panel: claude-opus-5-5 and claude-haiku-5-5, each with
#    `tools: [web_search]` and without. Resumable: a failed cell stays pending and the
#    run exits non-zero — re-run to fill exactly the missing cells; the question-set
#    digest is stamped on every row so you can't resume against a different question set.
cp -n configs/models.example.yaml configs/models.yaml   # the panel as-is; keys via env
                                                         # (-n: don't clobber an existing one)
uv --project pipelines run python -m sacredbench collect \
  "$RUN/questions.jsonl" configs/models.yaml --out "$RUN/answers.jsonl"

# 6. score (strict + normalized + token-F1; per-task contract; tradition breakdown;
#    --questions/--config add the missing-cell roster + the panel snapshot + usage).
#    UNPRICED by design: web search bills per request (not captured in in/out tokens),
#    so the example panel sets no price and `score` reports token totals only, no cost.
uv --project pipelines run python -m sacredbench score "$RUN/answers.jsonl" \
  --scores-out "$RUN/scores.jsonl" --summary-out "$RUN/summary.json" \
  --summary-md "$RUN/summary.md" --questions "$RUN/questions.jsonl" --config configs/models.yaml

# 7. audit the WHOLE run again — now the answers/scores you'd commit, not just the
#    questions — before committing any evidence
uv --project pipelines run python -m sacredbench audit "$RUN"
```

(The committed `runs/tutorial-2026-10-11/` was produced by exactly these commands with
that seed; its `questions.jsonl.manifest.json` records the inputs and digest.)

**Fair use.** This tutorial commits model answers **as collected** — no manual
copyright-clearance / redaction pass over the search-on answers. A search-enabled model
may incidentally echo copyrighted translation text; the maintainers treat that as fair
use for academic benchmarking, and answers are never truncated or edited so the explorer
can show them verbatim. The automated `audit` gate still runs on every commit and blocks
any artifact derived from a *restricted* source.

## Track C — view the results locally

```bash
pnpm -C apps/viewer install
pnpm -C apps/viewer dev          # then open the printed URL
```

- `/` shows the **leaderboard** for the most-recent run under `runs/` automatically
  (typically the committed `runs/tutorial-2026-10-11/` when you haven't added your own —
  use the run selector if it opens on another): the four panel entries ranked by overall
  accuracy, with per-task and per-tradition columns and per-model token totals. The dev
  server serves the repo's `runs/` at `/runs/`.
- A **run selector** lists every run under `runs/` (here: the tutorial run and
  `first-run-2026-10-11`); switching writes the selection to the URL as a bare run id
  (`/?run=<id>`), so a view is shareable and survives refresh.
- Click a model (or a task / tradition cell) to open the **error explorer**
  (`/run/$runId/model/$modelId`): every question with pass / fail / missing status, the
  prompt, expected text, the model's answer, and the exact / normalized / token-F1 scores
  side by side, filterable by task, tradition, correct/incorrect, and failure mode. This
  is where the wrapped-but-correct search-on answers are visible — a correct quote with a
  citation around it, scored 0 by the strict headline.
- **Standings** (`/standings`, in the header) shows each model's most recent result
  across all runs — one row per model, keyed on the panel's provider + model. Because the
  tools setting is part of that identity, the four tutorial entries
  (`…[web_search]` / `…[no-tools]`) appear as **four distinct rows** and do not collapse
  into one or collide with first-run's own `claude-haiku-5-5` row.
- An empty `runs/` shows an informative empty state.
- The multibrowser surface (`/t/...`, `/results`, `/raw`, `/review*`) has been removed.

## Re-running the whole thing / tests

```bash
bash .codev/checks/test.sh                      # the pipeline + viewer test gates
uv --project pipelines run pytest pipelines      # Python only
pnpm -C apps/viewer test                         # viewer only
```
