# Phase 3 (iter 1) — Rebuttal / disposition of consult feedback

**Verdicts:** codex `APPROVE` (HIGH, no issues); claude `REQUEST_CHANGES` (HIGH, 1 blocking + 3 non-blocking).

**Outcome:** every point accepted and fixed. Re-verified: scoped grep → only the permitted
`TUTORIAL.md:144`; `.codev/checks/test.sh` green (viewer passed; pipelines 292 passed / 1
pre-existing unrelated skip). Diff remains prose-only across exactly the four target docs; Spec 8
historical artifacts untouched.

---

## BLOCKING — TUTORIAL.md kept an Approach-A-era claim (`claude`)

**Point.** The rewrite kept "the four tutorial entries appear as **four distinct rows**." Under
Approach B the tutorial's search-off `claude-haiku-5-5` now keys *identically* to first-run's bare
`claude-haiku-5-5`; `aggregate.ts` picks the row by run-directory mtime (tie → run id ascending →
`first-run`), so there are four distinct *keys* but not four tutorial-sourced *rows*, and the total
across both runs is **7**, not 8. The spec is explicit: "does not promise a specific winner between
two same-date runs" / "Do not claim a winner."

**Disposition: ACCEPTED — fixed.** The claim was indeed falsified by the very change this spec
makes; claude is correct and the spec language is unambiguous. Reworded the standings bullet
(`TUTORIAL.md`) to:
- say the tutorial's four entries are **four distinct standings keys** (search-on rows carry a
  `web_search` tag; search-off rows carry none; model id shown unmarked);
- state that the search-off haiku collapses with first-run's bare haiku to a **single** row, so
  across both runs the reader sees **7** rows, not 8, and the first-run haiku row is "supersedable
  rather than orphaned" (matching the register of `runs/tutorial-2026-10-11/README.md:17-20`);
- add the mtime/id tiebreak caveat (git does not preserve mtimes → on a same-date tie the
  lexicographically-smaller run id wins) and name issue #7 as the out-of-scope recency fix.

No winner is claimed; the guarantee stated is the collision + the 7-row count, exactly as the spec
frames it.

## Non-blocking 1 — grep-letter circumlocution hurts readability (`claude`)

**Point.** Prose was reworded to avoid literal tokens even in negations (e.g. "no separate duplicate
id field" rather than naming `api_model`), which is opaque and ungreppable. Prefer naming the field
and whitelisting those lines.

**Disposition: ACCEPTED — resolved by simplification (not by naming the field).** Rather than widen
the plan's grep whitelist (criterion #1 names `TUTORIAL.md:144` as the sole permitted hit, and the
grep is the agreed proxy for "no marker *instruction* remains"), I removed the opaque circumlocution
entirely. The `update-arch-docs` skill is explicit that these docs describe **current state** and
reject "retired-component graveyards" / per-spec changelog framing — a dropped field need not be
memorialized. `arch-critical.md:9`, `arch.md:78-80`, and `CODE_WALKTHROUGH.md` now simply state the
current shape (raw `model`, no inline marker, real `panel.tools` list). This removes the opacity
claude flagged *and* keeps the gate green without reintroducing the literal tokens — a cleaner
result than whitelisting.

## Non-blocking 2 — CODE_WALKTHROUGH.md dropped a `file:line` pointer (`claude`)

**Point.** `cli.py:349` became a bare `(cli.py)`, breaking the doc's file:line convention; and the
written panel snapshot is actually emitted by `score.py` (cli.py only builds the in-memory dict).

**Disposition: ACCEPTED — fixed.** Restored a pointer as `score.py:430` — the line that writes
`"tools"` into the committed panel snapshot, which is the correct referent for this
evidence-integrity bullet (the committed artifact's identity). The walkthrough pointer-guard test
now validates it (`test_pointer_resolves_and_line_in_range`); pipelines went 291→292 passing.

## Non-blocking 3 — arch.md "newest run per model" (`claude`)

**Point.** With the new key the rollup is per `(provider, model, tools)`, not per model.

**Disposition: ACCEPTED — fixed.** `arch.md` now reads "the newest run per `(provider, model,
tools)` identity winning."
