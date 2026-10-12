# aspir-11 — Standings: promote tools to a real `panel.tools` field (Spec 8 Approach B)

## Context
Issue #11: Spec 8 chose Approach A — encode the tools setting as a marker inside
`panel.model` (`claude-haiku-5-5 [no-tools]` / `[web_search]`). Consequence: first-run's
bare `anthropic\u0000claude-haiku-5-5` standings key can never be superseded by a newer
run of the same model (tutorial's `… [no-tools]` is a *different* key), so a stale Oct-2026
row sits beside the tutorial's haiku row forever. Issue #11 = implement Spec 8's rejected
Approach B (the clean long-term shape): a real `panel.tools` field, `panel.model` goes back
to the raw API model id, and the viewer's standings key incorporates tools.

## Architect coordination (2026-10-12)
- builder-aspir-15 works #15 (scoring-contract / metrics) in parallel — both touch
  score.py/cli.py (panel emission vs metrics) and possibly viewer. Keep my diff TIGHT to
  tools-field + standings-key scope; whoever merges second rebases.
- Maintainer values simplicity: minimal clean shape beats clever. Target = panel.tools
  field + viewer key incorporates it + old bare rows supersede correctly.

## Key findings from reading the code (specify phase)
- `config.py` ALREADY has `ModelSpec.tools` fully parsed + fail-fast validated (`_parse_tools`,
  `TOOLS`, `_ANTHROPIC_ONLY_TOOLS`). NO config change needed.
- `collect.py::_panel_fingerprint` is `provider|model|base_url|tools` — ALREADY tools-aware
  and operates on ModelSpec, not the panel. NO change; the evidence-integrity cross-check in
  cli.py still passes.
- `providers.py` unchanged.
- The marker lives in exactly two places:
  - `cli.py` ~349-351: `marked = f"{m.model} [{'+'.join(m.tools)}]" if m.tools else f"{m.model} [no-tools]"`; emits `model: marked, api_model: m.model`.
  - `score.py` ~424-432: re-emits `model` (marked) + `api_model`.
- Viewer standings key: `aggregate.ts:59` `key = p ? ${p.provider}\u0000${p.model} : modelId`.
  `PanelEntry` (localResults.ts) is `{provider, model, endpoint, served_by}` — ignores any
  other panel field (so adding `tools` flows through parseSummary automatically; only the TS
  type needs it).
- `first-run-2026-10-11/summary.json` has NO tools field, bare `model` → viewer must default
  missing tools to `[]` so first-run's haiku keys identically to tutorial's no-tools haiku and
  gets superseded. first-run summary.json is UNCHANGED.

## Decisions (to bake into spec/plan)
- Drop `api_model` entirely: it existed only to recover the raw id from the marked string;
  with Approach B `model` is raw so `api_model == model` always → pure redundancy. Simplicity.
- Migrate `runs/tutorial-2026-10-11/summary.json` by RE-RUNNING `score --config` (keyless —
  score reads answers.jsonl, needs no API keys; `_panel_fingerprint` unchanged so the
  cross-check passes). Guard: scores.jsonl must come back byte-identical (determinism; this
  spec does NOT touch normalize()). Only summary.json's panel + generated_at change.
- StandingsPage subtext must surface tools (the marker used to; now show `[web_search]` etc.)
  so two raw-model rows stay visually distinguishable.

## Blast radius
Pipeline: cli.py, score.py, test_phase2_tools.py, test_tutorial_run.py.
Viewer: localResults.ts, aggregate.ts, StandingsPage.tsx, tutorialRun.test.ts (premise
inverts: collision→supersession, 8 rows→7), aggregate.test.ts / StandingsPage.test.tsx (TBD).
Evidence: runs/tutorial-2026-10-11/summary.json regenerated.

## Spec consult iter-1 (both REQUEST_CHANGES, HIGH — Approach B endorsed, 3 surgical fixes)
codex + claude converge:
1. **Supersession over-claimed (blocking).** Recency = run-dir filesystem mtime
   (`aggregate.ts:76` via `runIndex.ts`/`StandingsPage.tsx:34`), NOT `generated_at`. git
   doesn't preserve mtime → clone/CI tie → id-asc tiebreak → `first-run` < `tutorial` → STALE
   row wins. A hardcoded-mtime test would mask it. FIX: narrow criterion to *dedupe-to-one-key*
   (bare rows become supersedable; which run supplies the row follows existing mtime rule;
   making it mtime-independent = Issue #7, out of scope per tight-diff).
2. **Migration scope + docs unscoped.**
   - `runs/tutorial-2026-10-11/summary.md:27-30` also carries the marker; `score` rewrites md
     ONLY with `--summary-md` (`cli.py:360`) → regen must pass it or JSON/MD disagree
     (test_tutorial_run.py:73 reads md).
   - `summary_markdown` panel table (`score.py:484-494`) is `|model_id|provider|model|endpoint|served_by|`
     → with marker gone, haiku & haiku-search show IDENTICAL model cell → arm distinction lost.
     DECISION: add a `tools` column (consistent w/ arch-critical "tool-use is part of panel identity").
   - Falsified AUTHORITATIVE docs to update: `arch-critical.md:9` (always-on!), `arch.md:79,103`,
     `CODE_WALKTHROUGH.md:339`, `TUTORIAL.md:199` (user-facing), `runs/.../README.md:17`.
     NOT touched (historical Spec-8 records): plans/8, projects/8, reviews/8, state/aspir-8.
3. **Python standings-key mirror missed.** `test_tutorial_run.py` has `_standings_key()` (L29),
   `FIRST_RUN_KEY` (L20), `test_panel_has_four_distinct_standings_identities` asserting
   `FIRST_RUN_KEY not in keys` (L42). Under Approach B the mirror gains a tools segment and that
   assertion INVERTS: tutorial's no-tools haiku key must now EQUAL first-run's (dedupe enabled).
Minor: key-set assertion → use `==` (not `⊆`) {provider,model,tools,endpoint,served_by};
score.py:421 synthesized-entry path needs `tools: []` default; state row count = 7.

## Plan (3 phases, each green at its own commit)
- P1: pipeline emits panel.tools (raw model, no api_model) + md tools column. Touches NO
  committed artifact → suite stays green. Tests: score.py via score_file dict AND cli.py via
  CliRunner over collect-written fingerprinted answers (claude: the dict path can't reach cli.py).
- P2: viewer keys standings on (provider,model,tools) [missing⇒[]] + display + MIGRATE committed
  run (temp-dir regen, byte-diff scores.jsonl, copy summary.json+summary.md) + invert both
  committed-run tests (TS + py mirror) + aggregate.ts/StandingsPage.tsx in-code+user text +
  run README.md. Atomic (migration/key/tests mutually dependent). check-types in acceptance.
- P3: prose docs — arch-critical.md + arch.md (update-arch-docs skill), CODE_WALKTHROUGH.md,
  TUTORIAL.md. Scoped grep gate w/ named survivors. Spec-8 historical artifacts untouched.
- Migration verified viable by claude: committed answer fingerprints match models.example.yaml
  exactly; config is unpriced so no cost_usd appears → diff = panel + generated_at only.

## Plan consult iter-1: codex APPROVE (no issues); claude COMMENT (6 corrections, all accepted)
Fixed: (1) `answers` positional not --answers; (2) P1 needs a CLI-level test (CliRunner +
fingerprinted answers) or cli.py emission is untested; (3) add committed summary.md tools-column
assertion (real md-skew guard); (4) add `pnpm -C apps/viewer check-types` (not in gate);
(5) move aggregate.ts/StandingsPage.tsx text + run README to P2 (self-consistency); (6) scope
P3 grep + name survivors (TUTORIAL.md:144 config, models.example.yaml, Spec-8 artifacts).

## Phase 1 implement (2026-10-12) — DONE, signalling porch done
- Commit `9a0555d` `[Spec 11][Phase: implement]`. Touches ONLY cli.py, score.py,
  test_phase2_tools.py (explicit `git add`; `.builder-*`/`.claude/hooks` left untracked).
- cli.py panel build: `{provider, model(RAW), tools:list(m.tools), endpoint, price_in, price_out}`
  — marker + api_model gone. score.py written snapshot: `{provider, model, tools (p.get or []),
  endpoint, served_by}`; synthesised entries default tools=[]. summary_markdown panel table gained
  a `tools` column (header/sep/row; `", ".join(tools) or "—"`).
- Tests: rewrote the old marker test → `test_panel_tools_field_distinguishes_arms_and_dedupes_bare_model`
  (score_file: raw model, tools list, api_model gone, key-set == {provider,model,tools,endpoint,
  served_by}, no-tools arm keys == first_run bare key, md tools-column assertion scoped to the
  Panel-composition section — NOT the token-usage table, which shares the first cell). Added
  `test_cli_score_panel_emits_tools_field_and_raw_model` (CliRunner over collect-written
  fingerprinted answers — the ONLY way to reach cli.py's inline panel build).
- Gate `.codev/checks/test.sh` GREEN: 290 passed / 1 skipped; pipelines lane ran incl.
  test_tutorial_run.py (committed run UNTOUCHED, still old shape — Phase 1 touches no artifact).
  viewer lane correctly not triggered. grep: no api_model, no [no-tools]/[web_search] in
  cli.py/score.py.

## Overlap w/ aspir-15 (resolved 2026-10-12, via architect:main relay)
- My Phase 1 CHANGES panel emission shape (raw model + tools list, api_model dropped). aspir-15's
  first-run rebaseline copies the panel VERBATIM (byte-for-byte) from committed summary.json via
  score_file(panel=...), NEVER re-emits through cli.py/YAML → NO collision on first-run. Confirmed
  by architect from aspir-15's own plan text.
- Still-open overlap for Phase 2: aspir-15 also edits apps/viewer TEST FIXTURES (tutorialRun,
  ExplorerPage, LeaderboardPage, maybe StandingsPage/realRun) + score.py/cli.py. My Phase 2 edits
  viewer (localResults/aggregate/StandingsPage + tutorialRun.test.ts) AND migrates
  runs/tutorial-2026-10-11. SECOND MERGER REBASES (architect standing order). Watch for fixture
  conflicts in tutorialRun/StandingsPage.

## Status
- [x] Specify — done (both consults addressed, rebuttal, advanced).
- [x] Plan — written; iter-1 consult (codex APPROVE / claude COMMENT); plan revised for all 6
      corrections; rebuttal written. Advanced.
- [x] Implement Phase 1 — DONE + consult-passed. `porch done` → build-complete `f3ccca8`.
      Per-phase consult: codex COMMENT / claude APPROVE (both NON-BLOCKING, HIGH). Verdicts at
      `codev/projects/11-.../11-phase_1-iter1-{codex,claude}.txt`. Folded in the 4 valid comments
      (commit `36f5fef`): CLI test asserts exact written key-set =={provider,model,tools,endpoint,
      served_by} for both arms (the CLI path is the only one carrying price_in/price_out → proves
      score.py strips them); added synthesised-entry test (usage-only model ⇒ tools []); tightened
      md tools-column assertion to the exact 4th cell; comments mention tools. SKIPPED (justified):
      defensive tools-sort in score.py (config.py already sorts; plan puts defensive sort in the
      VIEWER key — Phase 2); transiently-false marker prose (intended, fixed Phase 2/3). Gate green
      291 passed/1 skipped. porch advanced to **phase_2**; refreshing context at the boundary.
- [x] Implement Phase 2 — DONE. Commit `c7e388e` `[Spec 11][Phase: implement]`.
      Viewer: localResults.ts `PanelEntry.tools?`; aggregate.ts key now
      `${provider}\u0000${model}\u0000${[...tools].sort().join(",")}` (missing⇒[]), `StandingRow.tools`
      populated, doc comments corrected; StandingsPage.tsx renders `[tools]` subtext + header/blurb
      text fixed. Migrated `runs/tutorial-2026-10-11` via temp-dir re-score (scores.jsonl
      BYTE-IDENTICAL; models/by_tradition/usage identical; only panel+generated_at changed) — raw
      model, real `panel.tools`, no api_model, md tools column; README prose → Approach B.
      Inverted both committed-run tests: tutorialRun.test.ts (4 distinct arm keys, no-tools haiku
      DEDUPES w/ first-run bare row, 7 rows, directional-supersession-possible w/ injected mtimes
      labelled as possibility-only) + test_tutorial_run.py (`_standings_key` gains tools segment,
      `FIRST_RUN_KEY` now `…\u0000`, `not in`→`in`, panel test renamed → exact key-set
      =={provider,model,tools,endpoint,served_by} + tools-by-arm, NEW summary.md tools-column skew
      guard). aggregate.test.ts +3 edge cases (tools-distinct / missing⇒[] dedupe / sort-stable).
      Gate GREEN: viewer 128 passed, pipelines 292 passed/1 skipped (pre-existing unrelated skip in
      test_first_run_regression.py). `pnpm -C apps/viewer check-types` GREEN (fixed 2 pre-existing
      latent TS2532 in tutorialRun.test.ts leaderboard block: `rows[0]`→`rows[0]!`, matching the
      `!` convention in sibling tests — surfaced only now the viewer lane type-checks). audit OK.
      first-run-2026-10-11 UNTOUCHED. porch done → build-complete.
      Per-phase consult (codex+claude; Gemini excluded): BOTH APPROVE, HIGH, non-blocking.
      Verdicts at `codev/projects/11-.../11-phase_2-iter1-{codex,claude}.txt`. Folded in 2 nits
      (commit `a3dc445`): (1) new StandingsPage two-arm test asserting the search-on row surfaces
      its `[web_search]` subtext (deliverable was inspection-only); (2) tutorialRun.test.ts derives
      first-run's collision key from its ACTUAL committed panel entry (prior assertion was vacuous).
      DEFERRED (justified): claude #3 `Array.isArray` guard on `p.tools` — spec-WAIVED ("handled
      like any other unexpected panel value") + cuts against fail-fast/tight-diff/simplicity; claude
      #4 Issue #7 `generated_at` recency (tie-mtime clone lets first-run's stale haiku row win) —
      ARCHITECT note, explicitly out of scope per spec. Viewer 129 passed, check-types green.
      porch advancing to phase_3.
- [ ] Implement Phase 3 — prose docs (arch-critical/arch via update-arch-docs, CODE_WALKTHROUGH,
      TUTORIAL). Not started.
