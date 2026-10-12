# CODE_WALKTHROUGH.md — extending sacredtexts

A guided tour of the code for someone who wants to **augment** the benchmark —
not a tutorial on running it. If you want to run the loop end-to-end
(convert → validate → generate → audit → collect → score → view), start with
[`TUTORIAL.md`](TUTORIAL.md); for the stage-by-stage CLI reference see
[`pipelines/README.md`](pipelines/README.md); for the system-shape overview see
[`codev/resources/arch.md`](codev/resources/arch.md). This document walks the two
extension paths you are most likely to take and points at the real code that each
one touches.

The benchmark is **multi-faith by construction**: adding a corpus is drop-in data
(one converter-registry line + a data directory), and adding a *kind of question*
is a bounded set of edits to `generate.py` + `score.py`. Neither changes the core
pipeline shape — four subsystems (collection, scoring, analysis, visualisation)
joined by JSONL seams (`questions.jsonl` → `answers.jsonl` → `scores.jsonl`). Keep
that invariant in mind as you read.

Line numbers below are correct at time of writing; a test
(`pipelines/tests/test_code_walkthrough.py`) checks that every `file:line` pointer
in this document still resolves and that the symbols it leans on still exist. If a
pointer has drifted, search for the named symbol — the names are the stable anchor,
the lines are a convenience.

---

## (a) Adding a new text + its converter

Goal: get a new corpus (a translation, a new tradition, a new work) into the
benchmark without touching any core pipeline code.

### 1. Where corpora live — the two-tier `raw` → `standardized` layout

Texts live under `texts/` in two tiers (see [`texts/README.md`](texts/README.md)):

- **`texts/raw/<tradition>/`** — source JSON exactly as obtained, one directory
  per tradition, each carrying a committed **`source.yaml`** catalogue.
- **`texts/standardized/`** — the working-group flat-format documents produced from
  `raw/` by `sacredbench convert`. This tier is **gitignored and rebuilt locally**;
  nothing here is committed.

What is committed vs. held back is a **copyright** decision, not a convenience one:
public-domain / openly-licensed raw sources *are* committed under `texts/raw/`
(with their `source.yaml`); **restricted** payloads (NABRE, the Greek Orthodox TLG
extracts) and all of `texts/standardized/` are gitignored and rebuilt locally. A
restricted source still ships a committed `source.yaml` (with its payload absent)
so the catalogue stays complete and auditable — see the "Obtaining the held-back
sources" section of [`texts/README.md`](texts/README.md).

### 2. The catalogue: `source.yaml` as a *targets* manifest

Each tradition directory's `source.yaml` is a **targets manifest**, parsed by
`pipelines/sacredbench/catalogue.py`. A tradition holds many works/versions/shapes,
so a single flat record cannot describe it: instead each file has a `targets:` list,
and every target is one `(work, version, language)` conversion unit — see the
`Target` dataclass at `pipelines/sacredbench/catalogue.py:101` and the module
docstring for the YAML shape. Required fields and the fail-fast parse live in
`load_source()` (`catalogue.py:155`).

