# viewer (seeded from multibench's multibrowser)

## Local benchmark results view (Spec 1, Phase 7)

One adapted page lives here already: **`/local-results`** — a minimal, local-only
view of a benchmark run's `summary.json` + per-question `scores.jsonl`/`answers.jsonl`
(from `pipelines/sacredbench score`). It renders a per-model × task accuracy table
and a per-question list (✓/✗, prompt, model answer, expected). It is **independent
of the GitHub data layer** (`src/lib/localResults.ts`, `src/components/LocalResults.tsx`,
`src/routes/LocalResultsPage.tsx`) and ships a tiny committed sample run
(`src/local/sample.ts`) so `pnpm -C apps/viewer dev` → `/local-results` works out of
the box. Local only — no deploy, no domain adaptation (that is Spec 2). Pointing it
at a real run under `runs/` is the TUTORIAL's final step.

Everything below is the unadapted seed.

**STATUS: seed, not yet adapted.** This app is a verbatim port of
`multibench/apps/multibrowser` (commit 14f6c9d4), with only the upstream repo
default repointed to `faithfamilytechnologynetwork/sacredtexts` and the baked
`public/data-raw` bundle removed. It will not render meaningful pages until its
data layer is adapted from MultiBench's domain (traditions / scenarios /
pressures / results tiers) to the Sacred Texts domain (corpora / works /
questions / answers / scores) — that adaptation is SPIR work, specced in
`codev/specs/`.

What carries over as-is (and why this seed is worth it):
- the **client-side GitHub data layer** (`src/lib/github.ts`, `queries.ts`):
  SHA-pinned tree reads, raw-content fetches off the API budget, gentle SHA
  polling, stale-on-403 with a banner — all the unauthenticated-rate-limit
  lessons are baked in;
- the stack and conventions: Vite / React 19 / TS / Tailwind 4 / HeroUI v3
  (provider-less — do NOT add a v2-era provider) / TanStack Router+Query;
- the Railway static deploy shape (`railway.json`, `server/`, `.railwayignore`,
  engines.node >= 20 for Tailwind 4 oxide) incl. the `--no-gitignore` baked-
  bundle gotcha documented in the original README;
- the test setup (vitest; the GitHub boundary is mockable by construction).

The original README is preserved verbatim as `README.multibrowser.md` — read it
before touching the data layer; its "lessons" sections are load-bearing.
