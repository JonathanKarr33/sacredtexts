# PR review (review phase) iter-1 — rebuttal / disposition

Both PR-level reviews were REQUEST_CHANGES (codex, claude). The architect's
integration review consolidated them into 4 pre-merge items + 4 to disposition; all
are handled in commit `e8b10ec` (and `81c109a` for the digest/schema pair). Full
narrative in the review doc's **Review phase — PR #3** section.

## codex

1. **`score` never compares the answers' digest with `--questions`.** → **Addressed**:
   `score_file(..., expected_digest=)`; the score CLI passes `question_set_digest(qs)`
   and scoring refuses when the answers' stamped digest differs. Regression test
   `test_score_rejects_digest_not_matching_questions`.
2. **`schema.parse_document` str()-coerces null/blank/non-string source metadata.** →
   **Addressed**: work/version/language/document_type must be non-empty strings and
   every tradition value non-empty; 6 new fail-fast cases.
3. **Branch history not `[Spec 1][Phase:]`-compliant (many `chore(porch)` commits, 118
   total).** → **Rebutted (+ deferred to the merge)**: the `chore(porch)` commits are
   framework-generated state transitions, not builder commits; claude independently
   confirmed **every non-porch commit matches the format, zero violations**. Squashing
   would erase the phase-by-phase consult history. The merge strategy (squash vs merge)
   is the human's call at the `pr` gate; squash-merge is available if a single commit on
   `main` is preferred.

## claude

- **Five files of fixes were uncommitted; `git grep expected_digest HEAD` empty.** →
  **Addressed**: committed + pushed (`81c109a`, then `e8b10ec`); the codex consult output
  is tracked. (The review was mid-edit — the fixes were real, just not yet committed.)
- **Review doc misreports consults (Phases 2/4/5; "every phase converged").** →
  **Addressed**: replaced with an accurate per-phase final-verdict table, corrected the
  2/4/5 lines, and added a **Review phase** disposition subsection. Thanks — this was a
  real documentation defect.
- **`score.py:22-24` overclaims the anti-hedge guarantee (prose hedges score 1).** →
  **Addressed**: docstring now has a SCOPE block stating the anti-hedge counts only
  formally-shaped citation candidates; prose-form hedges are a Spec-2 refinement.
- **`parse_yes_no` / `identify_source.work_found` gameable by negation.** → **N/A here /
  Spec 2**: the committed run is `retrieve_quote`-only, so no `verify_source` /
  `identify_source` number is reported; the docstring now flags "harden before reporting
  those tasks" and the review doc lists it as pre-paper follow-up.
- **`sacredbench audit` raises `ConvertError` when a TLG payload is present** (unregistered
  `tlg` converter). → **Addressed**: the content layer skips restricted targets whose
  converter is unregistered with a loud warning; origin layer stays enforced.
- **`test_collect.py` fake returns `input_tokens`/`output_tokens` while the seam yields
  `in`/`out`; `config.py`/`providers.py` untested.** → **Addressed**: fake now returns
  `{in,out}` (the real `complete` contract), and the collect panel-fingerprint test
  asserts it; broader direct `config`/`providers` tests recorded as follow-up.

## Architect pre-merge items (summary; detail in the review doc)
1 audit-skip-unregistered-converter · 2 NABRE real list shape · 3 dispatcher routes
runs/texts · 4 collect panel fingerprint + score digest bind — all **Addressed**.
5/6 scoring hardening → **Spec 2**; 7 manifest `inputs` → **Addressed**; 8 Vatican
encyclicals © LEV → **escalated to the humans** (licensing sign-off, not a code change).

Gate: `pipelines` 150, `apps/viewer` 412 / 9 skipped — green. Committed evidence
re-verified reproducible (digest `ef837474` byte-identical).
