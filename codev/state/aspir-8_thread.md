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

## Phase 3 — UNBLOCKED (2026-10-11): architect approved option (a), human authorized spend
- Keys: `set -a; source /Users/mwk/Development/fftn/taqwabench/.env; set +a` before collect.
  NEVER cat/echo/print the file or any key; never commit key material; logs carry the path only.
- **SCOPE CHANGE (human, pre-collect)**: n=100 not 30. Regenerated `--per-task 100 --seed 20261011`
  → 100 Q, balance 34 Judaism / 33 Sunni Islam / 33 Protestant Christian (34 Hebrew/33 Arabic/33
  Latin), unique ids, audit clean. **digest 37eb58400fdf4ea9**, corpus ed3f05dcf703e2e3.
  (Plan canonical cmd pinned per-task 30; deviation is the approved scope change — update Phase-4
  TUTORIAL + plan canonical block to per-task 100 so repro matches.) Panel 100×4 = 400 cells (200 search-on).
- **SMOKE PASSED** (3 Q = 1 Ar/1 He/1 La × 4 panel = 12 cells, scratchpad only, NOT committed):
  exit 0, NO pause_turn (hard gate #1 CLEARED), no empty answers, no invisible-format chars.
  Both paths work: -search cells recorded web_search_requests (1/2/5), -off None. Content sane:
  KJV Jeremiah correct EN (all 4); Qur'an 7:70 Arabic original; Talmud Aramaic Q → EN refusals/
  explanations ("couldn't find the exact Aramaic text"), NOT copyrighted reproductions (good early
  clearance signal — still must review all 200).
- Full collect running (bg task bb6h64b58) → answers.jsonl.

### SCOPE REDUCTION (human, pre-commit): DROP manual copyright-clearance entirely
Human determination: academic research / fair use; incidental copyrighted text in model answers
is acceptable. Commit run AS COLLECTED (no review/redact/strip). Removed the required clearance
step from spec (Approach F → SUPERSEDED note + resolved the Critical open question + risk row +
criteria) and plan (Phase 3 clearance block → fair-use note; Objective; Test Plan). README carries
a one-line fair-use note only. Automated audit gate UNCHANGED. New sequence: collect→score→audit→commit.

## Phase 3 DONE — committed tutorial run (collect→score→audit→commit)
- **collect**: 400 answers (100/model), 0 empty, single digest 37eb58400fdf4ea9. Web search fired
  on 93/200 search-on cells (opus-search 34 cells/131 req, haiku-search 59/95; 226 req total).
- **score** (unpriced, no cost_usd): summary.json keys models/by_tradition/usage/panel/generated_at.
  Panel 4 entries, marked [web_search]/[no-tools], api_model preserved, secret-free. Standings keys
  distinct + NO first-run collision. generated_at ISO.
- **CONTRAST (honest, NOT what issue expected)**: web search did NOT help, slightly HURT.
  opus 66 vs opus-search 66; haiku 47 vs haiku-search 40. By tradition: Judaism ~0 all (Aramaic
  Talmud recall floor; abstain/EN-about); KJV 85-100 flat; Qur'an opus 100→97, haiku 58→36.
  Driver: web-retrieved Qur'an in different vocalisation/orthography than Uthmani QUL ref →
  normalize folds diacritics/tatweel but NOT letter choices → correct-but-differently-spelled
  scores 0 (token_f1 shows near-miss not fabrication). 1 opus flip was web_req=None = sampling noise.
  Documented fully in run README. Benchmark working as designed (strict reference match).
- **audit**: origin-clean (pre- and post-score). **invisible-format scan: 0/400** (Phase-1 watch
  item clear — no silent zeroing). **secret scan: 0 sk-/bearer/auth material across all run files.**
- **test**: added pipelines/tests/test_tutorial_run.py (4 distinct standings + non-collision,
  secret-free+api_model+unpriced+generated_at, re-score committed answers byte-for-byte [strong
  non-Latin regression], 3-tradition/3-script questions). Secret-scan refined to key-MATERIAL
  regex (sk-/bearer-with-value) not var-name mentions (ANTHROPIC_API_KEY in README repro is doc,
  not secret; panel secret-freeness also structurally asserted). **Full gate: 195 passed.**
- **.gitignore**: added `!runs/tutorial-2026-10-11/`.

### Phase 3 review: iter1 — codex APPROVE/HIGH; claude REQUEST_CHANGES/HIGH (accepted in full)
Claude recomputed from committed artifacts: my run README's causal analysis was WRONG/INVERTED.
Truth (verified by my own recompute): web search retrieves MORE correct scripture (contains-exact
opus 66→74, haiku 47→52), but 20/400 cells score 0 while CONTAINING the exact ref — ALL 20 are
search-on (opus-search 8, haiku-search 12) = citation/attribution WRAPPERS, not orthography.
Talmud: opus-search contains exact Aramaic 8/34 (~24%) vs opus-off 0/34 — web search LIFTED it
(headline hid it). Qur'an haiku: contains 24/33 vs 19/33 (more) but headline 12 vs 19 (wrappers);
exactly 1 genuine orthographic miss. opus flip 642fbf516c7a = normalize-equal + trailing disclaimer.
FIX = DOC-ONLY (no re-collect/re-score/code/spend): rewrote README "## The contrast" + "## Reading
the scores" to lead with contains-exact cut, 20-wrapped asymmetry, Talmud lift, Qur'an 24-vs-19.
Did NOT touch _SUBMETRICS/headline (req 4). Did NOT add a contains-ref submetric (would reshape
scores.jsonl → break byte-for-byte re-score regressions) — put numbers in README prose instead.
token_f1 median on 20 wrapped = 0.45 (my recompute; claude said 0.54 on a diff subset) → used 0.45.
Rebuttals: 8-phase_3-iter1-rebuttals.md. 195 tests still pass. Committed README fix; reconsulting.

### Phase 3 review iter2: codex REQUEST_CHANGES (denominator); claude REQUEST_CHANGES (same + 2)
Both caught: my iter1-fix sentence "exactly one Qur'an miss is orthographic; rest are wrappers"
WRONGLY applied claude's regression-subset figure (11 Q: 10 wrappers+1) to ALL misses. Verified
aggregate: haiku-search Qur'an 21 misses = 12 wrappers + 9 encoding variants (correct āyah in a
different Uthmani Unicode encoding normalize doesn't fold; 5 pure-Arabic f1 0.69-0.95, 4 +EN prose;
none wrong scripture). haiku-OFF also has 14 encoding-variant misses, 0 wrappers → orthographic
near-miss is NOT a search artifact. FIXED Qur'an bullet (12+9 split, scoped the "exactly one" to
the regression subset). claude +2: (a) scoped line-53 "mechanism not orthography/fabrication" to
the 20 wrapped cells; (b) record encoding-variance as future work (below). claude said 22=13+9;
codex+my recompute = 21=12+9 (haiku-search correct=12) → used verified 12/21. iter2 rebuttals written.

