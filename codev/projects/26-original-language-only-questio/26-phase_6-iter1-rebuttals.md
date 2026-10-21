# Spec 26 Phase 6 — Rebuttal to iter-1 consult (codex + claude, both REQUEST_CHANGES)

Both reviewers independently verified the run evidence is sound (digest + re-score both
byte-identical, audit clean, 362 tests green, OpenRouter substitution properly authorized). The two
substantive findings converged, plus codex caught false headline claims. All accepted and fixed in
`[Spec 26][Phase: implement] fix: phase-6 consult — regression guard + correct run evidence claims`.

## 1. Missing generation-invariance anchor + a docstring that lies about it (codex #2, claude #1/#2) — ACCEPTED (main)
Phase 2 retired the first-run *generation* guard on the explicit promise that the fresh Spec-26 run
would re-establish it, and `test_first_run_regression.py:14` asserted as fact that the anchor is
"digest-pinned there" — but no test pinned `ca5b5d5372f81603` or re-scored the new run. The repo had
**zero** generation-invariance coverage after Phase 2. Fixed: new
`pipelines/tests/test_original_run_regression.py` with two guards mirroring the existing re-score
pattern —
- `test_rescoring_committed_original_run_reproduces_scores`: re-scores
  `runs/original-2026-10-21/answers.jsonl` → byte-for-byte equal to committed `scores.jsonl` (always
  runs; this is the only committed evidence exercising Arabic/Aramaic `normalize()`, leading-stance
  `parse_yes_no`, and `cite_passage`/`complete_unit` over 1,427 real answers);
- `test_regenerating_original_run_reproduces_digest`: regenerates from the committed manifest's own
  `inputs`/`seed`/`per_text`/`negatives_share` via the real `cli.generate` path and asserts the pinned
  digest `ca5b5d5372f81603` + corpus hash (skips if `texts/standardized/` absent, i.e. in CI/fresh
  clone where the rebuilt corpus is gitignored).

Both pass. The `test_first_run_regression.py:14` docstring now points at the concrete new test instead
of asserting an anchor that didn't exist.

## 2. False headline claims in the run evidence (codex #1) — ACCEPTED
`README.md` and `TUTORIAL.md` claimed "**KJV scores 100% for all three models**" and "opus **93–100%**
on every English text". The per-text scores disprove both: KJV is opus 100% / haiku 100% but
**`gpt-oss-20b` 16%**; opus is **86%** on Doctrine and Covenants (so the English range is 86–100%, not
93–100%). Corrected both documents to: KJV 100% by **both frontier models** (gpt-oss-20b 16% even
there); opus **86–100%** across English texts. The Arabic/Aramaic figures (opus Qur'an 86% / Talmud
32%, haiku Talmud 29%) were already correct and unchanged.

## 3. TUTORIAL "four contestants / search on-vs-off" contradicts the repointed 3-model run (claude #3) — ACCEPTED
§2 and §8 described four contestants and a "Search on vs off" comparison while step 8 now lands the
reader on the three-model, search-off reference run. Reconciled without losing the tutorial's own
four-contestant framing (that panel is what the reader runs from `models.example.yaml` in step 5):
- §2 now scopes the four-contestant language to "the panel **you** will run" and adds that the
  *shipped* reference run is a different panel — three models, all search-off, three rows, no search
  comparison.
- §8 leaderboard: "ranks the **models in the selected run**" (was "the four contestants"); the
  "Search on vs off" line is explicitly scoped to the tutorial panel, not the shipped run.
- §8 standings: the four-row example is scoped to "the tutorial panel (once you run it)", and the
  dedup example now names the shipped reference run as another search-off row.

## 4. README audit line quoted the wrong path count (claude #4) — ACCEPTED
`README.md` quoted `copyright audit OK — 2 path(s)` (that was `audit runs/… texts/standardized`, two
args). Auditing just the run is `audit runs/original-2026-10-21` → **1 path(s)**. Fixed the quote and
named the exact command that produces it.

## 5. verify_source refused = 0/357 never exercises the #23 hardening with a real refusal (claude, note — no action) — ACKNOWLEDGED
True and already stated plainly in the run README (with the `**Yes.**` / trailing-explanation cases it
*does* exercise). Carried into the review doc as a known **evidence gap** (the unit tests in
`test_score.py` cover the negation-evasion refusal path; no live cell triggered it), not a defect.

## Net
Generation-invariance is restored and genuinely digest-pinned (364 tests pass, +2). The committed
run evidence no longer contains an unsupported accuracy claim, the audit quote matches a reproducible
command, and the TUTORIAL's shipped-run framing matches what a reader actually sees. Audit origin-clean;
re-score byte-for-byte.
