
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
