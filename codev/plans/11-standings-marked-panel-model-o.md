# Plan: Standings — promote tool-use to a real `panel.tools` field (Spec 8's Approach B)

**Specification**: [codev/specs/11-standings-marked-panel-model-o.md](../specs/11-standings-marked-panel-model-o.md)

## Executive Summary

The spec's **Approach 1 (CHOSEN)** replaces Spec 8's `panel.model` marker with a real
`panel.tools` field: `panel.model` returns to the raw API model id, each entry carries a `tools`
list, `api_model` is dropped (redundant once `model` is pure), and the viewer's standings key
becomes `(provider, model, tools)` with a missing/empty `tools` defaulting to "no tools". This
makes same-model/same-tools rows **dedupe** (the fix) while search-on/off stay distinct. Recency
(which run wins a deduped key) is the existing mtime rule, **unchanged** — making it
calendar-accurate is Issue #7, out of scope.

**Phasing is driven by one hard constraint: the full `.codev/checks/test.sh` must be green at
every phase commit.** `pipelines/tests/test_tutorial_run.py` and
`apps/viewer/src/local/tutorialRun.test.ts` both read the **committed**
`runs/tutorial-2026-10-11/summary.json`, and the viewer's standings dedupe depends on both the
migrated artifact *and* the tools-aware key. Migrating the run, switching the viewer key, and
updating those committed-run tests are therefore **mutually dependent** and land together
(Phase 2). The pure code-emission change — which is only exercised by hand-built-panel tests —
lands first and green (Phase 1), because it touches no committed artifact and no consumer. Docs
the change falsifies are corrected last (Phase 3).

