# Plan: Tutorial centered on KJV / Qur'an / Talmud (he), 2-model panel, web-search on/off comparison

**Specification**: [codev/specs/8-spec-3-tutorial-centered-on-kj.md](../specs/8-spec-3-tutorial-centered-on-kj.md)

## Executive Summary

The spec's design is settled; this plan pins every value the implementation needs so nothing
is re-decided mid-build. The viewer is **not touched** — all tools/standings effects are
produced in the pipeline's data output (Approach A, verified: `aggregate.ts:59` keys standings
on `` `${provider}\u0000${model}` `` and `parseSummary` ignores unknown panel fields).

**Settled implementation decisions (pinned here):**

- **Tools config schema.** Each `models[]` entry gets an optional `tools:` **list**; the only
  allowed value today is `web_search`; absent/empty ⇒ no tools (the canonical default).
  `ModelSpec` gains `tools: tuple[str, ...] = ()`. Fail-fast `ConfigError` when: `tools` is not
  a list, contains an unrecognised value, or contains `web_search` on a non-`anthropic`
  provider.
- **Panel identity encoding — BOTH variants marked** (so neither collides with first-run's
  bare `anthropic\u0000claude-haiku-5-5` and silently replaces its standings row). Emitted
  `panel.model`: `"{api_model} [web_search]"` when web search is on, `"{api_model} [no-tools]"`
  when off. `panel.api_model` carries the raw model string (`claude-opus-5-5` /
  `claude-haiku-5-5`), which the viewer ignores. `_panel_fingerprint` becomes
  `provider|model|base_url|<tools-joined>`.
- **Panel model ids:** `opus-search`, `opus`, `haiku-search`, `haiku` (the `-search` entries
  have `tools: [web_search]`).
- **Web-search tool:** the Anthropic server-side web-search tool pinned to **one** SDK param
  version — `web_search_20250305` (SDK 1.13.0 also exposes `20260209`/`20260318`; confirm the
  chosen constant against the installed SDK) — with `max_uses: 5` for cost control; the version
  and `max_uses` are recorded in the run README (part of what the run proves).
- **Mark handling:** combining marks and in-word elongation (harakat/niqqud/cantillation,
  tatweel) are **deleted**; the Hebrew **maqaf (U+05BE) becomes a space** (a word boundary),
  not deleted, so adjacent words don't concatenate.
- **Issue #7 (`generated_at`):** **included** — `score.py`/`cli.py` stamp an additive
  `generated_at` (UTC ISO) into `summary.json` (the viewer ignores it); this closes #7's
  pipeline half, as the human flagged.
- **Committed run params (canonical; defined here, reproduced by the Phase-4 tutorial):** run
  id `runs/tutorial-2026-10-11/` (date = collection date), `--tasks retrieve_quote
  --per-task 100 --seed 20261011`, inputs = the three standardized dirs:
  `texts/standardized/Protestant Christian/the-bible-kjv-en`,
  `texts/standardized/Sunni Islam/the-qur-an-uthmani-qul-ar`,
  `texts/standardized/Judaism/talmud-bavli-william-davidson-edition-aramaic-he`; panel =
  `configs/models.example.yaml` (4 entries), **unpriced**.

Four phases, dependency-ordered. Phases 1 and 2 are independent offline/deterministic work;
both precede Phase 3 (the single live/paid phase); Phase 4 reworks docs and verifies the
viewer.

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

Make `score.py :: normalize()` treat Arabic and Hebrew sensibly — marks deleted, maqaf → word
boundary, alef/hamza folded — so Qur'an/Talmud quote scoring is fair in **both** directions
(vocalized↔unvocalized), with the Latin path byte-for-byte unchanged and the scoring contract
untouched. Extend `audit.py :: _norm` the same way.

#### Files to Create / Modify

- `pipelines/sacredbench/score.py` — `normalize()`: before the `[^\w\s]`→space step, **delete**
  the Arabic combining marks (U+064B–U+0655, U+0670) and the Qur'anic annotation block present
  in QUL (U+06D6–U+06ED, incl. U+06DE/U+06E9 symbols and U+06E5/U+06E6 small letters), delete
  tatweel (U+0640), delete Hebrew points/cantillation (U+0591–U+05BD / U+05BF / U+05C1–U+05C2 /
  U+05C4–U+05C5 / U+05C7), fold alef/hamza/alef-wasla (U+0622/0623/0625/0671 → U+0627), and map
  the Hebrew **maqaf U+05BE → space**. Keep NFKD / quote / dash / casefold / whitespace for Latin.
