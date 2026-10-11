# aspir-8 thread — [Spec 3] Tutorial centered on KJV / Qur'an / Talmud(he), 2-model panel, web-search on/off

Builder: aspir-8 · Protocol: ASPIR (strict) · Issue #8

## Phase: SPECIFY (started 2026-10-11)

### Grounding done (read real code, not docs)
- **Converters already handle ar/he.** `quran_qul` (Arabic Qur'an, QUL Uthmani) and
  `sefaria_talmud` (Hebrew/Aramaic Talmud, with an explicit en/he language cross-check)
  are both registered in `convert.py` and the `he` Talmud target IS already in
  `texts/raw/Judaism/source.yaml` (added Spec 1, commit cff38b2). The issue's "only
  English catalogued today / handle its shape in the converter" is **stale** — the
  conversion half is largely done. Real remaining converter work = verify it produces
  docs + wire the tutorial generate to the ar/he standardized paths.
- **normalize() mangles non-Latin (verified empirically).** Current `score.py normalize()`
  does NFKD + fold curly quotes/dashes + `[^\w\s]`→space + casefold. On Arabic vocalized
  basmala it yields `'ب س م ٱلل ه ٱلر ح م ن ٱلر ح يم'` (harakat→spaces split letters;
  alef-wasla ٱ NOT folded), `token_f1(vocalized,plain)=0.0`. Tatweel survives; Hebrew
  niqqud/maqaf split letters. The deferred Arabic/Hebrew normalization must land: delete
  combining marks (harakat/niqqud), remove tatweel, fold alef/hamza/alef-wasla→ا, fold
  maqaf, WITHOUT splitting letters.
- **Tools/standings identity (viewer is zero-change, req 5).** Viewer STANDINGS keys on
  `panel.provider \u0000 panel.model` (`apps/viewer/src/lib/aggregate.ts:59`). Leaderboard +
  explorer key on `model_id`. loadRun/parseSummary do NOT read any `tools` field; panel =
  {provider, model, endpoint, served_by}. ⇒ To make search on/off distinct in standings
  WITHOUT touching the viewer, the pipeline must encode the tools setting into the emitted
  `panel.model` (the standings key). Also `_panel_fingerprint` (collect.py:32) must include
  tools. 4 distinct model_ids give distinct leaderboard/explorer rows for free.
- **Panel/config shape.** `ModelSpec` (config.py) has no `tools` field yet. Panel snapshot
  built in `cli.py score` from `{provider, model, endpoint, price_in, price_out}`;
  `_anthropic` in providers.py makes a plain `messages.create` (no tools) — web_search is
  Anthropic server-side tool, needs `tools=[...]` passed when enabled.
- **Committed run.** `.gitignore`: `runs/*` + `!runs/first-run-2026-10-11/`. KJV target =
  `The Bible / KJV / en`; Qur'an = `The Qur'an / Uthmani (QUL) / ar`; Talmud-he =
  `Talmud Bavli / William Davidson Edition - Aramaic / he`. CC-BY-NC Talmud is "open" (not
  restricted) → audit-clean to commit. Run-listing needs only summary.json. Committed-run
  viewer gate = `apps/viewer/src/local/realRun.test.ts`; #86 CSS probe = `deploy.test.ts`.
- **#7 (optional).** score.py could stamp a `generated_at` into summary.json to replace the
  viewer's fragile mtime "most recent" ordering — flag in spec, optional scope.

### Decisions I'm proposing in the spec (open design areas)
1. Tools identity: encode tools into `panel.model` + `_panel_fingerprint` (zero viewer change).
2. Committed run: ADD a new `runs/tutorial-*` dir + gitignore negation, KEEP first-run so the
   existing viewer gate test is untouched (honors req-5 "zero code changes"). Flag the risk
   that a viewer index test might assert an exact run set.
3. normalize: delete-marks approach (Arabic/Hebrew ranges), real-script fixtures.

### Spec iter-1 consult (codex + claude, both REQUEST_CHANGES / HIGH) — incorporated
Both independently verified my empirical claims were exactly right; both found real gaps:
- **QUL mark coverage**: real QUL has marks far beyond basic harakat (enumerated: U+06D6–U+06ED
  annotation block, rub-el-hizb U+06DE, sajdah U+06E9, superscript alef U+0670, tatweel, small
  waw/yeh), many MID-WORD. Approach D expanded + full-ayah fixture required.
- **Copyright exposure (big)**: committing live-web-search answers to a PUBLIC repo — a search-on
  model could echo a copyrighted translation (Steinsaltz/NABRE/NA28); audit.py can't see it
  (origin keys on question's public source; content layer restricted-gated + Latin-only).
  Added Approach F = documented clearance + PD-originals framing + CC-BY-NC attribution; Critical
  open question; constraint + risk + criteria.
- **audit._norm Latin-only** (verified no-op on ar/he): Approach G = extend or state limitation.
- **web-search cost**: server_tool_use.web_search_requests uncaptured → Approach H = committed run
  stays UNPRICED (no cost_usd).
- **headline confound**: correct=normalized whole-answer equality can INVERT the search contrast;
  pin token_f1/exact as discriminators; do NOT touch _SUBMETRICS (req 4).
- **config fail-fast**: tools on non-anthropic / invalid value → ConfigError; today config.py does
  no unknown-key validation (a stray tools: is silently ignored) — must genuinely parse+honor.
- **api_model**: also emit raw API model string under viewer-ignored key so panel proof stays true.
- **pin --tasks retrieve_quote**; generate.py imports normalize (blast radius) but Latin digest
  safe (_qid hashes raw text) — added first-run-digest regression criterion.
Committed as "[Spec 8] Specification with multi-agent review".

### SPEC advanced to PLAN (no human gate). Plan drafted → iter-1 consult (both REQUEST_CHANGES/HIGH, both verified vs real code) → revised.
Critical plan-consult catches folded in:
- **Hebrew no-op**: catalogued `he` Aramaic files have ZERO niqqud → "derive from he data" unfollowable.
  Fixture source = uncatalogued `Shevuot - he - ... Vocalized Aramaic.json` (106k marks), MUST NOT enter corpus.
- **Standings collision**: unmarked search-off `claude-haiku-5-5` == first-run's key → would REPLACE its
  standings row. Fix: mark BOTH variants (`[web_search]` / `[no-tools]`); assert non-collision.
- **Asymmetric Hebrew risk**: unvocalized expected vs vocalized search-on answer → token_f1≈0 inverts contrast.
  Strip marks both sides; test asymmetric direction.
- No provider-seam tests exist (lazy `import anthropic`) → mock via monkeypatch.setitem(sys.modules,...).
- SDK 1.13.0 has 3 web-search tool versions → pin web_search_20250305 + max_uses:5, record in README.
- max_tokens truncation + retry re-bills → headroom 4096 on search entries + loud stop_reason check.
- Vacuous digest test → regenerate from manifest params. Strong Latin regression = re-score first-run
  answers→tmp, diff committed scores (TUTORIAL Track A trick).
- summary_markdown shows accuracy only → contrast via summary.json + viewer explorer (optional md cols).
- generated_at (#7) INCLUDED (additive, viewer ignores).
- Copyright clearance: review EVERY search-on answer (~60), pinned procedure in README.
- Pinned: tools schema (`tools: [web_search]`, default []), ids opus/opus-search/haiku/haiku-search,
  run id runs/tutorial-2026-10-11, seed 20261011, per-task 30, 3 standardized paths (verified exist).
  maqaf→space (boundary), marks→delete.

### PLAN approved (autonomous) → IMPLEMENT.

## Phase 1 DONE — Fair Arabic/Hebrew scoring normalisation (committed)
- `score.py`: added `strip_script_marks()` + `_SCRIPT_MARKS_RE` (Arabic U+064B-0655,0670,0640,
  06D6-06ED; Hebrew points/cantillation 0591-05BD,05BF,05C1-C2,C4-C5,C7). normalize() deletes
  marks BEFORE punct-pass (so vocalised words aren't split), folds alef-wasla→alef, maqaf→space.
  Alef-madda/hamza fold automatically via NFKD+mark-delete. Latin byte-for-byte unchanged.
- `audit.py::_norm`: NFKD + strip_script_marks + `[^\w]+` (was ASCII-only `[^a-z0-9]` → collapsed
  non-Latin to ''). Now fingerprints Arabic/Hebrew/Greek; consistent on both fp + blob.
- Tests: `test_normalize_nonlatin.py` (real tracked QUL + vocalised-Davidson fixtures; symmetric
  + ASYMMETRIC both directions; maqaf boundary; Latin invariance snapshot), audit non-Latin
  content-layer test, `test_first_run_regression.py` (re-score committed first-run → reproduces
  scores [strong Latin regression]; regenerate first-run digest [skipif corpus absent]).
- Verified empirically: AR vocal==plain f1=1.0, QUL 2:2/7:206 marks gone, HE vocal==plain,
  Latin "naïve"→"nai ve" (unchanged). Full gate: 165 passed. `ar`/`he` convert cleanly (221 docs)
  → Phase 3 convert ready. (Gotchas hit: json.dumps ensure_ascii must be False in audit test;
  Uthmani dagger-alef ≠ full alef — strip programmatically not by hand.)

### Phase 1 review: iter1 REQUEST_CHANGES (QUL-only mark set) → fixed (Mn-in-RTL-blocks superset)
### → iter2 BOTH APPROVE/HIGH. Claude verified corpus-wide: 6236/6236 QUL symmetric, 0 splits,
### 176 tests no-skip, Latin invariant even over Davidson English transliteration lines.

⚠️ **Phase-3 WATCH ITEM (invisible-format chars)**: bidi/joiner/BOM/soft-hyphen (U+200C-200F,
U+061C, U+FEFF, U+00AD) in web-fetched RTL answers split a word mid-token → under whole-string
`correct=normalized` one RLM zeroes a correct search-on item. I tried an eager global-delete fix
but it BROKE Latin invariance (soft-hyphen in a committed English answer: old→space, new→deleted;
the byte-for-byte re-score guard caught it). Can't be fully fixed without violating the hard
Latin-invariance contract, and it's NON-blocking (both reviewers approved without it). So:
REVERTED to approved state (score.py diff now comment-only), documented in the code comment +
here. **Phase 3: during the copyright-clearance answer review, also scan search-on answers for
these chars; if present, strip them from that cell's answer context or re-collect.** A split
answer is visible in the explorer.
Also noted (out of scope, Phase 3 orthographic variance): explicit-alef الرحمان vs dagger-alef,
alef-maksura/ya, ta-marbuta/ha — read as variance, not a normalise bug.

(Deferred the porch context-refresh at the P1→P2 boundary: context budget ~97%, all state
committed, refresh is advisory + non-blocking — clearing would waste rich consult-informed context.)

## Phase 2 DONE — web-search tool config/collect/tools-aware identity (committed, 186 pass)
- config.py: `ModelSpec.tools` + `_parse_tools` (fail-fast: non-list / unknown / web_search on
  non-anthropic → ConfigError). TOOLS=("web_search",).
- providers.py: `WEB_SEARCH_TOOL={"type":"web_search_20250305","name":"web_search","max_uses":5}`;
  `_anthropic` passes it iff enabled, raises ProviderError on stop_reason==max_tokens (no retry
  re-bill), records web_search_requests. complete() re-raises ProviderError (no retry) — good.
- collect.py: `_panel_fingerprint` = provider|model|base_url|tools (updated test_collect assert to
  "anthropic|m-m||").
- cli.py: panel.model = "<model> [web_search]"/"[no-tools]" (BOTH marked → no first-run collision),
  + api_model raw. score.py: panel passes api_model through; adds summary["generated_at"] (ISO, #7).
- configs/models.example.yaml: 4 entries opus-search/opus/haiku-search/haiku, unpriced.
- tests test_phase2_tools.py: faked SDK via monkeypatch.setitem(sys.modules,"anthropic",...).
- ⚠️ generated_at makes score_file non-deterministic (timestamp) — fine, no test compares full
  summaries; re-score regression compares scores.jsonl only.

### Phase 2 review: iter1 REQUEST_CHANGES (stop_reason guarded only max_tokens, missed pause_turn)
### → fixed (allowlist {end_turn,stop_sequence}, fail loud else) → iter2 BOTH APPROVE/HIGH.
Claude verified vs installed SDK StopReason enum, viewer parseSummary (permissive to api_model/
generated_at), aggregate.ts standings key, 190 tests.

## Phase 3 CARRY-FORWARD GATES (from phase_2 iter2 non-blocking notes):
1. ⛔ **pause_turn is a HARD SMOKE GATE**: fail-loud is correct for evidence integrity BUT collect
   is NON-CONVERGENT if pause_turn occurs (every re-run re-bills, cell never completes). In the
   Phase-3 smoke: if pause_turn appears EVEN ONCE → implement the continuation protocol BEFORE the
   full paid collect, do NOT retry into it.
2. 📝 Review-doc note: `_openai`/`_gemini` lack the truncation/stop_reason guard now enforced for
   anthropic (out of scope — tutorial panel is all-anthropic; latent trap for a future mixed panel).
3. 📝 Narrow re-bill path: end_turn with only tool blocks + no text → generic empty-response retry
   (very unlikely). Cosmetic: cli.py uses '+' join, collect.py uses ',' join (both tools-general,
   harmless, different purposes).
(Did NOT re-touch approved phase 2 for these — they're non-blocking / operational, per the Phase-1
lesson about not eagerly re-opening approved phases.)

## Phase 3 — BLOCKED on credentials + paid-spend authorization (2026-10-11)
Free/deterministic prep DONE + verified (on disk at runs/tutorial-2026-10-11/, gitignored WIP):
- generate: 30 questions, seed 20261011, per-task 30, 3 corpora. VERIFIED: 10/10/10 across
  Sunni Islam / Judaism / Protestant Christian; expected-text script 10 Arabic / 10 Hebrew / 10
  Latin. digest 0e3af4805373e5e5, corpus ed3f05dcf703e2e3. audit OK (origin-only, clean).
BLOCKER: `ANTHROPIC_API_KEY` NOT in builder env → paid web-search collect can't run. AND the
collect is a real spend (30Q × 4 entries = 120 cells; 60 web-search, max_uses 5 each) — budget
authorization is the human/architect's call, not mine. Notified architect; signalled BLOCKED; waiting.
Do NOT fabricate the run. When unblocked, resume at: smoke (pause_turn hard gate #1) → full collect
→ score (unpriced) → clearance (review ALL search-on answers, strip web bidi/joiner/BOM) → audit →
commit run + README + gitignore negation.

### Next
WAIT for architect: key + spend go-ahead, OR architect runs collect & hands me answers, OR defer P3.
⚠️ Phase 3 = paid Anthropic web-search run. Order: convert → generate (seed 20261011, per-task 30,
3 corpora) → audit → SMOKE (few cells, check pause_turn gate #1) → full collect → score (unpriced)
→ copyright-clearance (review ALL search-on answers; strip web bidi/joiner/BOM chars if present) →
audit → commit run + README (CC-BY-NC attribution, web_search_20250305 + max_uses 5). If no
ANTHROPIC_API_KEY/budget → escalate to architect, do NOT fabricate.