A note on the parallel builder (architect coordination, 2026-10-12): builder-aspir-15 (#15) also
edits `score.py`/`cli.py`. Phase 1 confines its pipeline edits to the panel-projection and
markdown-table lines to minimise conflict; whoever merges second rebases.

## Phases (Machine Readable)

<!-- REQUIRED: porch parses this JSON to track phase progress. Keep it in sync; at least two phases. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Pipeline emits panel.tools (raw model, no api_model)"},
    {"id": "phase_2", "title": "Viewer keys standings on tools; migrate committed run"},
    {"id": "phase_3", "title": "Correct falsified marker docs"}
  ]
}
```

## Phase Breakdown

### Phase 1: Pipeline emits `panel.tools` (raw model, no `api_model`)

**Dependencies**: None

#### Objective

Make `score --config` emit the Approach-B panel shape: raw `panel.model`, a `panel.tools` list
(default `[]`), no `api_model`; and give `summary_markdown`'s panel-composition table a `tools`
column so the arms stay distinguishable once `model` is raw. This is the clean schema every
*future* run gets. No committed artifact is touched, so every existing consumer (the committed
tutorial run and its tests, the unchanged viewer) still sees the old shape — the full suite stays
green.

#### Files to Create / Modify

- `pipelines/sacredbench/cli.py` — in the `score` panel build (~lines 341–351): replace
  `marked = …` + `"model": marked, "api_model": m.model` with `"model": m.model,
  "tools": list(m.tools)`. Keep `provider`/`endpoint`/`price_in`/`price_out`. Update the
  adjacent comment (no longer a "marker").
- `pipelines/sacredbench/score.py` — in the written panel snapshot (~lines 419–432): emit
  `"model": p.get("model") or um.get("model")` (raw) and `"tools": p.get("tools") or []`
  (so the synthesised-entry path, `set(usage) | set(panel)`, defaults to `[]`); remove the
  `api_model` line. In `summary_markdown` (~lines 484–494): add a `tools` column to the panel
  table header, separator, and row (`", ".join(p.get("tools") or []) or "—"`).
- `pipelines/tests/test_phase2_tools.py` — update **two** test paths:
  (a) the `score_file`-level hand-built-panel assertions (~238–259): raw `model` + `tools`, no
  `api_model`, key-set `== {provider, model, tools, endpoint, served_by}` — this covers
  **score.py** only; and
  (b) a **CLI-level** test that exercises **cli.py**'s panel build. The `cli.py score` panel path
  is inline behind the fingerprint cross-check, so a hand-built dict can't reach it — follow the
  existing `test_score_config_drift_from_answers_refused` recipe (~106–137): monkeypatch
  `collect_mod.complete`, run `collect` to write *fingerprinted* answers, then
  `CliRunner().invoke(app, ["score", str(answers), "--config", …, "--questions", …, …])` and
  assert the written `summary.json` panel has raw `model` + `tools`, no `api_model`. Without (b),
  `cli.py`'s new emission would ship with zero coverage until the Phase-2 migration first runs it.

#### Deliverables

- [ ] `cli.py` panel build emits `{provider, model (raw), tools, endpoint, price_in, price_out}`.
- [ ] `score.py` written entry is exactly `{provider, model (raw), tools, endpoint, served_by}`;
      synthesised entries default `tools` to `[]`.
- [ ] `summary_markdown` panel table has a `tools` column.
- [ ] `test_phase2_tools.py` covers **both** score.py (via `score_file`) and cli.py (via
      `CliRunner` over collect-written fingerprinted answers) emitting the new shape (raw model,
      `tools`, no `api_model`, exact key-set with `==`).
- [ ] Tests for this phase (above) pass; no committed run artifact is modified in this phase.

#### Acceptance Criteria

- [ ] `uv --project pipelines run pytest` green.
- [ ] `.codev/checks/test.sh` green overall (the committed tutorial run and both its
      committed-run tests — pipeline and viewer — are untouched and still agree on the old shape).
- [ ] `grep` shows no `api_model` and no `[no-tools]`/`[web_search]` marker produced by
      `cli.py`/`score.py`.

#### Test Plan

- Unit: `test_phase2_tools.py` builds a 2-model (search on/off) config, runs the `cli.py`
  panel-build path + `score_file`, asserts each entry's key-set `== {provider, model, tools,
  endpoint, served_by}`, `model` raw, `tools` `[]`/`["web_search"]`, no `api_model`.
- Unit: a `summary_markdown` assertion that the panel table renders a `tools` column and shows
  `web_search` on the search-on row and `—`/empty on the no-tools row.
- Regression: the whole pipeline suite stays green; the committed-run test `test_tutorial_run.py`
  is **not** changed here and still passes against the still-old committed file.

### Phase 2: Viewer keys standings on tools; migrate committed run

**Dependencies**: Phase 1 (needs the new emission to regenerate the committed run faithfully)

#### Objective

Switch the viewer's standings identity to `(provider, model, tools)` (missing ⇒ `[]`), surface
the tools setting in the standings row, migrate the committed `runs/tutorial-2026-10-11/` to the
Approach-B shape, and update every committed-run test. This is the atomic "Approach-B switchover":
after it, the tutorial's four arms are distinct rows and the tutorial-no-tools / first-run-haiku
keys **collide** (dedupe). Done together because the migrated artifact, the new key, and the
committed-run tests are mutually dependent for a green suite.

#### Files to Create / Modify

- `apps/viewer/src/lib/localResults.ts` — add `tools?: string[]` to `PanelEntry`
  (`parseSummary` already passes `panel` through structurally; no parse branch needed).
- `apps/viewer/src/lib/aggregate.ts` — standings key becomes
  `` p ? `${p.provider}\u0000${p.model}\u0000${[...(p.tools ?? [])].sort().join(",")}` : modelId ``;
  `StandingRow` gains `tools: string[]`, populated `p?.tools ?? []`. (Sort defensively even
  though the pipeline already sorts, so a hand-written summary can't produce an order-dependent
  key.) **Also update the now-false in-code text**: the `StandingRow.key` doc comment and the
  `aggregate()` docstring both state the key is `` `${provider}\u0000${model}` `` — correct them
  to the tools-aware key.
- `apps/viewer/src/routes/StandingsPage.tsx` — render the tools setting in the provider/model
  subtext when non-empty (e.g. `… [web_search]`), so raw-model rows for different arms are
  visually distinct. **Also update the now-false text**: the header comment (lines ~9–10) and the
  **user-visible** blurb (~line 97, "keyed on the panel's provider + model") — both must mention
  tools, so the Phase-2 commit isn't self-contradictory.
- `runs/tutorial-2026-10-11/summary.json` **and** `summary.md` — **migrated** (see Test Plan:
  regenerate into a temp dir, byte-diff `scores.jsonl`, copy the two files in).
- `runs/tutorial-2026-10-11/README.md` (line 17) — update the panel-identity prose to the
  `panel.tools` shape **in this phase** (not Phase 3): leaving it to the doc sweep would make the
  Phase-2 commit a run dir whose `summary.json` carries `tools` while its own README still
  describes the marker.
- `apps/viewer/src/local/tutorialRun.test.ts` — rewrite: assert raw `panel.model` + `tools`;
  assert the four distinct standings keys (now tools-aware); **invert** the first-run collision
  assertion (the tutorial-no-tools haiku key now equals first-run's bare haiku key); assert total
  rows **7**.
- `pipelines/tests/test_tutorial_run.py` — update `_standings_key` to include a tools segment and
  `FIRST_RUN_KEY` accordingly; **invert** `FIRST_RUN_KEY not in keys` → `in keys`; rename/rewrite
  `test_panel_is_secret_free_carries_api_model_and_is_unpriced` to assert `tools` present and the
  exact key-set `== {provider, model, tools, endpoint, served_by}` (drop the `api_model`
  assertion); tighten `⊆` to `==`. **Add a committed-`summary.md` assertion** (the real JSON/MD
  skew guard): the migrated `summary.md` panel table has a `tools` column with `web_search` on the
  `-search` rows and empty/`—` on the no-tools rows.
- `apps/viewer/src/lib/aggregate.test.ts`, `apps/viewer/src/routes/StandingsPage.test.tsx` —
  update any assertions on the old `(provider, model)` key or the marker subtext to the new shape
  (verify by running the suite; add a tools-dedupe / missing-tools edge case where natural).

#### Deliverables

- [ ] `PanelEntry.tools` type; `aggregate` key incorporates sorted tools with missing ⇒ `[]`;
      `StandingRow.tools` populated.
- [ ] `StandingsPage` shows the tools setting for a non-empty tool set.
- [ ] Committed `runs/tutorial-2026-10-11/summary.json` + `summary.md` carry raw `model` +
      `tools` (no marker, no `api_model`; md has the `tools` column); `scores.jsonl`,
      `answers.jsonl`, `questions.jsonl` byte-unchanged.
- [ ] `tutorialRun.test.ts`: four distinct arm keys, first-run/tutorial key collision, 7 rows.
- [ ] `test_tutorial_run.py`: mirror updated + collision asserted + exact new key-set + committed
      `summary.md` `tools`-column assertion (JSON/MD skew guard).
- [ ] `aggregate.ts`/`StandingsPage.tsx` in-code + user-visible text and the run `README.md`
      updated to the tools-aware shape (no self-contradiction in the Phase-2 commit).
- [ ] `aggregate.test.ts` / `StandingsPage.test.tsx` updated; tests for this phase pass.

#### Acceptance Criteria

- [ ] `.codev/checks/test.sh` green (pipeline pytest + viewer vitest + audit).
- [ ] `pnpm -C apps/viewer check-types` green — `tsc --noEmit` is **not** in the dispatcher gate,
      so the new `PanelEntry.tools` / `StandingRow.tools` fields must be typechecked explicitly or
      type breakage ships silently.
- [ ] `audit runs/tutorial-2026-10-11` passes; the committed panel key-set is exactly
      `{provider, model, tools, endpoint, served_by}` and secret-free.
- [ ] Standings over both committed runs = 7 rows; the four tutorial arms are distinct; the
      tutorial-no-tools haiku and first-run haiku share one key.
- [ ] `realRun.test.ts` (first-run gate) and the `#86` CSS probe still pass.
- [ ] `first-run-2026-10-11/` is unmodified (`git status` clean for it).

