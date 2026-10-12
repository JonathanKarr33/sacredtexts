### Iteration 1 Reviews
- codex: APPROVE — Phase 3 correctly updates all four authoritative documents to the panel.tools model, removes stale marker guidance, preserves the valid config example, and respects hot-tier limits.
- claude: REQUEST_CHANGES — Doc corrections are accurate and the grep/walkthrough gates hold, but TUTORIAL.md keeps an Approach-A-era claim ("four tutorial entries appear as four distinct rows") that Approach B makes mtime-dependent and that the spec explicitly forbids claiming.

### Builder Response to Iteration 1
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


### Iteration 2 Reviews
- codex: APPROVE — Phase 3 documentation now accurately describes the tools-aware panel identity, dedupe behavior, seven-row outcome, and unchanged mtime-based winner selection.
- claude: REQUEST_CHANGES — The four enumerated Phase 3 docs are accurate and the iter-1 TUTORIAL fix is correct, but `apps/viewer/README.md` still asserts the now-false `(provider, model)` standings key — and arch-critical directs agents to read it before viewer work.

### Builder Response to Iteration 2
# Phase 3 (iter 2) — Rebuttal / disposition of consult feedback

**Verdicts:** codex `APPROVE` (HIGH, no issues); claude `REQUEST_CHANGES` (HIGH, 1 scope item + 3 nits).

**Outcome:** the 3 nits are fixed. The 1 substantive item (`apps/viewer/README.md`) is a **baked-scope
question** raised with the architect — see below. Re-verified after the nit fixes: scoped grep → only
the permitted `TUTORIAL.md:144`; `.codev/checks/test.sh` green (viewer passed; pipelines 292 passed /
1 pre-existing unrelated skip).

---

## `apps/viewer/README.md:44-47` asserts the now-false `(provider, model)` standings key

**Point (claude).** `apps/viewer/README.md:44-47` still says standings is "keyed on the run panel's
`(provider, model)` identity." This PR's `aggregate.ts` change (Phase 2) falsified it — the key is now
`(provider, model, tools)`. It matters because `arch-critical.md` directs agents to "read
`apps/viewer/README.md` before touching it," making it the designated viewer-work entry point; a false
2-tuple claim there is the same regression vector Phase 3 exists to close. Claude notes it is "not in
the spec's enumerated falsified-doc list or the plan's Phase 3 file list" and offers it as a legitimate
"defer to PR review" item if the architect holds the enumeration strictly.

**Disposition: NOT a false positive — the finding is correct. FIXED, under explicit architect
authorization (deviation from the baked enumeration).** The spec's Constraints bake governance-doc scope
as: "limited to docs the change *falsifies* (`arch-critical.md`, `arch.md`, `CODE_WALKTHROUGH.md`,
`TUTORIAL.md`, the tutorial run's `README.md`)" — a closed enumeration that does **not** include
`apps/viewer/README.md`. Per the builder protocol, crossing a baked "limited to" boundary is the
architect's call, so I did not edit it unilaterally and surfaced it via `afx send`.

**Architect (main), 2026-10-12T17:34Z — authorized option A:** "fix apps/viewer/README.md's
standings-key line to (provider, model, tools). The spec's 'limited to' list was a scope guardrail, not
a licence to leave a falsified doc that arch-critical routes agents to — correcting documentation your
own change invalidated is squarely the spec's goal. Note the enumeration deviation + this authorization
in your review doc, then proceed with porch done."

**Applied** (`apps/viewer/README.md:44-48`): "keyed on the run panel's `(provider, model)` identity (so
a model renamed between runs still dedupes to one row)" → "keyed on the run panel's
`(provider, model, tools)` identity (a missing `tools` ⇒ `[]`), so search-on/off stay distinct rows
while two runs of the same model with the same tools dedupe to one". (`README.md:13-14`'s loose "`panel`
(provider/model/endpoint)" summary left as-is — it already omits `served_by`.) Scoped grep re-run over
all five docs → still only the permitted `TUTORIAL.md:144`; gate green.

> **Carry into the review doc:** `codev/reviews/11-*.md` (written in the Review phase) must record this
> deviation from the spec's enumerated governance-doc list (added `apps/viewer/README.md`) and the
> architect's explicit authorization above.

## Nit 1 — ragged re-wrap in `CODE_WALKTHROUGH.md:341-343` (`claude`)

**Disposition: ACCEPTED — fixed.** Re-flowed the "Tools are validated — and fail-fast …" paragraph so
the lines wrap evenly. No pointer or symbol changed; walkthrough guard test still green.

## Nit 2 — ragged re-wrap / long line in `arch.md:104-108` (`claude`)

**Disposition: ACCEPTED — fixed.** Re-flowed the standings clause; collapsed the duplicated
"`(provider, model, tools)` identity" to "that identity" and tightened the trailing parenthetical so no
line exceeds the file's prior width.

## Nit 3 — `TUTORIAL.md:205` "same-date tie" imprecise (`claude`)

**Disposition: ACCEPTED — fixed.** `aggregate.ts` ties on exact `mtimeMs`, not calendar date. Changed
"on a same-date tie" → "on an mtime tie." The 7-row claim is unaffected.

## Nit 4 — `arch-critical.md:9` is now the hot file's longest fact (`claude`)

**Disposition: ACCEPTED — fixed.** Dropped the trailing "(Spec 11, Approach B)" provenance tag from the
hot fact (the cold `arch.md` retains the pointer). The hot tier carries current-state behaviour, not
provenance, so the line is leaner and the density creep is reversed.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
