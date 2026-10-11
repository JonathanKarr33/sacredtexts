# arch.md — System Architecture (COLD / reference)

On-demand reference. The always-injected subset lives in `arch-critical.md`.
Seeded from Spec 1 (Phase 1 benchmark) — the first implementation round.

## Repository shape

- `pipelines/` — single `uv` project `sacredbench`; run `uv --project pipelines run
  python -m sacredbench …` from the repo root.
- `apps/viewer/` — React 19 / Vite / TS / Tailwind 4 / HeroUI v3 (provider-less) /
  TanStack; a seed port of multibench's multibrowser plus a self-contained local
  results view.
- `texts/` — the corpus (two tiers, below). `configs/` — model panels. `runs/` — run
  evidence (gitignored except the committed first run). `codev/` — SPIR artifacts.

## Texts: two tiers + catalogue

- `texts/raw/<tradition>/` holds committed source payloads + one `source.yaml` per
  tradition. `source.yaml` is a **targets manifest** (shared provenance + a `targets:`
  list), not one flat record; each target = `{payload glob, converter, work, version,
  language, document_type, tradition[], license, license_detail?}`.
- `license` is the 3-value gate: `public-domain` / `open` / `restricted`. Restricted
  payloads (NABRE, the Greek Orthodox TLG extracts) are gitignored/local-only; their
  `source.yaml` is still committed so the catalogue stays complete and auditable.
- `texts/standardized/<source-id>/<target-slug>/` is the converted output (gitignored;
  rebuilt by `convert`). The standardized path mirrors the raw path so `generate`
  recovers a document's licence from its path. `convert`/`generate` exclude
  `restricted` targets unless `--include-restricted`.
- `catalogue.py`: `Target`/`Source`/`Provenance`, `discover_catalogue` (globs
  `texts/raw/**/source.yaml`), `select_targets`, path↔licence mapping; fail-fast on
  unknown licence, bad target, or missing field.

## Interchange format (working-group flat JSON)

`{source:{tradition[], work, version, language, document_type, source_url?},
entries:[{unit_type, citation, text}]}`. `tradition` is a **list** (traditions share
texts). `export.py` assembles standardized shards per `(work, version, language)`
with a tradition union, dedup by `(citation, text)`, and an inverse-grouping
round-trip that proves no invention/reordering.

## Pipeline (four subsystems, JSONL seams)

`convert` → `texts/standardized` → `generate` → `questions.jsonl` → `collect` →
`answers.jsonl` → `score` → `scores.jsonl` + `summary.{json,md}`.

- **generate.py**: six working-group templates; deterministic (content-derived ids,
  seeded); version-gated with overlap exclusions; tradition-balanced (`_balanced_sample`
  sorts sub-pools by content before the seeded shuffle, so it is input-order
  independent); writes a `.manifest.json` (seed, params, corpus hash, question-set
  digest).
- **collect.py**: concurrency-bounded fan-out; **resumable** (skips answered
  `(question_id, model_id)` cells); failed cells stay pending and the run exits
  non-zero; stamps the question-set digest on every row and refuses to resume a file
  built for a different question set.
- **providers.py**: `anthropic` / `openai` (any OpenAI-compatible host via
  `base_url`+`api_key_env`, e.g. OpenRouter) / `gemini`; keys from env only; missing
  credentials fail before any network call; bounded retries; per-call timeout.
- **score.py**: per-task headline contract — `retrieve_quote`/`complete_unit` →
  normalized full-string match (+ exact/token-F1); `verify_source` → yes/no;
  `identify_version` → label exact/normalized; citation tasks → the single extracted
  citation must equal ground truth (a multi-candidate hedge scores 0; extractor chosen
  by the ground-truth citation shape). Emits per-model × task × **tradition** breakdown
  with a missing-cell roster, a `usage` block (per-model + total tokens; cost only when
  every model is priced — prices never invented), and (with `--config`) a `panel` block
  (provider/model/endpoint/served_by, no secrets).
- **audit.py**: see arch-critical — origin layer always; content-fingerprint layer when
  restricted payloads are present locally.
- **config.py**: model-panel YAML; `ModelSpec` carries optional `price_in`/`price_out`.

## Viewer local results (Phase 7)

`apps/viewer/src/lib/localResults.ts` (`loadRun` fetches `summary.json` +
`scores.jsonl` + `answers.jsonl`, joins on `(question_id, model_id)`), rendered at
`/local-results?run=<base>`. `vite.config.ts` `serveRuns()` is a dev-only plugin
serving the repo's gitignored `runs/` at `/runs/` (confined to the runs dir).
`realRun.test.ts` pins the committed run through `loadRun` in the gate.

## Run evidence layout

`runs/<id>/`: `questions.jsonl` (+ `.manifest.json`), `answers.jsonl`, `scores.jsonl`,
`summary.json`, `summary.md`, and a `README.md` that makes the evidence self-describing.
`runs/*` is gitignored with a per-run negation for committed evidence
(`!runs/first-run-2026-10-11/`). The per-user `configs/models.yaml` is gitignored; keys
come from the environment only.

## Test gate

Per-builder dispatcher `.codev/checks/test.sh` (global `porch.checks` is unsuitable for
a multi-app repo): routes touched dirs → `pipelines` (`uv … pytest`) and `apps/viewer`
(`pnpm … vitest`). It diffs `origin/main...HEAD`, so changes must be committed to be
tested.