#### Test Plan

- **Migration procedure (manual, scripted, no in-place re-score):**
  1. `uv --project pipelines run python -m sacredbench score
     runs/tutorial-2026-10-11/answers.jsonl --questions runs/tutorial-2026-10-11/questions.jsonl
     --config configs/models.example.yaml --scores-out <TMP>/scores.jsonl --summary-out
     <TMP>/summary.json --summary-md <TMP>/summary.md` where `<TMP>` is a fresh scratch dir.
     Note `answers` is a **positional** argument (`cli.py score`), not `--answers`; everything
     else is an option.
  2. `diff runs/tutorial-2026-10-11/scores.jsonl <TMP>/scores.jsonl` → **must be empty**.
  3. Confirm `<TMP>/summary.json` differs from the committed one only in the `panel` block and
     the `generated_at` timestamp (a `jq`/diff spot-check on `models`/`by_tradition`/`usage`).
  4. Copy `<TMP>/summary.json` and `<TMP>/summary.md` over the committed ones. **Fallback** if
     step 2/3 shows any other drift: surgically edit the committed `summary.json`/`summary.md`
     panel only (raw `model`, add `tools` from the old marker, drop `api_model`, add md `tools`
     column), leaving all other bytes untouched.
- Unit (viewer): `aggregate` dedupe — two runs, same `(provider, model)` with (a) same tools
  dedupe to one row, (b) different tools stay two rows; a panel entry with **no** `tools` field
  keys identically to explicit `tools: []`; a no-panel run still keys on `model_id`.