- `pipelines/sacredbench/audit.py` — `_norm`: same Arabic/Hebrew handling so the restricted-text
  content layer is not a silent no-op on non-Latin.
- `pipelines/tests/` — new `test_normalize_nonlatin.py` (+ a small real-script fixture file).

#### Deliverables

- [ ] `normalize()` handles the full Arabic mark/symbol set actually present in QUL and the
      Hebrew point/cantillation set, deleting marks and mapping maqaf → space.
- [ ] Arabic mark set re-derived from the committed `quran_uthmani_from_qul.json.json`; the
      Hebrew set derived from the **uncatalogued** `texts/raw/Judaism/Talmud Bavli/Shevuot - he
      - William Davidson Edition - Vocalized Aramaic.json` (the catalogued Aramaic files carry
      no niqqud) — used only as a test fixture source; a note records this.
- [ ] Latin output byte-for-byte unchanged; `audit._norm` extended.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] **Symmetric**: vocalized vs. unvocalized forms of the same Qur'an ayah and Talmud line are
      `normalized`-equal and `token_f1 == 1.0`; a full real QUL ayah with mid-word annotation
      marks + a sajdah/rub-el-hizb symbol normalises without word-splitting; a maqaf-joined
      Hebrew phrase keeps its word boundary.
- [ ] **Asymmetric (the contrast-preserving direction)**: a *vocalized* answer vs. an
      *unvocalized* expected (the Talmud/search-on case) and a *plain* answer vs. the *vocalized*
      QUL expected both score `normalized == 1` / `token_f1 == 1.0` — so non-Latin scoring does
      not artificially depress one side.
- [ ] **Latin invariance (strong)**: re-score `runs/first-run-2026-10-11/answers.jsonl` to a
      **tmp** path and assert the output equals the committed `scores.jsonl` (≈400 real answers;
      never writes over the evidence); plus a Latin-diacritic unit fixture asserting exact prior
      output.
- [ ] **Generation regression**: regenerate the first run's question set from its
      `.manifest.json` parameters + the converted inputs and assert the recomputed
      question-set digest equals the committed digest (exercises `generate`+`normalize`, not a
      hash of the committed file).
- [ ] `_SUBMETRICS` and the `retrieve_quote` headline rule unchanged; `uv --project pipelines
      run pytest pipelines` green.

#### Test Plan

- Unit: parametrised Arabic (harakat on/off, tatweel, alef variants, a full real ayah with
  U+06D6–U+06ED + sajdah) and Hebrew (niqqud on/off from the vocalized Shevuot fixture, maqaf)
  — both symmetric and asymmetric directions.
- Regression: the tmp re-score diff against committed `scores.jsonl`; the manifest-driven
  regeneration digest comparison; a Latin-diacritic fixture.
- Audit: `_norm` fingerprints a non-Latin sample over the length threshold.

### Phase 2: Web-search tool config, collection, and tools-aware identity

**Dependencies**: None (independent of Phase 1; both precede Phase 3)

#### Objective

Let a panel entry carry a validated `tools` setting that drives the Anthropic web-search tool in
`collect`, binds into the collect fingerprint, and becomes a both-variants-marked identity in
the emitted panel — plus the additive `generated_at` — all with zero viewer changes and no
scoring-contract change.

#### Files to Create / Modify

- `pipelines/sacredbench/config.py` — `ModelSpec.tools: tuple[str, ...] = ()`; parse `tools` as
  a list; fail-fast `ConfigError` on a non-list, an unrecognised value, or `web_search` on a
  non-`anthropic` provider.
- `pipelines/sacredbench/providers.py` — `_anthropic`: when `web_search` is set, pass the pinned
  web-search tool param (`web_search_20250305`, `max_uses: 5`) on `messages.create`; validate the
  response shape and **fail loud** on mismatch; raise loudly on `stop_reason == "max_tokens"`
  (truncated answers score 0 and re-bill on retry); keep text/usage extraction valid with
  tool/citation blocks present; optionally record `usage.server_tool_use.web_search_requests`.
- `pipelines/sacredbench/collect.py` — `_panel_fingerprint` → `provider|model|base_url|<tools>`.
- `pipelines/sacredbench/cli.py` + `score.py` — panel snapshot: emit `panel.model` as
  `"{api_model} [web_search]"` / `"{api_model} [no-tools]"`, add `panel.api_model` (raw string);
  stamp an additive `generated_at` (UTC ISO) into `summary.json`.
