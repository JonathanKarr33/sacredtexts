
---

# aspir-2 thread — Spec 2: viewer leaderboard + error explorer

## 2026-10-11 — SPECIFY phase start

Strict-mode ASPIR builder for Spec 2. Porch handed me the specify task; no spec file
existed yet, so I'm drafting from the issue (whose numbered "Requirements (from the
human)" I treat as fixed constraints — no literal "Baked Decisions" heading but same
force).

Context gathered:
- Viewer is a near-verbatim multibrowser port. Routes to purge: `/t/*`, `/results`,
  `/results/$runId/...`, `/raw/$runId`, `/review*`. One adapted page: `/local-results`
  (localResults.ts + LocalResults.tsx + LocalResultsPage.tsx + src/local/sample.ts).
- Real run format confirmed from runs/first-run-2026-10-11/summary.json:
  models{model:{task:Cell,_overall}}, by_tradition{model:{trad:{task:Cell,_overall}}},
  usage{per_model,total}, panel{model:{provider,model,endpoint,served_by}}.
  scores.jsonl carries per-metric exact/normalized/token_f1/correct (currently
  localResults.ts only keeps `correct`). answers.jsonl carries prompt/expected.text/
  answer/source.tradition.
- Run discovery gap: vite serveRuns middleware serves individual files, NO index. Home
  leaderboard "lists every run under runs/" needs an enumeration mechanism — key design
  decision (dev directory-listing endpoint recommended).
- Gate test to keep green: src/local/realRun.test.ts (renders committed first run via
  loadRun). deploy.test.ts + app.test.tsx assert GitHub-data-layer / removed routes →
  must be reworked or removed.
- runs/ gitignored except !runs/first-run-2026-10-11/ (committed evidence).

Drafting spec next.

## 2026-10-11 — SPECIFY iter1 consult + revision

