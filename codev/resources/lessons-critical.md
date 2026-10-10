# lessons-critical.md — Always-On Engineering Wisdom (HOT tier)

## Critical lessons (consult before deciding)
- Check for existing work (PRs, git history) before building from scratch.
- "It compiled" / "tests pass" is not "it works" — verify the real user path before calling it done.
- When stuck (2 failed hypotheses or ~30 min), get an outside perspective instead of guessing.
- Derive a data format from the **real reference data**, not its docs (ported lesson, multibench): e.g. `catholic_text_json` encyclicals have `paragraph: null` — only visible in the data.
- **Mocking the provider seam hides live-only failures** (ported, multibench): keep a budgeted live smoke in the loop; the first smoke here (2026-10-10) already caught the benchmark's target failure mode working end-to-end.
- **Multi-app porch tests-check**: `porch.checks` is global — use the per-builder dispatcher `.codev/checks/test.sh` (registry: pipelines→uv pytest, apps/viewer→pnpm vitest). Keep it.
- **A client-side GitHub data layer** is unauthenticated (60/hr per IP): SHA-pin the tree, fetch content via `raw`, poll gently, serve stale + banner on 403 (ported with apps/viewer — details in `apps/viewer/README.multibrowser.md`).
- **HeroUI v3 is provider-less** — don't add a v2-era provider to the viewer.
- Gemini's per-phase impl/review consult can't see the worktree → per-phase consult is `["codex","claude"]` (set in `.codev/config.json`).

## Map of lessons-learned.md (consult when…)
- (lessons-learned.md not yet written — demote entries here as the hot tier fills.)
