# Sacred Texts Benchmark — end-to-end tutorial

This benchmark measures how accurately AI models can quote scripture from memory. This
tutorial walks the whole process once, from a fresh copy of the code to a results page in
your browser, using the same kind of run that ships as the project's reference evidence.

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
  (`runs/original-2026-10-21/`, `runs/tutorial-2026-10-11/`, and `runs/first-run-2026-10-11/`).
  Those folders are the finished reference results that come with the project; always send your
  own work to a brand-new folder instead (step 5 sets one up).
- **Keep your API key in your terminal's environment, never saved in a file** in the
  project.

## What this tutorial builds

It runs **three in-pool scriptures** through the benchmark's four question templates:

- **The Bible — King James Version** (English) — a Protestant Christian text. The KJV is an
  English translation, but the benchmark treats its *canonical language* as English (so English
  Bibles stay in the pool); the Qur'an and Talmud below are the genuine originals.
- **The Qur'an — Uthmani text, QUL** (Arabic) — the vocalised Arabic original.
- **The Talmud Bavli — William Davidson Edition** (Aramaic, © Sefaria, CC-BY-NC 4.0) —
  the Aramaic original, *not* the English translation.

(A text is "in the pool" when its language equals its `canonical_language` — see
[`pipelines/README.md`](pipelines/README.md).)

The benchmark asks **four kinds of question**: *retrieve_quote* ("what is the text of
⟨edition⟩ ⟨citation⟩?"), *complete_unit* ("complete this quote…"), *cite_passage* ("where in
⟨edition⟩ is this?", which shows the citation format by example) and *verify_source* ("is this
text from ⟨edition⟩? yes/no", sometimes with a deliberately wrong source to catch a model that
agrees too readily). The question set is built directly from the scripture text, so the same
command always builds the same set.

The run uses **three models** answering every question from memory (no web-search tool), exactly
the shape of the shipped reference run in
[`runs/original-2026-10-21/`](runs/original-2026-10-21/) — the full four-template,
all-17-texts, original-language-only run whose [`README.md`](runs/original-2026-10-21/README.md)
has the complete results write-up. Your tutorial run is a smaller, three-scripture version of
it, and step 8 compares the two in the same viewer.

## Before you start

You need two free tools installed:

- [`uv`](https://docs.astral.sh/uv/) — runs the Python part of the project. It handles
  everything Python needs for you; you do not have to know Python.
- [`pnpm`](https://pnpm.io/) (with Node 20 or newer) — runs the results viewer, step 8.

You only need an **AI model API key** if you want to do the paid step (6) yourself. This
tutorial uses the three-model **OpenRouter** panel that ships with the project, so that key is
an `OPENROUTER_API_KEY`. Put it in your terminal's environment (`export OPENROUTER_API_KEY=…`),
never in a file inside the project. (An alternative panel, `configs/models.example.yaml`, is an
Anthropic panel that also adds a web-search tool if you have an `ANTHROPIC_API_KEY` — not used
here.)

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

This creates the actual questions — each one built from a known passage whose text (or
citation) is the correct answer. It does **not** use any AI; the questions come directly
from the scripture text, so the set is identical every time you run it with the same settings.

```bash
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian/the-bible-kjv-en" \
  "texts/standardized/Sunni Islam/the-qur-an-uthmani-qul-ar" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-aramaic-he" \
  --per-text 40 --seed 20261011 \
  --out runs/my-run/questions.jsonl
```

The three quoted paths pick exactly our three scriptures. `--per-text 40` asks for 40
questions **per text**, split evenly across the four templates — **120 in all here** (30 of each
template); the default is `--per-text 28`. `--seed 20261011` is a fixed starting number that
makes the random selection repeatable, so the same command always builds the same set. The
questions are written to a brand-new folder, `runs/my-run/`, which keeps your work separate from
the shipped examples.

> To try the whole loop more cheaply first, use a smaller number like `--per-text 8`. A
> different `--per-text` or `--seed` produces a different question set. The shipped
> [`runs/original-2026-10-21/`](runs/original-2026-10-21/) is the full reference run to compare
> your results against in the viewer.

## 4. Audit — confirm nothing restricted slipped in

A free copyright check: it fails loudly if any file in your run was built from a
copyright-restricted source. Run it now on the questions, and again at the end.

```bash
uv --project pipelines run python -m sacredbench audit runs/my-run
```

## 5. Set up the model list for the paid step

This copies the ready-made three-model OpenRouter panel into place. It will not overwrite
a list you already have.

```bash
cp -n configs/models.openrouter.yaml configs/models.yaml
```

The models read your `OPENROUTER_API_KEY` from the environment, so there are no secrets in
this file.

## 6. Collect — ask the models the questions  💲 *the only paid step*

This sends every question to every model over the internet and records their answers.
**This is the step that costs money.** The cost scales with the number of
question-and-model combinations: the `--per-text 40` command above makes 120 questions ×
3 models = **360 combinations** — a couple of dollars on OpenRouter. For scale, the full
shipped reference run (`runs/original-2026-10-21`, 1,428 combinations) cost roughly **$13**.

```bash
uv --project pipelines run python -m sacredbench collect \
  runs/my-run/questions.jsonl configs/models.yaml --out runs/my-run/answers.jsonl
```

If some answers fail (a dropped connection, say), the command stops with an error and
leaves the rest in place — just run it again and it fills in only the missing ones. It
will refuse to run against a different question set than the one it started with, so you
can't accidentally mix things up.

> **Never point this at `runs/original-2026-10-21/`, `runs/tutorial-2026-10-11/`, or
> `runs/first-run-2026-10-11/`.** Those are the finished example runs; re-running here would
> either do nothing or overwrite their results. Always use your own `runs/my-run/` folder.

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
> editing. If a model happens to echo some copyrighted translation, the maintainers treat that
> as fair use for academic research, and the automated audit above still blocks anything derived
> from a *restricted* source.

**No API key?** Steps 6 and 7 need the paid run, so skip them and explore the shipped reference
run instead. Read its summary directly:

```bash
cat runs/original-2026-10-21/summary.md
```

The shipped run's [`README.md`](runs/original-2026-10-21/README.md) explains the headline
finding. An answer counts as **correct** when it contains the exact passage — a verbatim quote
wrapped in extra words ("According to Sefaria…", a link) still counts — and a model that **declines**
("I can't reliably reproduce that line") is marked **refused** and set aside, not counted wrong. So
each model gets two numbers you read together: **accuracy** (how often it's right *when it answers*)
and **coverage** (how often it answers at all). That pairing is the real story: a model can show a
high accuracy only because it stayed silent on most of the roster, which is exactly why coverage sits
right beside it. In that run the strongest model reaches 68% overall but answers only half the
`retrieve_quote` roster — it refuses the Arabic/Aramaic lines it can't recall rather than guessing —
while the famous KJV is answered at 100% accuracy by both frontier models (the small open model
manages only 16% even there).

## 8. View — see the results in your browser

This starts the local results viewer — a small website, running only on your own machine,
that shows the scoreboard and lets you click into individual answers.

```bash
pnpm -C apps/viewer install     # one-time setup: fetch the viewer's dependencies
pnpm -C apps/viewer dev         # then open the web address it prints
```

Open the address it prints. To land directly on the shipped reference run regardless of
which run is newest, add `?run=original-2026-10-21` to the address.

What you can look at:

- The **leaderboard** (`/`) ranks the models in the selected run by accuracy, with a **coverage**
  column of equal weight beside it, columns per scripture, and each model's token totals.
- A **run selector** lets you switch between runs (your own and the shipped examples);
  your choice is saved in the address so you can share or reload it.
- Click any model (or a scripture cell) to open the **error explorer** — every question with its
  outcome (correct / incorrect / **refused** / missing), the prompt, the expected passage, the
  model's answer, and the three scores side by side, filterable by outcome. This is where the
  "correct but wrapped in extra words" answers show as correct under the containment rule, and a
  declined answer shows a neutral **refused** label rather than a red "wrong".
- **Standings** (link in the header) shows each model's most recent result across all
  runs, so when you run your own tutorial panel its models appear here and the newest run for each
  model wins.

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
```