- Unit (viewer, directional supersession): a test that **injects distinct mtimes** (tutorial
  newer) and asserts the surviving haiku-no-tools row is sourced from the tutorial — labelled as
  demonstrating supersession is now *possible*; the key-collision + 7-row count is asserted
  separately as the real guarantee.
- Integration: `tutorialRun.test.ts` end-to-end over the two real committed runs.
- Manual: `pnpm --dir apps/viewer dev` (or the project `run` path), open `/standings`, confirm 7
  rows and that `haiku` vs `haiku-search` are visually distinguishable.

### Phase 3: Correct falsified marker docs

**Dependencies**: Phase 1, Phase 2 (docs describe the shipped behaviour)

#### Objective

Update the authoritative docs the change falsifies so no future agent is instructed to restore
the marker, and the user-facing tutorial matches what `/standings` now shows. (The in-code/UI
text in `aggregate.ts`/`StandingsPage.tsx` and the run `README.md` were already corrected in
Phase 2, so this phase is the remaining prose: arch docs, the walkthrough, and the tutorial.)
Spec 8's historical plan/review/project/thread artifacts are left as records of what Spec 8 did.

#### Files to Create / Modify

- `codev/resources/arch-critical.md` (line 9) — rewrite the "Tool-use is part of panel identity"
  fact: tools is a real `panel.tools` field; the viewer's standings key is
  `provider\u0000model\u0000tools`; it is **no longer** a "zero-viewer-change property". Use the
  `update-arch-docs` skill (hot-tier edit; keep within the cap).
- `codev/resources/arch.md` (lines 79, 103) — update the panel/standings description (raw
  `model` + `tools` field; drop the `api_model`/marker language). Via `update-arch-docs`.
- `CODE_WALKTHROUGH.md` (line 339) — update the `cli.py` panel-identity description.
- `TUTORIAL.md` (line ~199; also check line 144) — the standings section tells readers to look
  for `…[web_search]`/`…[no-tools]` rows; update to describe the raw-model rows + the tools
  indicator. (Line 144 refers to the `tools: [web_search]` *config*, still valid — verify, leave
  if accurate.)
  *(`runs/tutorial-2026-10-11/README.md:17` is handled in Phase 2, with the run migration, so the
  Phase-2 commit is self-consistent.)*

#### Deliverables

- [ ] `arch-critical.md`, `arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md` describe the
      `panel.tools` + viewer-key shape; no stale marker *instruction* remains.
- [ ] Spec 8's `codev/plans/8-*`, `codev/projects/8-*`, `codev/reviews/8-*`,
      `codev/state/aspir-8_thread.md` are **not** modified.
