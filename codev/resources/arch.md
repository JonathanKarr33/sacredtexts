# arch.md — System Architecture (COLD / reference)

On-demand reference. The always-injected subset lives in `arch-critical.md`.
Seeded from Spec 1 (Phase 1 benchmark) — the first implementation round.

## Repository shape

- `pipelines/` — single `uv` project `sacredbench`; run `uv --project pipelines run
  python -m sacredbench …` from the repo root.
- `apps/viewer/` — React 19 / Vite / TS / Tailwind 4 / HeroUI v3 (provider-less) /
  TanStack; a benchmark viewer over local `runs/` (leaderboard + error explorer +
  cross-run standings). Originally seeded from multibench's multibrowser; that surface and
  its GitHub data layer have been removed (provenance in `README.multibrowser.md`).
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

- **generate.py**: four working-group templates (`retrieve_quote` / `complete_unit` /
  `cite_passage` / `verify_source`), **original-language-only by default** (a text is in the
  pool iff `language == canonical_language`; excluded texts recorded in the manifest with a
  reason); deterministic (content-derived ids, seeded); a per-text quota (`--per-text`, default
  28) split over the active templates; `<edition>` rendered as a seeded choice from the text's
  `requested_as` names; writes a `.manifest.json` (seed, params, corpus hash, question-set
  digest, selected + excluded texts). (Spec 26 retired `identify_version`/`identify_source` and
  the tradition-balanced sampler.)
- **collect.py**: concurrency-bounded fan-out; **resumable** (skips answered
  `(question_id, model_id)` cells); failed cells stay pending and the run exits
  non-zero; stamps the question-set digest on every row and refuses to resume a file
  built for a different question set. The `_panel_fingerprint` includes the `tools`
  setting (provider|model|base_url|tools), so the same model run with and without web
  search is two distinct panel entries, not one.
- **providers.py**: `anthropic` / `openai` (any OpenAI-compatible host via
  `base_url`+`api_key_env`, e.g. OpenRouter) / `gemini`; keys from env only; missing
  credentials fail before any network call; bounded retries; per-call timeout. The
  Anthropic path passes the server-side web-search tool (`web_search_20250305`,
  `max_uses: 5`) iff a spec enables it, records `web_search_requests`, and fails loud on
  a non-terminal `stop_reason` (allowlist `end_turn`/`stop_sequence`) so a truncated or
  `pause_turn` turn never silently re-bills; `_openai`/`_gemini` lack that guard (latent
  trap for a future mixed tool-using panel — the tutorial panel is all-anthropic).
