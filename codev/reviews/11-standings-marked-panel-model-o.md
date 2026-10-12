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
      no-tools `claude-haiku-5-5` and first-run's bare `claude-haiku-5-5` now collide; recency
      (mtime/id) unchanged; directional supersession test injects distinct mtimes and the
      collision + 7-row count is the asserted guarantee (Phase 2)
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

## Lessons Learned

### What Went Well

- The committed-run migration regenerated into a fresh temp dir and was verified
  **`scores.jsonl` byte-identical** before the two files were copied back — the project lesson
  ("never re-run score over committed evidence") held, and the panel-only change was provable.
- The tests assert the **key collision + 7-row count** as the guarantee rather than a specific
  winner, so they stay honest about what Approach B actually delivers (dedupe), leaving recency
  (Issue #7) cleanly out of scope.
- Consultation earned its keep on a docs-only phase: claude caught a genuinely falsified
  user-facing claim (TUTORIAL "distinct rows") and a falsified doc outside the spec's enumeration
  (`apps/viewer/README.md`).

### Challenges Encountered

- **Grep gate: letter vs. intent.** The plan's acceptance grep permitted only one survivor
  (`TUTORIAL.md:144`). Correcting prose while even *negations* ("the marker is gone") would trip
  the literal tokens forced a choice; resolved by describing current state only (no backward
  reference to the retired marker/`api_model`), which satisfies both the gate and readability.
- **Recency is mtime, and git does not preserve it.** On a same-checkout tie the id-ascending
  tiebreak favours `first-run` over the tutorial, so the docs had to describe the *collision*
  without promising the tutorial wins — easy to get subtly wrong (the iter-1 TUTORIAL miss).

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
  (`(provider, model, tools)`, missing ⇒ `[]`, newest run per that identity).

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

- **Issue #7 — `generated_at`-based recency.** Make standings recency calendar-accurate so a
  newer run always supersedes an older one regardless of checkout mtimes; this is what decides
  *which* run supplies the shared `claude-haiku-5-5` row. Out of scope here (this spec delivered
  the collision/dedupe only).
- **Loose `panel` summaries** in `pipelines/README.md:101` and `apps/viewer/README.md:14` omit
  `tools` (and `served_by`). Not falsified by this change (they never asserted the marker), so
  left per tight-diff; worth a deliberate decision at PR review whether to round them out.
- **Parallel work coordination:** builder-aspir-15 (#15) also touches `score.py`/`cli.py` and
  viewer test fixtures; whoever merges second rebases.
