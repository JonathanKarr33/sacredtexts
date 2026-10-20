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
