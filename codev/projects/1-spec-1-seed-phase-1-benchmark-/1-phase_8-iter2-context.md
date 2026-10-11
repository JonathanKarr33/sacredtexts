# Phase 8 — iter-2 context for reviewers

Both iter-1 reviews were REQUEST_CHANGES; every accepted item was a plan deliverable
or spec criterion. Full disposition: `1-phase_8-iter1-rebuttals.md`. What changed
since iter-1 (commits `8430bb8`, `2d665a2`):

## Blocking items — fixed

1. **Token/usage totals** (codex #1, claude #1). `score.py` now writes a `usage`
   block to `summary.json`/`summary.md`: per-model and total input/output tokens
   (claude-haiku 5,810/41,140; gpt-oss-20b 10,080/80,188; gemma-3-4b 4,615/6,252;
   llama-3.1-8b 4,715/6,551; **total 25,220 / 134,131** over 400 cells — matches
   claude's independent count). Cost appears only if the run config supplies
   per-model prices (none here → omitted; prices never invented).

2. **Keyless TUTORIAL step 6** (claude #2). `config.load_config` now fails fast with
   a clear `ConfigError` (caught by `main()`) instead of a `FileNotFoundError`
   traceback; TUTORIAL step 5/6 gained an explicit **keyless** variant — score the
   committed `answers.jsonl` without `--questions/--config`. Verified in the fresh
   clone (below).

3. **≥2-provider bar provable from committed artifacts** (codex #3, claude comment).
   `score.py` writes a `panel` block (provider / model / endpoint host / served_by)
   from the run config — **no secrets** (no keys, no `api_key_env`). The committed
   `summary.json`/`summary.md` now show `claude-haiku → anthropic / api.anthropic.com`
   and the other three → `openai / openrouter.ai`: two serving providers, checkable
   without the gitignored `configs/models.yaml`.

4. **Audit "contains restricted text"** (codex #2, claude comment). `audit.py` gains
   a CONTENT layer: `restricted_text_fingerprints()` normalizes restricted unit
   texts when the held-back payloads are present locally; `audit_paths(..., restricted_texts)`
   flags any committed file containing one — catching a restricted unit mislabeled
   with a public `(work, version, language)`, which origin alone cannot see. New test
   `test_content_layer_catches_restricted_text_under_a_public_label` injects
   restricted TEXT under a public label and asserts it is caught. CI/fresh-clone has
   no payloads → origin-only there; documented in `pipelines/README.md`.

5. **Fresh-clone verbatim verification** (codex #4). Cloned `origin@builder/spir-1`
   to /tmp and ran TUTORIAL 1–7 verbatim: convert 221 docs / 349,799 entries →
   validate 221 → generate **digest `ef837474` byte-identical** to the committed
   questions → audit OK → collect keyed smoke 8/8 → keyless score reproduced the
   table (24 / 1 / 0 / 0) → viewer `realRun` test renders the committed run.

## Cheap accepts — fixed

- `configs/models.example.yaml` is now the exact panel shape that produced the run
  (Anthropic direct + 3 via OpenRouter), not unexercised seed ids.
- `test_committed_run_evidence_is_clean` globs every tracked file under `runs/`
  (`git ls-files`), so a second committed run is covered — not one hardcoded path.
- `pipelines/README.md` documents `audit.py` + the `audit` command + the
  origin/content two-layer design and its CI limitation.
- PR #3's stale draft banner is rewritten when the PR leaves draft.

## Deferred to the review doc (gated Phase-6 contract — not a Phase-8 change)

- Abstention-vs-hallucination split (`correct=0` conflates honest refusal with
  fabrication) and the 17 claude-haiku near-misses lost to the strict "exact text
  and nothing else" rule (`token_f1` already surfaces them). Both belong in
  `codev/reviews/1-*.md` / Spec 2.

Gate: `pipelines` 140 tests, `apps/viewer` 412 / 9 skipped — all green.
