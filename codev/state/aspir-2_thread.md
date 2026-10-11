
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