- **score.py**: per-task headline contract — `retrieve_quote`/`complete_unit` → the OR of the
  SELECTED graders' verdicts (default `strict` + `containment` ⇒ `normalized OR contains_reference`,
  Spec 15; graders are named + selectable via `score --evaluator`, a paid/separate-pass grader
  expressible for #21; + exact/token-F1 reported); `verify_source` → the **leading-stance** yes/no
  equals expected; `cite_passage` → the single extracted citation must equal ground truth (a
  multi-candidate hedge scores 0; extractor chosen by the ground-truth citation shape). Every
  answered cell also carries an **outcome** (correct/incorrect/**refused**): a deterministic decline
  is `refused` and excluded from `accuracy = correct/(correct+incorrect)`, with **coverage** reported
  beside it (for `verify_source`, `refused ⟺ parsed is None`). A deliberate contract change is a
  sanctioned, oracle-witnessed rebaseline, not a forbidden re-score. (verify_source is hardened —
  leading-stance `parse_yes_no`; **#23 PAPER GATE closed, Spec 26**.) `normalize()` is script-aware: it **deletes**
  Arabic/Hebrew combining marks (harakat/niqqud/cantillation) and tatweel and folds
  alef-wasla→alef / Hebrew maqaf→space *before* the punctuation pass, so vocalised
  non-Latin words score fairly; Latin text is byte-for-byte unchanged (a pinned
  invariance snapshot guards it). Emits per-model × task × **tradition** breakdown with a
  missing-cell roster, a `usage` block (per-model + total tokens; cost only when every
  model is priced — prices never invented), a `generated_at` (UTC ISO; the viewer's
  primary run-recency signal since issue #7 — see `lib/recency.ts`), and (with `--config`)
  a `panel` block
  (provider/model/endpoint/served_by, no secrets) where each entry carries a raw unmarked
  `model` (the API model id, no inline tool marker) plus a real `tools` list (sorted; `[]`
  when none) — Spec 11, Approach B.
- **audit.py**: see arch-critical — origin layer always; content-fingerprint layer when
  restricted payloads are present locally; `_norm` strips non-Latin marks too so Arabic/
  Hebrew/Greek unit texts fingerprint consistently (was ASCII-only, a non-Latin no-op).
- **config.py**: model-panel YAML; `ModelSpec` carries optional `price_in`/`price_out`
  and an optional `tools` list (fail-fast parse: non-list / unknown tool / `web_search`
  on a non-anthropic provider → `ConfigError`).

## Viewer local results

`apps/viewer/src/lib/localResults.ts` (`loadRun` fetches `summary.json` + `scores.jsonl`
+ `answers.jsonl` + `questions.jsonl` and joins panel × roster on `(question_id,
model_id)`, surfacing un-answered roster questions as missing cells; `loadSummary` reads
just `summary.json` for the standings rollup). As of the Spec 2 purge the viewer is
**local-only**: the multibrowser surface (`/t/...` traditions, the GitHub-data-layer
`/results`/`/raw` explorers, the `/review*` flows, and their data layer/components) is
gone. The route tree is `/` (the **leaderboard home** — `routes/LeaderboardPage.tsx` +
`components/LeaderboardTable.tsx`, ranking by `lib/leaderboard.ts`),
`/run/$runId/model/$modelId` (the **error explorer** — `routes/ExplorerPage.tsx` +
`components/QuestionList.tsx`/`ExplorerFilters.tsx`, classification/filters in
`lib/explorer.ts`), `/standings` (the **cross-run current standings** —
`routes/StandingsPage.tsx`, rollup in `lib/aggregate.ts`, keyed on the panel's
`(provider, model, tools)` identity, `${provider}\u0000${model}\u0000${sortedTools}` with
a missing `tools` defaulting to `[]`, newest run per that identity winning), plus a 404.
Because the standings key incorporates the `panel.tools` list, a model's search-on/off
variants stay distinct standings rows while two runs of the same model with the same tools
dedupe — so a bare pre-Spec-11 run collides with an explicit search-off run instead of
orphaning it (Spec 11, Approach B, which required the viewer change). The
selected run lives in the URL as a **bare run id**, `/?run=<id>` (validated by a plain
`validateSearch` fn — zod is pruned — and resolved to the fetch base
`/runs/${encodeURIComponent(id)}`); the default is the most-recent run from the
`/runs/_index` index (fetched via `lib/runIndex.ts`, shared by the leaderboard and
standings), and a `?run=` that is not a known id (e.g. the old Spec-1 `?run=/runs/<id>`
base-path form) falls back to that default. `vite.config.ts` `serveRuns()` (logic in
`vite/runsEndpoint.ts`) is a dev-only plugin serving the repo's gitignored `runs/` at
`/runs/` with a `/runs/_index` run index (confined to the runs dir; symlink traversal
rejected, so symlinked run dirs are omitted). The gate renders the committed run through
`loadRun` (`realRun.test.ts`), the leaderboard (`LeaderboardPage.test.tsx`), the explorer
(`ExplorerPage.test.tsx`), and the standings rollup (`StandingsPage.test.tsx`). Production
is a static SPA host (`server/index.mjs`, hono + history fallback; no `/api` proxy).

## Run evidence layout

`runs/<id>/`: `questions.jsonl` (+ `.manifest.json`), `answers.jsonl`, `scores.jsonl`,
`summary.json`, `summary.md`, and a `README.md` that makes the evidence self-describing.
`runs/*` is gitignored with a per-run negation for each committed-evidence dir
(`!runs/first-run-2026-10-11/`, `!runs/tutorial-2026-10-11/` — the latter the Spec-3
KJV/Qur'an(ar)/Talmud(he) 2×2 web-search on/off panel). The per-user
`configs/models.yaml` is gitignored; keys come from the environment only.

## Test gate

Per-builder dispatcher `.codev/checks/test.sh` (global `porch.checks` is unsuitable for
a multi-app repo): routes touched dirs → `pipelines` (`uv … pytest`) and `apps/viewer`
(`pnpm … vitest`). It diffs `origin/main...HEAD`, so changes must be committed to be
tested.
