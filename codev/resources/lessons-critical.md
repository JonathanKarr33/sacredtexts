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
- **Never re-run `collect`/`score`/`generate` over committed run evidence** — write to a fresh `runs/<id>/`. Collect resume-skips every cell (zero calls) and a keyless score overwrites the committed panel/usage proof with nulls. **Exception: a deliberate scoring-contract change** rebaselines committed `scores.jsonl` on purpose — do it once, panel/usage fed back verbatim, witnessed by a projection-SHA oracle + a pre-registered flip/refused set (`test_contains_reference_rebaseline.py`); surface the moved numbers to the architect first.
- **`porch rollback <id> plan` replays the OLD plan's iterations** (counter not reset) → a re-scoped plan can reach implement with **no fresh consult**. Run a manual `consult` over the re-scoped plan and fold it before implementing. porch's implement loop also **force-advances** at `max_iterations` (3) with the last rebuttal as disposition — verify that's what happened, don't assume a clean pass.

## Map of lessons-learned.md (consult when…)
- **Scoring & evaluation** — designing/changing a scoring contract or interpreting scores.
- **Live runs & providers** — running a panel, picking model slugs, debugging empty/failed cells.
- **Evidence & copyright** — committing run evidence or reasoning about the audit.
- **Process / SPIR** — consult dispositions, deriving formats from real data.
