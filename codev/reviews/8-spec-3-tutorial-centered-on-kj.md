# Review: Tutorial centered on KJV / Qur'an / Talmud (he), 2-model panel, web-search on/off comparison

## Summary

Reworked the benchmark's front-door `TUTORIAL.md` to revolve around three sources across
three scripts (KJV `en`, Qur'an QUL `ar`, Talmud Davidson `he`) and to demonstrate the
parametric-recall-vs-tool-assisted-retrieval contrast via a 2-model × web-search-{on,off}
panel. Delivered in four phases (fair non-Latin scoring normalisation; web-search tool
config + tools-aware panel identity; a committed 100-question tutorial run; tutorial rework
+ viewer verification), all with **zero behavioural changes to the merged viewer**. Net
outcome: the benchmark's multi-faith/multi-script thesis is now demonstrated end-to-end from
a fresh clone rather than asserted, and the committed run renders in the viewer unchanged.

## Spec Compliance

- [x] AC1: `TUTORIAL.md` reworked around the three sources; `generate` step selects exactly
      the three standardized corpora; copy-pasteable from repo root; deterministic (same seed
      ⇒ same question set, digest `37eb58400fdf4ea9`). (Phase 4)
- [x] AC2: `convert` → `generate` over Qur'an (`ar`) and Talmud (`he`) succeeds; committed
      `questions.jsonl` spans three traditions / three scripts (34 Hebrew / 33 Arabic / 33
      Latin of 100). (Phases 1, 3)
- [x] AC3: `configs/models.example.yaml` is the 2-model panel (`claude-opus-5-5` +
      `claude-haiku-5-5`) as four entries (`opus`, `opus-search`, `haiku`, `haiku-search`),
      with distinct ids and per-entry tool-use setting; `ModelSpec.tools` genuinely parsed and
      honoured; loads with no duplicate-id error. (Phase 2)
- [x] AC4: Tool-config validation is fail-fast — `web_search` on a non-`anthropic` provider,
      a non-list `tools`, or an unrecognised tool value each raise `ConfigError` at load time.
      (Phase 2)
- [x] AC5: `collect` honours the per-model web-search setting (Anthropic server-side
      `web_search_20250305`, `max_uses: 5`, passed iff enabled); search-on and search-off are
      distinct cells. (Phases 2, 3)
- [x] AC6: `_panel_fingerprint` incorporates the tools setting
      (`provider|model|base_url|<tools>`); a flipped-tools resume is refused (`CollectError`).
      (Phase 2)
- [x] AC7: Standings identity incorporates tools — the committed run's `summary.json` emits
      `panel.model` marked `[web_search]` / `[no-tools]` for BOTH variants, so the viewer
      shows search-on and search-off as separate rows with no viewer source change and no
      collision with first-run's `claude-haiku-5-5` key. (Phases 2, 3, 4)
- [x] AC8: `normalize()` deletes Arabic/Hebrew combining marks + the QUL annotation block
      (U+06D6–U+06ED incl. mid-word) + tatweel, folds alef/hamza/alef-wasla, maps the Hebrew
      maqaf to a space; vocalized ↔ unvocalized are `normalized`-equal / `token_f1 == 1.0`;
      Latin is byte-for-byte unchanged; `_SUBMETRICS` + `retrieve_quote` headline unchanged.
      (Phase 1)
- [x] AC9: Python tests with real-script fixtures — full real QUL ayah with annotation +
      sajdah/rub-el-hizb symbol, real Davidson Talmud line, Arabic harakat/tatweel/alef
      variants, Hebrew niqqud/maqaf, plus a Latin regression fixture. (Phase 1)
- [x] AC10: `first-run-2026-10-11` question-set digest unchanged by the `normalize()` change
      (regression guard: re-score committed answers → tmp diffs identically; manifest-driven
      regeneration digest matches). (Phase 1)
- [x] AC11: Committed run `runs/tutorial-2026-10-11/` with the full four-file set + README,
      negated in `.gitignore`; `audit` passes origin-clean; panel is secret-free
      (provider/model/endpoint/`api_model`/served_by only). (Phase 3)
- [x] AC12: Committed as collected — no manual copyright-clearance / redaction pass (human
      determination 2026-10-11: fair use for academic research); answers verbatim; README
      carries the one-line fair-use note. Automated `audit` still gates. (Phase 3)
- [x] AC13: Run README preserves CC-BY-NC Davidson attribution (source / licence /
      non-commercial notice). (Phase 3)
- [x] AC14: Committed run reports no misleading cost — panel is unpriced (token-only, no
      `cost_usd`); `web_search_requests` captured as additive provenance only. (Phases 2, 3)
- [x] AC15: Merged viewer renders the committed run with zero source changes — run selector
      lists it, leaderboard ranks the four entries with per-task + per-tradition columns and
      token totals, explorer drills into each, standings lists four distinct rows. (Phase 4)
- [x] AC16: `realRun.test.ts` (first-run gate) and the `#86` CSS probe still pass. (Phase 4)
- [x] AC17: `.codev/checks/test.sh` green (pipelines pytest 195/195 + viewer vitest 125/125
      + audit). (All phases; re-verified at review)
- [x] AC18: The web-search contrast is observable in the committed run — per-entry accuracy
      in `summary.md`, discriminating `exact`/`normalized`/`token_f1` in `summary.json` and
      the explorer; the headline-confound hazard is named in the run README; `_SUBMETRICS`
      not altered. (Phases 3, 4)

**Note on the observed contrast (AC18 / human expectation):** the human expected web search
to score *higher*. The committed run shows web search did **not** lift the strict headline
(`correct = normalized`, whole-answer equality) and slightly hurt it on haiku. The honest
cut — recomputed from the committed artifacts — is **contains-exact-reference**: web search
*does* retrieve more correct scripture (opus 66→74, haiku 47→52 contain the exact reference;
Talmud opus-search contains the exact Aramaic in 8/34 vs 0/34 off), but 20/400 cells score 0
on the headline while containing the exact reference — all 20 are search-on, where the model
wraps the correct quote in citation/attribution prose. This is the benchmark working as
designed (strict reference match), and it is documented fully in the run README. See
Follow-up Items for the encoding-variance refinement.

## Deviations from Plan

- **Phase 3 question count: 30 → 100.** The plan's canonical block pinned `--per-task 30`;
  the human approved a larger spend pre-collect, so the committed run is 100 questions
  (balance 34 Judaism / 33 Sunni Islam / 33 Protestant Christian), digest `37eb58400fdf4ea9`.
  A stray "per-task 30" earlier in the plan was corrected to 100 in Phase 4 so repro matches.
- **Manual copyright-clearance step dropped (Phase 3).** The plan and spec originally required
  a documented clearance/spot-check of every search-on answer (Approach F). The human
  determined pre-commit that incidental web-retrieved copyrighted text in a model answer is
  fair use for academic research; the run is committed as collected with a one-line fair-use
  note, answers never truncated/edited. Spec Approach F marked SUPERSEDED; the automated
  `audit` remains the enforced gate.
- **Phase 1 invisible-format-char handling not shipped.** An eager global-delete of
  bidi/joiner/BOM/soft-hyphen broke the hard Latin-byte-for-byte invariance (a committed
  English answer's soft-hyphen: old→space, new→deleted — caught by the re-score guard), so it
  was reverted to the approved state and documented as a code comment + watch item. The
  Phase-3 invisible-format scan then found **0/400** occurrences in the real run, so it was
  moot. Non-blocking; both reviewers approved without it.
- **`generated_at` (Issue #7) included** as planned — closes #7's pipeline half (additive
  UTC-ISO field in `summary.json`; the viewer ignores it). Noted here because it was
  *optional* scope in the spec.

## Consultation Feedback

Per-phase impl/review consultation was **codex + claude** (Gemini excluded in
`.codev/config.json` because its per-phase consult cannot see the worktree — recorded as a
project lesson). The spec and plan consults also ran codex + claude. All concerns below were
resolved before each phase advanced; every phase reached BOTH-APPROVE before porch advanced
it.

### Specify Phase (Round 1) — both REQUEST_CHANGES / HIGH
#### Codex & Claude (concordant findings)
- **Concern**: QUL carries marks far beyond basic harakat (U+06D6–U+06ED annotation block,
  rub-el-hizb U+06DE, sajdah U+06E9, superscript alef U+0670, tatweel, small waw/yeh), many
  mid-word → a basic-harakat-only mark set would ship broken. → **Addressed**: expanded
  Approach D to range+category derived from real QUL data; full-ayah fixture required.
- **Concern**: committing live-web-search answers to a PUBLIC repo is a new copyright surface
  `audit.py` can't see (origin keys on the question's public source; content layer is
  restricted-gated + Latin-only). → **Addressed** (then superseded): added Approach F
  (documented clearance + PD-originals framing + CC-BY-NC attribution); the clearance step was
  later dropped by human fair-use determination, attribution retained.
- **Concern**: `audit._norm` is Latin-only (verified no-op on ar/he). → **Addressed**:
  Approach G — extend it alongside `normalize()`.
- **Concern**: server-side `web_search_requests` cost is uncaptured → a priced run would
  understate cost. → **Addressed**: Approach H — committed run stays unpriced.
- **Concern**: headline `correct = normalized` (whole-answer equality) can invert the search
  contrast. → **Addressed**: named `token_f1`/`exact` as discriminators; `_SUBMETRICS` left
  unchanged (req 4).
- **Concern**: `config.py` does no unknown-key validation — a stray `tools:` is silently
  dropped. → **Addressed**: parse + fail-fast validation required. Also added `api_model` so
  the panel proof stays truthful.

### Plan Phase (Round 1) — both REQUEST_CHANGES / HIGH
#### Codex & Claude (concordant findings)
- **Concern**: catalogued `he` Aramaic files carry ZERO niqqud → "derive the Hebrew mark set
  from the `he` data" is unfollowable. → **Addressed**: fixture source is the uncatalogued
  vocalized Shevuot file, used for tests only, must not enter the corpus.
- **Concern**: an unmarked search-off `claude-haiku-5-5` entry would collide with first-run's
  standings key and silently replace its row. → **Addressed**: mark BOTH variants
  (`[web_search]` / `[no-tools]`); a test asserts non-collision.
- **Concern**: unvocalized expected vs. vocalized search-on answer could depress search-on
  (token_f1≈0), inverting the contrast. → **Addressed**: strip marks on both sides; assert the
  asymmetric direction explicitly.
- **Concern**: no provider-seam tests exist (lazy `import anthropic`); SDK exposes three
  web-search tool versions; `max_tokens` truncation re-bills on retry. → **Addressed**: mock
  via `monkeypatch.setitem(sys.modules, ...)`; pin `web_search_20250305` + `max_uses: 5`;
  headroom `max_tokens` + loud stop_reason check; manifest-driven digest regen (not a vacuous
  file-hash).

### Phase 1 — Fair Arabic/Hebrew scoring normalisation
- **Round 1**: REQUEST_CHANGES — mark set was QUL-only (would miss marks absent from the
  committed QUL but valid in the script). → **Addressed**: widened to any Mn in the Arabic/Hebrew
  blocks (superset), verified corpus-wide.
- **Round 2**: Codex APPROVE/HIGH, Claude APPROVE/HIGH — Claude verified 6236/6236 QUL ayat
  symmetric, 0 word-splits, Latin invariant even over Davidson English transliteration lines.

### Phase 2 — Web-search tool config, collection, tools-aware identity
- **Round 1**: REQUEST_CHANGES — the stop_reason guard caught only `max_tokens`, missing
  `pause_turn`. → **Addressed**: switched to an allowlist (`{end_turn, stop_sequence}`), fail
  loud otherwise.
- **Round 2**: Codex APPROVE/HIGH, Claude APPROVE/HIGH — Claude verified against the installed
  SDK `StopReason` enum, the viewer's permissive `parseSummary`, and `aggregate.ts` standings
  key.

### Phase 3 — Committed KJV/Qur'an/Talmud tutorial run
- **Round 1**: Codex APPROVE/HIGH; Claude REQUEST_CHANGES/HIGH — the run README's causal
  analysis was inverted (claimed web search "slightly hurt" on orthography). → **Addressed**
  (doc-only, no re-collect/re-score/code/spend): rewrote the README to lead with the
  contains-exact cut, the 20-wrapped-cell asymmetry, the Talmud lift, and the Qur'an 24-vs-19
  contains figure. Did not add a contains-ref submetric (would reshape `scores.jsonl` and break
  byte-for-byte re-score regressions) — numbers put in README prose.
- **Round 2**: both REQUEST_CHANGES — the iter-1 fix over-applied a regression-subset figure
  ("exactly one orthographic miss") to all misses. → **Addressed**: verified the aggregate
  (haiku-search Qur'an 21 misses = 12 wrappers + 9 encoding variants; haiku-off has 14
  encoding-variant misses + 0 wrappers, proving orthographic near-miss is not a search
  artifact), scoped the "exactly one" claim to the regression subset.
- **Round 3**: Codex APPROVE/HIGH, Claude APPROVE/HIGH.

### Phase 4 — Tutorial rework and viewer verification
- **Round 1**: Codex REQUEST_CHANGES/HIGH; Claude APPROVE/HIGH.
  - Codex **Concern**: `tutorialRun.test.ts` exercised only `loadRun()`/`aggregate()`, not the
    leaderboard/explorer render paths. → **Addressed**: extended the (test-only) spec to cover
    `leaderboardRows` (ranks four entries 66/66/47/40, non-increasing, 100 calls each) +
    `traditionRows`, and explorer `modelQuestions`/`questionStats`/tradition filter.
  - Codex **Concern**: the fair-use copyright policy was absent from the governance docs. →
    **Addressed**: recorded under cold `lessons-learned.md` (Evidence & copyright).
  - Claude (non-blocking): added Track-B cost magnitude + a cheap `--per-task 5` trial note
    (**Addressed**); hedged the "most-recent run" mtime assumption (**Addressed**); confirmed
    `lessons-critical` left unchanged is deliberate (**N/A** — no action).
- **Round 2**: Codex APPROVE/HIGH, Claude APPROVE/HIGH — applied two optional doc-only polish
  items (deterministic `/?run=tutorial-2026-10-11` deep-link replacing the mtime hedge;
  "12 of 33" count clarity). Skipped the `skipIf`-vacuous suggestion (consistent with
  `realRun.test.ts`; the run is gitignore-negated so present in every clone/CI).

### PR Review (Round 1) — ASPIR review-phase consultation on PR #9
- **Codex**: APPROVE / HIGH — "complete, internally consistent, well-tested, ready to merge";
  no issues.
- **Claude**: APPROVE / HIGH — independently re-implemented `normalize()` from the spec in a
  throwaway stdlib script and recomputed every run-README number from `answers.jsonl` /
  `scores.jsonl`; all matched exactly (headline 66/66/47/40, contains-exact 66/74/47/52, the
  20 zero-but-contains cells all search-on, Talmud opus-search 8/34 vs 0/34, Qur'an
  haiku-search 24/33 vs 19/33, 226 web-search requests, panel secret-free/unpriced/`api_model`
  present/`generated_at` ISO); branch MERGEABLE/CLEAN. Non-blocking notes:
  - **Concern**: the `_TERMINAL_STOP` allowlist makes `pause_turn` fatal for *all* Anthropic
    calls, so a long server-tool turn can never continue. → **N/A** (deferred follow-up): a
    `pause_turn` continuation loop is the real fix; both reviewers signed off on fail-fast for
    evidence integrity, and the Phase-3 smoke saw zero `pause_turn`. Added to Follow-up Items.
  - **Concern**: marking both panel variants moves a re-scored pre-Spec-8 run's standings key
    (`claude-haiku-5-5` → `… [no-tools]`), so it won't aggregate across the boundary. →
    **Rebutted** (intentional): this is exactly the non-collision property AC7 requires;
    Approach B (a dedicated viewer `tools` field) was deliberately deferred. Noted for a future
    longitudinal standings view.
  - **Concern**: AC10's generation-side digest guard skips when `texts/standardized/` is absent
    (always in a fresh clone/CI). → **N/A** (accurate caveat): the *strong* re-score guard over
    ~400 real first-run answers runs unconditionally; the generation-side half is additive. The
    AC10 line is read with this caveat.
  - **Concern**: repo has no CI, so the 195/125 counts are builder-reported. → **N/A**: true;
    the gate is run locally (re-verified green at review entry). Out of this spec's scope.
  - **Concern** (cosmetic): stale "≥3-model / ≥2-provider" code comment above `if panel:` in
    `score.py`; brittle `"cost" not in json.dumps(summary).lower()` assertion in
    `test_tutorial_run.py` (would false-positive on a model id containing "cost"). → **N/A**
    (non-blocking, not re-opening an approved+gated branch): captured in Follow-up Items.

No `CONSULT_ERROR` was encountered; both PR-round verdicts were APPROVE / HIGH.

## Lessons Learned

### What Went Well

- **Derive from real data, not docs.** The mark set, the standings-key collision, the Hebrew
  no-niqqud fixture problem, and the inverted contrast were all caught by enumerating the real
  QUL/Davidson data and recomputing from the committed artifacts — exactly the project's
  standing lesson, and it paid off every phase.
- **The re-score-to-tmp regression guard** (re-score the committed first-run answers to a
  throwaway path, diff against committed `scores.jsonl`) is a strong, cheap invariance check
  that caught the invisible-format-char regression immediately.
- **Marking BOTH panel variants** (`[web_search]` AND `[no-tools]`) — not just the search-on
  one — avoided a silent standings-row replacement of first-run's haiku entry.
- **Budgeted live smoke before the full paid collect** cleared the `pause_turn` hard gate and
  confirmed both search paths end-to-end before spending on 400 cells.

### Challenges Encountered

- **The headline metric hid the real result.** `correct = normalized` (whole-answer equality)
  penalises a correctly-retrieved quote wrapped in citation prose, so the raw headline made
  web search look neutral-to-harmful when contains-exact showed it retrieves *more* correct
  scripture. Resolved doc-only (README prose + the discriminating submetrics already emitted),
  without touching the frozen `_SUBMETRICS` contract.
- **Invisible-format characters vs. Latin invariance.** A general fix for web-fetched
  bidi/joiner/BOM/soft-hyphen chars could not coexist with the byte-for-byte Latin-invariance
  contract; reverted and documented, then found moot (0/400 in the real run).
- **Two review rounds on Phase 3 were about *my own analysis prose*, not code** — the pipeline
  was correct; the README's causal story was wrong twice (inverted, then over-generalised).
  Recomputing the aggregate numbers from the artifacts each time was the fix.

### What Would Be Done Differently

- **Compute the contrast's honest cut (contains-exact) up front**, before writing any causal
  narrative in the run README — the two Phase-3 review rounds were spent correcting a story
  that should have been derived from the numbers first.
- **Pin the scope number (per-task) in exactly one place.** A stray `--per-task 30` survived
  the human's 30→100 change and had to be chased down in Phase 4.

### Methodology Improvements

- ASPIR's per-phase 2-way consult (codex + claude) was effective; the Gemini-can't-see-the-
  worktree exclusion is correctly encoded in `.codev/config.json`. No protocol change needed.
- Consider a protocol nudge to treat a committed artifact's *narrative* (README causal claims)
  as reviewable-against-data the same way code is — it was the single biggest source of review
  churn here.

## Architecture Updates

Routed during Phase 4 via the `update-arch-docs` skill (diff-mode):

- Routed: **hot** (`arch-critical.md`) — tool-use is part of panel identity (`tools` →
  `_panel_fingerprint` AND emitted `panel.model` `[web_search]`/`[no-tools]`; non-anthropic
  tool = UNPRICED fail-fast) — added as one fact; the scoring fact gained a script-aware
  `normalize()` clause. Hot file sits at 10 facts (within cap).
- Routed: **cold** (`arch.md`) — `score.py` non-Latin `normalize()` + `generated_at`;
  `config.py` tools fail-fast; `providers.py` web_search tool + loud stop_reason allowlist;
  `collect.py` tools in fingerprint; viewer standings tools-identity zero-change property; the
  `runs/tutorial-2026-10-11` gitignore negation.

## Lessons Learned Updates

Routed during Phase 4 via `update-arch-docs`:

- Routed: **cold** (`lessons-learned.md`) — non-Latin scoring fairness (delete marks before the
  punct pass; maqaf→space); the wrapper-penalty / contains-exact honest cut; the
  encoding-variance deferral; web_search as identity-bearing + the unpriced rule; and the
  fair-use copyright policy (answers committed as collected, audit stays the gate).
- **No hot-tier lessons change** — `lessons-critical.md` is at its ~10-entry cap and the new
  items are cold reference, not behavior-changing-up-front facts; displacement discipline
  respected (no append past the cap).

## Flaky Tests

No flaky tests encountered.

## Follow-up Items

- **Web-retrieved encoding-variance gap (deferred — future refinement).** A search-on model can
  return the correct āyah in a *different* Uthmani Unicode encoding (e.g. U+06E1 vs U+0652,
  Arabic Extended-A tanwin U+08F0–U+08F2, U+0657, yeh/alef-maksura) that `normalize()` does
  **not** fold to exact equality (`token_f1` up to 0.95, `correct = 0`). Not fixed in Spec 8:
  either folding these additional code points OR adding a pipeline-level `contains_reference`
  submetric would reshape `scores.jsonl` and break the byte-for-byte re-score regressions, and
  req 4 freezes the `_SUBMETRICS` contract. This is the cleanest next step to make the
  web-search-retrieval advantage visible in the headline, not just in README prose.
- **Wrapper-vs-retrieval honest metric.** The strict headline scores a correctly-retrieved
  quote 0 when wrapped in citation prose; a `contains-exact-reference` submetric (not
  `token_f1`) is the honest discriminator. Pairs with the encoding-variance item above.
- **Non-anthropic providers lack the truncation/stop_reason guard.** `_openai` / `_gemini` do
  not enforce the stop_reason allowlist now enforced for `_anthropic`; out of scope here (the
  tutorial panel is all-anthropic) but a latent trap for a future mixed panel.
- **Invisible-format characters in web-fetched RTL answers** (bidi/joiner/BOM/soft-hyphen)
  could in principle split a word mid-token under whole-string equality; it was 0/400 in this
  run and cannot be fixed globally without breaking Latin invariance. A per-answer scan (as
  done in Phase 3) is the pragmatic guard.
- **`pause_turn` continuation loop (Anthropic).** The current `_TERMINAL_STOP` allowlist treats
  a `pause_turn` as a fatal error so no partial turn is ever committed as an answer — correct
  for evidence integrity, but it means a legitimately long server-tool turn can never complete.
  The real fix is a continuation loop that re-issues the paused turn; deferred (zero `pause_turn`
  observed in the Phase-3 smoke or full collect). Surfaced by the PR-round Claude consult.
- **Cosmetic cleanups (non-blocking, not applied to the approved/gated branch).** A stale
  "≥3-model / ≥2-provider" code comment remains above `if panel:` in `score.py` though the
  rendered markdown header was softened; and `test_tutorial_run.py`'s
  `"cost" not in json.dumps(summary).lower()` secret/price assertion would false-positive on a
  model id containing the substring "cost" (the committed run's ids do not, so it is correct
  today). Both are safe to tidy in a future touch of those files.
