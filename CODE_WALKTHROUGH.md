# CODE_WALKTHROUGH.md — extending sacredtexts

This is a map of the code for anyone who wants to **add to** the benchmark. If you only
want to *run* it, start with [`TUTORIAL.md`](TUTORIAL.md) instead; for a stage-by-stage
command reference see [`pipelines/README.md`](pipelines/README.md).

The benchmark is a pipeline: scripture texts go in, questions are built from them, AI
models answer the questions, and the answers are scored. Adding to it almost always means
one of two things, and this document is built as two **recipes** for exactly those:

- **Add a new text** — plug in another scripture (a translation, a tradition, a work).
- **Add a new evaluation task** — add another *kind* of question and grade it.

Both are deliberately small, drop-in changes: a new text is data plus one short
converter function; a new task is a handful of edits in two files. Neither touches the
shape of the pipeline itself.

Read the **codebase layout** below first so the file names in the recipes mean something,
then follow whichever recipe you need top to bottom.

> **About the `file:line` pointers.** Throughout, code is cited as `` `file.py:line` ``.
> The line numbers are correct as of writing but drift as code changes — the **function
> or symbol name is the reliable anchor**; if a line has moved, search for the name. A
> test (`pipelines/tests/test_code_walkthrough.py:72`) checks that every pointer still
> resolves to a real file and that the named symbols still exist, so this map can't rot
> silently.

---

## Codebase layout

The whole repository, with a one-line "what lives here, and when you'd open it" for each
entry. The recipes below refer back to these.

```
sacredtexts/
├── pipelines/                 The Python engine. One self-contained project run via `uv`.
│   └── sacredbench/
│       ├── catalogue.py       Reads texts/raw/**/source.yaml; defines the license enum. Open when changing what a source lists or how it's parsed.
│       ├── convert.py         Turns each raw source shape into the standard format. Open when adding a text (RECIPE A).
│       ├── schema.py          The standard document format (one scripture → one Document of Entries). Open to see the shape your converter must emit.
│       ├── generate.py        Builds the question set from standardized texts — no AI, fully repeatable. Open when adding a task (RECIPE B).
│       ├── collect.py         Sends questions to the models and records answers (the paid stage). Open to understand resumability / panel identity.
│       ├── config.py          Parses the model list (configs/models.yaml), including each model's tools. Open when touching model/tool config.
│       ├── providers.py       Talks to Anthropic / OpenAI-compatible / Gemini APIs. Open when adding a provider.
│       ├── score.py           Grades answers (exact / normalized / word-overlap). Open when adding a task (RECIPE B).
│       ├── audit.py           Copyright gate: fails if any artifact derives from a restricted source. Open to understand the licence enforcement.
│       ├── export.py          Assembles the shared "interchange" JSON and checks the merge is lossless.
│       └── cli.py             The command-line entry points (convert, generate, collect, score, …). Open to see how a stage is wired.
├── texts/
│   ├── raw/<tradition>/        Source scripture as obtained, one folder per tradition, each with a source.yaml catalogue. Add a text's data here (RECIPE A).
│   └── standardized/           Converted texts in the standard format. Rebuilt by `convert`; never committed.
├── runs/                       Finished benchmark runs (questions + answers + scores + summary). The two dated folders are shipped reference evidence — never overwrite them.
├── apps/viewer/                The local results website (leaderboard + error explorer). Read apps/viewer/README.md before touching it.
│   └── src/lib/explorer.ts     Derives the viewer's task/tradition filters from the data.
├── configs/                    models.example.yaml — the model list template copied to models.yaml for a run.
└── codev/                      Project process: specs, plans, reviews, and resources/arch.md (the system-shape reference).
```

Two facts hold everywhere and are worth keeping in mind:

- **The pipeline is four stages joined by files.** questions → answers → scores, each a
  `.jsonl` file (a text file with one JSON record per line). A new text or task flows
  through these stages as data; it does not change them.
- **What's committed is a copyright decision.** Public-domain / openly-licensed raw texts
  *are* stored in `texts/raw/`; copyright-**restricted** payloads and all of
  `texts/standardized/` are kept out and rebuilt locally. The audit (`audit.py`) enforces
  this on every commit.

---

## Recipe A — add a new text

Goal: get a new scripture into the benchmark as **data plus one converter function**, with
no change to the pipeline itself.

### 1. Put the raw source file in place

Drop the source JSON under `texts/raw/<tradition>/` (create the tradition folder if it is
new). This is the file exactly as you obtained it — whatever shape it came in.

> A tradition folder holds one **`source.yaml`** catalogue listing everything in it. Each
> `source.yaml` is parsed by `catalogue.py` (`pipelines/sacredbench/catalogue.py:155`).

### 2. Add a *target* to that folder's `source.yaml`

A `source.yaml` is a list of **targets**, where one target = one
`(work, version, language)` unit to convert. Add an entry under `targets:` with these
fields:

- `payload` — a filename or glob matching the raw file(s) from step 1.
- `converter` — the name of the converter function (step 3) that reads this shape.
- `work`, `version`, `language`, `document_type`, `tradition` — the identity of the text
  (`tradition` is a **list**).