⭐ REVIEW-DOC CARRY-FORWARD (claude iter2 req): web-retrieved encoding-variance gap — a search-on
model can return the correct āyah in a different Uthmani Unicode encoding (U+06E1 vs U+0652, Arabic
Extended-A tanwin U+08F0-08F2, U+0657, yeh/alef-maksura) that normalize() does NOT fold to exact
equality (token_f1 up to 0.95, scores correct=0). Future refinement: fold these, OR add a
pipeline-level contains_reference submetric. NOT done in Spec 8 (req 4: would reshape scores.jsonl
+ break byte-for-byte re-score regressions). Put this in codev/reviews/8-*.md.

## Phase 3 APPROVED (iter3: codex APPROVE/HIGH, claude APPROVE/HIGH) → porch advanced to phase_4.
Commits: 4caadef (run), 79e0d47 (README analysis fix iter1), 458fcc8 (README scope fix iter2).
Phase 3 fully done: committed run runs/tutorial-2026-10-11/ (100 Q, digest 37eb58400fdf4ea9,
400 answers, unpriced, audit-clean, secret-free, 0 invisible chars, 195 tests). configs/models.yaml
exists locally but is GITIGNORED — do NOT commit it.

### PHASE 4 WORK (TUTORIAL rework + viewer verification) — carry-forwards for a cold reader:
1. Rework repo-root TUTORIAL.md around the 3 sources (KJV en / Qur'an ar / Talmud he) + the
   web-search on/off contrast. Track B commands must match Phase-3 canonical block VERBATIM:
   per-task 100, seed 20261011, the 3 standardized corpora paths, configs/models.example.yaml.
   Keep Track A (explore committed run, no keys) + Track C (view). Remove any manual
   copyright-clearance step from TUTORIAL → replace with one-line fair-use note.
2. ⭐ FIX plan `codev/plans/8-spec-3-tutorial-centered-on-kj.md:~39` — a stray "canonical
   committed run params" still says `--per-task 30`; the committed run + Phase-3 canonical block
   (line ~223) are `--per-task 100`. Phase 4 MUST reproduce 100 to match digest 37eb58400fdf4ea9.
   (claude iter3 non-blocking flag.) Grep the plan for "per-task 30" and fix.
3. Verify merged viewer (apps/viewer/) renders runs/tutorial-2026-10-11 with ZERO source changes:
   run selector lists it + first-run; leaderboard ranks 4 entries (per-task+per-tradition, tokens);
   explorer drills each; standings = 4 distinct rows (search-on/off not collapsed, no first-run
   collision). Confirm realRun.test.ts (first-run gate) + #86 CSS probe still green. Decide if a
   new viewer test is added (spec allows; no behavioural source change). Viewer dedupe key =
   aggregate.ts:59 `${provider}\u0000${model}`.
4. Update arch/lessons docs (codev/resources/arch.md + lessons-learned.md, or the -critical hot
   tiers if warranted): non-Latin normalisation (Phase 1), web-search tools config/identity
   (Phase 2), generated_at (#7 pipeline half), and the ⭐ REVIEW-DOC item below.
5. Cosmetic (optional, non-blocking, claude iter3): README.md ~lines 98-99 mid-sentence line
   break; summary.md panel table omits api_model (present in summary.json — it's generated, fine).

⭐ REVIEW-DOC CARRY-FORWARD (claude iter2 req — put in codev/reviews/8-*.md at ASPIR review phase):
web-retrieved encoding-variance gap — a search-on model can return the correct āyah in a different
Uthmani Unicode encoding (U+06E1 vs U+0652, Arabic Extended-A tanwin U+08F0-08F2, U+0657,
yeh/alef-maksura) that normalize() does NOT fold to exact equality (token_f1 up to 0.95,
correct=0). Future refinement: fold these OR add a pipeline-level contains_reference submetric.
NOT done in Spec 8 (req 4: would reshape scores.jsonl + break byte-for-byte re-score regressions).

## Phase 4 DONE — TUTORIAL rework + viewer verification + docs (implement iter 1)
Re-entered after context refresh (porch next 8 → phase_4 implement). All FREE (no spend). Work:
1. ✅ Plan fix: `codev/plans/8-*.md:39` stray "canonical committed run params --per-task 30" → 100
   (matches committed run + line ~223). Phase-4 repro must match digest 37eb58400fdf4ea9.
2. ✅ TUTORIAL.md fully reworked around KJV(en)/Qur'an(ar)/Talmud-Aramaic(he) + 2×2 web-search
   on/off panel + parametric-vs-retrieval framing. Track A now explores runs/tutorial-2026-10-11/
   (re-score-to-/tmp reproduces); Track B commands match Phase-3 canonical VERBATIM (3 specific
   target-slug dirs, --per-task 100 --seed 20261011, configs/models.example.yaml); Track C notes
   4 distinct standings rows. Fair-use note (no clearance step). Kept Track A/B/C + copy-paste det.
   VERIFIED E2E: ran the Track-B generate cmd to scratch → digest 37eb58400fdf4ea9 MATCH, n=100.
3. ✅ Viewer verified ZERO source change: added test-only apps/viewer/src/local/tutorialRun.test.ts
   (loadRun → 4 marked panel entries / 400 cells / usage 400; aggregate → 4 distinct standings keys
   + first-run claude-haiku key distinct & still present, 8 rows total). pnpm test green 123/123
   incl. realRun.test.ts + #86 deploy.test.ts probe. Manual dev server (port 5219): /runs/_index
   lists BOTH runs (tutorial newest → default leaderboard), tutorial summary serves 4 marked models.
4. ✅ Docs via update-arch-docs (diff-mode): arch.md (score.py non-Latin normalize + generated_at
   + tools-marked panel/api_model; config.py tools fail-fast; providers.py web_search tool + loud
   stop_reason; collect.py tools in fingerprint; viewer standings tools-identity zero-change;
   run-evidence tutorial negation). arch-critical.md +1 fact (tool-use=panel identity) + non-Latin
   clause on scoring fact (now 10 facts, within cap). lessons-learned.md (cold): non-Latin fairness,
   wrapper-penalty/contains-exact cut, encoding-variance deferral, web_search identity+unpriced.
   lessons-critical.md UNCHANGED (at cap; new items are cold reference — respected displacement).
5. ✅ Cosmetic: fixed run README mid-sentence line break (claude iter3 flag). summary.md api_model
   omission left as-is (it's a generated table; api_model IS in summary.json — non-blocking, fine).
Committed 26a0dc7 [Spec 8][Phase 4]. porch done 8 → checks green → BUILD COMPLETE → porch next 8
returned the 2-way consult task (codex+claude; gemini excluded per config — can't see worktree).

### Phase 4 review iter1: codex REQUEST_CHANGES/HIGH; claude APPROVE/HIGH — all addressed
codex (2 issues): (1) tutorialRun.test.ts only hit loadRun()/aggregate(), not leaderboard/explorer
UI → EXTENDED the test (+2 it blocks, test-only): leaderboardRows ranks 4 entries (opus,opus-search,
haiku,haiku-search; 66/66/47/40, non-increasing; tokens.calls=100 each) + traditionRows 3 traditions;
explorer modelQuestions(haiku-search)=100, questionStats correct=40/missing=0, tradition filter
Sunni Islam=33. (2) fair-use copyright policy absent from docs → ADDED to cold lessons-learned
Evidence & copyright (answers committed as collected, no manual clearance, audit stays the gate).
claude (APPROVE, 3 non-blocking): (1) Track B had no cost magnitude → added ~4.24M in/249K out/226
search req + --per-task 5 cheap-trial note w/ digest-changes caveat. (2) "most-recent run = tutorial"
is mtime-dependent (tie→first-run by id-asc) → hedged Track A + Track C to point at run selector.
(3) lessons-critical unchanged noted as deliberate (agreed) — no action. Full gate GREEN after fixes:
viewer 125/125 (realRun + #86 still green), pipelines 195/195.
### Phase 4 review iter2: codex APPROVE/HIGH + claude APPROVE/HIGH — PHASE APPROVED
Both verified vs real artifacts (claude recomputed contains-exact + ran Track-A/B repro + confirmed
only apps/viewer change is the test file; codex: none). Applied 2 optional non-blocking polish items
claude suggested (pure docs): (1) replaced the mtime "typically" hedge in TUTORIAL Track A/C with a
deterministic `/?run=tutorial-2026-10-11` deep-link; (3) run README "falls to 12" → "12 of 33"
(count-vs-percent clarity). Skipped #2 (skipIf-vacuous — consistent w/ realRun, run is negated/present).
Gate still green 125/125 + 195/195. Committed as the phase_4 polish.
NEXT: porch next 8 → both APPROVE so porch advances phase_4 (final plan phase) → open ONE PR (all
phases = commits on builder/aspir-8), porch done 8 --pr <N> --branch builder/aspir-8, afx send
architect "PR ready", architect approval gate → porch approve, merge, porch done 8 --merged <N>,
verify phase. REVIEW-DOC carry-forward (encoding-variance) goes in codev/reviews/8-*.md at review phase.

## Phase: REVIEW (re-entered after context refresh, 2026-10-11)
All 4 plan phases APPROVED; porch in review iter 1. Verified gate GREEN at review entry
(pipelines 195/195 + viewer vitest passed; audit clean). Git clean except untracked
.builder-* + phase_4 consult artifacts.
- ✅ Wrote `codev/reviews/8-spec-3-tutorial-centered-on-kj.md` (template order): 18 ACs all met;
  deviations (per-task 30→100, clearance dropped=fair-use, invisible-char revert+moot,
  generated_at included); Consultation Feedback per phase/round (codex+claude; gemini excluded
  per config); lessons; arch/lessons routing recap (hot=tool-use identity + normalize clause,
  cold=the rest; lessons-critical at cap=unchanged); no flaky; follow-ups = ⭐ encoding-variance
  gap + wrapper-vs-retrieval contains-exact + non-anthropic stop_reason guard + invisible-char scan.
- NEXT: commit review + thread + phase_4 consult artifacts → open ONE PR (Closes #8) →
  porch done 8 --pr <N> --branch builder/aspir-8 → afx send architect "PR ready" →
  <signal>REVIEW_COMPLETE</signal> + <signal>PR_READY</signal> (porch runs 3-way consult) →
  wait for human `pr` gate approval (NEVER auto-approve) → porch approve → merge →
  porch done 8 --merged <N> → verify phase.

### Review consult (PR #9) — BOTH APPROVE/HIGH → porch at `pr` gate (pending human approval)
- codex APPROVE/HIGH (no issues). claude APPROVE/HIGH — independently recomputed EVERY run-README
  number from answers/scores.jsonl, all exact match; branch MERGEABLE/CLEAN. Non-blocking notes
  (none require re-opening): pause_turn-fatal (real fix = continuation loop; 0 seen), both-marked
  standings key moves pre-Spec-8 re-score (= the AC7 non-collision property, intended), AC10 gen-side
  digest skips in fresh clone (strong re-score guard still unconditional), no repo CI (counts
  builder-reported), 2 cosmetics (stale score.py comment, brittle "cost" test assert).
- Recorded the PR round in review Consultation Feedback + added pause_turn-loop + cosmetics to
  Follow-up Items (doc-only; did NOT re-open the approved/gated branch). Committed + pushed.
- 🚦 STOPPED at `pr` gate. porch status=gate_pending, gate=pr. NEVER auto-approve. Waiting for
  explicit architect approval → then `porch approve 8 pr` (builder runs it) → merge → porch done
  8 --merged 9 → verify phase. Notified architect.

### PR / completion
Phases = commits in ONE PR. After Phase 4: open PR, `porch done 8 --pr <N> --branch builder/aspir-8`,
then architect approval gate → `porch approve`, merge, `porch done 8 --merged <N>`, verify phase.
Smoke scratchpad files live in session scratchpad (NOT committed). Attribution: per global CLAUDE.md
NO Co-Authored-By on commits; PR body gets the 🤖 Generated-with line per session reminder.
⚠️ Phase 3 = paid Anthropic web-search run. Order: convert → generate (seed 20261011, per-task 30,
3 corpora) → audit → SMOKE (few cells, check pause_turn gate #1) → full collect → score (unpriced)
→ copyright-clearance (review ALL search-on answers; strip web bidi/joiner/BOM chars if present) →
audit → commit run + README (CC-BY-NC attribution, web_search_20250305 + max_uses 5). If no
ANTHROPIC_API_KEY/budget → escalate to architect, do NOT fabricate.
