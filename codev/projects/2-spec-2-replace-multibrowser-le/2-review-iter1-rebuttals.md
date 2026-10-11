# Review (PR) — iter1 consult rebuttal

2-way PR consult: **codex REQUEST_CHANGES (HIGH)**, **claude APPROVE (HIGH)**. In parallel the
**architect posted a hands-on integration review** on PR #6 (their own pass green — purge,
run discovery, and all three pages verified against the real runs) consolidating the feedback
into a concrete pre-merge fix list. This rebuttal addresses codex's two blocking points, notes
claude's minor items, and records the architect's four fixes + the one explicit judgment call.

Net result after the revision: `check-types` clean, `pnpm build` green (CSS 421KB, JS 344KB),
full suite **121 passed / 0 skipped** (was 115; +6 for the new parse/render coverage).

## codex (REQUEST_CHANGES) — one addressed, one rebutted

### C1 — `runsEndpoint.ts` should `realpath` the resolved target, not only the root
**Rebutted (no change).** codex reads the "canonical-path confinement" requirement as
`realpath(target) + containment`. The endpoint instead rejects **any symlink component**
per-component (`lstatSync(cur).isSymbolicLink()` at each path element), then rejects `..`, then
applies a lexical `startsWith(root + sep)` containment backstop, then confirms a regular file.
For the confinement goal this is **strictly stronger** than realpath-on-target: realpath only
rejects symlinks that *escape* the root, whereas per-component rejection refuses to follow **any**
symlink at all (in-root symlinks included — a deliberate, tested product decision: an in-root
`inlink → run-a` is rejected, not silently resolved). So there is no symlink left for a
`realpath` to canonicalize away; the lexical containment check then catches any `..`-style escape
that reached the loop.

The residual codex names — a directory swapped to a symlink *between* the `lstat` checks and the
`readFileSync` (TOCTOU) — is a real but theoretical window that `realpath`-then-`open` shares
equally (both canonicalize, then make a second syscall). Fully closing it needs `openat` +
`O_NOFOLLOW` per component, which Node does not expose ergonomically. Weighed against:
- this is a **dev-only** endpoint — it exists only in the Vite dev server (`vite.config.ts`),
  serving the local developer's own `runs/` directory on localhost; it ships in **no** production
  bundle (the prod static host has no `/runs` endpoint at all — that path is exactly why
  `loadRun`/`loadSummary` shape-sniff a 200-HTML answer as "absent"). An attacker able to race a
  symlink swap on the developer's filesystem already has local write access.
- the **other reviewer (claude, APPROVE HIGH) read the same file and called the confinement "the
  strongest part"**, having checked each guard for vacuity against real symlinks (drop the `..`
  check → traversal resolves; drop the `lstat` → an escaping symlink resolves; drop the try/catch
  → a malformed `%E0%A4%A` throws instead of 400).
- the **architect's hands-on integration pass verified run discovery against the real runs** and
  did **not** include this item in the pre-merge fix list.

Given a dev-only surface, a strictly-stronger confinement than the literal ask, independent
HIGH-confidence approval of the exact guard, and the integrator's green pass, I'm leaving the
endpoint as is rather than adding a second canonicalization that narrows (does not close) a
dev-only TOCTOU window. Filed nothing — the current behavior is the intended one.

### C2 — every failing question should display its per-metric scores (missing cells omitted the grid)
**Agreed, fixed.** Spec AC6 lists the per-metric scores among the four things shown side by side
for **each failing question**, and a missing cell is a failing question. `QuestionList` now renders
the exact / normalized / token-F1 grid on **every** failing row; a missing cell has no scored
answer, so all three read `"n/a"` (`formatMetric(null)`). The row keeps its distinct `missing`
badge and the "no answer produced (missing cell …)" marker, so a missing cell is still
unambiguous — the change only makes the row shape uniform and satisfies AC6 literally. Updated the
`QuestionList` unit test (missing row now asserts the grid with three `"n/a"`); no `ExplorerPage`
test regressed (none asserted the absence of the grid). This was the architect's item (5), left to
my disposition — reasoning recorded above and in the review doc.

## claude (APPROVE) — minor items

- **Untracked `2-review-iter1-codex.txt`** (the in-flight consult artifact): **committed** with
  this review gate alongside `2-review-iter1-claude.txt`, matching every prior phase.
- **Symlink confinement tests `if (!symlinked) return;` no-op on platforms without symlink
  support**: acknowledged; they do run on macOS/Linux (the CI/dev targets). This is the same
  vacuity class as the already-recorded follow-up about `describe.skipIf` committed-run gates —
  deferred to the cross-cutting MAINTAIN test-hardening pass, not a per-test change here.

## Architect integration review — four pre-merge fixes (all addressed)

codex/claude's porch consult did not surface these as blocking; the architect's hands-on pass did.
All folded:

1. **`.env.example` purge residue** — deleted; it held only multibrowser GitHub-layer /
   review-API config (`VITE_MULTIBENCH_*`, `VITE_API_BASE`, `API_ORIGIN`, `VITE_SHA_POLL_MS`),
   none of which applies to the local-only viewer. De-referenced it in `README.multibrowser.md`.
2. **`vite-env.d.ts:4-6` multibrowser `ImportMetaEnv` declarations** — deleted; no source reads
   `import.meta.env` post-purge (grep-confirmed). Kept the `vite/client` reference.
3. **`leaderboard.ts:37` `usage?.per_model[modelId]`** — now `per_model?.[modelId] ?? null`, so a
   `usage` block without a `per_model` cannot throw in the render path (which would bypass the
   typed `LoadResult` contract).
4. **`parseSummary` nested-shape validation** — now rejects structurally-malformed-but-valid-JSON
   summaries (`{"models":{"m":null}}`, non-object `models` / `by_tradition` entries, a `usage`
   without a `per_model` object, a non-object `panel`) with a localized thrown error → a typed
   `"malformed"` `LoadResult`, instead of a `TypeError` deep in `rankedModels`/`summaryTasks`/
   `leaderboardRows` at render time. Added tests (via `loadSummary` for the typed result + direct
   `parseSummary` throws + a `leaderboardRows`-never-throws-on-sparse-usage case).

**Recency-from-mtime** is filed by the architect as follow-up **issue #7** — out of this PR.