The field that gates everything is **`license`** — a three-value enum,
`LICENSES` at `pipelines/sacredbench/catalogue.py:46`
(`public-domain` / `open` / `restricted`). `select_targets()`
(`catalogue.py:259`) excludes `restricted` targets from `convert`/`generate` unless
`--include-restricted` is passed. The real upstream licence string is kept verbatim
in the optional `license_detail` field (e.g. the Talmud's `CC-BY-NC`).

A target's converted output lands under the **standardized-path convention**
`texts/standardized/<source-id>/<target-slug>/` (`Target.standardized_dir`,
`catalogue.py:122`). That convention is load-bearing: `generate` recovers a
document's licence from its path alone via `license_for_standardized_path()`
(`catalogue.py:296`), and that recovery is **fail-closed** — a standardized file
under no target directory is refused, never silently included
(`filter_standardized_paths`, `catalogue.py:329`).

### 3. The converter registry and its one function contract

Converters turn a source-JSON shape into standard-format `Document`s. They live in
`pipelines/sacredbench/convert.py`, and the registry is a single dict,
`CONVERTERS` at `pipelines/sacredbench/convert.py:411`. Dispatch is uniform:
`convert_target(paths, target)` (`convert.py:422`) looks up `target.converter` in
that dict and calls it. **Adding a source format = one function + one `CONVERTERS`
line.** The function contract is:

```python
convert_target(paths: list[Path], target: Target) -> list[Document]
```

where `paths` are the target's resolved payload files and `target` carries
`work`/`version`/`language`/`document_type`/`tradition`. Converters are **fail-fast**:
an unexpected shape raises `ConvertError` naming the offending file, and a target
whose `converter` is not registered raises `ConvertError` too (`convert.py:422`) —
"it lands in a later phase" rather than being skipped.

**Derive the format from the real reference data, not from docs.** This is a
hard-won project lesson. The converter docstring (`convert.py:1`) records cases
you would miss from documentation alone — e.g. LDS D&C is a 2-level
`{section: {verse}}` while the other LDS works are 3-level
`{book: {chapter: {verse}}}`, and encyclical paragraphs carry genuine duplicate
declared numbers. `convert_lds_nested` (`convert.py:160`) handles both LDS shapes
in one function; open the real JSON before you write the parser.

**The NABRE list-of-books cautionary example.** `convert_nabre`
(`pipelines/sacredbench/convert.py:246`) exists to merge NABRE book files into one
document — but note the docstring: the *real* `nabre.json` turned out to be a
**top-level list** of book objects (one file, 73 books), not the per-book
`{book, chapters}` object the shape was first written against. The converter now
accepts both (`convert.py:258`), and NABRE embeds chapter-heading strings inside the
first verse of a chapter, which are part of the source text and are deliberately
**not** stripped. The lesson: a shape assumed from the format name is a bug waiting
to happen; the converter is only correct because it was re-derived against the
payload.

### 4. The interchange format (and the losslessness requirement)

The standard flat JSON is defined in `pipelines/sacredbench/schema.py` — read the
module docstring (`schema.py:1`) for the full shape. One document per
`(work, version, language)`:

```json
{
  "source": {"tradition": ["..."], "work": "...", "version": "...",
             "language": "...", "document_type": "...", "source_url": "..."},
  "entries": [{"unit_type": "verse", "citation": "...", "text": "EXACT TEXT"}]
}
```

The `Document` / `Entry` dataclasses are at `schema.py:51` and `schema.py:44`;
serialisation is `Document.to_json_dict()` (`schema.py:61`); load-time validation is
`parse_document()` (`schema.py:80`), fail-fast on any malformed field.

**`tradition` is a LIST, not a string** (`schema.py:95`) — traditions *share* texts
(the Bible belongs to many Christian communities), so an entry can be attributed to
several. A bare string is accepted on load and normalised to a one-element list, but
new code should treat it as a list. The export/interchange assembly
(`pipelines/sacredbench/export.py`) **unions** traditions when it merges shards and
checks an inverse-grouping round-trip, which is what makes the merge **lossless** —
your converter's `Document`s must round-trip through this format without losing a
citation or a tradition.

### 5. How a new corpus flows through the pipeline untouched

Once the `source.yaml` target + converter exist, nothing else changes:

1. `convert` iterates the catalogue, dispatches each selected (non-restricted)
   target through `convert_target`, and writes standardized docs under the path
   convention.
2. `validate` mechanically re-parses the standardized docs (licence-agnostic).
3. `generate` loads standardized docs (restricted excluded, licence recovered from
   path) and samples questions over them.

None of these stages knows about your tradition specifically — it is **drop-in
data**. The one place balancing is tradition-aware is the sampler,
`_balanced_sample()` (`pipelines/sacredbench/generate.py:143`), which round-robins
over each tradition's sub-pool; it reads `doc.tradition[0]` generically, so a new
tradition simply becomes another bucket.

### 6. The copyright audit (and what an unregistered converter does)

The audit is the mechanical copyright gate — `pipelines/sacredbench/audit.py`, run
in the test gate via `.codev/checks/test.sh`. No committed artifact may derive from
a `restricted` source. Two layers (`audit_paths`, `audit.py:114`):

- **Origin (always on):** the artifact's source `(work, version, language)` is
  matched against the restricted catalogue keys (`restricted_keys`, `audit.py:84`).
  Since restricted payloads are never committed, origin is the enforceable proxy
  for "contains restricted text", and it is all that runs in CI / a fresh clone.
- **Content fingerprint (only when the held-back payload is present locally):**
  `restricted_text_fingerprints` (`audit.py:49`) converts the restricted targets and
  fingerprints their normalized unit texts, so a restricted unit *mislabeled* with a
  public source is still caught.

Two gotchas for a new corpus:

- Set `license` correctly in `source.yaml`. If you mislabel a copyrighted
  translation as `open`, the origin layer will not catch it (the whole point of the
  content layer, which only runs where the payload exists).
- A restricted target whose converter is **not** registered cannot be
  content-fingerprinted; the audit prints a WARNING and relies on the origin layer
  alone (`audit.py:68`). The origin layer still enforces it, so this is safe, but it
  is why you see the warning.

### 7. Worked example — the Talmud Bavli Aramaic target (Spec 8)

The Talmud-he corpus is the cleanest recent example of this whole path. It was
added as **data + one registry line**, no core changes:

- **Catalogue:** `texts/raw/Judaism/source.yaml` declares two targets that share one
  `source.yaml` — `William Davidson Edition - English` (`en`) and
  `William Davidson Edition - Aramaic` (`he`) — both `license: open` with the
  `CC-BY-NC` string in `license_detail`. The Aramaic target's payload glob
  deliberately excludes the one "Vocalized Aramaic" Shevuot variant so it does not
  collide with the standard Shevuot (see the comment in that file).
- **Converter:** `sefaria_talmud` (`pipelines/sacredbench/convert.py:356`), one entry
  in `CONVERTERS` (`convert.py:418`). It was derived from the real Sefaria export:
  `text` is indexed `[section][line]` where sections 0/1 are empty (tractates begin
  at daf 2a), so section `i` maps to daf `(i // 2) + 1` with side `a`/`b`; HTML
  markup is stripped (`_clean_markup`, `convert.py:351`) so the stored text is exact;
  all tractate files merge into one `Talmud Bavli` document, and a genuinely
  conflicting duplicate tractate is refused rather than silently resolved.

That is the entire footprint of adding a tradition in a non-Latin script.

---

## (b) Adding a new form of evaluation (a new task)

Goal: add a new *kind* of question (a new task) and score it, without corrupting the
committed run evidence or the re-score guarantees.

### 1. The task model in `generate`

Tasks are generated deterministically — **no LLM in the loop** — in
`pipelines/sacredbench/generate.py`. The task registry is the `TASKS` tuple
(`generate.py:48`); each task's prompt template and ground-truth `expected` dict are
produced by `_build()` (`generate.py:102`). A generated question is the `Question`
dataclass (`generate.py:66`): `id`, `task`, `prompt`, `expected`, `source`.

Determinism is the contract that makes a question set reproducible and auditable:

- **Seeded sampling.** `generate()` (`generate.py:181`) takes a `seed`; the whole
  pipeline downstream of it depends only on `(docs, seed)`. The corpus is sorted by a
  total key up front (`generate.py:208`) so input order never matters, and
  `_balanced_sample()` (`generate.py:143`) sorts each tradition's sub-pool by content
  before shuffling.
- **Content-derived IDs.** `_qid()` (`generate.py:92`) hashes task + source
  coordinates + text, so an id is stable across runs and unique by construction.
- **The question-set digest + manifest.** `question_set_digest()`
  (`generate.py:307`) hashes every question's full canonical JSON;
  `build_manifest()` (`generate.py:333`) records seed, params, `corpus_hash`
  (`generate.py:321`) and that digest. `collect` binds the digest into every answer
  row and `score` validates it — a resumed or scored run can never silently mix
  question sets.

To add a task you add it to `TASKS`, give it a template branch in `_build()`, and
(if it has eligibility rules, like `identify_version` being version-gated or
`verify_source` needing a false-premise wrong work) a pool filter in the per-task
loop (`generate.py:246`).

### 2. The scoring contract in `score.py`

Scoring lives in `pipelines/sacredbench/score.py`. For the text-retrieval tasks the reported
sub-metrics and the headline are set by the **selected graders** (default `strict` + `containment`
⇒ exact/normalized/token_f1/contains_reference); the provenance tasks declare their own fixed
sub-metrics. Every answered cell also gets an **outcome** (correct / incorrect / refused):

- The per-answer scorer is `score_answer()` (`pipelines/sacredbench/score.py:225`) —
  a branch per task returning its metrics dict, including the headline `correct` and
  (Spec 15) an `outcome` ∈ `correct` / `incorrect` / `refused`.
- `_SUBMETRICS` (`score.py:128`) fixes the sub-metrics for the NON-graded tasks
  (`identify_version`). The text-retrieval tasks (`retrieve_quote` / `complete_unit`)
  derive their sub-metric set from the **selected graders** instead
  (`graders.submetrics_for`, `graders.py:111`), so `--evaluator strict` emits only
  `exact`/`normalized` and `--evaluator containment` only `contains_reference`; `token_f1`
  is always-on.
- The **per-task headline `correct` rules** are in the module docstring (`score.py:1`) and
  `score_answer`: `retrieve_quote` / `complete_unit` = the OR of the selected graders'
  verdicts (default `normalized OR contains_reference`), `identify_version` requires the
  answer to *be* the version label, and `cite_passage` / `identify_source` require the
  single extracted citation to equal ground truth (a multi-candidate hedge scores 0, via
  `_single_citation_correct`, `score.py:207`).
- **Refusal is an OUTCOME, not a grader** (`_with_outcome`, `score.py:288`): a declined
  cell short-circuits the headline (`correct` → 0) and is reported `refused`, excluded from
  accuracy (`accuracy = correct/(correct+incorrect)`; coverage reports how often it answered).

Your new task adds a branch to `score_answer`. Adding a selectable **grader** is a different
extension — see the recipe just below.

### 2a. Adding an evaluator (a named grader)

A *grader* decides correct-vs-incorrect for the text-retrieval tasks and owns a set of
reported metric fields; graders are selectable by name on `score --evaluator`. To add one:

1. Register it in `GRADERS` (`pipelines/sacredbench/graders.py:49`) as a `Grader`
   (`graders.py:33`): its `name`, the `metric_keys` it owns, and a `verdict(metrics) -> bool`.
   An **inline** grader may own only keys `score_answer` already computes (the canonical
   primitives `exact`/`normalized`/`token_f1`/`contains_reference`) — enforced at import, so a
   stray key fails loudly rather than being silently dropped.
2. Nothing else for an inline grader: `resolve_evaluators` (`graders.py:86`) and
   `submetrics_for` (`graders.py:111`) pick it up, `score_answer` emits the selected graders'
   fields, and the headline becomes the OR of the selected verdicts. Add it to the default set
   with `default=True`.
3. A **paid / separate-pass** grader (the future Jev judge, issue #21) is a descriptor with
   `inline=False` and **no verdict callable**: `score` never runs it inline (selecting it fails
   fast), and a later resumable pass merges its declared `metric_keys` into each row's metrics
   map. The seam is deliberately minimal — do not assume evaluators are free/local/synchronous.

Do **not** make refusal a grader — it is an outcome (`_with_outcome`) that short-circuits
whichever graders run.

### 3. `normalize()` and why Latin byte-invariance is load-bearing

The matching backbone is `normalize()` (`pipelines/sacredbench/score.py:133`). Order
matters and is **not** to be reshuffled:

1. NFKD + unicode quote/dash folding;
2. `strip_script_marks()` (`score.py:105`) — **script-scoped**: it deletes
   Arabic/Hebrew combining marks (category `Mn`) and a small set of editorial code
   points *only within the RTL Unicode blocks*, and folds alef-wasla → bare alef and
   maqaf → space, so vocalised ↔ unvocalised scripture compares equal;
3. the punctuation + case-fold + whitespace pass.

Step 2 runs **before** the punctuation pass so marks are removed, not turned into
word splits. Critically, the RTL blocks are script-scoped so **Latin (and every
other script) is byte-for-byte unchanged** — read the long comment at `score.py:77`.
This invariance is load-bearing because the committed English `first-run-2026-10-11`
evidence was scored under the old `normalize()`; the regression test
`test_rescoring_committed_run_reproduces_scores`
(`pipelines/tests/test_first_run_regression.py:32`) re-scores that committed
`answers.jsonl` and asserts the committed `scores.jsonl` reproduces **byte-for-byte**.
If your task changes `normalize()`, this guard is what tells you whether you moved
Latin scoring over ~400 real answers. Don't route around it.

### 4. What a new task touches — and what it must NOT

**Touches:**

| Concern | Where |
|---|---|
| Generation (template + eligibility) | `generate.py` — `TASKS` (`generate.py:48`), `_build` (`generate.py:102`) |
| Per-task scoring rule | `score.py` — `score_answer` (`score.py:225`), graders (`graders.py:49`), `_SUBMETRICS` (`score.py:128`) |
| Summary rollup + per-tradition breakdown | `score.py` — `score_file` (`score.py:344`), `summary_markdown` (`score.py:605`) |
| Viewer explorer filters | `apps/viewer/src/lib/explorer.ts` — `explorerTasks` (`explorer.ts:52`), `filterQuestions` (`explorer.ts:40`) |

The summary and the viewer are mostly task-generic — `score_file` keys its
accumulators on `(model_id, task)` and the tradition breakdown counts each
observation once per *listed* tradition, so a new task flows through; the explorer
derives its task-filter options from the data (`explorerTasks`), so a new task
appears without a code change there. The viewer is HeroUI-v3 and provider-less —
read [`apps/viewer/README.md`](apps/viewer/README.md) before touching it.

**Must NOT touch:**

- **Committed run evidence.** Never re-run `generate`/`collect`/`score` over
  `runs/tutorial-2026-10-11/` or `runs/first-run-2026-10-11/`. A `collect` there
  resume-skips every cell (zero calls) and a keyless `score` overwrites the committed
  panel/usage proof with nulls. Write to a fresh `runs/<id>/` (see
  [`TUTORIAL.md`](TUTORIAL.md), Track B).
- **The re-score regression guards.** `test_first_run_regression.py` is the proof
  that a scoring change did not disturb committed numbers. A new task should *add*
  evidence, not perturb the old.

  **Sanctioned exception:** a deliberate scoring-contract change (e.g. Spec 15's
  containment headline and refused outcome) *does* reshape committed `scores.jsonl`, so
  the byte guards are rebaselined **on purpose, once, with evidence** — a durable
  projection-SHA oracle + an exact pre-registered flip/refused set
  (`test_contains_reference_rebaseline.py`) witnesses that only the intended fields moved.
  That is the *only* reason to regenerate committed evidence; a keyless re-score is still the
  scar. Surface the moved numbers to the architect before writing the prose.

### 5. The pluggable semantic-metric slot (an open working-group question)

`token_f1` (`pipelines/sacredbench/score.py:144`) is explicitly the **v1 semantic
stand-in** — the module docstring (`score.py:1`) flags that embedding- or
judge-based semantic scoring is a later, pluggable metric. If you are adding an
evaluation that needs semantic similarity, this is the designated slot; it is an open
group question, not a settled interface. A judge-based semantic grader is expected to
arrive as the **separate-pass grader seam** (issue #21) described in the "Adding an
evaluator" recipe above — `inline=False`, no inline verdict, merged by its own resumable
pass — precisely because it would be paid and non-local, which the inline grader path
assumes away.

A worked caution lives in the committed tutorial run
([`runs/tutorial-2026-10-11/README.md`](runs/tutorial-2026-10-11/README.md)): the
**contains-exact-reference** follow-up cut found that `token_f1` is *not* a reliable
wrapper detector (a short Arabic/Aramaic quote diluted by an English caveat sits near
a median `token_f1` of ~0.45, not ~1.0). The reliable signal there was whether the
normalised reference text is *contained* in the answer. Read that before designing a
new similarity metric — it tells you what the v1 metric can and cannot see.

### 6. Evidence-integrity invariants a new evaluation must preserve

These are the properties that make a committed run trustworthy. A new evaluation
must keep all of them:

- **Question-set digest stamping.** `collect` stamps the digest into every answer row
  (`collect.py:84`, written at `collect.py:129`) and refuses to resume an
  `answers.jsonl` built for a different question set; `score` refuses a file that
  mixes digests or whose digest does not match `--questions` (`score.py:394`).
- **Panel fingerprints — including tool-use identity.** A model cell's identity is
  `_panel_fingerprint()` (`pipelines/sacredbench/collect.py:32`), which includes its
  `tools`, so a web-search-on cell can never be resumed as web-search-off. The same
  tools identity is baked into the emitted `panel.model` marker
  (`[web_search]` / `[no-tools]`) in `cli.py:349`, so search-on and search-off never
  collapse or collide in the viewer's standings key. Tools are validated — and
  fail-fast on a non-Anthropic provider — in `config.py` (`_parse_tools`,
  `config.py:59`; `tools` on `ModelSpec`, `config.py:50`).
- **Resumable collect.** Already-answered `(question_id, model_id)` cells are skipped
  on re-run (`_existing`, `collect.py:39`; the pending-cell list is built at
  `collect.py:113`), and a failed cell stays pending and makes the run exit non-zero —
  nothing is silently dropped.
- **Deterministic re-scoring.** `score_file` preserves input-row order and is a pure
  function of the answers, which is exactly what the byte-for-byte regression guard
  (`test_first_run_regression.py:32`) relies on.

---

## See also

- [`TUTORIAL.md`](TUTORIAL.md) — run the whole loop from a fresh clone.
- [`pipelines/README.md`](pipelines/README.md) — per-stage CLI reference and module map.
- [`texts/README.md`](texts/README.md) — the two-tier corpus layout and held-back sources.
- [`apps/viewer/README.md`](apps/viewer/README.md) — the local results viewer.
- [`codev/resources/arch.md`](codev/resources/arch.md) — system architecture (cold reference).