2-way consult (codex + claude, gemini excluded per lessons): BOTH REQUEST_CHANGES,
HIGH confidence, strongly convergent. Claude verified every factual claim against the
worktree. Folded all into one revision:
- Added requirement 6 (cross-run aggregate "current standings"), keyed on
  panel.provider+panel.model per architect clarification — both consults flagged it was
  silently dropped. Now in Constraints (verbatim), Success Criteria, Desired State,
  Approaches (data shape: load ALL runs' summaries), Test Scenarios. Fixed the
  References "copied verbatim" claim.
- Missing-cell: named questions.jsonl (the roster, ships with every run) as 4th
  artifact; joinResults must iterate roster not scores. Both consults: not derivable
  from the 3 named artifacts alone (score.py only emits rows for answered questions).
- Per-task metrics softened: retrieve_quote/complete_unit → all three;
  identify_version → exact+normalized; others → none; _overall → none (verified
  _SUBMETRICS in score.py). "n/a" where not emitted.
- Purge wording fixed: concrete patterns (/traditions/ imports, JLS-\d{3}, BZ-\d{3},
  al-jalīs) not "no tradition identifiers" (sample.ts legitimately carries tradition
  NAMES from run data).
- Settled the Critical/Important open questions into decisions (ASPIR autonomous):
  run discovery = dev dir-listing (hardened: realpath+symlink-reject+safe-decode);
  ordering = mtime+id; deploy = static SPA host, rework deploy.test.ts but KEEP the #86
  CSS probe + SPA-fallback smoke.
- Added dep-pruning criterion (js-yaml, zod, TanStack Query persisters, maybe hono) and
  doc-staleness (TUTORIAL.md, arch.md) to doc criterion.

Open Questions now only nice-to-know. Committing revised draft, then re-signal for the
consult re-check.

## 2026-10-11 — PLAN phase draft

Specify phase complete (porch advanced to plan). Wrote the implementation plan: 5 phases,
order seam → purge → three views:
1. Run-data seam + hardened run-index endpoint (lib + dev middleware + roster + missing
   fixture; no page changes; gate stays green).
2. Purge multibrowser to a clean shell (delete all legacy routes/pages/components/libs/
   GitHub layer/test scaffolding; minimal router with interim local-results home; rework
   deploy.test.ts + app.test.tsx KEEPING the #86 CSS probe + SPA smoke; prune deps).
3. Leaderboard home + run selector (replaces interim home; gate reworked onto leaderboard).
4. Error explorer (roster-based missing cells, composing filters, per-metric side-by-side).
5. Cross-run aggregate / current standings (all-runs load, provider+model dedupe, links).

Rationale: purge-first localizes the risky mass-deletion + deploy/app-test rework into one
atomic reviewable commit; feature phases then build additively on a clean green base.
Interim Phase-2 home reuses the existing local-results view so `/` is never broken.

Committing initial plan draft, then signal PLAN_DRAFTED for the 2-way consult.

## 2026-10-11 — PLAN iter1 consult + revision

2-way plan consult (codex + claude): BOTH REQUEST_CHANGES HIGH, no design disagreement —
approach/ordering/spec-coverage confirmed sound. Claude verified against the tree and
caught real build-breakers. Folded all into one revision:
- Phase 2 MUST edit src/main.tsx (rewrite, drops PersistQueryClient/queryClient/
  RAW_PERSIST_EXCLUDED) + src/test/renderApp.tsx (strip QueryClientProvider) — build
  breaks otherwise; blocks react-query prune. (claude)
- Phase 1: extracted run endpoint to src/lib/runsEndpoint.ts (factory + listRuns) so
  confinement is testable; Connect strips /runs prefix (collection at / or /_index);
  nonexistent runs/ → [] (guard realpathSync). (both)
- Phase 1: production loadRun REQUIRES all four artifacts; typed failure result
  (missing/HTTP/malformed-line); optional roster only in low-level join for the sample.
  (codex)
- Phase 1/2: prod static host returns 200 HTML for /runs/* (serveRuns dev-only) → added
  content-type/JSON-shape guard so loadRun treats non-JSON 200 as absent → empty state,
  not crash; prod smoke asserts it. (claude)
- Phase 2: #86 probe would go RED after purge (probed shades only in deleted files under
  @theme inline) → add @source inline(...) safelist in styles.css + pin probe to
  safelisted shades. (claude)
- Phase 2: static-host decided concretely — keep hono, rewrite server/index.mjs (drop
  /api proxy), delete bake-and-deploy.sh; cleanup adds @types/js-yaml + pnpm-lock. (codex)
- Phase 3: run-selection URL contract /?run=<encoded-id> (plain validator, not zod);
  selector syncs; explorer back-link + standings links use it; stale-request guard +
  rapid-switch test. (codex)
- Minors: served_by string[]|null; InterimHome default-loads most-recent (not sample);
  zod stays pruned (explorer uses plain validator); name LocalResults.test.tsx in P3
  deletions; noted P2 may split into 2a/2b internal commits.

Phases JSON unchanged (5). Committing revised plan + rebuttal, then signal for re-check.

## 2026-10-11 — PLAN iter2 consult + revision

2-way re-consult: BOTH REQUEST_CHANGES HIGH, convergent, confirmed iter-1 blockers fixed
and approach sound. New gaps were all the same class (contract change → unlisted
consumer). Folded all in (no disputes):
- loadRun typed-result breaks LocalResultsPage.tsx:35-41 + LocalResults.test.tsx:57 →
  Phase 1 now lists LocalResultsPage as a minimal adapter edit + reworks the 404 test
  case; acceptance reworded to "no NEW routes/nav". (codex+claude)
- content-type guard would throw on bare fake fetchers (no headers) + .jsonl is
  text/plain → switched to shape-sniffing primary (leading '<' / parse-fail = absent).
  (claude)
- "built+served app shows empty state" not executable (jsdom-only, no browser) → split
  into (a) deploy server-response check + (b) jsdom render-with-HTML-200 test. (claude)
- Markdown/Loading post-purge: delete Markdown + prune react-markdown/remark-gfm/
  remark-breaks/rehype-sanitize/@tailwindcss/typography; keep Loading (reused). (claude)
- ?run= changes from base-path to bare id → Phase 3 states id→/runs/${id} mapping +
  old-value fallback-to-default + doc update. (claude)
- runsEndpoint.ts relocated out of src/ → apps/viewer/vite/runsEndpoint.ts. (claude)
- Phase 5 doc sweep also corrects arch-critical.md's stale "multibrowser seed" bullet.
  (codex minor)
- Correction adopted: #86 probe "would go red" overstated — it self-seeds from
  deploy.test.ts string literals today (fragile, not red); safelist = deterministic fix;
  tradeoff noted. Risk reclassified Medium/High. (claude FYI)

Phases JSON unchanged (5). Committing revised plan + iter2 rebuttal, re-signalling.

## 2026-10-11 — IMPLEMENT phase_1 done (run-data seam + run-index endpoint)

Implemented the data foundation, no page redesign yet:
- localResults.ts: QuestionResult now carries exact/normalized/token_f1 (number|null) +
  missing:boolean; Summary carries usage + panel (served_by string[]|null). joinResults
  takes optional {roster,models}: iterates panel×roster, marks un-answered (model,q) as
  missing; scores-only fallback kept for the in-memory sample. loadRun now REQUIRES all
  four artifacts (summary/scores/answers/questions), returns a typed LoadResult
  {ok:true,...} | {ok:false, kind: missing|http|malformed, message}; shape-sniff guard
  (leading '<' or parse-fail = "missing") so a prod HTML-200 never crashes.
- Extracted the run endpoint to apps/viewer/vite/runsEndpoint.ts (outside src/):
  listRuns(dir) [{id,mtimeMs}] newest-first, resolveRunFile (realpath + symlink reject),
  createRunsHandler (Connect: prefix stripped → collection at / or /_index; malformed
  decode → 400). vite.config.ts imports it. tsconfig include += "vite".
- LocalResultsPage.tsx adapted to the typed loader (success→render, failure→localized
  error; no-?run= sample path unchanged).
- sample.ts: added sampleQuestionsJsonl (roster) + sampleQuestionsWithMissingJsonl
  (missing>0 fixture).
- Tests: reworked LocalResults.test.tsx (typed loadRun, roster/missing join, shape-sniff,
  malformed); extended realRun.test.ts (400 cells, missing:0, metrics, usage.total.calls
  == 400, panel claude-haiku provider == anthropic); new vite/runsEndpoint.test.ts
  (listing, nonexistent-root → [], traversal/symlink confinement, 400 decode).

Verified: check-types clean; full viewer suite 423 passed / 9 skipped (pre-existing
skips); realRun gate ran (not skipped); runsEndpoint 8/8. Multibrowser tests still green
(removed in phase_2).

## 2026-10-11 — IMPLEMENT phase_1 consult (codex REQUEST_CHANGES / claude APPROVE) + fixes

Per-phase impl consult. claude APPROVE (nits), codex REQUEST_CHANGES (3 real items).
Applied all legitimate fixes (no disputes):
- runsEndpoint resolveRunFile: now rejects ANY symlink component (per-component lstat) +
  `..`, containment as backstop; listRuns skips symlink entries + accessSync(R_OK)
  readability; handler readFileSync wrapped → 500 on read error. (codex 1,2; claude 3)
- loadRun: localized malformed summary.json message (`${base}/summary.json: ...`);
  JSONL already localized. (codex 3; claude 2)
- Tests added: HTTP 500→http; malformed JSONL→malformed w/ scores.jsonl:2 context;
  verify_source metrics→null; realRun served_by null (claude-haiku) + array (gpt-oss);
  in-root symlink rejection (inlink→run-a). (codex 3)
- LocalResultsPage stale comment fixed. (claude 1)
- joinResults roster branch: comment documenting authoritative-roster invariant (non-
  roster answers intentionally dropped; stale roster = count gap vs summary n). (claude 4)
- NOTE for phase_3: parseSummary normalizes absent by_tradition → {}, so the leaderboard
  must omit the by-tradition section on EMPTINESS, not truthiness. (claude 5)

Verified: check-types clean; full suite 427 passed / 9 skipped. Committing fixes, re-signal.

## 2026-10-11 — IMPLEMENT phase_1 iter2 consult (codex RC / claude APPROVE) + fixes

- codex RC: listRuns followed a symlinked summary.json (statSync/accessSync follow
  links). Fixed: lstat summary.json first, skip if symlink/non-file. Added symsummary
  fixture + listing assertion.
- claude APPROVE + 2 non-blocking folded in: (1) fetchArtifact await res.text() moved
  inside try/catch → body-read rejection returns kind:"http" (total LoadResult);
  (2) added grep guard test "no src/ imports runsEndpoint" (client/node boundary).
- Carry-forwards (not phase_1): document in-root-symlink-run omission in P2/3 README;
  resolveRunFile containment is intentional unreachable backstop; parseSummary
  by_tradition→{} → P3 omit on emptiness.
Verified: check-types clean; endpoint suite 10 tests; LocalResults 11; gate 1 — green.

## 2026-10-11 — phase_1 APPROVED (codex+claude iter3), entering phase_2 (PURGE)

phase_1 committed by porch. Both reviewers APPROVE on iter3. Context-refresh boundary at
plan-phase:phase_2 — refreshing now.

### State for a fresh context
- Protocol: ASPIR strict, project 2. `porch next 2` drives. Plan: codev/plans/2-*.md
  (5 phases, seam→purge→views). Spec: codev/specs/2-*.md.
- DONE: phase_1 (run-data seam + run-index endpoint). Key files:
  src/lib/localResults.ts (typed LoadResult, metrics/usage/panel/roster, shape-sniff),
  vite/runsEndpoint.ts (+ test; listRuns/resolveRunFile/createRunsHandler, no-symlink),
  src/local/sample.ts (sampleQuestionsJsonl + sampleQuestionsWithMissingJsonl).
- NEXT: phase_2 = purge multibrowser to a clean shell. Plan has the exact delete/modify
  list. Critical reminders from reviews:
  * MUST edit src/main.tsx (rewrite → StrictMode>ErrorBoundary>RouterProvider; drops
    PersistQueryClient/queryClient/RAW_PERSIST_EXCLUDED) + src/test/renderApp.tsx (strip
    QueryClientProvider) or build breaks + react-query prune blocked.
  * Add InterimHome.tsx that default-loads most-recent run via the Phase-1 /runs/_index
    endpoint (NOT the sample) so `/` shows real content; LocalResultsPage shows sample
    only on no-?run=.
  * #86 CSS probe: add @source inline(...) safelist in styles.css covering the shim ramp
    + pin probe to safelisted shades (probe self-seeds today from deploy.test.ts literals
    — fragile). noInvisibleText.test.ts stays.
  * deploy.test.ts: drop tradition-baking/raw-tier/api-proxy/`/t/` smoke; keep SPA
    fallback + #86 probe; add static-host returns index.html/200 for /runs/_index; split
    empty-state into (a) server-response check + (b) jsdom render-with-HTML-200 test.
  * Delete Markdown + prune react-markdown/remark-gfm/remark-breaks/rehype-sanitize/
    @tailwindcss/typography (no new view renders markdown); keep Loading. Prune js-yaml/
    @types/js-yaml/zod/@tanstack/react-query(+2 persisters). Keep hono (rewrite
    server/index.mjs static+SPA-fallback, drop /api proxy; delete bake-and-deploy.sh).
    Regenerate pnpm-lock.yaml.
  * README note: in-root symlinked run dirs are intentionally omitted from the index.
  * zod stays pruned — explorer (phase_4) uses a plain validateSearch fn.
- Dev env: node_modules installed in worktree (pnpm install done). Tests: pnpm -C
  apps/viewer test / check-types; porch check runs .codev/checks/test.sh (diffs vs
  origin/main — commit before it detects changes).

## 2026-10-11 — IMPLEMENT phase_2 done (purge to a clean local-only shell)

Committed the purge (93cee00). The viewer is now a clean, green, local-only shell.

What landed:
- Deleted ~75 multibrowser files: all /t, /results, /raw, /review* routes+tests, the
  GitHub data layer + domain libs (github/queries/queryClient/constants/rateLimit/corpus/
  identity/model/parse/filtering/leaderboard/results*/raw*/review*/scoreColor/rampColor/
  searchParams), the components (Tradition*/Scenario*/Review*/RateLimitBanner/RawComparison/
  RawPresets/CorpusContext/TaxonomyAxes/FilterBar/Collapsible/Notice/Markdown), test
  scaffolding (fakeRepo/rawFixture), and scripts/bake-and-deploy.sh.
- KEPT primitives: ErrorBoundary, Loading (InterimHome uses CenteredSpinner), LocalResults
  (+ test), localResults.ts, sample.ts, realRun.test.ts (gate — ran, not skipped), setup.ts,
  noInvisibleText.test.ts.
- Rewrote main.tsx (StrictMode>ErrorBoundary>RouterProvider), router.tsx (/ + 404 only),
  renderApp.tsx (no QueryClient), RootLayout (Sacred Texts brand, no nav/GitHub link),
  NotFound copy.
- NEW InterimHome.tsx: GET /runs/_index → most-recent id → loadRun(/runs/<id>) → LocalResults;
  empty state when no runs; shape-sniffs 200-HTML index (prod static host) → empty, no crash.
  Takes an injectable fetcher for the jsdom tests.
- styles.css: @source inline("{text,bg,border}-{default,warning,danger,success}-{50..900}")
  pins the #86 ramp (Tailwind 4.3.1). Verified built CSS emits the shim color-mix (it wins
  the cascade over HeroUI's plain var(--hue) rule). Dropped @tailwindcss/typography plugin.
- server/index.mjs: minimal hono static + SPA fallback; no /api proxy. railway.json needed
  no change (bake lived only in the deleted bake-and-deploy.sh). .railwayignore/.gitignore
  dropped public/data-raw; .gitignore also now ignores *.tsbuildinfo.
- deploy.test.ts/app.test.tsx reworked (see commit body). Two gotchas hit + fixed: the
  `/api/*` and `runsEndpoint` strings in my COMMENTS tripped the proxy-gone assertion and
  the "no src/ imports the node endpoint" guard — reworded to match code, not prose.

### Deviations from the plan (flag for the phase_2 consult)
1. Deleted LocalResultsPage.tsx (not in the plan's explicit delete list). Its only consumer
   was the removed /local-results route; InterimHome replaces its role with most-recent-run
   default behavior. Leaving it would be dead code — chose "gone, not merely hidden".
2. Also pruned tailwind-merge + lucide-react (beyond the plan's explicit prune list). Both
   are now unused in kept code (grep-clean); spec says prune deps used only by removed
   surface. Kept @testing-library/user-event (test tooling the explorer/selector phases need).

Verified: check-types clean; `pnpm build` green (CSS 419KB from the safelist — expected);
full suite 44 passed / 0 skipped (the 9 prior skips were in deleted multibrowser suites);
gate realRun.test.ts ran. Manual: `pnpm dev` → GET /runs/_index returns
[{id:first-run-2026-10-11}], summary.json served, / serves the SPA shell — the InterimHome
seam works end-to-end.

Next: run .codev/checks/test.sh, then `porch done 2` for the 3-way impl consult.

## 2026-10-11 — IMPLEMENT phase_2 consult (codex APPROVE / claude APPROVE, both HIGH)

Both APPROVE HIGH. codex: no issues. claude: verified the risky claims against the real
built CSS/JS (the #86 safelist ramp all maps to color-mix and wins the cascade; bundle
purity holds; tailwind-merge removal safe — it still resolves as a HeroUI peer at 3.4.0;
both deviations sound). 5 non-blocking findings.

Folded in now (cheap + in phase_2 scope):
- deploy smoke was vacuous (both HTTP assertions satisfied by the index.html fallback) →
  added an assertion that the hashed dist/assets/*.js is served as a real file with a JS
  content-type, so a serveStatic regression can't ship silently.
- stale multibrowser strings in kept code: vite.config.ts deep-link comment → generic
  route; ErrorBoundary console.error label "multibrowser" → "viewer" (that literal shipped
  in the bundle).

Carry-forwards (NOT phase_2):
- phase_3: InterimHome.fetchRunIndex collapses every index failure (500/malformed/network)
  into "No runs yet" — the spec's selector needs "empty" vs "index fetch failed"
  distinguished (localized error, selector still usable).
- phase_3: loadRun(`/runs/${id}`) doesn't encodeURIComponent the id — phase 3's ?run=
  contract adds it.
- phase_5 doc/dep sweep: confirm @testing-library/user-event is used by then (kept now for
  the explorer/selector phases) or prune it.

Re-verified after the folded nits: check-types clean; full suite 44 passed / 0 skipped.
Both consult outputs committed under codev/projects/2-spec-2-replace-multibrowser-le/.

## 2026-10-11 — IMPLEMENT phase_3 start (leaderboard home + run selector)

Re-entered after a context refresh at plan-phase:phase_3. Confirmed data model against
runs/first-run-2026-10-11/summary.json: 4 models (claude-haiku 0.24, llama-3.1-8b 0.01,
gemma-3-4b 0.0, gpt-oss-20b 0.0 — id tiebreak gemma<gpt), by_tradition = model→trad→task→Cell
(4 traditions incl. "The Church of Jesus Christ of Latter-Day Saints" = LDS; claude-haiku/LDS
= 0.72), usage.per_model{calls,in,out}, panel{provider,model,endpoint,served_by}.

Design decisions for phase_3:
- `?run=<id>` via a PLAIN validateSearch fn on the index route (zod is pruned); page resolves
  id→loadRun(`/runs/${encodeURIComponent(id)}`) (closes the phase_2 carry-forward re: encodeURIComponent).
  Old-style `?run=/runs/<id>` won't match a known id → falls back to default (most-recent).
- fetchRunIndex now DISTINGUISHES empty (ok,[]) vs index-fetch-failed (error) — the phase_2
  carry-forward. HTML-200 (prod static host, no /runs endpoint) → treated as empty, not crash.
- by-tradition section omitted on EMPTINESS (parseSummary normalizes absent→{}) — phase_1 carry-forward.
- LeaderboardPage (container, router hooks: useSearch/useNavigate from="/") owns index-fetch +
  per-run loadRun with a `live` stale guard keyed on selectedId; RunSelector + LeaderboardTable
  are presentational (directly unit-testable). leaderboard.ts = pure ranking/column/token derivation
  (reuses rankedModels/summaryTasks/formatCell).
- Deletions: InterimHome.tsx, components/LocalResults.tsx + its test. RELOCATING the surviving
  `localResults lib` describe block (loadRun/join/failure-types/missing — NOT component tests) to
  src/lib/localResults.test.ts so that coverage survives. Keeping realRun.test.ts (loader gate).

## 2026-10-11 — IMPLEMENT phase_3 done (leaderboard home + run selector)

Replaced the interim home with the benchmark leaderboard. What landed:
- lib/leaderboard.ts: pure leaderboardRows (ranked via rankedModels: overall desc, id
  tiebreak, null-overall last) + per-model token totals from usage.per_model; traditionRows
  + hasTraditionData (omit the by-tradition section on EMPTINESS — phase_1 carry-forward);
  formatTokens. + leaderboard.test.ts.
- components/LeaderboardTable.tsx: presentational — ranked model×task+overall+tokens table
  and the by-tradition breakdown. + LeaderboardTable.test.tsx.
- components/RunSelector.tsx: native <select> (provider-less), onSelect; a load error shows
  but the selector stays enabled + lists every run. + RunSelector.test.tsx.
- routes/LeaderboardPage.tsx: container (useSearch/useNavigate from="/"). (1) run index fetch
  once, DISTINGUISHING empty vs index-fetch-failed vs HTML-200 (prod static host → empty)
  — closes the phase_2 carry-forward. (2) per-run loadRun(`/runs/${encodeURIComponent(id)}`)
  with a `live` stale guard keyed on selectedId — closes the encodeURIComponent carry-forward.
  `?run=` = bare id; unknown/old base-path value falls back to most-recent default.
- router.tsx: `/` → LeaderboardPage with a PLAIN validateSearch fn ({run?:string}); zod stays pruned.
- Deleted InterimHome.tsx, components/LocalResults.tsx + LocalResults.test.tsx. RELOCATED the
  surviving `localResults lib` describe block (loadRun/join/failure-types/missing — NOT the
  component render test) to src/lib/localResults.test.ts so that coverage survives. Kept
  realRun.test.ts (loader gate). Reworked app.test.tsx (dropped InterimHome block; kept 404 /
  shell / ErrorBoundary). deploy.test.ts comment InterimHome→leaderboard.
- Docs: README.md, TUTORIAL.md, arch.md "Viewer local results" → leaderboard + `/?run=<id>` contract.

Gate reworked onto the leaderboard (LeaderboardPage.test.tsx, skipIf-guarded): the committed
runs/first-run-2026-10-11 renders with claude-haiku first, llama-3.1-8b 2nd, gemma/gpt last
(0.0, id tiebreak), retrieve_quote + overall columns, 4 traditions (LDS cell 72%), token
totals (5,810 in / 41,140 out / 100 calls). Plus: default=most-recent, ?run= honoured,
old-base-path fallback, empty/index-failed/bad-run states, selector switch, rapid-switch
stale guard.

VERIFIED: check-types clean; `pnpm build` green (CSS 419KB safelist, expected); full suite
61 passed / 0 skipped (was 44 — +17 for the new leaderboard/selector/relocated-lib coverage);
realRun gate + LeaderboardPage gate both ran. Manual: `pnpm dev` → /runs/_index returns the
committed run, summary.json served, / serves the SPA shell — the client data path is intact.

Carry-forwards into phase_4/5 (unchanged): phase_4 makes LeaderboardTable rows link into the
explorer; phase_5 doc/dep sweep (confirm/prune @testing-library/user-event — now USED by
RunSelector.test + LeaderboardPage.test, so it's load-bearing, keep it) + correct
arch-critical.md's stale "multibrowser seed" bullet.

Next: run .codev/checks/test.sh, then `porch done 2` for the 3-way impl consult.

## 2026-10-11 — IMPLEMENT phase_3 consult iter1 (codex RC / claude APPROVE) + fixes

2-way impl consult. claude APPROVE HIGH (verified suite/types/build itself; all plan items
landed; rapid-switch test non-vacuous). codex REQUEST_CHANGES HIGH on ONE item — which both
reviewers in fact flagged at the same spot (the null-overall cell), from opposite framings:
- codex (blocking): spec edge case says a null-overall model "formats as 'n/a'", but
  formatCell returned "—" for an {n:0, accuracy:null} cell (n===0 branch short-circuited).
- claude (non-blocking #2): same test over-claimed "n/a" while code yielded "—"; rename or assert.
Resolution: the spec is the source of truth and literally says "n/a" → fixed formatCell so a
present no-observation cell is "n/a" (missing count still wins as "miss N"; undefined still "—").
This satisfies codex AND makes claude's test assertion true. Updated localResults.test.ts
(+ {n:0,accuracy:null}→"n/a") and LeaderboardTable null-overall test (asserts "n/a" now).
Also folded claude's cheap in-scope #3: fixed the stale "pnpm dev → /local-results" comment in
sample.ts (now described as a test fixture).

Deferred (claude non-blocking, explicitly phase_5): widen RunRef with mtimeMs + sort defensively
(standings needs run dates anyway); formatInt export (used internally by formatTokens; harmless).

Verified: check-types clean; full suite 61 passed / 0 skipped. Committing fixes + both consult
outputs, re-signalling for the re-check.

## 2026-10-11 — IMPLEMENT phase_3 consult iter2 (codex RC / claude COMMENT) + fixes

2-way re-consult. Both converged on the SAME residual (codex RC HIGH blocking, claude COMMENT
HIGH non-blocking): the iter1 "n/a" fix only covered {n:0, accuracy:null} with NO missing
count, but score.py emits a fully-missing model's cells (incl. _overall) as
{n:0, accuracy:null, expected_n, missing:N} — which hit the `miss N` branch, so the overall
showed "miss N", not the spec-required "n/a". codex: overall-specific formatter → "n/a";
claude: a combined "n/a (miss N)" satisfies both spec + the informative count.

Resolution (the superset both accept): unified formatCell so a NULL-ACCURACY cell everywhere
reads "n/a", annotated with the missing count when present → "n/a (miss N)". Switched the guard
from `n===0` to `accuracy===null` (equivalent, but directly expresses the spec intent). This
applies to BOTH the overall and task/tradition columns (LeaderboardTable uses formatCell for
all), so no separate formatter was needed. Dropped the bare "miss N" display (strictly less
informative than "n/a (miss N)").

Tests: localResults.test.ts formatCell now asserts the real _overall shape
{n:0,accuracy:null,expected_n:100,missing:100} → "n/a (miss 100)" and {..missing:3} → "n/a (miss 3)";
added a LeaderboardTable test rendering a fully-missing model (real shape on task + _overall) →
both cells "n/a (miss 10)", ranked last, no bare "miss 10". Also folded claude's minor test-gap:
the bad-default-run test now selects the good run and asserts the leaderboard recovers.

Still deferred (both reviewers agree, phase_5): RunRef mtimeMs widening + defensive client sort.

Verified: check-types clean; `pnpm build` green; full suite 62 passed / 0 skipped (+1 for the
fully-missing-model test). Committing fixes + both iter2 consult outputs, writing the iter2
rebuttal, re-signalling.

## 2026-10-11 — phase_3 APPROVED (codex + claude iter3, both HIGH)

Both APPROVE HIGH, no blocking issues. codex: none. claude: verified 62 tests / types / the
committed-run gate green itself; confirmed InterimHome/LocalResultsPage/LocalResults all deleted
and the /?run=<id> contract consistent across README/TUTORIAL/arch.md. The iter1→iter2 null-accuracy
fix is now generalized to the real score.py cell shape with assertions on it.

Non-blocking carry-forwards (NOT phase_3 — noted for later):
- claude: the committed-run gate uses describe.skipIf(!present) (project convention, also in
  realRun.test.ts from phase_1); a `expect(present).toBe(true)` sentinel would make a vanished
  fixture loud instead of silently skipping. A MAINTAIN-style test-hardening, not a phase_3 fix.
- claude: formatCell's partial-missing "−N" (U+2212) annotation lacks a legend — cosmetic;
  phase_4's explorer is where missing cells get real surface area.
- both: RunRef carries only {id}; "most recent = runs[0]" rides listRuns' mtime-desc/id-asc sort.
  Widen RunRef with mtimeMs + defensive client sort in phase_5 (standings needs run dates anyway).

Letting porch commit phase_3 and advance to phase_4 (error explorer).

## 2026-10-11 — IMPLEMENT phase_4 done (error explorer with roster-based missing cells)

Re-entered after a context refresh at plan-phase:phase_4. Built the error explorer. What
landed:
- lib/explorer.ts (pure): failureMode (correct→null / missing / wrong), filterQuestions
  (task/tradition/correct/mode, AND-composed; tradition is membership — multi-tradition
  aware), modelQuestions, explorerTasks/explorerTraditions (sorted distinct options),
  questionStats {total,correct,wrong,missing}, formatMetric (number→String, null→"n/a").
  ExplorerFilters type = the URL search shape. + explorer.test.ts (classification, each
  filter, AND-composition incl. contradictory→empty, option derivation, stats, formatMetric,
  and the Phase-1 missing fixture: joinResults over sampleQuestionsWithMissingJsonl → ccc
  missing distinct from bbb wrong).
- components/QuestionList.tsx (presentational): per-question card — status badge
  (correct/missing/wrong via success/warning/danger safelisted shades), prompt/expected/
  answer; a missing cell shows "no answer produced (missing cell…)" and NO metric grid; an
  answered question shows exact/normalized/token-F1 side by side with null→"n/a". +
  QuestionList.test.tsx (answered detail+3 metrics; identify_version token_f1:null→"n/a";
  missing marker + no metric grid; empty-state).
- components/ExplorerFilters.tsx (presentational): native <select>s (provider-less) for
  task/tradition/result(correct|incorrect)/failure-mode(missing|wrong); "all" sentinel →
  undefined; calls onChange with the next full Filters.
- routes/ExplorerPage.tsx (container, from="/run/$runId/model/$modelId"): useParams +
  useSearch + useNavigate; loadRun(`/runs/${encodeURIComponent(runId)}`) with a `live`
  stale guard (same pattern as LeaderboardPage); modelQuestions→filterQuestions(search);
  header + stats line + a legend (closes the phase_3 cosmetic carry-forward: missing/−N
  annotations lacked a legend); back-link <Link to="/" search={{run:runId}}> = the Phase-3
  /?run=<id> contract; localized error on load failure.
- router.tsx: registered the explorer route with a PLAIN validateSearch fn (zod stays
  pruned) coercing task/tradition/correct/mode, unknown→undefined.
- components/LeaderboardTable.tsx: now takes runId; model-name cell → <Link> to the
  explorer (whole model), each task cell → <Link search={{task}}>, tradition-table task
  cells → <Link search={{task,tradition}}> (TanStack form-encodes query spaces as '+').
  LeaderboardPage passes runId={selectedId!}.
- LeaderboardTable.test.tsx reworked: LeaderboardTable now renders <Link> (needs router
  context) + requires runId → wrapped renders in a throwaway router (root renders the table,
  registers the explorer route path so Links resolve); tests are async (router resolves the
  initial route asynchronously — await "Leaderboard" before sync queries). Added link-target
  assertions (model → /run/<id>/model/<m>; task cell → ?task=…; tradition cell → ?task=&tradition=).
- ExplorerPage.test.tsx (integration via renderApp at the explorer path): missing fixture
  (fix run) → all 3 roster questions listed, ccc missing; ?mode=missing → only ccc (distinct
  from bbb wrong); ?mode=wrong → bbb + 3 metrics, not ccc; back-link href "/?run=fix";
  bad-run → localized alert. Committed-run drill-in gate (skipIf-guarded, sentinel
  expect(present).toBe(true)): claude-haiku 100 questions / 24 correct / 0 missing, "Showing
  100 of 100", 3 metric labels present; ?correct=correct → "Showing 24 of 100".

Deviations from the plan: none of substance. The plan listed the exact files; I added a
QuestionList.test.tsx (presentational unit coverage) beyond the two named test files, and
added the explorer legend to ExplorerPage (phase_3 cosmetic carry-forward lands naturally
here). Also folded the phase_3 non-blocking test-hardening (expect(present).toBe(true)
sentinel) into the new committed-run gate.

VERIFIED: check-types clean; `pnpm build` green (CSS 421KB safelist, expected); full suite
89 passed / 0 skipped (was 62 — +27 for explorer/questionlist/explorerpage/leaderboard-link
coverage); both committed-run gates (realRun loader + LeaderboardPage + the new ExplorerPage
drill-in) ran, not skipped.

Carry-forwards into phase_5 (unchanged): standings (/standings) keyed on panel
provider+model; widen RunRef with mtimeMs + defensive client sort; doc/dep sweep (README/
TUTORIAL/arch.md describe the finished app incl. the explorer; confirm @testing-library/
user-event still used — RunSelector/LeaderboardPage tests use it; correct arch-critical.md's
stale "multibrowser seed" bullet).

Next: run .codev/checks/test.sh, then `porch done 2` for the 3-way impl consult.

## 2026-10-11 — IMPLEMENT phase_4 consult iter1 (codex APPROVE / claude COMMENT, both HIGH)

2-way impl consult. codex APPROVE HIGH, no issues. claude COMMENT HIGH (non-blocking),
verified the suite + types + real scores.jsonl (metrics pre-rounded → formatMetric String()
fine) itself; all deliverables met. 4 non-blocking findings — folded in 1–4 while the
explorer is fresh (cheap + in scope, no disputes):
1. Filter UI untested (phase_3 set the userEvent.selectOptions precedent) → added an
   ExplorerPage interaction test: drive the failure-mode <select> → onChange → navigate →
   URL → re-filter narrows to the missing cell, and selecting "all" restores the full list
   (closes the spec's "clearing filters restores the full list" scenario).
2. Tradition round-trip asserted only as an href string, never parsed back → added a
   page-level test rendering `?tradition=Protestant+Christian` (a value with a space) and
   asserting it parses back (the leaderboard link's '+'↔space contract), plus a no-match →
   "Showing 0 of 3".
3. Unknown model id read as "empty run" → ExplorerPage now keeps the run's model list and
   shows a distinct "Model not in this run" alert (not the "No questions match" empty-filter
   phrasing). + a test.
4. Cosmetic: a hand-edited ?task=/?tradition= value absent from the derived options left the
   controlled <select> blank → ExplorerFilters now appends the active value as an option so
   the select never renders blank.

Verified: check-types clean; `pnpm build` green (CSS 421KB safelist); full suite 92 passed /
0 skipped (was 89 — +3 for the folded tests). Committing fixes + both consult outputs,
re-signalling.

## 2026-10-11 — IMPLEMENT phase_5 start (cross-run standings)

Re-entered fresh at plan-phase:phase_5 (final implement phase). Read state + plan §Phase 5 +
the full thread. Design settled before coding:
- `src/lib/aggregate.ts` (pure): `aggregate(runs:{runId,mtimeMs,summary}[])` → one row per
  model keyed on panel `(provider\u0000model)`, latest by mtime (runId desc tiebreak);
  panel-absent run falls back to bare `model_id` keying (graceful, documented limitation).
  Rows ranked like the leaderboard (overall acc desc, null last, modelId asc) so standings
  over ONE run == that run's leaderboard rows (acceptance criterion). `tasks` = sorted union.
- `loadSummary(base,fetcher)` added to localResults.ts — summary-only loader reusing the
  private `fetchArtifact` (same HTML-200 shape-sniff guard as loadRun); standings needs only
  the per-model/panel rollup, not the 4-artifact join.
- Extract the run-index fetch to `src/lib/runIndex.ts` (RunRef widened `{id, mtimeMs?}`;
  defensive client sort mtime-desc/id-asc — the reviewers' phase_3/4 carry-forward). Both
  LeaderboardPage and StandingsPage consume it (no copy-paste of the security-relevant
  HTML-sniff guard). RunSelector.tsx imports RunRef from the lib now (correct layering).
- StandingsPage.tsx: route `/standings`; fetch index → loadSummary every run → aggregate →
  table (one row per model, per-task + overall cells, provider/model identity, source run
  id + ISO date, link into `/?run=<id>`). Nav link in RootLayout + route in router.tsx.
- Doc sweep: README/TUTORIAL/arch.md "coming in remaining phases" → finished app; correct
  arch-critical.md's stale "multibrowser seed … not yet adapted" bullet IN PLACE; dep sweep.

## 2026-10-11 — IMPLEMENT phase_5 done (cross-run standings + final doc/dep sweep)

The final feature. What landed:
- lib/aggregate.ts (pure): `aggregate(RunSummary[])` → {tasks, rows}. One row per model keyed
  on panel `(provider\u0000model)`; most-recent wins (mtime desc, runId desc tiebreak);
  panel-absent run falls back to bare model_id keying (documented graceful degradation). Rows
  ranked EXACTLY like the leaderboard (overall acc desc, null last, modelId asc) so standings
  over one run == that run's leaderboard rows. tasks = sorted union across selected rows.
- lib/localResults.ts: added `loadSummary(base,fetcher)` (+ SummaryResult type) — summary-only
  loader reusing the private fetchArtifact (HTML-200 shape-sniff guard shared with loadRun);
  standings reads one artifact/run, not four.
- lib/runIndex.ts (NEW): extracted fetchRunIndex out of LeaderboardPage; RunRef widened to
  `{id, mtimeMs?}` and moved here (RunSelector imports it from here now). Defensive client sort
  mtime-desc/id-asc — the reviewers' phase_3/4 carry-forward (both pages rely on runs[0]=most
  recent; the HTML-sniff guard now lives in ONE place, not copy-pasted into standings).
  LeaderboardPage.tsx dropped its local fetchRunIndex copy → imports the shared one.
- routes/StandingsPage.tsx (NEW): route `/standings`; fetch index → loadSummary EVERY run in
  parallel (a run with a missing/malformed summary is skipped, not fatal) → aggregate → table
  (model + provider/model identity, per-task + overall cells, source run id + ISO date, both
  the model cell and the from-run cell link into `/?run=<id>`). loading/empty/failed states.
- router.tsx: registered the `/standings` route. RootLayout.tsx: added a "Standings" header nav
  link (plan asked for exactly this). Deliberately did NOT add a "Leaderboard" nav link — its
  text collides with the page's `<h1>Leaderboard</h1>` and broke two LeaderboardPage tests; the
  brand link ("Sacred Texts Benchmark" → `/`) is the leaderboard home affordance.
- Tests: lib/aggregate.test.ts (most-recent-per-key, older-only kept, renamed-id-same-panel
  dedupe→1 row, panel-absent fallback, leaderboard-identical ranking, task union, mtime-tie
  determinism); routes/StandingsPage.test.tsx (empty/index-failed states, two-run rollup with
  link targets, missing-summary skip, + committed-run gate with `expect(present).toBe(true)`
  sentinel: standings over the committed run == leaderboard order, panel identity shown, links
  back to /?run=first-run-2026-10-11); loadSummary unit tests folded into localResults.test.ts
  (ok / missing / HTML-200→missing / malformed-localized).
- Doc sweep: README.md + TUTORIAL.md rewritten (leaderboard + explorer + standings, no "coming
  in remaining phases"); arch.md top bullet + "Viewer local results" section updated (full route
  tree incl. standings/explorer, loadSummary, runIndex.ts); arch-critical.md's stale "seed port
  … not yet adapted" HOT bullet corrected IN PLACE (within the cap — edited the one bullet).
- Dep sweep: every runtime dep confirmed used (@heroui/react→Loading, @heroui/styles→styles.css,
  hono+@hono/node-server→server/index.mjs, @tanstack/react-router everywhere,
  @testing-library/user-event→3 test files — KEPT, load-bearing). No dead dep; phase_2's prune
  (markdown/js-yaml/zod/react-query/tailwind-merge/lucide-react) holds.

VERIFIED: check-types clean; `pnpm build` green (CSS 421KB safelist, JS 343KB); full suite
**109 passed / 0 skipped** (was 92 — +17 for aggregate/standings/loadSummary coverage); the
per-builder dispatcher `.codev/checks/test.sh` → apps/viewer vitest green; all FOUR committed-run
gates (realRun loader, LeaderboardPage, ExplorerPage, StandingsPage) RAN, not skipped.

This is the FINAL implement phase. After porch commits phase_5 (3-way consult), the next step is
to open the single PR (all phase commits), record with `porch done 2 --pr <N> --branch
builder/aspir-2`, and notify the architect; the `pr` gate is human-approved (never auto-approve).

Next: `porch done 2` for the phase_5 3-way impl consult.

## 2026-10-11 — IMPLEMENT phase_5 consult iter1 (codex RC / claude APPROVE, both HIGH) + fixes

2-way impl consult. claude APPROVE HIGH (ran suite/types/build itself; confirmed the panel-keyed
rollup, newest-wins, fallbacks, docs sweep; 8 non-blocking nits). codex REQUEST_CHANGES HIGH on 2
real items. Folded ALL legitimate findings in one revision (no disputes):
- **codex #1 (blocking): aggregate equal-mtime tiebreak was id-DESC, but the run index sorts
  mtime-desc/id-ASC** (runIndex.ts, runsEndpoint.ts) → leaderboard-default and standings could
  disagree on which tied run is "most recent". Fixed: tiebreak → id ASC (smaller id = newer,
  matching the index). Updated the tie test (run-a wins now) + the doc comment.
- **codex #2 + claude #6 (blocking/nit): StandingsPage silently dropped failed summaries** → a
  dropped newer run could present an older result as "current". Fixed: loadAllRunSummaries now
  returns `failed: string[]`; a non-fatal `role=status` notice names the omitted runs ("N runs
  could not be read and are omitted — standings may be out of date: …"). Partial render kept.
  Extended the missing-summary test to assert the notice names the dropped run.
- claude #2: Standings nav link untested → added an app.test.tsx case (link present, href
  `/standings`).
- claude #3: the new defensive mtime sort in runIndex.ts was unexercised (all fixtures already
  newest-first) → added `src/lib/runIndex.test.ts` feeding an OUT-OF-ORDER index (+ equal-mtime
  id tiebreak, HTML-200→empty, non-200→fail, non-array→malformed, id/mtime filtering).
- claude #4: `runDate` labeled dir mtime as the run's date → relabeled "indexed <date>" (and
  "date unknown" when mtime is 0); dropped runDate's now-dead 0-guard (caller guards).
- claude #5: package.json description omitted standings → updated.
- claude #8: two imports from localResults in StandingsPage → merged.
- NOT changed (carry-forwards): claude #1 (phase_5 uncommitted — porch commits the phase on
  advance, expected); claude #7 (`expect(present).toBe(true)` inside `describe.skipIf(!present)`
  is unreachable-when-skipped — same pattern in ALL committed-run gates incl. realRun/
  LeaderboardPage/ExplorerPage; a cross-cutting MAINTAIN fix, not a phase_5 change).

VERIFIED after fixes: check-types clean; `pnpm build` green; full suite **115 passed / 0 skipped**
(16 files; was 109 — +5 runIndex.test.ts, +1 nav-link test; aggregate/standings tests updated not
net-added). Committing fixes + both consult outputs + rebuttal, re-signalling for the iter2 re-check.

## 2026-10-11 — IMPLEMENT phase_5 consult iter2 (codex APPROVE / claude RC, both HIGH) + fix

2-way re-consult with the rebuttal as context. codex APPROVE HIGH, no issues — confirmed both
iter-1 blockers genuinely fixed (tiebreak now id-asc matching the index; omitted-runs notice).
claude REQUEST_CHANGES HIGH on ONE legitimate item I'd missed, plus agreement on everything else
(verified the committed-run order against the real summary.json itself; dep sweep clean; accepted
the skipIf carry-forward reasoning):
- **BLOCKING (fixed): repo-root `README.md:25-26` still called `apps/viewer/` "seeded from
  multibench's multibrowser; not yet adapted".** I'd fixed the apps/viewer/README + arch.md +
  arch-critical.md twins but missed the REPO-ROOT README — and phase_5's deliverable explicitly
  names README.md in the final docs sweep; it's the repo front door; last phase, nothing
  downstream catches it. Fixed in place → "the benchmark viewer over local runs/ (leaderboard +
  error explorer + cross-run standings)".
- **FLAGGED FOR ARCHITECT, not fixed (claude agrees out of Spec 2 scope): root `README.md:22`**
  says `texts/` is "gitignored pending licensing", which contradicts arch-critical.md's committed-
  raw-sources two-tier rule (public-domain raw IS committed; only `restricted` + `texts/standardized/`
  are ignored). Unrelated to the viewer → scope discipline says don't touch it in phase_5; raising
  it with the architect instead.
- claude non-blocking (no action, claude concurs): aggregate would throw on `models:{m:null}`
  (pre-existing parseSummary validation-depth limit shared with the leaderboard, not a phase_5
  regression); standings omits token totals (req 6 asks only per-task + source run + link);
  cross-coverage ranking is inherently apples-to-oranges (per-row "from run" gives the reader context).

VERIFIED after the one-line doc fix: suite still 115 passed / 0 skipped (docs-only change). Writing
the iter2 rebuttal, re-signalling for the iter3 re-check.

## 2026-10-11 — phase_5 APPROVED (codex + claude iter3, both HIGH)

Both APPROVE HIGH, no blocking issues. codex: none. claude: verified 115 tests / types green on
its own run; confirmed panel-keyed newest-wins rollup, index-consistent tiebreak, the partial-load
notice, nav/route, and the corrected docs sweep (incl. the repo-root README fix). The iter2 blocker
(root README) is resolved.

Non-blocking carry-forwards (NOT changed post-approval — capture in the REVIEW doc / future MAINTAIN;
I did not touch the approved tree):
- claude nit (maintainability): `aggregate` re-implements `rankedModels`' comparator (`?? -1` null-
  last, id asc). They agree today — the committed-run gate pins standings==leaderboard order for the
  REAL run — but a shared `compareByOverall(a,b)` used by both would make the invariant structural
  for all runs. Worth doing in the Review/MAINTAIN pass.
- claude nit (coverage): panel-absent double-row degradation is asserted only for a single panel-less
  run; a two-run fixture (one with panel, one without, same model) would pin the intended two-row
  behavior.
- claude suggestion (OUT of req 6): pointing the standings model-name link at the explorer
  (`/run/$runId/model/$modelId`) instead of `/?run=<id>` would make it one-click into the explorer;
  req 6 only asks for a link to the run, so current behavior is as specified.
- claude carry-forward (agreed): the `expect(present).toBe(true)`-inside-`skipIf` convention — defer
  to a cross-cutting MAINTAIN pass across ALL committed-run gates, not a one-gate change.

Letting porch commit phase_5 and advance. phase_5 is the FINAL implement plan-phase → next is the
single PR (all phase commits), `porch done 2 --pr <N> --branch builder/aspir-2`, notify architect;
the `pr` gate is human-approved (NEVER auto-approve). Also flag the architect: root README.md:22
`texts/` gitignore wording contradicts the two-tier rule (out of Spec 2 scope).
