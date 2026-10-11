# Phase 8 — iter-1 consult disposition

Both reviewers REQUEST_CHANGES; both independently re-ran the pipeline and confirmed
the evidence is real (claude re-derived questions, scores and summary **byte-identically**;
both confirmed the 0% scores are genuine refusal/fabrication, not a format artifact).
All accepted items are plan deliverables or spec criteria.

## Blocking — fixed

1. **Token/usage totals absent** (codex #1, claude #1 — plan deliverable + spec criterion).
   → `score.py` now computes a `usage` block (per-model + total input/output tokens;
   optional cost only when the run config supplies per-model prices — never invented)
   in `summary.json` and `summary.md`. Totals match claude's independent count
   (25,220 in / 134,131 out over 400 cells). Regenerated the committed summary.

2. **TUTORIAL step 6 tracebacks for a keyless reader** (claude #2 — the spec's demo
   path). → `load_config` now fails fast with a clear message (not `FileNotFoundError`),
   `ConfigError` is caught by `main()`, and TUTORIAL step 5/6 gained an explicit
   **keyless** variant (skip collect; score the committed `answers.jsonl` without
   `--questions/--config`). Verified: keyless score produces the table; missing config
   prints a clean error.

3. **≥2-provider bar not provable from committed artifacts** (codex #3, claude comment —
   spec wants it verified by artifacts, panel config is gitignored). → `score.py` writes
   a `panel` block (provider / model / endpoint host / served_by) from the run config —
   **no secrets** (no keys, no `api_key_env`). The committed `summary.json`/`summary.md`
   now show `claude-haiku → api.anthropic.com` and the other three → `openrouter.ai`:
   two serving providers, four model vendors, checkable without the gitignored config.

4. **Fresh-clone verbatim verification not done** (codex #4 — acceptance criterion).
   → performed a real fresh clone and ran TUTORIAL top-to-bottom (see thread log /
   `## Fresh-clone verification` below).

5. **Audit origin-only vs "contains restricted text"** (codex #2, claude comment — plan
   wording + acceptance "would fail on injected restricted text"). → `audit.py` gains a
   CONTENT layer: `restricted_text_fingerprints()` normalizes restricted units when the
   held-back payloads are present locally, and `audit_paths(..., restricted_texts)` flags
   any committed file containing one — catching a restricted unit mislabeled with a
   public source. New test injects restricted **text** under a public label and asserts
   it's caught; origin layer still always runs. Limitation (CI has no payloads → origin
   only) documented in `pipelines/README.md`.

## Cheap accepts — fixed

- **`models.example.yaml` was unexercised seed ids** (claude, codex #3): replaced with
  the exact shape of the panel that produced the run (Anthropic direct + 3 via OpenRouter).
- **Gate audited one hardcoded run path** (claude): `test_committed_run_evidence_is_clean`
  now globs every tracked file under `runs/` (via `git ls-files`), so a second committed
  run is covered.
- **README omitted `audit.py`/`audit`** (claude): added the audit step + module-map entry
  + the origin-vs-content two-layer explanation.
- **PR #3 body stale draft banner** (both): rewritten when taking the PR out of draft.

## Deferred to the review doc / Spec 2 (not a code change here)

- **Abstention-vs-hallucination split** (claude's closing observation): `correct=0`
  conflates honest refusal (haiku on the encyclicals) with fabrication (gemma/llama);
  given Phase 1's "reject false premises" objective this split is the most interesting
  signal, but the Phase-6 scoring contract is gated — it belongs in the review doc and
  Spec 2, not a Phase-8 contract change. Recorded in `codev/reviews/1-*.md`.
- **The 17 claude-haiku near-misses** (text retrieved, lost to the strict "exact text and
  nothing else" rule): `token_f1` already surfaces this; a relaxed "quote-contained"
  metric is a reasonable Spec-2 refinement, not a gated-contract change now.
