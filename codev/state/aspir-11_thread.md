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
- [x] Implement Phase 3 — prose docs DONE (PROSE ONLY, no code). Corrected the four FALSIFIED
      authoritative docs to the Approach-B shape (real `panel.tools` list + raw unmarked `model`,
      no marker, no api_model; viewer standings key `provider\u0000model\u0000sortedTools`,
      missing⇒[]; search-on/off stay distinct while same-model/same-tools dedupe):
      • `codev/resources/arch-critical.md` line 9 (always-on hot tier) — rewrote "Tool-use is part
        of panel identity" bullet IN PLACE via update-arch-docs skill (no fact-count change; file
        still 20 lines ≤35 cap). No "zero-viewer-change" claim; `_panel_fingerprint` stays
        tools-aware/unchanged.
      • `codev/resources/arch.md` lines 78-80 (panel block desc) + 100-107 (standings key) via
        update-arch-docs.
      • `CODE_WALKTHROUGH.md` §6 evidence-integrity bullet — panel-identity sentence; guard test
        `test_code_walkthrough.py` only checks SYMBOL existence (not line nums/marker prose), and
        I removed no referenced symbol → gate unaffected.
      • `TUTORIAL.md` ~line 196-203 (user-facing standings section) — raw-model rows + `web_search`
        tag indicator. Line 144 (`tools: [web_search]` CONFIG) left intact = the sole permitted hit.
      SCOPED-GREP GATE GREEN: `grep -rn "no-tools|\[web_search\]|api_model"` over the 4 docs →
      ONLY `TUTORIAL.md:144`. NOTE: to satisfy the gate's LETTER (not just intent), I reworded the
      corrected prose to AVOID the literal tokens even in NEGATIONS (e.g. "no separate duplicate id
      field" not "no `api_model`"; "search-off" not "no-tools") — otherwise negations like "the
      marker is gone" would themselves trip the grep.
      `.codev/checks/test.sh` GREEN: viewer vitest 129 passed, pipelines pytest 291 passed/1 skipped
      (PRE-EXISTING unrelated skip in test_first_run_regression.py), audit (test_audit.py) passed.
      Diff TIGHT: exactly the 4 docs (git diff --stat: CODE_WALKTHROUGH.md, TUTORIAL.md,
      arch-critical.md, arch.md). Spec 8 historical artifacts (plans/8, projects/8, reviews/8,
      state/aspir-8) UNTOUCHED. No code touched. Signaling build-complete → 2-way consult (codex+claude).
      Phase 3 consult (iter1): codex APPROVE/HIGH (no issues); claude REQUEST_CHANGES/HIGH — 1 BLOCKING
      + 3 non-blocking. ALL ADDRESSED (verdicts at 11-phase_3-iter1-{codex,claude}.txt):
      • BLOCKING (accepted): TUTORIAL.md kept Approach-A claim "four tutorial entries appear as four
        distinct ROWS" — false under Approach B (tutorial's search-off haiku now collides with
        first-run's bare haiku; spec FORBIDS claiming a winner). Reworded to four distinct standings
        KEYS + **7** total rows across both runs (not 8) + first-run haiku "supersedable rather than
        orphaned" + mtime/id tiebreak caveat (same register as runs/.../README.md:17-20). No winner claimed.
      • NB#1 (accepted, resolved via simplify not naming): dropped the opaque "no separate duplicate id
        field" circumlocution in arch-critical.md:9, arch.md:78-80, CODE_WALKTHROUGH — per arch-doc
        "describe current state, no graveyards" the dropped field needn't be memorialized; prose now
        just states the current shape (raw `model`, no inline marker). Keeps scoped-grep green WITHOUT
        reintroducing literal tokens or widening the permitted-hits list (plan's criterion #1 intact).
      • NB#2 (accepted): restored a `file:line` pointer in CODE_WALKTHROUGH — bare `(cli.py)` →
        `score.py:430` (the WRITTEN committed snapshot's tools field; cli.py only builds the in-memory
        dict). Walkthrough pointer test now validates it (pipelines 292 passed, +1 vs prior run).
      • NB#3 (accepted): arch.md:104 "newest run per model" → per `(provider, model, tools)` identity.
      Re-verified: scoped grep → ONLY TUTORIAL.md:144; `.codev/checks/test.sh` GREEN (viewer passed,
      pipelines 292 passed/1 pre-existing skip). Diff still TIGHT to the 4 docs, no code, Spec 8 untouched.
      Phase 3 consult ITER 2: codex APPROVE/HIGH (no issues); claude REQUEST_CHANGES/HIGH — 1 scope item
      + 3 nits. Rebuttal at 11-phase_3-iter2-rebuttals.md. NITS ALL FIXED:
      • CODE_WALKTHROUGH:341-343 ragged wrap re-flowed; arch.md:104-108 re-flowed + collapsed dup
        "(provider,model,tools) identity"→"that identity"; TUTORIAL:205 "same-date tie"→"mtime tie"
        (aggregate.ts ties on exact mtimeMs); arch-critical:9 dropped trailing "(Spec 11, Approach B)"
        provenance tag (cold arch.md keeps the pointer) to reverse hot-line density creep.
      • SCOPE ITEM (BLOCKED on architect): claude correctly found `apps/viewer/README.md:44-47` still
        asserts the now-FALSE `(provider,model)` standings key (falsified by Phase 2's aggregate.ts
        change; arch-critical routes agents to read it before viewer work). BUT spec Constraints bake
        gov-doc scope as "limited to [arch-critical, arch, CODE_WALKTHROUGH, TUTORIAL, run README]" — a
        CLOSED list excluding apps/viewer/README.md. Crossing a baked "limited to" is the architect's
        call → did NOT edit it; sent architect a decision-ready note (recommend INCLUDE: 1-line fix,
        serves spec goal, no aspir-15 conflict — it touches viewer TEST FIXTURES not this README).
      Re-verified after nit fixes: grep → only TUTORIAL.md:144; gate GREEN (pipelines 292/1-skip, viewer
      passed).
      ARCHITECT RULED (main, 2026-10-12T17:34Z): option A — AUTHORIZED fixing apps/viewer/README.md
      ("'limited to' was a scope guardrail, not a licence to leave a falsified doc arch-critical routes
      agents to; note the deviation + authorization in your review doc, then porch done"). Applied the
      1-line fix (README:44-48 → `(provider,model,tools)` key, missing tools⇒[]). Scoped grep over ALL
      FIVE docs → still only TUTORIAL.md:144. **DEVIATION (carry into codev/reviews/11-*.md): added
      apps/viewer/README.md to the spec's enumerated gov-doc list under explicit architect auth.**
      → proceeding with porch done (iter 2).
      Phase 3 consult ITER 3: codex APPROVE/HIGH + claude APPROVE/HIGH — PHASE PASSES, no blocking.
      Folded in 3 of claude's 4 non-blocking nits (reviewer-suggested, docs-only, no re-consult needed):
      (1) arch-critical:9 dropped the `web_search_20250305`/`max_uses:5` pinning detail (duplicated in
      arch.md) → hot line shorter; (2) arch.md:100-107 split the dense nested `))` parenthetical into a
      standalone "Because the standings key incorporates…" sentence; (3) TUTORIAL:200 "the model id is
      now shown unmarked" → "the model name shown in each row's subtext is the raw API id (no marker)"
      (claude: row.modelId was never marked; the panel `model` in the subtext is what's now raw).
      DECLINED nit #4 (deliberate): pipelines/README.md:101 + apps/viewer/README.md:14 loose "panel
      (provider/model/endpoint)" summaries omit tools/served_by — claude EXPLICITLY says NOT falsified by
      this change (they never asserted the marker), so outside even the architect-authorized deviation
      (which covered the FALSIFIED README:44 line). Leaving per tight-diff; noted for deliberate PR-review.
      Re-verified: grep over all 5 docs → only TUTORIAL.md:144; gate GREEN (pipelines 292/1-skip, viewer
      passed). Phase 3 COMPLETE.
- [x] Phase 3 COMMITTED (porch had advanced implement→review with docs still uncommitted — builder
      commits the impl, as in P1/P2). 3 commits: a01189f ([Spec 11][Phase: implement] docs), b643568
      (phase_3 consult outputs), 36cee99 (thread). Clean tracked worktree.
- [x] REVIEW phase (porch auto-acked the enter:review refresh boundary; continued in-session with full
      context — ideal for the Consultation Feedback section). Wrote codev/reviews/11-*.md (template
      order: Summary/Spec Compliance 16 ACs all met/Deviations/Consultation Feedback per phase+round/
      Lessons/Architecture Updates/Lessons Learned Updates/Flaky/Follow-up). Routed 1 COLD lesson to
      lessons-learned.md §Scoring&evaluation (marker-baked-into-identity orphans bare rows → promote to
      a real field). Arch docs already corrected in phase_3 (documented in review's Architecture Updates).
- [ ] Open the single PR (Closes #11), then porch done → PR_READY. NO Co-Authored-By / Generated-with
      lines (user CLAUDE.md overrides harness attribution reminder). After merge → verify phase.
