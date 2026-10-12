# Spec iter-1 rebuttals — Project 11 (Approach B: real `panel.tools` field)

Both reviewers returned **REQUEST_CHANGES (HIGH)** while endorsing Approach B and confirming the
spec's code analysis is accurate. All findings are surgical; I accepted every substantive one.
Summary of disposition below.

## Finding 1 (BLOCKING, both reviewers) — the supersession criterion is not deliverable by the key change

**Point.** Success criterion 5 and the Desired State claimed "the tutorial run's no-tools
`claude-haiku-5-5` row **supersedes** first-run's bare row." But standings recency is the run
**directory's filesystem mtime** (`aggregate.ts:76` fed by `runIndex.ts`/`StandingsPage.tsx:34`),
not `generated_at`. git does not preserve mtimes, so on a clone/CI the two run dirs tie, and the
id-ascending tiebreak picks `first-run-2026-10-11` (`f` < `t`) — the **stale** row wins. A test
with hardcoded mtimes (like today's `tutorialRun.test.ts:75-78`) would pass while the real page
shows stale data — precisely this repo's `lessons-critical.md` warning.

**Accepted — fully.** I verified the tiebreak direction myself (`aggregate.ts:76`:
`mtimeMs === prev.mtimeMs && runId < prev.runId` → smaller id wins the tie → `first-run`). The
spec now:
- Reframes the deliverable as the key **collision / dedupe** (bare rows become *supersedable* —
  they share a key with same-model/same-tools runs — instead of orphaning forever). It no longer
  claims the tutorial wins.
- States explicitly that *which* run supplies the surviving row follows the **existing,
  unchanged** mtime/id recency rule, and that making recency calendar-accurate via
  `generated_at` is **Issue #7**, out of scope under the tight-diff constraint.
- Rewrites criterion 5, the Desired State bullet ("Bare rows become supersedable — not 'the
  tutorial always wins'"), the Test Scenarios, and adds a top Risk: any directional-supersession
  test must **inject distinct mtimes** and is labelled as a demonstration, while the asserted
  guarantee is the collision + the row count. Added a "Resolved" note in Open Questions.

I chose the "narrow the criterion" option (both reviewers offered it) over pulling recency onto
`generated_at`, because the latter widens scope against the architect's explicit tight-diff
constraint and is Issue #7's job.

## Finding 2 (claude) — committed `summary.md` + `summary_markdown` table + falsified docs unscoped

### 2a. `summary.md` migration
**Point.** The marker also lives in `runs/tutorial-2026-10-11/summary.md:27-30`, and `score`
rewrites the Markdown **only if `--summary-md` is passed** (`cli.py:360`). Regenerating only the
JSON would leave the run dir self-inconsistent (raw `model` in JSON, `[no-tools]` in MD), and
`test_tutorial_run.py:73` reads `summary.md`.

**Accepted.** The migration criterion and Approach 3 now cover **both** `summary.json` and
`summary.md`, regenerated with `score --config --summary-md`. Added a JSON/MD-skew risk row and a
Current-State note that the MD is `--summary-md`-gated.

### 2b. `summary_markdown` panel table loses the arm distinction
**Point.** `summary_markdown` (`score.py:484-494`) renders `| model_id | provider | model |
endpoint | served_by |`. With a raw `model`, `haiku` and `haiku-search` show an identical `model`
cell — the human-readable proof loses the search-on/off distinction, while `arch-critical.md`
says tool-use *is* panel identity.

**Accepted — decided: add a `tools` column.** New success criterion + Desired-State bullet +
Approach-1 note + a Test-Scenario line. This keeps the proof honest and consistent with
`arch-critical.md`, at the cost of one column — minimal, per the simplicity preference.

### 2c. Falsified docs (incl. always-on `arch-critical.md`)
**Point.** No criterion covered the docs the change falsifies: `arch-critical.md:9` (always-on
hot-tier, asserts the marker AND "a zero-viewer-change property"), `arch.md:103`,
`CODE_WALKTHROUGH.md:339`, `TUTORIAL.md:199` (user-facing), `runs/.../README.md:17`.

**Accepted.** I grepped the whole repo for the marker and split results into *authoritative docs
to correct* (`arch-critical.md`, `arch.md` lines 79+103, `CODE_WALKTHROUGH.md`, `TUTORIAL.md`,
the run `README.md`) versus *historical Spec-8 records to leave* (`codev/plans/8-*`,
`codev/projects/8-*`, `codev/reviews/8-*`, `codev/state/aspir-8_thread.md` — these correctly
record what Spec 8 did and should not be rewritten). Added a doc-update success criterion, a
Constraints clause scoping it, a Current-State listing, and a Risk row (a stale always-on doc
would tell a future agent to restore the marker). The `arch-critical.md`/`arch.md` edits will go
through the `update-arch-docs` skill per repo convention.

## Finding 2′ (codex) — regeneration conflicts with the "never re-run score over committed evidence" lesson

**Point.** Writing the regenerated outputs in place conflicts with `lessons-critical.md`
("never re-run collect/score over committed evidence — write to a fresh `runs/<id>/`").

**Accepted.** Approach 3 now regenerates into a **fresh temporary directory**, byte-diffs the
temp `scores.jsonl` against the committed one (must be identical) and confirms only
panel + `generated_at` moved, and only then copies the two regenerated files into the committed
run dir. The committed evidence is never scored over in place. A Constraints clause and the Risk
mitigation were updated to match; the surgical panel-only edit remains the documented fallback.

## Finding 3 (claude) — the Python standings-key mirror also inverts

**Point.** The test-rewrite criterion named only `test_tutorial_run.py`'s key-set change, but
that file also has a **Python mirror** of the viewer standings key — `_standings_key()` (line 29),
`FIRST_RUN_KEY` (line 20), and `test_panel_has_four_distinct_standings_identities` asserting
`FIRST_RUN_KEY not in keys` (line 42). Under Approach B that assertion must **invert** (the
tutorial's no-tools haiku key must now *equal* first-run's) and the mirror must gain the tools
segment.

**Accepted.** I confirmed the lines by reading the file. The test-rewrite criterion now
explicitly requires: updating `_standings_key` to include the tools segment, updating
`FIRST_RUN_KEY`, and **inverting** `FIRST_RUN_KEY not in keys` to a collision assertion. Added a
dedicated Risk row and a Test-Scenario (integrity) line.

## Minor points (claude)

- **"exactly" vs `⊆`/`==`.** Resolved: the written key-set is asserted with **exact equality**
  (`==`) to `{provider, model, tools, endpoint, served_by}`; `test_tutorial_run.py`'s `⊆` is
  tightened to `==` to match `test_phase2_tools.py`. Criterion updated.
- **`score.py:421` synthesised-entry path needs a `tools` default.** Accepted — added a success
  criterion: the `set(usage) | set(panel)` path defaults `tools` to `[]` so every emitted entry
  has the field (the viewer default covers the viewer, not the artifact).
- **Row count = 7.** Accepted — the spec now states "7 rows (4 tutorial arms + 3 non-overlapping
  first-run models)" explicitly rather than "the corrected total row count."
- **`tools` already sorted / `price_in`/`price_out` never reach the artifact.** Confirmed by both
  reviewers; no change needed (criterion already relies on it).

## Net

No disagreements — every substantive finding was accepted and folded into the spec. Approach B,
the tight-diff scope, and the drop of `api_model` stand. The headline correction is honest
scoping: this spec delivers the **dedupe/collision** (the actual defect — permanent
non-supersedable duplicates), and names Issue #7 as the separate, out-of-scope work that would
make recency calendar-accurate.