- `license` — **the field that gates everything**: one of `public-domain`, `open`, or
  `restricted` (`LICENSES`, `pipelines/sacredbench/catalogue.py:46`). The optional
  `license_detail` keeps the real upstream licence string verbatim.

A target maps to the `Target` dataclass (`pipelines/sacredbench/catalogue.py:102`).
`select_targets()` (`pipelines/sacredbench/catalogue.py:259`) excludes `restricted`
targets from a normal `convert`. Set `license` honestly: mislabel a copyrighted text as
`open` and the copyright gate's first line of defence won't catch it (step 6).

### 3. Write the converter function

Add a function to `convert.py` that turns your raw shape into standard-format documents.
The contract is exactly:

```python
convert_target(paths: list[Path], target: Target) -> list[Document]
```

— `paths` are your target's resolved payload files, `target` carries the identity fields
from step 2, and you return a list of `Document`s. A `Document` (and its `Entry` list) is
the standard format, defined in `schema.py` (`pipelines/sacredbench/schema.py:52` and
`pipelines/sacredbench/schema.py:45`); one `Document` per `(work, version, language)`,
each `Entry` a `{unit_type, citation, text}` with the **exact** passage text.

> **Write the parser against the real data, not the format's name** — a hard-won project
> rule. Open the actual JSON first. `convert_nabre`
> (`pipelines/sacredbench/convert.py:246`) exists because the real file turned out to be
> a top-level *list* of books, not the per-book object its name suggested; `convert_lds_nested`
> (`pipelines/sacredbench/convert.py:160`) handles two different nesting depths in one
> function for the same reason. Converters **fail loudly** (`convert_target`,
> `pipelines/sacredbench/convert.py:422`) rather than skipping a shape they don't expect.
>
> Your `Document`s must survive the shared **interchange** merge without losing a citation
> or a tradition — load-time validation is `parse_document()`
> (`pipelines/sacredbench/schema.py:80`), and `tradition` is a list so texts can be shared
> across communities (`pipelines/sacredbench/schema.py:95`).

### 4. Register the converter

Add one line to the `CONVERTERS` dict (`pipelines/sacredbench/convert.py:411`) mapping
your converter's name (the string you put in `source.yaml`) to the function. That is the
entire wiring — `convert_target` looks the name up here and calls it. A name that isn't
registered fails loudly; it is never silently skipped.

### 5. Run convert, then validate

```bash
uv --project pipelines run python -m sacredbench convert
uv --project pipelines run python -m sacredbench validate texts/standardized
```

`convert` writes your text to `texts/standardized/<source-id>/<target-slug>/` (the path
convention enforced by `Target.standardized_dir`,
`pipelines/sacredbench/catalogue.py:122`); `validate` re-checks the result is well-formed.

### 6. Check the copyright audit

```bash
uv --project pipelines run python -m sacredbench audit runs/<your-run>
```

The audit (`audit_paths`, `pipelines/sacredbench/audit.py:114`) is the copyright gate and
also runs in the test suite. Its always-on layer matches each artifact's source against
the restricted catalogue (`restricted_keys`, `pipelines/sacredbench/audit.py:84`); a
second layer fingerprints restricted text content when the held-back payloads happen to be
present locally (`restricted_text_fingerprints`, `pipelines/sacredbench/audit.py:49`),
catching a restricted unit mislabeled with a public source.

> **Worked example — the Aramaic Talmud.** The cleanest recent walk of this recipe:
> `texts/raw/Judaism/source.yaml` declares the target, `convert_sefaria_talmud`
> (`pipelines/sacredbench/convert.py:356`) reads the real Sefaria export (strips HTML via
> `_clean_markup`, `pipelines/sacredbench/convert.py:351`, applies the daf-2a offset,
> merges all tractates into one document), and one line in `CONVERTERS`
> (`pipelines/sacredbench/convert.py:418`) wires it up. Data plus one function — a whole
> tradition in a non-Latin script, no core change.

The sampler that balances questions across traditions (`_balanced_sample`,
`pipelines/sacredbench/generate.py:143`) reads tradition generically, so your new text
becomes another bucket with no further edits.

---

## Recipe B — add a new evaluation task

Goal: add a new *kind* of question and grade it, without disturbing the shipped run
evidence or the scoring guarantees.

### 1. Add the task to `generate.py` — `TASKS`

Register the task name in the `TASKS` tuple (`pipelines/sacredbench/generate.py:48`).
Questions are built here with **no AI in the loop**, so a given seed always yields the
same set — that repeatability is the contract that makes a run auditable.

### 2. Give it a question template — `_build`

Add a branch to `_build()` (`pipelines/sacredbench/generate.py:102`) producing the
prompt and the ground-truth `expected` dict for your task. A built question is the
`Question` dataclass (`pipelines/sacredbench/generate.py:67`), with a content-derived id
from `_qid()` (`pipelines/sacredbench/generate.py:92`).

