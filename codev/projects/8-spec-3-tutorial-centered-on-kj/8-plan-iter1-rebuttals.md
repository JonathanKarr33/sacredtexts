# Plan 8 — Iteration 1 rebuttals

Both reviewers returned **REQUEST_CHANGES / HIGH**; both verified the plan against the real
code and data (Claude even enumerated the QUL marks and found the Hebrew data defect). Every
point was accepted and folded into the revised plan. No point rejected.

## Claude (verified against the worktree)

**L1 — Phase 1's Hebrew derivation yields an empty set; the catalogued `he` Aramaic files have zero niqqud. ACCEPTED (critical).**
Confirmed independently (Taanit `he` has no U+0591–U+05C7). The revised Phase 1 names the
**uncatalogued** `texts/raw/Judaism/Talmud Bavli/Shevuot - he - William Davidson Edition -
Vocalized Aramaic.json` as the Hebrew **fixture** source, with an explicit warning it must not
enter the corpus (the catalogue deliberately excludes it). This also reframes the real
scoring need: the committed Talmud expected text is *unvocalized*, so the live value of Hebrew
normalisation is the asymmetric case (L2).

**L2 — Hebrew risk is asymmetric (unvocalized expected vs. vocalized search-on answer). ACCEPTED (critical).**
Phase 1 now asserts the **asymmetric** direction in both scripts: a vocalized answer vs. an
unvocalized expected (Talmud/search-on) and a plain answer vs. the vocalized QUL expected both
score 1.0. Added a Risk row. This is the direction that would otherwise invert the spec's
headline contrast.

**L6 — Standings collision: an unmarked search-off entry shares first-run's `anthropic\u0000claude-haiku-5-5` key and replaces its row. ACCEPTED (critical).**
The encoding now marks **both** variants (`[web_search]` / `[no-tools]`), so neither equals
the bare first-run key. Phase 2's panel-identity criterion now asserts non-collision with the
committed first-run key (not merely on-vs-off distinctness). Risk row added.

**L3 — "as existing provider tests do" is false; `_anthropic` imports the SDK lazily. ACCEPTED.**
Corrected: there are no provider-seam tests; Phase 2 names the technique —
`monkeypatch.setitem(sys.modules, "anthropic", <fake>)` — and notes current mocks live at
`collect.complete`.

**L4 — SDK exposes three web-search tool versions. ACCEPTED.**
Pinned `web_search_20250305` with `max_uses: 5`, to be confirmed against SDK 1.13.0 and
recorded in the run README (it is part of what the run proves).

**L5 — `max_tokens` truncation + retry re-bills; truncated answers score 0. ACCEPTED.**
`-search` entries get `max_tokens: 4096`; `_anthropic` raises loudly on
`stop_reason == "max_tokens"` so a truncated answer is a failed cell, not a silent 0 that
also confounds the contrast.

**L7 — Stronger, safe Latin regression: re-score first-run answers to tmp and diff committed scores. ACCEPTED.**
Adopted as a Phase 1 acceptance criterion (≈400 real answers; writes only to tmp — the same
reproduce trick TUTORIAL Track A already uses).

**L8 — Approach E (`generated_at`) silently dropped. ACCEPTED.**
Included: Phase 2 stamps an additive `generated_at` (UTC ISO) into `summary.json` (viewer
ignores it), closing Issue #7's pipeline half as the human flagged.

## Codex

**C1 — Copyright-clearance mechanism unspecified. ACCEPTED.**
Phase 3 now carries a pinned procedure: review **every** search-on answer (~60), criteria
(original-language public-domain text, not a verbatim copyrighted translation), evidence
recorded in README (count, criteria, outcome), pass/fail (no copyrighted translation
committed), and flagged-answer handling (remove + re-collect, or restrict the corpus; never
truncate).

**C2 — Tools config + identity encoding abstract. ACCEPTED.**
Pinned in the Executive Summary: `tools:` list, allowed value `web_search`, default empty;
`ModelSpec.tools`; fail-fast rules; the exact both-marked `panel.model` encoding + `api_model`.

**C3 — Phase 3 lacks reproducible params and has a circular tutorial dependency. ACCEPTED.**
Phase 3 now defines the **canonical commands** (run id `runs/tutorial-2026-10-11`, seed
`20261011`, `--per-task 30`, the three resolved standardized paths, `max_uses: 5`). The
circularity is resolved: the plan/run is canonical; Phase 4's tutorial must *reproduce* these
commands (verified in Phase 4), not the other way round.

**C4 — The first-run digest test is vacuous. ACCEPTED.**
Replaced with a regeneration test: regenerate the first run's question set from its
`.manifest.json` parameters + converted inputs and compare the recomputed digest to the
committed one — exercising `generate` + `normalize`, not a hash of the committed file.

**C5 — `summary_markdown` renders only accuracy, but Phase 3 wanted submetrics in `summary.md`. ACCEPTED.**
Phase 3's criterion now relies on `summary.json` + the viewer explorer for the discriminating
`exact`/`normalized`/`token_f1`, with per-entry accuracy visible in `summary.md`; adding
submetric columns to `summary_markdown` is an optional nice-to-have (contract unchanged), not a
requirement — so no scoring-contract pressure.

**C6 — "Fold the maqaf" must state the transformation. ACCEPTED.**
Pinned: combining marks and tatweel are **deleted**; the Hebrew **maqaf (U+05BE) → space** (a
word boundary), so adjacent words do not concatenate.

## Net

All plan-consult findings incorporated; the three critical ones (Hebrew-data no-op, asymmetric
scoring, standings collision) materially changed Phase 1 and Phase 2. The phase structure and
the zero-viewer-change approach — both explicitly verified sound by the reviewers — are
unchanged.
