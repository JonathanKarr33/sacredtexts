# Plan: Tutorial centered on KJV / Qur'an / Talmud (he), 2-model panel, web-search on/off comparison

**Specification**: [codev/specs/8-spec-3-tutorial-centered-on-kj.md](../specs/8-spec-3-tutorial-centered-on-kj.md)

## Executive Summary

The spec's open design areas are settled: tools identity encoded into the emitted panel
identity (Approach A, plus a truthful `api_model`), committed-run added alongside first-run
(Approach C), data-derived Arabic/Hebrew normalisation (Approach D), documented copyright
clearance of web-search answers (Approach F), optional `audit._norm` extension (G), and an
unpriced committed run (H). The viewer is **not touched** — every tools/standings effect is
produced in the pipeline's data output.

The work decomposes into four phases ordered by dependency:

1. **Fair non-Latin scoring** — the scoring foundation; a run over Arabic/Hebrew can only be
   *scored fairly* once `normalize()` handles the real QUL/Davidson marks. Pure-Python,
   fully unit-testable offline, no credentials.
2. **Web-search tool: config, collection, and tools-aware identity** — the panel capability;
   also offline-testable (config validation + mocked provider seam + panel-identity unit
   tests).
3. **The committed tutorial run** — the one live/paid phase: convert the `ar`/`he` corpora,
   generate the deterministic three-source question set, collect the 2×2 panel (web search
   on/off), score (unpriced), audit, copyright-clear, and commit the run with its README and
   gitignore negation. Depends on 1 + 2.
4. **Tutorial rework & viewer verification** — rewrite `TUTORIAL.md` around the three
   sources + 2-model + search toggle, update arch docs, and verify the merged viewer renders
   the committed run (leaderboard / explorer / standings) with zero code changes while the
   existing first-run gate and `#86` probe stay green. Depends on 3.