- `configs/models.example.yaml` — 4 entries (`opus-search`, `opus`, `haiku-search`, `haiku`);
  `-search` entries `tools: [web_search]` + `max_tokens: 4096`; others `max_tokens: 1024`;
  unpriced; comments explaining the search-on/off contrast and the keys-from-env rule.
- `pipelines/tests/` — config, fingerprint, provider-seam (mocked), panel-identity, `generated_at`.

#### Deliverables

- [ ] `ModelSpec` parses+honours `tools`; `config.py` rejects a non-list, an unknown tool, and
      `web_search` on a non-Anthropic provider with `ConfigError`.
- [ ] `_anthropic` issues the pinned web-search tool when enabled (and not when disabled),
      fails loud on truncation, and still extracts text when tool/citation blocks are present.
- [ ] `_panel_fingerprint` includes tools; a flipped-tools resume is refused (`CollectError`).
- [ ] `panel.model` is marked for **both** variants; `panel.api_model` holds the raw string;
      `summary.json` carries `generated_at`; no secrets.
- [ ] `configs/models.example.yaml` is the 4-entry shape and loads cleanly.
- [ ] Tests for this phase.

#### Acceptance Criteria

- [ ] Config tests: the 4-entry example loads; a `web_search` `openai` entry, a non-list
      `tools`, and an unknown tool value each raise `ConfigError`.
- [ ] Provider-seam test — mock the lazily-imported SDK via `monkeypatch.setitem(sys.modules,
      "anthropic", <fake>)` (there are **no** existing provider-seam tests; all current mocks are
      at `collect.complete`) — asserts the `tools` kwarg is passed iff enabled, that a
      `max_tokens` stop raises, and that text is extracted alongside tool/citation blocks.
- [ ] Fingerprint test: search-on vs. search-off are distinct, a flipped resume is refused.
- [ ] Panel-identity test: two entries sharing an `api_model` but differing in tools yield two
      distinct `provider\u0000model` standings keys, **and neither equals first-run's committed
      `anthropic\u0000claude-haiku-5-5`** (no silent replacement); `api_model` equal.
- [ ] `generated_at` present and ISO-parseable; viewer behaviour unaffected (it ignores it).
- [ ] `uv --project pipelines run pytest pipelines` green; scoring contract unchanged.

#### Test Plan

- Unit: `load_config` happy path + three rejection cases; `_panel_fingerprint` identity +
  flipped-resume `CollectError`; panel snapshot standings-key distinctness, non-collision with
  first-run, `api_model`, `generated_at`.
- Seam: fake `anthropic` module capturing `messages.create(**kwargs)`, returning tool+text
  blocks and a `max_tokens`-stop response.