- [ ] Tests for this phase: `.codev/checks/test.sh` still green (docs do not affect tests;
      `CODE_WALKTHROUGH.md` has a pointer-line-range test — keep its `_REQUIRED_SYMBOLS` intact);
      the scoped grep (below) confirms no authoritative doc still prescribes the marker.

#### Acceptance Criteria

- [ ] A **scoped** grep returns nothing — run it over the authoritative docs only and allow the
      legitimate survivors: `grep -rn "no-tools\|\[web_search\]\|api_model" codev/resources/arch-critical.md
      codev/resources/arch.md CODE_WALKTHROUGH.md TUTORIAL.md`, where the sole permitted hit is
      `TUTORIAL.md:144` (`tools: [web_search]` is valid *config*, not a standings-row instruction).
      Explicitly **not** scanned (legitimate marker mentions): `configs/models.example.yaml`
      (`tools: [web_search]` config) and Spec 8's historical `codev/plans/8-*`/`codev/projects/8-*`/
      `codev/reviews/8-*`/`codev/state/aspir-8_thread.md`.
- [ ] `.codev/checks/test.sh` green.
- [ ] `update-arch-docs` hot-tier caps respected for `arch-critical.md`.

#### Test Plan

- Manual read-through of each edited doc against the shipped Phase 1/2 behaviour.
- `grep` audit as above.
- Re-run `.codev/checks/test.sh` to confirm docs changes didn't disturb the gate.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Migrating the committed run before the viewer key change collapses haiku/haiku-search mid-PR | Medium | Medium | Bundle migration + viewer key + committed-run tests in **one phase (2)**; never commit the migration without the key change. |
| A hardcoded-mtime test "proves" the tutorial supersedes first-run while the real page shows the stale row | High | High | Assert the key **collision** + 7-row count as the guarantee; the directional test explicitly injects mtimes and is labelled a demonstration; Issue #7 named as the real recency fix (out of scope). |
| Migration perturbs `scores.jsonl`/usage (not just panel) | Low | High | Regenerate into a temp dir; byte-diff `scores.jsonl` (must be empty); surgical panel-only edit fallback. |
| JSON/MD skew (regenerate JSON without `--summary-md`) | Medium | Medium | Always regenerate with `--summary-md`; Phase 2 adds an explicit `test_tutorial_run.py` assertion that the committed `summary.md` panel table has the `tools` column (today that file only secret-scans the md). |
| Missed the Python standings-key mirror in `test_tutorial_run.py` | Medium | Medium | Phase 2 names `_standings_key`/`FIRST_RUN_KEY`/the `not in keys` inversion explicitly. |
| Merge conflict with builder-aspir-15 (both touch `score.py`/`cli.py`) | Medium | Medium | Confine Phase 1 edits to the panel-projection + markdown-table lines; whoever merges second rebases. |
| A stale always-on `arch-critical.md` tells a future agent to restore the marker | Medium | Medium | Phase 3 corrects it via `update-arch-docs`; grep audit gate. |
| Viewer tests beyond `tutorialRun.test.ts` assert the old key/subtext | Medium | Low | Run the viewer suite at the start of Phase 2; update `aggregate.test.ts`/`StandingsPage.test.tsx` as part of the phase. |

## Documentation Updates

- **Phase 2** (with the code, to keep that commit self-consistent): the in-code key docstrings in
  `apps/viewer/src/lib/aggregate.ts`, the header comment + user-visible blurb in
  `apps/viewer/src/routes/StandingsPage.tsx`, and `runs/tutorial-2026-10-11/README.md`.
- **Phase 3** (prose sweep): `codev/resources/arch-critical.md` + `codev/resources/arch.md` (both
  via the `update-arch-docs` skill), `CODE_WALKTHROUGH.md`, `TUTORIAL.md`.

Spec 8's historical artifacts are intentionally left unchanged. No API docs exist to update;
`lessons-critical.md` already carries the relevant lessons (panel identity; never re-run score
over committed evidence) and needs no change — the migration honours the latter via the temp-dir
procedure.

<signal>PLAN_DRAFTED</signal>
