# Sacred Texts Benchmark — end-to-end tutorial

This benchmark measures how accurately AI models can quote scripture — and whether
giving a model a **web-search tool** helps it quote more accurately than it can from
memory alone. This tutorial walks the whole process once, from a fresh copy of the
code to a results page in your browser.

You do not need to be a programmer to follow it. Every step has a one-sentence
plain-language explanation, then the exact command to copy and paste. Run the commands
in order, from the top folder of the project (the one you land in right after the
`clone` step below). A line starting with `#` inside a command block is just a comment
— you can paste it or skip it.

**One step costs money; the rest are free.** Only step 6 (`collect`) sends questions to
AI models over the internet, and that is the only part that incurs a bill. Everything
else runs entirely on your own machine. **If you have no model API key, just stop before
step 6 and skip to step 8** — the project already ships a finished example run, and the
viewer in step 8 will show it to you.

Two short safety notes you will see repeated below, because they matter:

- **Never re-run steps 6, 7, or 8's scoring on top of the shipped example runs**
  (`runs/tutorial-2026-10-11/` and `runs/first-run-2026-10-11/`). Those folders are the
  finished reference results that come with the project; always send your own work to a
  brand-new folder instead (step 5 sets one up).
- **Keep your API key in your terminal's environment, never saved in a file** in the
  project.

## What this tutorial builds

It runs **three scriptures in their original languages** through one question type:

- **The Bible — King James Version** (English) — a Protestant Christian text.
- **The Qur'an — Uthmani text, QUL** (Arabic) — the vocalised Arabic original.
- **The Talmud Bavli — William Davidson Edition** (Aramaic, © Sefaria, CC-BY-NC 4.0) —
  the Aramaic original, *not* the English translation.

The question type is `retrieve_quote`: the model is given a citation (like a chapter and
verse) and must return **the exact text of that passage and nothing else**.

Four "contestants" answer every question — **two models** (a larger, more capable one
and a smaller, faster one), each tried **two ways: with web search switched on, and with
it off**. "Off" tests what the model memorised; "on" tests whether a live web search
helps it find the exact words. The search setting is part of each contestant's identity,
so the results page shows all four side by side and never mixes them up.

A finished example of exactly this run already ships with the project, in
[`runs/tutorial-2026-10-11/`](runs/tutorial-2026-10-11/) — its
[`README.md`](runs/tutorial-2026-10-11/README.md) has the full results write-up. A
second, English-only example run lives in
[`runs/first-run-2026-10-11/`](runs/first-run-2026-10-11/), so the viewer always has at
least two runs to compare.

## Before you start

You need two free tools installed:

- [`uv`](https://docs.astral.sh/uv/) — runs the Python part of the project. It handles
  everything Python needs for you; you do not have to know Python.
- [`pnpm`](https://pnpm.io/) (with Node 20 or newer) — runs the results viewer, step 8.

You only need an **AI model API key** if you want to do the paid step (6) yourself. The
tutorial uses Anthropic models (web search is an Anthropic feature), so that key is an
`ANTHROPIC_API_KEY`. Put it in your terminal's environment (`export ANTHROPIC_API_KEY=…`),
never in a file inside the project.

**Get the code** (replace `<this repo>` with the project's address):

```bash
git clone <this repo> && cd sacredtexts   # (or the repo root if nested)
```

`git clone` makes a copy of the project on your machine; `cd` moves you into it. Run
every command below from this folder.

## 1. Convert — turn the raw scripture files into one standard format

The project ships each scripture as raw data in whatever shape it arrived in. This step
rewrites all of them into one common format the rest of the pipeline understands.

```bash
uv --project pipelines run python -m sacredbench convert
```

This reads the catalogue of sources in `texts/raw/` and writes the converted,
standardised texts into `texts/standardized/`. (Those standardised files are rebuilt
on demand and are not stored in the project, so this step recreates them for you.)
Copyright-restricted sources are skipped automatically — you never need them for this
tutorial.

## 2. Validate — check the converted texts are well-formed

A quick, free sanity check that every converted file has the right structure before we
build questions from it.

```bash
uv --project pipelines run python -m sacredbench validate texts/standardized
```

## 3. Generate — build the question set

This creates the actual questions — each one a citation whose exact passage text is the
known correct answer. It does **not** use any AI; the questions are built directly from
the scripture text, so the set is identical every time you run it with the same settings.

```bash
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian/the-bible-kjv-en" \
  "texts/standardized/Sunni Islam/the-qur-an-uthmani-qul-ar" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-aramaic-he" \
  --tasks retrieve_quote --per-task 100 --seed 20261011 \
  --out runs/my-run/questions.jsonl
```

The three quoted paths pick exactly our three scriptures. `--per-task 100` asks for 100
questions; `--seed 20261011` is a fixed starting number that makes the random selection
repeatable — these are the **exact settings that produced the shipped example run**, so
your question set will match it. The questions are written to a brand-new folder,
`runs/my-run/`, which keeps your work separate from the shipped examples.

> To try the whole loop cheaply before committing to the paid step, use a smaller number
> like `--per-task 5`. Note that **any number other than 100 produces a different
> question set**, so it will no longer match the shipped example run.

## 4. Audit — confirm nothing restricted slipped in

A free copyright check: it fails loudly if any file in your run was built from a
copyright-restricted source. Run it now on the questions, and again at the end.

```bash
uv --project pipelines run python -m sacredbench audit runs/my-run
```

## 5. Set up the model list for the paid step

This copies the ready-made list of the four contestants (the two models, each with web
search on and off) into place. It will not overwrite a list you already have.

```bash
cp -n configs/models.example.yaml configs/models.yaml
```

The models read your API key from the environment, so there are no secrets in this file.

## 6. Collect — ask the models the questions  💲 *the only paid step*

This sends every question to every contestant over the internet and records their
answers. **This is the step that costs money**, and this particular set of contestants is
not cheap: the shipped example run used roughly **4.24M input / 249K output tokens and
226 web-search requests** across 400 question-and-model combinations — on the order of
tens of dollars. Web search is billed per search on top of the text.

```bash
uv --project pipelines run python -m sacredbench collect \
  runs/my-run/questions.jsonl configs/models.yaml --out runs/my-run/answers.jsonl
```

If some answers fail (a dropped connection, say), the command stops with an error and
leaves the rest in place — just run it again and it fills in only the missing ones. It
will refuse to run against a different question set than the one it started with, so you
can't accidentally mix things up.

> **Never point this at `runs/tutorial-2026-10-11/` or `runs/first-run-2026-10-11/`.**
> Those are the finished example runs; re-running here would either do nothing or
> overwrite their results. Always use your own `runs/my-run/` folder.

## 7. Score — grade the answers

This compares each answer to the known-correct passage and produces the scoreboard. It
is free and uses no AI. An answer counts as correct when it **contains** the exact passage (a
verbatim quote still counts when the model wraps it in a citation); an exact-string match, a
"normalised" match (ignoring differences like vowel marks and punctuation so a vocalised Arabic
verse still matches its plain form), and a word-overlap score are reported alongside. A model that
declines is marked **refused** and set aside, so the scoreboard shows **accuracy** (right when it
answers) with **coverage** (how often it answers) beside it. Two graders run by default — strict and
containment; add `--evaluator strict` (or `containment`) to score by one alone. A human-readable
summary is written out.

```bash
uv --project pipelines run python -m sacredbench score runs/my-run/answers.jsonl \
  --scores-out runs/my-run/scores.jsonl --summary-out runs/my-run/summary.json \
  --summary-md runs/my-run/summary.md \
  --questions runs/my-run/questions.jsonl --config configs/models.yaml
```

Then audit the whole finished run one more time, now that it holds answers and scores:

```bash
uv --project pipelines run python -m sacredbench audit runs/my-run
```

You can read the plain-text summary right away:

```bash
cat runs/my-run/summary.md
```

> **A note on fair use.** The models' answers are saved exactly as given, with no manual
> editing. A model using web search may happen to echo some copyrighted translation; the
> maintainers treat that as fair use for academic research, and the automated audit above
> still blocks anything derived from a *restricted* source.

**No API key?** Steps 6 and 7 need the paid run, so skip them and explore the shipped
example instead. Read its summary directly:

```bash
cat runs/tutorial-2026-10-11/summary.md
```

The shipped run's [`README.md`](runs/tutorial-2026-10-11/README.md) explains the headline
finding. An answer counts as **correct** when it contains the exact passage — a verbatim quote
wrapped in extra words ("According to Sefaria…", a link) still counts — and a model that **declines**
("I can't reliably reproduce that line") is marked **refused** and set aside, not counted wrong. So
each model gets two numbers you read together: **accuracy** (how often it's right *when it answers*)
and **coverage** (how often it answers at all). That pairing is the real story — web search mostly
converts refusals into correct retrievals, most dramatically for the Aramaic Talmud, where the
search-on model goes from refusing every line to retrieving about a quarter of them. It also means a
model can show "100%" only because it stayed silent most of the time, which is exactly why coverage
sits right beside accuracy.

## 8. View — see the results in your browser

This starts the local results viewer — a small website, running only on your own machine,
that shows the scoreboard and lets you click into individual answers.

```bash
pnpm -C apps/viewer install     # one-time setup: fetch the viewer's dependencies
pnpm -C apps/viewer dev         # then open the web address it prints
```

Open the address it prints. To land directly on the shipped example run regardless of
which run is newest, add `?run=tutorial-2026-10-11` to the address.

What you can look at:

- The **leaderboard** (`/`) ranks the four contestants by accuracy, with a **coverage** column of
  equal weight beside it, columns per scripture, each model's token totals, and — for a run with the
  same model tried with and without search — a **"Search on vs off"** comparison.
- A **run selector** lets you switch between runs (your own and the shipped examples);
  your choice is saved in the address so you can share or reload it.
- Click any model (or a scripture cell) to open the **error explorer** — every question with its
  outcome (correct / incorrect / **refused** / missing), the prompt, the expected passage, the
  model's answer, and the three scores side by side, filterable by outcome. This is where the
  "correct but wrapped in extra words" answers show as correct under the containment rule, and a
  declined answer shows a neutral **refused** label rather than a red "wrong".
- **Standings** (link in the header) shows each model's most recent result across all
  runs. Because web-search-on and web-search-off count as different contestants, the four
  tutorial entries stay as four separate rows — but the plain (no-search) `claude-haiku-5-5`
  now shares a row with the same model from the earlier first run, and the newer run wins,
  so you see one up-to-date row for it instead of two.

For more on the viewer, see [`apps/viewer/README.md`](apps/viewer/README.md).

## Re-running the automated tests

If you want to confirm everything is working, these run the project's test suites
(free, no AI):

```bash
bash .codev/checks/test.sh                   # the pipeline + viewer tests together
uv --project pipelines run pytest pipelines   # the Python pipeline only
pnpm -C apps/viewer test                      # the viewer only
```

## Where to go next

- **Run the pipeline stage by stage, with every option:** [`pipelines/README.md`](pipelines/README.md).
- **Add a new scripture or a new kind of question:** [`CODE_WALKTHROUGH.md`](CODE_WALKTHROUGH.md).
- **Understand how the whole system fits together:** [`codev/resources/arch.md`](codev/resources/arch.md).
