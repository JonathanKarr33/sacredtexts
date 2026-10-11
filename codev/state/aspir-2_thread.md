
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