Phases 1 and 2 are independent of each other (either order); both must precede 3. This keeps
all offline, deterministic work (1, 2) and most verification (4) separable from the single
credential-and-budget-dependent step (3).

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Fair Arabic/Hebrew scoring normalisation"},
    {"id": "phase_2", "title": "Web-search tool config, collection, and tools-aware identity"},
    {"id": "phase_3", "title": "Committed KJV/Qur'an/Talmud tutorial run"},
    {"id": "phase_4", "title": "Tutorial rework and viewer verification"}
  ]
}
```

## Phase Breakdown

### Phase 1: Fair Arabic/Hebrew scoring normalisation

**Dependencies**: None

#### Objective

Make `score.py :: normalize()` treat Arabic and Hebrew sensibly so Qur'an/Talmud quote
scoring is fair, deriving the mark set from the **real** QUL/Davidson data, while leaving
the Latin path byte-for-byte unchanged and the per-task scoring contract untouched.
Optionally extend `audit.py :: _norm` the same way (Approach G).

#### Files to Create / Modify

- `pipelines/sacredbench/score.py` — `normalize()`: before the `[^\w\s]`→space step, delete
  the Arabic-/Hebrew-range combining marks and the Qur'anic editorial annotation code points,
  remove tatweel (U+0640), fold alef/hamza/alef-wasla variants → bare alef (U+0627), fold the
  Hebrew maqaf (U+05BE). Keep NFKD / quote / dash / casefold / whitespace for Latin.
- `pipelines/sacredbench/audit.py` — `_norm`: extend with the same Arabic/Hebrew handling so
  the restricted-text content layer is not a silent no-op on non-Latin (optional per Approach
  G; if deferred, record the limitation in a code comment and the review doc).
- `pipelines/tests/` — new tests (see Test Plan); a small real-script fixture file if useful.

#### Deliverables

- [ ] `normalize()` deletes (not space-replaces) the Arabic-block combining marks (U+064B–
      U+0655, U+0670) **and** the Qur'anic annotation block actually present in QUL (U+06D6–
      U+06ED, incl. mid-word marks), the editorial symbols U+06DE / U+06E9, and the small
      modifier letters U+06E5 / U+06E6; removes tatweel; folds alef/hamza/alef-wasla.
- [ ] `normalize()` deletes Hebrew-block points/cantillation (U+0591–U+05BD / U+05BF /
      U+05C1–U+05C2 / U+05C4–U+05C5 / U+05C7) and folds the maqaf (U+05BE).
- [ ] The mark set is re-derived from the committed `quran_uthmani_from_qul.json.json` and the
      Davidson `he` data (a short derivation note in the review doc).
- [ ] Latin `normalize()` output is byte-for-byte unchanged.
- [ ] (Approach G) `audit._norm` handles Arabic/Hebrew, or the limitation is documented.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Vocalized vs. unvocalized forms of the same Qur'an ayah and Talmud line are
      `normalized`-equal and `token_f1 == 1.0`; a full real QUL ayah with mid-word annotation
      marks + a sajdah/rub-el-hizb symbol normalises without word-splitting.
- [ ] A Latin regression fixture asserts byte-identical output; all pre-existing Latin
      scoring tests pass.
- [ ] Recomputing the committed `first-run-2026-10-11` question-set digest after the change
      equals the committed digest (generation-side regression guard; `generate.py` imports
      `normalize`).
- [ ] `_SUBMETRICS` and the `retrieve_quote` headline rule are unchanged; `uv --project
      pipelines run pytest pipelines` is green.

#### Test Plan

- Unit: parametrised Arabic fixtures (harakat on/off, tatweel, alef variants, a full real
  ayah with U+06D6–U+06ED + sajdah); Hebrew fixtures (niqqud on/off, maqaf); each asserting
  equality and `token_f1`.
- Regression: Latin fixture (incl. a diacritic case) asserting exact prior output; a test
  that re-derives the first-run digest from its committed `questions.jsonl` inputs and
  compares to the committed `.manifest.json` digest.
- (If G) audit `_norm` fingerprints a non-Latin restricted sample (length threshold met).

### Phase 2: Web-search tool config, collection, and tools-aware identity

**Dependencies**: None (independent of Phase 1; both precede Phase 3)

#### Objective

Let a model panel entry carry a web-search tool setting that is validated fail-fast, drives
the Anthropic server-side web-search tool in `collect`, binds into the collect panel
fingerprint, and becomes part of the identity the viewer's standings view rolls up on — all
with **zero viewer changes** and without altering the scoring contract.

#### Files to Create / Modify

- `pipelines/sacredbench/config.py` — add an optional tool-use setting to `ModelSpec` (web
  search on/off); validate fail-fast: web search on a non-`anthropic` provider or an invalid
  value raises `ConfigError` at load.
- `pipelines/sacredbench/providers.py` — `_anthropic`: when the setting is on, pass the
  Anthropic server-side web-search tool on `messages.create` (pin the exact tool
  spec/version against the installed SDK; validate the response shape, fail loud on
  mismatch); keep text/usage extraction valid with tool blocks present. Optionally record
  `usage.server_tool_use.web_search_requests` as additive provenance.
- `pipelines/sacredbench/collect.py` — `_panel_fingerprint` incorporates the tools setting.
- `pipelines/sacredbench/cli.py` + `pipelines/sacredbench/score.py` — panel snapshot: make
  the emitted `panel.model` (the standings key `provider\u0000model`) distinct for
  search-on vs. search-off, and also emit the raw API model string under a viewer-ignored
  `api_model` key.
- `configs/models.example.yaml` — rewrite to the 2-model panel (`claude-opus-5-5` +
  `claude-haiku-5-5`) as four entries = each model × web-search-{on,off}, distinct ids,
  unpriced.
- `pipelines/tests/` — config, fingerprint, provider-seam (mocked), and panel-identity tests.

#### Deliverables

- [ ] `ModelSpec` parses and honours the tool-use setting; `config.py` rejects web search on
      a non-Anthropic provider and an invalid value with `ConfigError`.
- [ ] `_anthropic` issues the web-search tool call when enabled and a plain call when
      disabled; text/usage extraction unaffected.
- [ ] `collect._panel_fingerprint` includes the tools setting (resume under a flipped tools
      setting is refused with `CollectError`).
- [ ] `summary.json.panel` entries carry a tools-distinct `model` identity **and** an
      `api_model` raw string; no secrets.
- [ ] `configs/models.example.yaml` is the 2-model / 4-entry shape and loads cleanly.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Config tests: the 4-entry example loads; a web-search-on `openai` entry and an invalid
      tools value each raise `ConfigError`.
- [ ] A mocked-provider test asserts the web-search tool is passed when enabled and absent
      when disabled, and that answers are still extracted when tool/content blocks are present.
- [ ] A fingerprint test shows search-on and search-off are distinct identities and a flipped
      resume is refused.
- [ ] A panel-snapshot unit test shows two entries sharing an API model but differing in
      tools produce two distinct `provider\u0000model` standings keys, with `api_model` equal.
- [ ] `uv --project pipelines run pytest pipelines` is green; the scoring contract is unchanged.

#### Test Plan

- Unit: `load_config` happy path (4 entries) + two rejection cases; `_panel_fingerprint`
  identity + flipped-resume `CollectError`; panel snapshot standings-key distinctness +
  `api_model`.
- Seam: monkeypatch the Anthropic client (as existing provider tests do) to capture the
  `tools` kwarg for on/off and to return tool+text blocks; assert extraction.
- No live calls in this phase (live exercise happens in Phase 3's smoke).

### Phase 3: Committed KJV/Qur'an/Talmud tutorial run

**Dependencies**: Phase 1, Phase 2

#### Objective

Produce and commit the real tutorial run under `runs/` — the deterministic three-source
(KJV / Qur'an `ar` / Talmud `he`) question set answered by the 2×2 panel (web search
on/off) — audited clean, copyright-cleared, secret-free, unpriced — so the merged viewer
picks it up with zero code changes. This is the only phase that makes paid API calls.

#### Files to Create / Modify

- `.gitignore` — add `!runs/<tutorial-id>/` alongside the existing first-run negation.
- `runs/<tutorial-id>/` — `questions.jsonl` (+ `.manifest.json`), `answers.jsonl`,
  `scores.jsonl`, `summary.json`, `summary.md`, and a `README.md` (task/scope, panel, the
  CC-BY-NC Davidson attribution, and the recorded copyright-clearance of the search-on
  answers).
- (No pipeline code changes here — this phase exercises Phases 1–2 and commits evidence.)

#### Deliverables

- [ ] `convert` produces the `ar` Qur'an and `he` Talmud standardized documents (verify the
      converters succeed on the real data); `generate` over the three corpora with a fixed
      seed yields a deterministic three-tradition / three-script `retrieve_quote` set
      (pinned `--tasks retrieve_quote`).
- [ ] A budgeted **live smoke** (a few cells) confirms the web-search-on and -off paths work
      end-to-end before the full collect.
- [ ] Full `collect` over the 4-entry panel; `score` with `--questions`/`--config`
      (unpriced → no `cost_usd`); `audit` passes origin-clean.
- [ ] Documented copyright clearance of the committed search-on answers, recorded in the run
      `README.md` (answers intact, not truncated).
- [ ] `.gitignore` negation added; the full four-file set + README committed.

#### Acceptance Criteria

- [ ] `uv --project pipelines run python -m sacredbench audit runs/<tutorial-id>` passes.
- [ ] `summary.json` has four panel entries whose standings identities are distinct for
      search-on vs. search-off; `questions.jsonl` contains Arabic and Hebrew expected text
      across the three traditions; the panel is secret-free and unpriced.
- [ ] The web-search-on vs. -off contrast is visible in `summary.md` (`exact`/`normalized`/
      `token_f1` reported per entry).
- [ ] `.codev/checks/test.sh` stays green with the new run present (first-run gate and viewer
      suite unaffected — confirmed here, finalised in Phase 4).

#### Test Plan

- Manual/live: convert → generate (inspect that Arabic/Hebrew questions are well-formed) →
  smoke → collect → score → audit, following the (to-be-updated) TUTORIAL Track B.
- Automated: `audit` on the committed run; a secret-scan assertion on `summary.json`/README;
  (optional) a pipeline test that loads the committed `summary.json` and asserts four
  distinct standings identities + unpriced usage.
- **Credential/budget gate**: this phase needs `ANTHROPIC_API_KEY` and incurs
  token + web-search cost. If keys/budget are unavailable in the builder environment, stop
  and notify the architect (`afx send`) — the run is produced with real calls, never
  fabricated — then continue once provided.

### Phase 4: Tutorial rework and viewer verification

**Dependencies**: Phase 3

#### Objective

Rewrite `TUTORIAL.md` to revolve around the three sources, the 2-model panel, and the
search-on/off comparison; update the arch docs; and verify the merged viewer renders the
committed run (leaderboard, explorer, standings) with **zero source changes** while the
existing first-run gate (`realRun.test.ts`) and the `#86` CSS probe stay green.

