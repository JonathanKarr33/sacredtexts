# Spec 15 — Rebuttal to iteration-2 plan review (codex + claude)

Iteration-2 verdicts: **codex REQUEST_CHANGES** (docs completeness + validation rigor), **claude COMMENT**
(approach/deltas/nine-guard surface/rebaseline mechanics all independently re-verified correct; five small
precision gaps). No approach-level disagreement from either. **All points accepted and folded into the
revised plan.** I verified the two concrete new claims (TUTORIAL.md staleness, CLI writer format) against the
code, and recomputed the disputed tradition breakdown.

## codex: TUTORIAL.md still shows the old headline — ACCEPTED

Verified (`TUTORIAL.md:94-103`): it presents opus 66 % / haiku-search 40 %, calls the strict headline
"misleading", and frames containment as external analysis. Added to Phase 2 docs with the adopted-contract
update.

## codex: lessons-critical.md / lessons-learned.md contradict the sanctioned rebaseline — ACCEPTED (scoped)

The "never re-run score over committed evidence" lesson is now contradicted by this PR's sanctioned in-place
re-score. **Change:** Phase 2 adds a one-line **sanctioned-exception caveat** to both lessons docs (factual,
order-independent). I deliberately **do not** rewrite the headline-contract governance line in those docs or
`arch-critical.md` here, because the headline reshape is **not final until the human confirms it at the PR
gate** — that hot-tier update is routed to a post-PR MAINTAIN follow-up. Writing "headline reshape is
sanctioned" before confirmation would be premature. This scoping is stated in the plan.

## codex: validation may use aggregates — ACCEPTED

Correct — aggregates can't prove "nothing else moved" (compensating changes preserve totals). **Change:** the
mandatory validation now requires the **exact 21 hard-coded `(model_id, question_id)` pairs** *plus* a
pre/post projection asserting `exact`/`normalized`/`token_f1` unchanged on every row and `correct` unchanged
outside the 21. Removed the "or per-cell aggregates" option (kept only as a secondary check).

## codex + claude: summary regeneration procedure incomplete / serialization unpinned — ACCEPTED

Verified `cli.py` writes `json.dump(summary, f, indent=1)` + trailing `"\n"` for `summary.json`,
`summary_markdown(summary)` for `summary.md`, and passes `expected_digest = gen.question_set_digest(qs)`.
**Change:** the rebaseline procedure now pins all three (writer params, md writer, committed digest). An
`indent=2` would have made the pre-registered honest diff unauditable.

## claude: CODE_WALKTHROUGH has ~12 `score.py:N` pointers that shift — ACCEPTED

Phase 1 edits the module docstring, `_SUBMETRICS`, `score_answer`, and `score_file`, moving most pointers;
`test_code_walkthrough.py` only checks in-range, so stale pointers fail **silently**. **Change:** Phase 2 now
says **re-derive every `score.py:N` pointer** (enumerated the ~12), not just "check §4".

## claude: pin the insert position — ACCEPTED

**Change:** `contains_reference` is appended **after `token_f1`** in `_SUBMETRICS` and placed **before
`correct`** in the `score_answer` dict, so both diffs are append-only.

## claude: StandingsPage.test.tsx:134 unnamed — ACCEPTED

**Change:** added `StandingsPage.test.tsx:134` (`"24% (n=100)"` first-run → `25%`) to the enumerated
viewer-guard list; left only `realRun.test.ts` in the "re-check if red" bucket.

## claude + codex: inherited factual drift ("all Qur'an") — ACCEPTED (spec corrected)

Recomputed the tradition breakdown of the 20 flips myself: haiku-search 12 (**all Sunni Islam / Qur'an**),
opus-search 8 (**7 Judaism / Talmud + 1 Sunni Islam**) → **13 Qur'an + 7 Talmud**, *not* "all Qur'an". The
first-run flip is 1 LDS cell. **Change:** corrected the **spec** Problem Statement and the plan's delta
description; Phase 2's tutorial-README correction now fixes "Talmud 8 of 34" → 7, and the first-run high-F1
miss count to ~17 (≥0.9) / ~23 (≥0.8) with "exactly 1 contained" preserved.

## Cross-builder coordination folded in (architect relay, aspir-11)

aspir-11 changes the emitted panel shape (`panel.model`→raw, `+panel.tools`, `-api_model`) and migrates the
**tutorial** `summary.json` to it (not first-run). **Change:** added a risk row — scores.jsonl and the
`contains_reference`/accuracy deltas are panel-shape-independent (contract holds either order); the tutorial
`summary.json` panel block is merge-order-dependent (rebase onto whichever `score.py` is on `main`; viewer
standings fixtures key on `panel.tools` if aspir-11 lands first); first-run is untouched, so its verbatim
panel + `api_model` pre-registration hold regardless.

---

**Net:** every codex REQUEST_CHANGES point and every claude COMMENT gap closed; one verified factual error
("all Qur'an") corrected in both spec and plan; cross-builder panel-shape dependency captured. Deltas,
approach, guard surface, and rebaseline mechanics were independently re-verified correct by claude, so the
approach is unchanged.