> If your task only applies to some texts (e.g. it needs a wrong "false-premise" work, or
> two versions of the same work), add a pool filter in the per-task loop
> (`pipelines/sacredbench/generate.py:246`). Determinism is anchored by
> `question_set_digest()` (`pipelines/sacredbench/generate.py:307`) and recorded by
> `build_manifest()` (`pipelines/sacredbench/generate.py:333`); `collect` stamps that
> digest on every answer and `score` checks it, so a run can never silently mix question
> sets.

### 3. Grade the task — `score_answer`

Add a branch to `score_answer()` (`pipelines/sacredbench/score.py:201`) returning your
task's metrics dict, including the headline `correct` flag. Every answer is graded on
three sub-metrics — exact, normalized, and word-overlap — selected per task in
`_SUBMETRICS` (`pipelines/sacredbench/score.py:108`).

> Existing tasks show the range of rules: `retrieve_quote` passes on a *normalized* match;
> others require the answer to *be* a specific label, or a single extracted citation to
> equal the expected one (`_single_citation_correct`,
> `pipelines/sacredbench/score.py:183`).

### 4. Know the matching backbone — `_SUBMETRICS` / `normalize`

The comparison engine is `normalize()` (`pipelines/sacredbench/score.py:115`), which runs
three passes **in a fixed order**: Unicode folding, then `strip_script_marks()`
(`pipelines/sacredbench/score.py:87`) which removes Arabic/Hebrew vowel marks *only within
those scripts* (so a vocalised verse matches its plain form), then the
punctuation/case/whitespace pass. The word-overlap metric is `token_f1`
(`pipelines/sacredbench/score.py:126`), explicitly a **v1 stand-in** for a future
semantic metric — the designated slot if your task needs similarity scoring.

> **Do not reorder those passes, and do not casually change `normalize()`.** English text
> is byte-for-byte unchanged by design, and the shipped English run was scored under the
> current rules. The guard that proves a scoring change didn't move old numbers is
> `test_rescoring_committed_run_reproduces_scores`
> (`pipelines/tests/test_first_run_regression.py:32`), which re-scores the committed
> answers and asserts the committed scores reproduce exactly. A new task should *add*
> evidence, not perturb the old — don't route around this test.

### 5. What flows through for free — and what NOT to touch

The summary rollup (`score_file`, `pipelines/sacredbench/score.py:235`;
`summary_markdown`, `pipelines/sacredbench/score.py:452`) keys on `(model, task)` and is
task-generic, so your task appears without extra work. The viewer's filters derive from
the data too (`explorerTasks`, `apps/viewer/src/lib/explorer.ts:47`; `filterQuestions`,
`apps/viewer/src/lib/explorer.ts:35`), so a new task shows up there with no code change.
The viewer is HeroUI-v3 and provider-less — read
[`apps/viewer/README.md`](apps/viewer/README.md) before touching it.

**Must NOT touch:**

- **The shipped run evidence.** Never re-run `generate`/`collect`/`score` over
  `runs/tutorial-2026-10-11/` or `runs/first-run-2026-10-11/`. Write to a fresh
  `runs/<id>/` (see [`TUTORIAL.md`](TUTORIAL.md)). A `collect` there resume-skips every
  cell; a keyless `score` overwrites the committed proof with nulls.
- **The regression guard** in `test_first_run_regression.py` (step 4).

### 6. Preserve the evidence-integrity invariants

A new task must keep every property that makes a committed run trustworthy:

- **Panel identity includes tool use.** A model cell's identity is `_panel_fingerprint()`
  (`pipelines/sacredbench/collect.py:32`), which folds in its `tools`, and the same
  tools identity is emitted as a real `panel.tools` list — the `model` stays the raw API
  id, with no inline marker — in the written panel snapshot (`score.py:430`), so the viewer
  keys standings on `(provider, model, tools)`: web-search-on and web-search-off stay
  distinct rows while same-model/same-tools runs dedupe. Tools are validated (and fail-fast
  on a non-Anthropic provider) by `_parse_tools` (`pipelines/sacredbench/config.py:59`; the
  `tools` field on the model spec is at `pipelines/sacredbench/config.py:50`).
- **Resumable collect.** Already-answered cells are skipped on re-run and a failed cell
  makes the run exit non-zero — nothing is silently dropped (`_existing`,
  `pipelines/sacredbench/collect.py:39`; the run driver `collect`,
  `pipelines/sacredbench/collect.py:73`).
- **Deterministic re-scoring.** `score_file` preserves row order and is a pure function of
  the answers — exactly what the byte-for-byte regression guard relies on.

---

## See also

- [`TUTORIAL.md`](TUTORIAL.md) — run the whole loop from a fresh clone.
- [`pipelines/README.md`](pipelines/README.md) — per-stage CLI reference and module map.
- [`texts/README.md`](texts/README.md) — the two-tier corpus layout and held-back sources.
- [`apps/viewer/README.md`](apps/viewer/README.md) — the local results viewer.
- [`codev/resources/arch.md`](codev/resources/arch.md) — system architecture (cold reference).