#### Files to Create / Modify

- `TUTORIAL.md` — rework: the three corpora in `generate`, the 2×2 panel via the updated
  `configs/models.example.yaml`, the search-on/off framing, and the viewer walk pointing at
  the committed tutorial run; keep the Track A (reference, no keys) / Track B (fresh run) /
  Track C (view) shape and the copy-paste determinism.
- `codev/resources/arch.md` / `codev/resources/arch-critical.md` — update the pipeline /
  "Viewer local results" notes for the tools setting, the tools-aware panel identity, and the
  non-Latin normalisation (via the `update-arch-docs` discipline); add the web-search
  copyright-clearance lesson to `lessons-critical.md`.
- `configs/models.example.yaml` — only if Phase 2's rewrite needs a tutorial-facing comment.
- No `apps/viewer/` source changes.

#### Deliverables

- [ ] `TUTORIAL.md` reworked around KJV / Qur'an (`ar`) / Talmud (`he`), the 2-model ×
      search-{on,off} panel, and the parametric-vs-retrieval contrast; commands copy-pasteable
      and deterministic; the committed tutorial run referenced in Track A/C.
- [ ] arch/lessons docs updated (tools identity, non-Latin normalisation, web-search
      copyright clearance).
- [ ] Viewer verification evidence (run the viewer and/or the existing viewer tests) that the
      committed run appears in the selector, the leaderboard ranks the four entries, the
      explorer drills in, and **standings shows four distinct rows**.

