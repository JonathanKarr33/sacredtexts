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

## Status
- [x] Specify — spec written; iter-1 consult (both REQUEST_CHANGES, Approach B endorsed);
      spec revised to address all 3 findings + minors; rebuttal written. Advancing.
