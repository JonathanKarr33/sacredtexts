# Specification: Standings — promote tool-use to a real `panel.tools` field (Spec 8's Approach B)

<!--
SPEC vs PLAN BOUNDARY:
This spec defines WHAT and WHY. The plan defines HOW and WHEN.
Keep implementation phases, file paths, code, and ordering out of the spec.
-->

## Problem Statement

Spec 8 made a model's tool-use setting (Anthropic server-side web search on/off) part of the
panel identity the viewer's **standings** view rolls up on. Standings dedupes each model to
its most-recent result across all runs, keyed on `` `${panel.provider}\u0000${panel.model}` ``
(`apps/viewer/src/lib/aggregate.ts`). To make search-on and search-off never collapse into one
row **without touching the merged viewer** (a Spec 8 constraint), Spec 8 chose **Approach A**:
bake a *marker* into the emitted `panel.model` string — `claude-haiku-5-5 [no-tools]` /
`claude-haiku-5-5 [web_search]` — and keep the raw API model id recoverable in a
viewer-ignored `api_model` field.

That marker solved the collision but created a new defect, raised in the PR #9 integration
review (claude consult #1):

- The pre-Spec-8 **first run** (`runs/first-run-2026-10-11`) emits a *bare* panel model —
  `claude-haiku-5-5` — so its standings key is `anthropic\u0000claude-haiku-5-5`.
- Every Spec 8 run of the *same model with no tools* emits `claude-haiku-5-5 [no-tools]`, whose
  key is `anthropic\u0000claude-haiku-5-5 [no-tools]` — a **different** string.
- Because the keys differ, the newer no-tools run can **never supersede** first-run's bare
  row. A stale Oct-2026 first-run result sits in standings beside `claude-haiku-5-5 [no-tools]`
  forever, even though they are the same model run the same way (no tools). The marker, meant
  to separate genuinely different arms (search on vs off), also wrongly separates two runs that
  should dedupe.

Who is affected: anyone reading the `/standings` cross-run view — it shows a duplicated,
never-updating row for a model that a newer run already re-measured, defeating the "most recent
result per model" contract (Spec 2 requirement 6).

The clean long-term fix is the shape Spec 8 explicitly deferred as **Approach B** (rejected
*then* only because it required a viewer change, which was forbidden *then*): make the tool-use
setting a **first-class `panel.tools` field**, return `panel.model` to the raw API model id,
and have the viewer's standings key incorporate the tools field. The architect has now
authorised the viewer change, so Approach B is in scope.

## Current State

**Pipeline — the marker (Spec 8, Approach A).** The tool-use setting is already a fully
modelled, validated config input; only its *projection into the panel* uses the marker hack:

- `pipelines/sacredbench/config.py` — `ModelSpec.tools: tuple[str, ...]` exists and is parsed
  and **fail-fast validated** (`_parse_tools`, `TOOLS = ("web_search",)`,
  `_ANTHROPIC_ONLY_TOOLS`): a `tools` on a non-`anthropic` provider or an unknown value raises
  `ConfigError` at load. The tools tuple is order-independent (`tuple(sorted(set(...)))`).
- `pipelines/sacredbench/collect.py` — `_panel_fingerprint(m)` is
  `f"{m.provider}|{m.model}|{m.base_url or ''}|{','.join(m.tools)}"` — **already** incorporates
  the tools setting, and is stamped onto every answer row; the collect-resume and the
  score-time evidence-integrity cross-check (`cli.py`) both rely on it.
- `pipelines/sacredbench/providers.py` — honours `m.tools` on the Anthropic call
  (`WEB_SEARCH_TOOL`), unchanged by this work.
- `pipelines/sacredbench/cli.py` (`score`, ~lines 341–351) — builds the panel snapshot with
  the marker: `marked = f"{m.model} [{'+'.join(m.tools)}]" if m.tools else f"{m.model}
  [no-tools]"`, then `panel[m.id] = {"provider", "model": marked, "api_model": m.model,
  "endpoint", "price_in", "price_out"}`.
- `pipelines/sacredbench/score.py` (~lines 419–432) — re-emits each panel entry as
  `{provider, model (marked), api_model, endpoint, served_by}`. The synthesised-entry path
  (`score.py:421`, `for model_id in sorted(set(usage) | set(panel))`) builds a panel entry even
  for a model present in `usage` but absent from `panel`.
- `pipelines/sacredbench/score.py` (`summary_markdown`, ~lines 484–494) — renders a
  human-readable panel-composition table with columns `| model_id | provider | model | endpoint
  | served_by |`. Today the marker in `model` is the only thing distinguishing a search-on row
  from a search-off row in that table; with a raw `model`, `haiku` and `haiku-search` would show
  an **identical** `model` cell. `score`'s Markdown summary is written **only when
  `--summary-md` is passed** (`cli.py:360`).

**Viewer (Spec 2 / Spec 8).**
- `apps/viewer/src/lib/localResults.ts` — `PanelEntry` is `{provider, model, endpoint,
  served_by}`; `parseSummary` passes the `panel` object through structurally and **ignores any
  field not in that interface** (so an extra `tools` field already survives the parse at
  runtime — only the TypeScript type lacks it).
- `apps/viewer/src/lib/aggregate.ts` — standings key is
  `` p ? `${p.provider}\u0000${p.model}` : modelId `` (`aggregate.ts:59`); `StandingRow`
  carries `provider`/`model` but **no tools**. A run with no panel entry falls back to keying
  on the bare `model_id` (graceful degradation, preserved).
- `apps/viewer/src/routes/StandingsPage.tsx` — shows `row.modelId` as the primary label and
  `{provider} / {model}` as subtext; today the marker in `model` is what visually separates a
  search-on row from a search-off row in that subtext.

**Committed evidence.**
- `runs/tutorial-2026-10-11/summary.json` — a 4-entry panel (`opus`, `opus-search`, `haiku`,
  `haiku-search`) whose `panel.model` carries the marker and whose entries carry `api_model`.
- `runs/tutorial-2026-10-11/summary.md` (lines 27–30) — the committed Markdown proof table
  carries the **same markers** (`claude-haiku-5-5 [no-tools]`, etc.).
- `runs/tutorial-2026-10-11/README.md` (line 17) — prose that describes the marker as the
  panel-identity mechanism.
- `runs/first-run-2026-10-11/summary.json` — a 4-model panel with **no** tools concept and a
  **bare** `panel.model` (e.g. `claude-haiku-5-5`); it predates Spec 8.

**Authoritative docs that assert the marker (falsified by this change).**
- `codev/resources/arch-critical.md` (line 9) — **always-on hot-tier context**: asserts the
  tools setting is "baked into … the emitted `panel.model` (`[web_search]`/`[no-tools]`) … a
  zero-viewer-change property." Both claims become false.
- `codev/resources/arch.md` (lines 79, 103) — the cold reference describing the display model +
  `api_model` and the marker-based standings distinction.
- `CODE_WALKTHROUGH.md` (line 339) — cites the `cli.py:349` marker.
- `TUTORIAL.md` (line 199) — **user-facing**: tells readers the standings view shows
  `…[web_search]` / `…[no-tools]` rows.
  *(Spec 8's own `codev/plans/8-*`, `codev/projects/8-*`, `codev/reviews/8-*`, and
  `codev/state/aspir-8_thread.md` are historical records of what Spec 8 did and are left as-is.)*

**Tests that pin the current (marker) shape.**
- `apps/viewer/src/local/tutorialRun.test.ts` — asserts `panel[...].model ===
  "claude-…-5-5 [no-tools|web_search]"`, asserts the four marked standings keys, and asserts
  that first-run's bare `anthropic\u0000claude-haiku-5-5` is a **distinct** key that is **not**
  replaced (8 total rows). This test's premise is exactly the defect and must invert.
- `pipelines/tests/test_phase2_tools.py` and `pipelines/tests/test_tutorial_run.py` — assert
  the marked `panel.model`, the presence of `api_model`, and the allowed panel key-set
  `{provider, model, api_model, endpoint, served_by}`.
- `pipelines/tests/test_tutorial_run.py` additionally carries a **Python mirror of the viewer's
  standings key** — `_standings_key(entry)` (line 29) returns `` f"{provider}\u0000{model}" ``,
  `FIRST_RUN_KEY = "anthropic\u0000claude-haiku-5-5"` (line 20), and
  `test_panel_has_four_distinct_standings_identities` asserts `FIRST_RUN_KEY not in keys`
  (line 42). This mirror's key formula and the non-collision assertion both invert under
  Approach B (same defect as the TS side).
- `apps/viewer/src/lib/aggregate.test.ts`, `apps/viewer/src/routes/StandingsPage.test.tsx` —
  exercise the standings key / display (verified during implementation; see Risks).

## Desired State

The tool-use setting is a **real panel field**, not a string marker:

- **Pipeline emits `panel.tools`.** Each `summary.json` panel entry carries `tools` (a list of
  tool names, e.g. `[]` for no-tools and `["web_search"]` for search-on) and a **raw,
  unmarked** `model` equal to the true API model id (`claude-haiku-5-5`, never
  `claude-haiku-5-5 [no-tools]`). The now-redundant `api_model` field is dropped: with the
  marker gone, `model` already *is* the raw API model id.
- **The viewer's standings identity incorporates tools.** The standings key becomes
  `(provider, model, tools)` so that search-on and search-off for the same underlying model
  remain **distinct rows**, while two runs of the same model with the **same** tools setting
  **dedupe to one row** (most-recent wins).
- **Missing `tools` means "no tools".** A run with no `tools` field in a panel entry (the
  first run, and any pre-Spec-11 artifact) is treated by the viewer as an empty tool set, so
  its key equals that of an explicit no-tools entry. Consequently first-run's
  `claude-haiku-5-5` row and the tutorial's `haiku` (no-tools) row **share one standings key**
  and dedupe to a single row instead of orphaning each other forever.
- **Bare rows become supersedable — not "the tutorial always wins".** The defect was that the
  keys could *never* collide; the fix makes same-model/same-tools rows collide, so the
  standings rollup's existing most-recent-wins logic can finally apply to them. **Which** run
  supplies the single row is decided by that existing recency rule — run-directory filesystem
  **mtime** with an id-ascending tiebreak (`aggregate.ts`), **unchanged by this spec**. Because
  git does not preserve mtimes, two run dirs checked out together tie, and the tiebreak then
  favours the lexicographically-smaller id; making recency mtime-independent (so a
  calendar-newer run always wins) is Issue #7's `generated_at` work and is explicitly **out of
  scope** here. This spec delivers the collision/dedupe; it does not promise a specific winner
  between two same-date runs.
- **The standings display still distinguishes arms.** With `model` no longer carrying a marker,
  the standings row surfaces the tools setting in its own right (e.g. in the provider/model
  subtext), so a reader can still tell a search-on row from a search-off row.
- **The committed Markdown proof table keeps the arm distinction.** `summary_markdown`'s
  panel-composition table gains a `tools` column, so with a raw `model` the search-on and
  search-off rows remain distinguishable in the human-readable proof (consistent with
  `arch-critical.md`'s "tool-use is part of panel identity").
- **Committed evidence is migrated to the new shape.** `runs/tutorial-2026-10-11/`'s
  `summary.json` **and** `summary.md` are regenerated so the panel uses raw `model` + `tools`
  (no marker, no `api_model`) in both; its `scores.jsonl`/`answers.jsonl`/`questions.jsonl` and
  its per-question/usage numbers are **unchanged** (this spec does not touch scoring). The
  regeneration runs into a **fresh temporary location** (never a re-score in place over
  committed evidence — project lesson), is verified to leave `scores.jsonl` byte-identical, and
  only then are the two regenerated files copied into the committed run dir.
  `runs/first-run-2026-10-11` is left exactly as-is (it needs no `tools` field — the viewer
  defaults it to empty).
- **Falsified authoritative docs are corrected.** The always-on `arch-critical.md` entry, the
  `arch.md` reference, `CODE_WALKTHROUGH.md`, the user-facing `TUTORIAL.md` standings note, and
  the tutorial run's `README.md` are updated to describe the `panel.tools` field + viewer-key
  shape, so no future agent is told to restore the marker. Spec 8's historical plan/review/
  project/thread artifacts are **not** rewritten.
- **The test gate is green** (`.codev/checks/test.sh`: pipeline pytest + viewer vitest +
  audit), with the marker-era assertions (both the TS and the Python standings-key mirror)
  rewritten to the Approach-B shape and the standings **dedupe/collision** asserted.

The concrete improvement: the `/standings` page shows one row per `(provider, model, tools)`
arm — two runs of the same model-with-same-tools dedupe to one row (the stale permanent
duplicate is gone) — and the data model is the clean one (tools is its own field, the model id
stays pure).

## Success Criteria

- [ ] Every `summary.json` panel entry emitted by `score --config` carries a `tools` list and a
      raw, unmarked `model` equal to the configured API model id; no entry contains a
      `[no-tools]` / `[web_search]` marker in `model`, and the `api_model` field is no longer
      emitted.
- [ ] `tools` reflects the model's configured tool set: `[]` when none, `["web_search"]` when
      web search is enabled; it is serialised deterministically (sorted, matching the config's
      order-independent tools identity).
- [ ] The written panel snapshot remains **secret-free**: each entry's key-set is **exactly**
      (`==`, not merely a subset) `{provider, model, tools, endpoint, served_by}` — no
      `api_model`, no `price_in`/`price_out` (those exist only in the transient in-memory build),
      no keys/tokens.
- [ ] The synthesised-entry path in `score.py` (a model in `usage` but absent from `panel`)
      defaults `tools` to `[]` so every emitted panel entry has the field.
- [ ] The viewer's standings key incorporates the tools setting, so in the committed tutorial
      run the search-on and search-off variants of the same model render as **separate**
      standings rows (not collapsed).
- [ ] Two runs of the **same** `(provider, model, tools)` **dedupe to a single standings key**
      (one row, not two) — specifically, the tutorial run's no-tools `claude-haiku-5-5` entry
      and first-run's bare `claude-haiku-5-5` entry now produce the **same** key, so they no
      longer appear as two permanent rows. Which of the two supplies the surviving row follows
      the **existing, unchanged** mtime/id recency rule in `aggregate`; this spec does **not**
      assert that the tutorial specifically wins on an mtime tie (that would require Issue #7's
      `generated_at`-based recency, out of scope). Any test demonstrating directional
      supersession must do so by **injecting distinct mtimes**, and must separately assert the
      key **collision** (identity + resulting row count) as the real guarantee.
- [ ] A panel entry with **no** `tools` field (first run, legacy artifacts) is treated as an
      empty tool set by the standings key — the fallback is "no tools", so it keys **identically**
      to an explicit `tools: []` entry; not a crash and not a distinct "undefined-tools" key.
- [ ] A run with **no panel entry** for a model still degrades gracefully to keying on
      `model_id` (unchanged behaviour; not regressed).
- [ ] The standings page visibly distinguishes a search-on row from a search-off row for the
      same underlying model now that `model` carries no marker (the tools setting is shown).
- [ ] `summary_markdown`'s panel-composition table gains a `tools` column so the two arms of a
      model stay distinguishable in the human-readable proof once `model` is raw.
- [ ] `runs/tutorial-2026-10-11/`'s `summary.json` **and** `summary.md` are regenerated to the
      new panel shape (raw `model` + `tools`, no `api_model`, `summary.md` with the `tools`
      column); `scores.jsonl` is byte-for-byte unchanged and the per-question, per-tradition, and
      usage numbers are unchanged. Regeneration is performed into a **fresh temporary location**
      (not a re-score in place), verified byte-identical on `scores.jsonl`, then the two files
      are copied in.
- [ ] `runs/first-run-2026-10-11/` is unchanged (no `tools` field added); it still renders, and
      the audit (`audit runs/tutorial-2026-10-11`) still passes for the migrated tutorial run
      (origin-clean).
- [ ] The existing viewer committed-run gate (`realRun.test.ts` over
      `runs/first-run-2026-10-11`) and the `#86` built-CSS probe still pass.
- [ ] The marker-era assertions are rewritten to the Approach-B shape:
      `apps/viewer/src/local/tutorialRun.test.ts` asserts raw `panel.model` + `tools`, the
      tools-incorporating standings keys, the first-run/tutorial key **collision** (dedupe) and
      the corrected total row count (**7**: 4 tutorial arms + 3 non-overlapping first-run
      models); `pipelines/tests/test_tutorial_run.py` updates its Python standings-key mirror
      (`_standings_key` to include tools, `FIRST_RUN_KEY`) and **inverts** its
      `FIRST_RUN_KEY not in keys` assertion to assert the collision; both Python tests assert the
      new exact key-set (`tools`, no `api_model`); `pipelines/tests/test_phase2_tools.py` is
      updated likewise.
- [ ] The falsified authoritative docs are corrected (`codev/resources/arch-critical.md`,
      `codev/resources/arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md`,
      `runs/tutorial-2026-10-11/README.md`); Spec 8's historical artifacts are left as-is.
- [ ] `.codev/checks/test.sh` is green (pipeline pytest + viewer vitest + audit).

## Constraints

**Baked by the architect (Issue #11 + 2026-10-12 coordination note) — not relitigated:**

- Implement **Spec 8's Approach B**: a real `panel.tools` field + the viewer's standings key
  incorporating it (the viewer change is now explicitly authorised). Do **not** keep the
  Approach-A marker.
- Keep the diff **tight** to the tools-field + standings-key scope. builder-aspir-15 is working
  the scoring-contract issue (#15) in parallel and also touches `score.py`/`cli.py`
  (panel emission vs metrics) and possibly the viewer; whoever merges second rebases. Do not
  broaden into scoring/metrics territory.
- **Minimal clean shape wins** (maintainer values simplicity): `panel.tools` field + viewer key
  incorporates it + old bare rows become supersedable (dedupe). No cleverness beyond that.

**Observed-state constraints (from reading the code):**

- `ModelSpec.tools` parsing/validation and `_panel_fingerprint` are **already** tools-aware and
  **must not change** — the only gap Approach B closes is the *panel projection* and the
  *viewer key*. The collect-resume / score-time fingerprint cross-check stays intact.
- The scoring contract is **out of scope**: `_SUBMETRICS`, the per-task headline rules,
  `normalize()`, and every per-question/usage number stay exactly as they are. This spec moves
  identity metadata only.
- **Recency is out of scope.** The standings rollup's recency/tiebreak logic (`aggregate`'s
  mtime-desc / id-asc ordering) is **not** changed. This spec only makes the keys *collide* so
  that logic applies; it does not switch recency onto `generated_at` (that is Issue #7).
- The committed tutorial run must be migrated **as data**, preserving its collected answers and
  computed scores; re-running `collect`/`score` **in place** over committed evidence is
  forbidden (project lesson — a keyless run can null the committed proof). Regeneration must run
  into a **fresh temporary location**, be verified `scores.jsonl`-byte-identical, and only then
  have its `summary.json`/`summary.md` copied into the committed run dir.
- **Governance-doc update is in scope**, but limited to docs the change *falsifies*
  (`arch-critical.md`, `arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md`, the tutorial run's
  `README.md`). Spec 8's historical plan/review/project/thread artifacts record what Spec 8 did
  and are **not** edited.
- `runs/first-run-2026-10-11` is the viewer's committed-run gate target and is **not** modified.

## Assumptions

- `score` needs no API keys (it reads `answers.jsonl`), so regenerating the tutorial run's
  `summary.json`/`summary.md` via `score --config --summary-md` over the committed
  answers/questions — writing to a **fresh temp dir** — is a keyless, deterministic operation
  that reproduces the same scores/usage while emitting the new panel shape. (Verified in the
  plan by a byte-diff of `scores.jsonl`; if anything beyond the panel and the additive
  `generated_at` timestamp changes, fall back to a surgical panel-only edit of the committed
  `summary.json`/`summary.md`.)
- Because `parseSummary` passes the panel object through structurally, adding `tools` to the
  `PanelEntry` TypeScript type is sufficient for the viewer to read it — no new parse/validation
  branch is required (a malformed `tools` would be handled like any other unexpected panel value;
  the standings key derivation defaults a missing/empty `tools` to `[]`).
- The committed tutorial run's four `summary.models` keys (`haiku`, `haiku-search`, `opus`,
  `opus-search`) remain distinct in the leaderboard/explorer (which key on `model_id`), so only
  the *standings* rollup is affected by the key change — the leaderboard and explorer behaviour
  is unchanged.

## Solution Approaches

The *what* (real `panel.tools` field, viewer key incorporates it, old bare rows become
supersedable) is fixed by the Constraints. The open design choices are small and resolved here.

### Approach 1 — `panel.tools` as the field; drop `api_model` (CHOSEN)

Emit `panel[m.id].tools = list(m.tools)` and set `panel[m.id].model = m.model` (raw) in both
`cli.py` (the in-memory panel build) and `score.py` (the written snapshot, including the
synthesised-entry path, which defaults `tools` to `[]`). Remove the `marked = …` construction
and the `api_model` field. The viewer's standings key becomes `(provider, model, tools)`, and
`summary_markdown`'s panel table gains a `tools` column so the arms stay distinguishable in the
human-readable proof.

- **Pros:** the cleanest data model (tools is its own field; the model id is pure again), fewest
  moving parts, and `api_model`'s only reason to exist (recovering the raw id from a marked
  string) disappears. Makes same-model/same-tools rows dedupe directly.
- **Cons:** `api_model` removal is a (small) schema change two pipeline tests assert; those
  tests are rewritten anyway.
- **Risk:** low; confined to the panel projection, the markdown table, and the viewer
  key/display.

### Approach 2 — keep `api_model` alongside the new `tools` field (REJECTED)

Add `tools` but leave `api_model` in place "for safety".

- **Rejected:** with the marker gone, `api_model` always equals `model` — pure redundancy.
  Keeping it is cruft that works against the maintainer's simplicity preference. Dropping it is
  the clean shape.

### Approach 3 — committed-run migration: regenerate into a temp dir, copy back (CHOSEN; lesson-compliant)

Regenerate the tutorial run's `summary.json` **and** `summary.md` by running `score --config
--summary-md` over the committed `answers.jsonl` + `questions.jsonl`, writing all outputs to a
**fresh temporary directory** (never over the committed run dir — `lessons-critical.md`: "never
re-run collect/score over committed evidence; write to a fresh `runs/<id>/`"). This is keyless
(score reads answers, not the API) and the unchanged `_panel_fingerprint` makes the
evidence-integrity cross-check pass. Then **byte-diff** the temp `scores.jsonl` against the
committed one (must be identical) and confirm only the panel + the additive `generated_at`
differ in `summary.json`; only then copy the temp `summary.json`/`summary.md` into the committed
run dir.

- **Pros:** the committed artifact is exactly what the new code emits — no hand-authored data —
  while the committed evidence is never scored over in place.
- **Fallback:** if regeneration perturbs anything beyond the panel/`generated_at`, do a surgical
  panel-only edit of the committed `summary.json`/`summary.md` (raw `model`, add `tools`, drop
  `api_model`, add the `tools` column) leaving all other bytes untouched. Either way a pipeline
  test pins the migrated shape.

### Approach 4 — standings display of tools (CHOSEN: show tools in the row)

`StandingsPage.tsx` surfaces the tools setting in the provider/model subtext (e.g. the model
label followed by the tool set when non-empty) so search-on and search-off rows for the same
underlying model stay visually distinct now that `model` no longer carries a marker.
`StandingRow` gains a `tools` field populated from `panel.tools ?? []`.

## Open Questions

- **Nice-to-know — exact standings-key separator / tools serialisation in the viewer.** The key
  must incorporate tools unambiguously (e.g. a third `\u0000`-delimited segment of the sorted
  tools joined by a stable separator) and default a missing/empty tools to the same value an
  explicit no-tools entry produces. The precise string form is a plan decision; the requirement
  (search-on/off distinct, same-tools dedupe, missing ⇒ no-tools) is fixed.
- **Nice-to-know — standings subtext wording for tools.** How the tools setting is rendered in
  the row (a `[web_search]` suffix, a `· web_search` tag, etc.) is cosmetic; it must simply be
  present and legible for a non-empty tool set.
- **Resolved (consult iter-1) — does the tutorial actually supersede first-run in a clone?**
  No, and this spec does not claim it does. Recency is run-directory filesystem mtime
  (`aggregate`), which git does not preserve, so two same-date run dirs tie and the id-ascending
  tiebreak favours `first-run`. The deliverable is the key **collision** (dedupe); making
  recency calendar-accurate is Issue #7's `generated_at` work, out of scope under the tight-diff
  constraint.

## Test Scenarios

**Happy paths**
- `score --config` over a 2-model × search-{on,off} panel emits four panel entries whose
  `model` is the raw API id and whose `tools` is `[]` / `["web_search"]`; no `api_model`, no
  marker.
- Aggregating the migrated tutorial run yields four distinct standings rows (opus, opus-search,
  haiku, haiku-search) — search-on/off not collapsed.
- Aggregating the migrated tutorial run **and** first-run together: the tutorial's no-tools
  `claude-haiku-5-5` entry and first-run's bare `claude-haiku-5-5` entry resolve to the **same**
  standings key (one haiku-no-tools row, not two), so the total is **7 rows** (4 tutorial arms +
  3 non-overlapping first-run models). *(Which run supplies that single row depends on injected
  mtimes in the test; the guarantee asserted is the collision + the row count, not the winner.)*
- With distinct mtimes injected (tutorial newer), the surviving haiku-no-tools row is sourced
  from the tutorial run — demonstrating supersession is now *possible*, which the marker made
  impossible.
- The standings page renders the tools setting so a search-on row is visually distinct from a
  search-off row for the same model.
- `summary_markdown` renders a `tools` column so `haiku` and `haiku-search` are distinguishable
  in the committed Markdown proof table despite sharing a raw `model`.

**Edge cases**
- A panel entry with no `tools` field (first-run shape) keys identically to an explicit
  no-tools entry (missing ⇒ empty tool set).
- A run with no panel entry at all still keys on `model_id` (graceful fallback unchanged).
- Two runs of the same model with the **same** tools setting dedupe to one row (most-recent
  wins); two runs of the same model with **different** tools settings stay as two rows.

**Error conditions / integrity**
- The regenerated `runs/tutorial-2026-10-11/` leaves `scores.jsonl` byte-identical and the
  per-question / per-tradition / usage numbers unchanged (panel + `summary.md` migration only);
  `summary.json` and `summary.md` agree (no JSON-says-raw / MD-says-marker skew).
- `audit runs/tutorial-2026-10-11` still passes (origin-clean); the committed panel's key-set is
  exactly `{provider, model, tools, endpoint, served_by}` and carries no secrets.
- The Python standings-key mirror in `test_tutorial_run.py` now asserts the first-run/tutorial
  key **collision** (inverting its old `FIRST_RUN_KEY not in keys`).
- `realRun.test.ts` (first-run gate) and the `#86` CSS probe stay green; `.codev/checks/test.sh`
  is green overall.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A hardcoded-mtime test "passes" supersession while the real `/standings` shows the stale row (recency is git-unpreserved mtime, id-tiebreak favours first-run) | High | High | Do **not** claim a winner: assert the key **collision** + row count (7) as the guarantee; any directional-supersession test must inject distinct mtimes and is labelled as such; the spec names Issue #7 (`generated_at`) as the real recency fix, out of scope. |
| The viewer key change doesn't reach the exact string `aggregate.ts` builds, so dedupe silently fails | Low | High | Change the single key-construction site; assert the four-distinct-rows and the first-run/tutorial collision in `tutorialRun.test.ts` against the real committed runs before calling it done. |
| A missing `tools` field is keyed as a distinct "undefined" value, so first-run doesn't dedupe | Medium | High | Default `panel.tools` to `[]` in the key derivation; edge-case test (no-tools-field entry keys identically to explicit `tools: []`). |
| JSON/Markdown skew: regenerating `summary.json` without `--summary-md` leaves `summary.md` carrying the old marker | Medium | Medium | Regenerate with `--summary-md`; a pipeline test reading `summary.md` pins the migrated table (and the new `tools` column). |
| Regenerating the committed tutorial run perturbs `scores.jsonl`/usage (not just the panel) | Low | High | Score into a fresh temp dir (never in place); byte-diff `scores.jsonl`; fall back to a surgical panel-only edit if anything beyond panel/`generated_at` moves. |
| Missing the Python standings-key mirror (`test_tutorial_run.py` `_standings_key`/`FIRST_RUN_KEY`/`not in keys`), leaving a stale assertion that still enforces the old marker semantics | Medium | Medium | Named explicitly in the test-rewrite criterion: update the mirror to include tools and invert the non-collision assertion to a collision assertion. |
| Merge conflict with builder-aspir-15 (both touch `score.py`/`cli.py`) | Medium | Medium | Keep the diff confined to the panel projection + markdown-table lines; whoever merges second rebases (architect coordination note). |
| Other viewer tests (`aggregate.test.ts`, `StandingsPage.test.tsx`) assert the old key/subtext and red the suite | Medium | Low | Run the viewer suite early; update those assertions to the Approach-B shape as part of the change. |
| A falsified always-on doc (`arch-critical.md`) left stale instructs a future agent to restore the marker | Medium | Medium | In-scope doc-update criterion covers `arch-critical.md`/`arch.md`/`CODE_WALKTHROUGH.md`/`TUTORIAL.md`/run `README.md`; Spec 8's historical artifacts are deliberately left. |
| Dropping `api_model` breaks an unseen consumer | Low | Low | Grep confirms `api_model` is referenced only in `cli.py`/`score.py`/two pipeline tests and is viewer-ignored; remove it with those tests updated. |

## References

- Issue #11 — this spec's driver (PR #9 integration review, claude consult #1).
- `codev/specs/8-spec-3-tutorial-centered-on-kj.md` — **Approach A (chosen then)** and
  **Approach B (rejected then, chosen now)**; the standings/panel identity requirement.
- `apps/viewer/src/lib/aggregate.ts` (standings key), `apps/viewer/src/lib/localResults.ts`
  (`PanelEntry`, `parseSummary`), `apps/viewer/src/routes/StandingsPage.tsx` (row display),
  `apps/viewer/src/local/tutorialRun.test.ts` (the premise that inverts),
  `apps/viewer/src/local/realRun.test.ts` + `apps/viewer/src/deploy.test.ts` (gates that stay
  green).
- `pipelines/sacredbench/cli.py` (panel build + `--summary-md`), `pipelines/sacredbench/score.py`
  (panel snapshot, the synthesised-entry path, `summary_markdown` table),
  `pipelines/sacredbench/collect.py` (`_panel_fingerprint` — unchanged),
  `pipelines/sacredbench/config.py` (`ModelSpec.tools` — unchanged),
  `pipelines/tests/test_phase2_tools.py`, `pipelines/tests/test_tutorial_run.py` (incl. its
  `_standings_key`/`FIRST_RUN_KEY` Python mirror).
- `runs/tutorial-2026-10-11/summary.json` + `summary.md` + `README.md` (migrated/corrected),
  `runs/first-run-2026-10-11/summary.json` (unchanged), `.codev/checks/test.sh` (the gate).
- Docs the change falsifies: `codev/resources/arch-critical.md` (always-on), `codev/resources/
  arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md` (user-facing). `codev/resources/
  lessons-critical.md` — tool-use is part of panel identity; never re-run collect/score over
  committed evidence (the migration honours this via a temp-dir regenerate).