- No live calls here (live exercise is Phase 3's smoke).

### Phase 3: Committed KJV/Qur'an/Talmud tutorial run

**Dependencies**: Phase 1, Phase 2

#### Objective

Produce and commit the real tutorial run — the deterministic three-source question set answered
by the 2×2 panel — audited clean, secret-free, unpriced — so the merged viewer picks it up with
zero code changes. The only phase that makes paid API calls.

> **Scope update (human, 2026-10-11):** the committed run is **100 questions** (≈34/33/33 across
> the three sources), not 30 — the larger spend was explicitly approved. The `--per-task` value
> below reflects this; the question-set digest is `37eb58400fdf4ea9`.
>
> **Clearance dropped (human, 2026-10-11):** no manual copyright-clearance / redaction pass is
> performed over search-on answers. The maintainers treat incidentally-retrieved copyrighted
> text in a model answer as fair use for academic research; the run is committed **as collected**
> (answers never truncated or edited). The standard automated `audit` (origin + restricted-payload
> fingerprints) still gates every commit — unchanged.

#### Canonical commands (defined here; the Phase-4 tutorial must reproduce them)

```
RUN=runs/tutorial-2026-10-11
uv --project pipelines run python -m sacredbench convert   # (re)build standardized ar/he/en
uv --project pipelines run python -m sacredbench generate \
  "texts/standardized/Protestant Christian/the-bible-kjv-en" \
  "texts/standardized/Sunni Islam/the-qur-an-uthmani-qul-ar" \
  "texts/standardized/Judaism/talmud-bavli-william-davidson-edition-aramaic-he" \
  --tasks retrieve_quote --per-task 100 --seed 20261011 --out "$RUN/questions.jsonl"
uv --project pipelines run python -m sacredbench audit "$RUN"
cp -n configs/models.example.yaml configs/models.yaml      # keys via env (ANTHROPIC_API_KEY)
uv --project pipelines run python -m sacredbench collect "$RUN/questions.jsonl" configs/models.yaml --out "$RUN/answers.jsonl"
uv --project pipelines run python -m sacredbench score "$RUN/answers.jsonl" \
  --scores-out "$RUN/scores.jsonl" --summary-out "$RUN/summary.json" \
  --summary-md "$RUN/summary.md" --questions "$RUN/questions.jsonl" --config configs/models.yaml
uv --project pipelines run python -m sacredbench audit "$RUN"   # whole run, pre-commit
```

#### Files to Create / Modify

- `.gitignore` — add `!runs/tutorial-2026-10-11/` alongside the existing first-run negation.
- `runs/tutorial-2026-10-11/` — `questions.jsonl` (+ `.manifest.json`), `answers.jsonl`,
  `scores.jsonl`, `summary.json`, `summary.md`, and `README.md`.

#### Copyright / licensing (clearance dropped — committed as collected)

No manual clearance/redaction pass runs over the search-on answers (human determination, fair
use — see the scope note above). The run is committed as collected; answers are never truncated
or edited. The `README.md` records a one-line fair-use note plus the CC-BY-NC Davidson
attribution (source / licence / non-commercial notice) and the web-search tool version +
`max_uses`. The automated `audit` (origin + restricted-payload fingerprints) is the enforced gate.

#### Deliverables

- [ ] `convert` produces the `ar`/`he`/`en` standardized docs; `generate` yields the
      deterministic three-tradition / three-script `retrieve_quote` set (Arabic + Hebrew
      expected text present).
- [ ] A budgeted **live smoke** (a few cells) confirms both web-search-on and -off paths work
      end-to-end before the full collect.
- [ ] Full `collect`; `score` unpriced (no `cost_usd`); both `audit` runs pass origin-clean.
- [ ] `README.md` records the fair-use note, the CC-BY-NC Davidson attribution, and the
      web-search tool version + `max_uses`.
- [ ] `.gitignore` negation; the four-file set + README committed.

#### Acceptance Criteria

- [ ] `uv --project pipelines run python -m sacredbench audit runs/tutorial-2026-10-11` passes.
- [ ] `summary.json` has four panel entries whose standings identities are distinct for
      search-on vs. off **and** distinct from first-run's `claude-haiku-5-5` key; `panel` is
      secret-free, carries `api_model`, and is unpriced; `questions.jsonl` contains Arabic and
      Hebrew expected text across the three traditions.
- [ ] The search-on vs. off contrast is readable from the committed artifacts: per-entry
      accuracy in `summary.md`, and the discriminating `exact`/`normalized`/`token_f1` in
      `summary.json` (and the viewer explorer). (`summary_markdown` renders accuracy only;
      optionally add submetric columns — nice-to-have, contract unchanged.)
- [ ] `.codev/checks/test.sh` stays green with the new run present.

#### Test Plan

- Live, following the canonical commands: convert → generate (inspect Arabic/Hebrew questions)
  → smoke → collect → score → audit.
- Automated: `audit` on the committed run; a secret-scan assertion on `summary.json`/README; a
  pipeline test loading the committed `summary.json` asserting four distinct standings
  identities, non-collision with first-run, and unpriced usage.
- **Credential/budget gate**: needs `ANTHROPIC_API_KEY` and incurs token + per-request
  web-search cost. If keys/budget are unavailable in the builder environment, stop and notify
  the architect (`afx send`) — the run is produced with real calls, never fabricated — then
  continue once provided.

### Phase 4: Tutorial rework and viewer verification

**Dependencies**: Phase 3

#### Objective

Rewrite `TUTORIAL.md` around the three sources, the 2-model panel, and the search-on/off
comparison (reproducing Phase 3's canonical commands); update arch/lessons docs; and verify the
merged viewer renders the committed run (leaderboard, explorer, standings) with zero source
changes while `realRun.test.ts` (first-run) and the `#86` probe stay green.

#### Files to Create / Modify

- `TUTORIAL.md` — rework: the three corpora in `generate`, the 2×2 panel via the updated
  `configs/models.example.yaml`, the parametric-vs-retrieval framing, the committed tutorial run
  in Track A/C; keep Track A (reference, no keys) / B (fresh run) / C (view) and copy-paste
  determinism; the Track-B commands match Phase 3's canonical commands verbatim.
- `codev/resources/arch.md` / `arch-critical.md` / `lessons-critical.md` — tools setting +
  tools-aware panel identity (both-marked, api_model), non-Latin normalisation, `generated_at`
  (#7 half closed), and the web-search copyright-clearance lesson (via `update-arch-docs`).
- No `apps/viewer/` source changes.

#### Deliverables

- [ ] `TUTORIAL.md` reworked around KJV / Qur'an (`ar`) / Talmud (`he`), the 2-model ×
      search-{on,off} panel, and the contrast; commands copy-pasteable, deterministic, and
      matching Phase 3.
- [ ] arch/lessons docs updated.
- [ ] Viewer-verification evidence: the committed run appears in the selector, the leaderboard
      ranks four entries, the explorer drills in, and **standings shows four distinct rows**
      (search-on/off not collapsed, first-run's haiku row still present).

#### Acceptance Criteria

- [ ] `apps/viewer` has no behavioural source change; `pnpm -C apps/viewer test` green, incl.
      `realRun.test.ts` and the `#86` probe in `deploy.test.ts`.
- [ ] Running the viewer shows the committed run with four leaderboard rows and four standings
      rows plus first-run's row — verified manually and/or by a viewer test that does not change
      app behaviour.
- [ ] A fresh-clone read-through of `TUTORIAL.md` confirms the E2E property.
- [ ] `.codev/checks/test.sh` green overall.

#### Test Plan

- Manual: `pnpm -C apps/viewer dev`; confirm default run, selector, drill-in, `/standings`.
- Automated: `pnpm -C apps/viewer test`; full `.codev/checks/test.sh`.
- Docs: read `TUTORIAL.md` top-to-bottom as a fresh-clone user.

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Phase 3 needs live Anthropic keys + budget (web search bills per request, retries re-bill) | Medium | High | One paid step; budgeted smoke first; `max_uses: 5`; headroom `max_tokens` + loud truncation check; if keys/budget absent, stop and notify the architect rather than fabricating. |
| Hebrew mark derivation unfollowable from catalogued `he` data (zero niqqud) | — | — | Resolved: use the uncatalogued vocalized Shevuot file as the **fixture** source only; it must not enter the corpus. |
| Non-Latin scoring asymmetry (vocalized answer vs. unvocalized expected) depresses search-on, inverting the contrast | Medium | High | Strip marks on both sides; acceptance tests assert the asymmetric direction explicitly (Phase 1). |
| Unmarked search-off entry collides with first-run's standings key and replaces its row | Medium | High | Mark BOTH variants; Phase 2 test asserts non-collision with the committed `claude-haiku-5-5` key. |
| Normalise mark set under-covers real QUL (mid-word annotation marks) | Medium | High | Derive from real QUL data (enumerated); full real-ayah fixture (Phase 1). |
| Latin scoring / first-run digest silently regresses | Low | High | Re-score first-run answers → tmp, diff committed scores; regenerate first-run digest from manifest; Latin fixture (Phase 1). |
| Search-on model echoes a copyrighted translation into the public committed run | Medium | High | Original-language public-domain targets; review every search-on answer with a pinned procedure recorded in README; CC-BY-NC attribution preserved (Phase 3). |
| Web-search tool param version ambiguous (SDK exposes three) | Medium | Medium | Pin `web_search_20250305`, confirm against SDK 1.13.0, record version + `max_uses` in README (Phase 2/3). |
| Provider seam hard to mock (lazy `import anthropic`, no existing provider tests) | Low | Medium | Mock via `monkeypatch.setitem(sys.modules, "anthropic", <fake>)` (Phase 2). |
| `summary_markdown` shows only accuracy, not submetrics | Low | Low | Rely on `summary.json` + viewer explorer for submetrics; accuracy contrast is in `summary.md`; adding submetric columns is an optional nice-to-have (Phase 3). |
| Adding a second committed run reds a viewer test | Low | Medium | Consult confirmed viewer tests stub a hardcoded index / temp dirs; re-verify in Phase 4; raise with the architect before editing viewer source. |

## Documentation Updates

- `TUTORIAL.md` — reworked (Phase 4).
- `configs/models.example.yaml` — rewritten to the 4-entry panel (Phase 2).
- `runs/tutorial-2026-10-11/README.md` — new; task/scope, panel, CC-BY-NC attribution,
  web-search tool version + `max_uses`, recorded copyright clearance (Phase 3).
- `.gitignore` — tutorial-run negation (Phase 3).
- `codev/resources/arch.md` + `arch-critical.md`, `lessons-critical.md` — tools identity,
  non-Latin normalisation, `generated_at`, web-search copyright clearance (Phase 4).
- `codev/reviews/8-spec-3-tutorial-centered-on-kj.md` — the review/lessons doc (review phase).