#### Acceptance Criteria

- [ ] `apps/viewer` has no behavioural source change; `pnpm -C apps/viewer test` is green,
      including `realRun.test.ts` (first-run) and the `#86` probe in `deploy.test.ts`.
- [ ] Running the viewer against the repo shows the committed tutorial run with four
      leaderboard rows and four standings rows (search-on/off not collapsed), verified
      manually and/or by a viewer test that does not change app behaviour.
- [ ] `.codev/checks/test.sh` is green overall.

#### Test Plan

- Manual: `pnpm -C apps/viewer dev`, confirm `/` default run, run selector, model drill-in,
  and `/standings` four rows against the committed run.
- Automated: `pnpm -C apps/viewer test` (unchanged behaviour); the full `.codev/checks/test.sh`.
- Docs: re-read `TUTORIAL.md` top-to-bottom as a fresh-clone user to confirm the E2E property.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Phase 3 needs live Anthropic keys + budget (web search bills per request) the builder may lack | Medium | High | Treat Phase 3 as the one paid step; budgeted smoke before full collect; if keys/budget absent, stop and notify the architect (`afx send`) rather than fabricating a run. |
| Normalise mark set still under-covers real QUL (mid-word annotation marks) | Medium | High | Derive the set from the real QUL/Davidson data; lock with a full real-ayah fixture (Phase 1). |
| Search-on model echoes a copyrighted translation into the committed public run | Medium | High | Original-language (public-domain) targets; documented copyright clearance of committed answers recorded in README (Phase 3); CC-BY-NC attribution preserved. |
| Latin scoring / first-run digest silently regresses | Low | High | Script-scoped mark handling; Latin regression fixture + first-run digest regression test (Phase 1). |
| Tools identity doesn't reach the exact standings key, so on/off collapse | Medium | High | Encode into emitted `panel.model` (the `provider\u0000model` key `aggregate.ts:59` reads); unit-test key distinctness (Phase 2); verify in the viewer (Phase 4). |
| Anthropic web-search tool spec differs from assumption; tool blocks break extraction | Medium | High | Pin the tool spec against the installed SDK; validate response shape and fail loud (Phase 2); live smoke (Phase 3). |
| Adding a second committed run reds a viewer test that assumes a run set | Low | Medium | Consult confirmed viewer tests stub a hardcoded index / use temp dirs; re-verify in Phase 4; if a real assertion exists, raise with the architect rather than editing viewer source. |
| Priced search run reports a cost omitting per-request web-search charges | Low | Medium | Committed panel stays unpriced (no `cost_usd`) (Phase 2/3). |

## Documentation Updates

- `TUTORIAL.md` — reworked (Phase 4).
- `configs/models.example.yaml` — rewritten to the 2-model / 4-entry panel (Phase 2).
- `runs/<tutorial-id>/README.md` — new; task/scope, panel, CC-BY-NC attribution, recorded
  copyright clearance (Phase 3).
- `.gitignore` — tutorial-run negation (Phase 3).
- `codev/resources/arch.md` + `arch-critical.md`, `lessons-critical.md` — tools identity,
  non-Latin normalisation, web-search copyright clearance (Phase 4, via `update-arch-docs`).
- `codev/reviews/8-spec-3-tutorial-centered-on-kj.md` — the review/lessons doc (review phase).
