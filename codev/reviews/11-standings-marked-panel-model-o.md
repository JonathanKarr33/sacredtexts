# Review: Standings — promote tool-use to a real `panel.tools` field (Spec 8's Approach B)

## Summary

Replaced Spec 8's `panel.model` tools *marker* (`[no-tools]`/`[web_search]`) with a real
`panel.tools` field and made the viewer's standings key incorporate it
(`(provider, model, tools)`). Delivered in **three phases** within one PR: (1) pipeline emits
`panel.tools` + raw unmarked `model` (drops `api_model`, adds a `tools` column to the Markdown
proof); (2) viewer keys standings on `(provider, model, tools)`, the committed tutorial run is
migrated to the new shape, and the marker-era tests invert to assert the dedupe; (3) the
authoritative docs the change falsified are corrected. Net outcome: `/standings` shows one row
per `(provider, model, tools)` arm, two runs of the same model-with-same-tools dedupe (the stale
permanent duplicate against first-run's bare `claude-haiku-5-5` is gone), and the data model is
clean (tools is its own field; the model id stays the raw API id).

## Spec Compliance

- [x] AC1: Every `summary.json` panel entry carries `tools` + a raw unmarked `model`; no
      `[no-tools]`/`[web_search]` marker; `api_model` no longer emitted (Phase 1)
- [x] AC2: `tools` reflects the configured tool set (`[]` / `["web_search"]`), serialised
      deterministically (sorted, matching the config's order-independent identity) (Phase 1)
- [x] AC3: Panel snapshot key-set is **exactly** `{provider, model, tools, endpoint, served_by}`
      — no `api_model`, no prices, no secrets (Phase 1)
- [x] AC4: The synthesised-entry path (`usage` without `panel`) defaults `tools` to `[]` (Phase 1)
- [x] AC5: The viewer's standings key incorporates tools, so the tutorial run's search-on/off
      variants render as separate rows (Phase 2)
- [x] AC6: Two runs of the same `(provider, model, tools)` dedupe to one key — the tutorial's
      no-tools `claude-haiku-5-5` and first-run's bare `claude-haiku-5-5` collide; after
      integrating `main`, recency is `generated_at`-based (Issue #7, merged on `main`), so the
      tutorial run (newer `generated_at`, 2026-10-12) supplies the single surviving row over
      first-run's run-id-date fallback (2026-10-11); 7 rows total (Phase 2, reconciled at
      integration — see Deviations)
- [x] AC7: A panel entry with no `tools` field keys identically to an explicit `tools: []`
      (missing ⇒ empty tool set) (Phase 2)
- [x] AC8: A run with no panel entry still degrades to keying on `model_id` (Phase 2)
- [x] AC9: The standings page visibly distinguishes a search-on row from a search-off row (the
      `tools` setting is shown as a `web_search` tag in the subtext) (Phase 2)
- [x] AC10: `summary_markdown`'s panel table gains a `tools` column so the arms stay
      distinguishable once `model` is raw (Phase 1)
- [x] AC11: `runs/tutorial-2026-10-11/` `summary.json` + `summary.md` regenerated to the new
      shape; `scores.jsonl` byte-for-byte unchanged; per-question/tradition/usage numbers
      unchanged; regenerated into a fresh temp dir, never re-scored in place (Phase 2)
- [x] AC12: `runs/first-run-2026-10-11/` unchanged (no `tools` added); audit of the migrated
      tutorial run still passes (origin-clean) (Phase 2)
- [x] AC13: `realRun.test.ts` (first-run gate) and the `#86` built-CSS probe still pass (Phase 2)
- [x] AC14: Marker-era assertions rewritten — `tutorialRun.test.ts` (raw `model` + `tools`, the
      collision/dedupe, **7** rows), `test_tutorial_run.py` (`_standings_key` + `FIRST_RUN_KEY`
      updated, `not in` → `in`, new exact key-set), `test_phase2_tools.py` likewise (Phases 1–2)
- [x] AC15: Falsified authoritative docs corrected — `arch-critical.md`, `arch.md`,
      `CODE_WALKTHROUGH.md`, `TUTORIAL.md`, and the tutorial run's `README.md`; Spec 8's
      historical artifacts left as-is (Phase 3, plus the run README in Phase 2)
- [x] AC16: `.codev/checks/test.sh` green — pipeline pytest (292 passed / 1 pre-existing
      unrelated skip) + viewer vitest + audit (all phases)

## Deviations from Plan

- **Phase 3 — one doc added beyond the spec's enumerated list, under explicit architect
  authorization.** The spec's Constraints bake governance-doc scope as "limited to"
  `arch-critical.md`, `arch.md`, `CODE_WALKTHROUGH.md`, `TUTORIAL.md`, and the tutorial run's
  `README.md`. The Phase 3 iter-2 consult (claude) found `apps/viewer/README.md:44-47` still
  asserted the now-false `(provider, model)` standings key — falsified by this PR's own
  `aggregate.ts` change, and the doc `arch-critical.md` explicitly routes agents to before viewer
  work. Because adding it crosses a baked "limited to" boundary, it was surfaced to the architect
  rather than edited unilaterally; **architect `main` authorized the one-line fix (2026-10-12
  17:34Z)**: "the spec's 'limited to' list was a scope guardrail, not a licence to leave a
  falsified doc that arch-critical routes agents to." Applied.
- **Phase 2 — fixed two pre-existing latent `TS2532` in `tutorialRun.test.ts`** (`rows[0]` →
  `rows[0]!`, matching the sibling-test `!` convention), surfaced only once the viewer lane began
  type-checking. In-scope (a file the phase already owned).
- **Integration — merged `origin/main` and reconciled to Issue #7's landed recency (architect-
  approved).** The PR-level consult found the branch 18 commits behind `main`, which had since
  merged Issue #7 (`generated_at`-based run recency, `lib/recency.ts`/`runRecencyMs`) and #19/#10
  (a single-track rewrite of `TUTORIAL.md` + `CODE_WALKTHROUGH.md`). Architect `main` ruled
  (2026-10-12 17:51Z): **merge** `origin/main` (not a 37-commit rebase) and **reconcile** to #7's
  recency as the contract. Applied in the merge commit: `aggregate.ts` composes the
  `(provider, model, tools)` key **on top of** `runRecencyMs` (did not clobber #7); the doc
  corrections were re-applied onto #19's rewritten `CODE_WALKTHROUGH.md`/`TUTORIAL.md` keeping
  their single-track tone; the recency-dependent tests/prose were flipped from the old
  "mtime-tie / no winner / Issue #7 out of scope" framing to assert the **correct post-#7
  outcome** — the tutorial run wins the shared `claude-haiku-5-5` key via its newer `generated_at`.
  Two follow-ons from the reconciliation: (a) the tutorial run's `generated_at` was restored to its
  original run time (`2026-10-12T01:20:16`) rather than the migration time, since #7 made it the
  load-bearing recency signal and the migration must stay panel-only (claude PR-consult finding);
  (b) the standings subtext tag was changed from `[web_search]` to `· web_search` so it no longer
  reads like the model-id marker this spec removes (claude nit); (c) `arch.md`'s stale
  "`generated_at` … the viewer ignores it" line was corrected (it is now the recency key).
- Otherwise the plan held across all three phases.

## Consultation Feedback

Per-phase consult is **`["codex", "claude"]`** — Gemini is excluded because its consult cannot
see the worktree (set in `.codev/config.json`). No `CONSULT_ERROR`s occurred.

### Phase 1 — Implement (Round 1)

#### Codex — COMMENT
- **Concern**: minor, non-blocking implementation comments → **Addressed**: folded in (commit
  `36f5fef`).

#### Claude — APPROVE
- No blocking concerns.

### Phase 2 — Implement (Round 1)

#### Codex — APPROVE (HIGH)
- No blocking concerns.

#### Claude — APPROVE (HIGH)
- **Concern**: the new two-arm StandingsPage test should assert the search-on row surfaces its
  tools subtext (deliverable was inspection-only) → **Addressed** (commit `a3dc445`).
- **Concern**: `tutorialRun.test.ts` should derive first-run's collision key from its actual
  committed panel entry (prior assertion was vacuous) → **Addressed** (commit `a3dc445`).
- **Concern**: add an `Array.isArray` guard on `p.tools` in `aggregate.ts` → **Rebutted**:
  spec-waived ("handled like any other unexpected panel value") and cuts against
  fail-fast/tight-diff/simplicity.
- **Concern**: `generated_at`-based recency so a calendar-newer run wins on an mtime tie →
  **N/A**: that is Issue #7, explicitly out of scope per the spec.

### Phase 3 — Implement (Round 1)

#### Codex — APPROVE (HIGH)
- No concerns.

#### Claude — REQUEST_CHANGES (HIGH)
- **Concern (blocking)**: `TUTORIAL.md` kept the Approach-A claim "the four tutorial entries
  appear as four distinct **rows**"; under Approach B the search-off haiku collides with
  first-run's bare haiku (7 rows, not 8) and the spec forbids claiming a winner → **Addressed**:
  reworded to four distinct **keys** + 7 total rows + the mtime/id tiebreak caveat, matching the
  run README's register; no winner claimed.
- **Concern**: the grep-letter circumlocution ("no separate duplicate id field") is opaque →
  **Addressed**: simplified the arch/walkthrough prose to describe current state only (raw
  `model`, no marker), per the arch-doc "no graveyards" discipline — clearer, and keeps the grep
  gate green without naming the retired field.
- **Concern**: `CODE_WALKTHROUGH.md` dropped its `file:line` pointer → **Addressed**: restored as
  `score.py:430` (the line that writes `tools` into the committed snapshot).
- **Concern**: `arch.md` "newest run per model" → **Addressed**: changed to per
  `(provider, model, tools)` identity.

### Phase 3 — Implement (Round 2)

#### Codex — APPROVE (HIGH)
- No concerns.

#### Claude — REQUEST_CHANGES (HIGH)
- **Concern**: `apps/viewer/README.md:44-47` still asserts the now-false `(provider, model)`
  standings key → **Addressed** (architect-authorized; see Deviations).
- **Concern (nits)**: ragged re-wraps in `CODE_WALKTHROUGH.md`/`arch.md`; "same-date tie" should
  be "mtime tie"; `arch-critical.md:9` grew long → **Addressed**: all four re-flowed/fixed
  (dropped the `web_search_20250305`/`max_uses:5` detail from the hot fact — it is duplicated in
  `arch.md`).

### Phase 3 — Implement (Round 3)

#### Codex — APPROVE (HIGH)
- No concerns.

#### Claude — APPROVE (HIGH)
- **Concern (nits)**: `arch-critical.md:9` still longest fact; `arch.md` dense parenthetical;
  `TUTORIAL.md` "model id … unmarked" conflates `row.modelId` with the panel `model` →
  **Addressed**: three folded in (dropped the pinning detail, split the parenthetical into a
  standalone sentence, clarified it is the subtext's raw API id).
- **Concern**: `pipelines/README.md:101` + `apps/viewer/README.md:14` loose `panel`
  (provider/model/endpoint) summaries omit `tools`/`served_by` → **N/A**: claude itself confirms
  these were **not** falsified by this change (they never asserted the marker), so they sit
  outside even the architect-authorized deviation; left per tight-diff and recorded as a
  follow-up for a deliberate PR-review decision.

### Review — PR consult (Round 1)

#### Codex — REQUEST_CHANGES (HIGH)
- **Concern**: the branch is 18 commits behind `main`, which has merged Issue #7's
  `generated_at` recency; a careless resolution would regress it and the PR is not
  integration-ready → **Addressed**: merged `origin/main` (architect-approved) and composed the
  tools key on top of `runRecencyMs` without clobbering #7; re-ran the gate green.

#### Claude — REQUEST_CHANGES (HIGH)
- **Concern**: implementation/tests/migration are sound, but the branch is `CONFLICTING`; `main`
  shipped #7 (`recency.ts`) and #19 (TUTORIAL/CODE_WALKTHROUGH rewrite), so the new docs/comments
  are falsified → **Addressed**: merged and reconciled — re-applied the doc corrections onto #19's
  rewrites (single-track tone kept), flipped the recency-dependent tests/prose to the post-#7
  behaviour (tutorial wins the shared key via `generated_at`).
- **Concern**: the `tutorialRun.test.ts` injected mtimes become inert post-#7 (recency resolves
  via `generated_at`/run-id date), so the directional assertion no longer tests what it claims →
  **Addressed**: rewrote the test to give first-run the larger mtime and assert the tutorial still
  wins (proving `generated_at` precedence, not mtime).
- **Concern**: the migration bumped `generated_at` (now load-bearing under #7) to the migration
  time → **Addressed**: restored the original run timestamp so the migration stays panel-only.
- **Concern (nit)**: `StandingsPage` renders the tool set as `[web_search]`, which reads like the
  removed marker → **Addressed**: changed to `· web_search`.

## Lessons Learned

### What Went Well

- The committed-run migration regenerated into a fresh temp dir and was verified
  **`scores.jsonl` byte-identical** before the two files were copied back — the project lesson
  ("never re-run score over committed evidence") held, and the panel-only change was provable.
- The tests assert the **key collision + 7-row count** as the core guarantee of Approach B
  (dedupe). Spec 11 delivered the collision; Issue #7 (merged on `main` in parallel) then supplied
  the `generated_at` recency that decides *which* run wins the shared key — the two compose cleanly
  at integration, and the tutorial run now correctly supersedes the stale first-run haiku row.
- Consultation earned its keep on a docs-only phase: claude caught a genuinely falsified
  user-facing claim (TUTORIAL "distinct rows") and a falsified doc outside the spec's enumeration
  (`apps/viewer/README.md`).

### Challenges Encountered

- **Grep gate: letter vs. intent.** The plan's acceptance grep permitted only one survivor
  (`TUTORIAL.md:144`). Correcting prose while even *negations* ("the marker is gone") would trip
  the literal tokens forced a choice; resolved by describing current state only (no backward
  reference to the retired marker/`api_model`), which satisfies both the gate and readability.
- **Recency changed underneath the branch mid-flight.** While Spec 11 was in review, Issue #7
  merged `generated_at`-based recency onto `main` — the exact mechanism this spec had documented as
  out of scope. The PR-level consult caught that the branch's new docs/tests (written against the
  old mtime-tie behaviour) were now falsified. The integration merge reconciled them: the
  reconciled tests assert the correct post-#7 outcome (tutorial wins via `generated_at`). Lesson:
  a long-lived branch's "out of scope" boundary can be overtaken by a parallel merge — the
  pre-merge PR consult is the checkpoint that catches it.

### What Would Be Done Differently

- **Commit each phase's work during that phase.** Phase 3's doc edits were left uncommitted until
  the review boundary; porch's checks run on the working tree so it passed regardless, but the
  per-phase git commit (as Phases 1–2 did) should happen in-phase, not retroactively.

### Methodology Improvements

- A docs-only phase still warrants the full per-phase consult — two of the three Phase 3 rounds
  surfaced real defects. Worth keeping the consult on prose phases rather than fast-tracking them.

## Architecture Updates

Both arch docs were corrected in **Phase 3** via the `update-arch-docs` skill (the change
falsified them):

- Routed: **hot** — `codev/resources/arch-critical.md` — rewrote the "Tool-use is part of panel
  identity" fact to the Approach-B shape (real `panel.tools` list, raw `model`, key
  `provider\u0000model\u0000sortedTools`), dropping the now-false "zero-viewer-change property"
  claim. In-place edit — no change to the fact count, file still 20 lines (within the hot cap);
  later trimmed the `web_search_20250305`/`max_uses:5` pinning detail (duplicated in `arch.md`) to
  reverse density creep.
- Routed: **cold** — `codev/resources/arch.md` — updated the `panel` block description (raw
  `model` + `tools` list, no `api_model`/marker) and the `/standings` key description
  (`(provider, model, tools)`, missing ⇒ `[]`, newest run per that identity). At integration, also
  corrected the now-stale `generated_at` line (it said "the viewer ignores it"; post-#7 it is the
  viewer's primary run-recency signal, pointing at `lib/recency.ts`).

## Lessons Learned Updates

- Routed: **cold** — `codev/resources/lessons-learned.md` § Scoring & evaluation — "A marker
  baked into an identity string to force non-collision orphans the pre-existing bare rows":
  promote the dimension to a real field and have the consumer's key incorporate it, rather than
  encoding it as a string marker to dodge a consumer change. (Cold, not hot: a design lesson for
  when you next touch panel/standings identity, not a must-know-up-front behaviour-changer — and
  `arch-critical.md` already carries the current-state panel-identity fact.)

## Flaky Tests

No flaky tests encountered. The single `pytest` skip (in `test_first_run_regression.py`) is a
pre-existing, deliberate, unrelated skip — not a flaky test skipped during this project.

## Follow-up Items

- **Issue #7 — `generated_at`-based recency: RESOLVED on `main` and integrated here.** It merged
  in parallel and now decides *which* run supplies the shared `claude-haiku-5-5` row; this branch's
  integration merge composes the tools key on top of it. No longer an open follow-up.
- **Loose `panel` summaries** in `pipelines/README.md:101` and `apps/viewer/README.md:14` omit
  `tools` (and `served_by`). Not falsified by this change (they never asserted the marker), so
  left per tight-diff; worth a deliberate decision at PR review whether to round them out.
- **Parallel work coordination:** builder-aspir-15 (#15) also touches `score.py`/`cli.py` and
  viewer test fixtures and had not merged to `main` as of this integration; whoever merges second
  rebases.
