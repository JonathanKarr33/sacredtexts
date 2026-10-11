# Spec 2 — Plan iteration 2 rebuttal

Both reviewers confirmed the iteration-1 blockers are genuinely fixed and the
approach/ordering/spec-coverage are sound, and raised a small, convergent set of new
gaps — all the same class (a contract change rippling to an unlisted consumer). Both
**REQUEST_CHANGES (HIGH)**. I accepted every point; no disputes. Revised the plan
(commit `[Spec 2] Plan with user feedback`). Point by point:

## Blocking — accepted and fixed

### 1. `loadRun`'s contract change breaks its existing consumers (codex + claude)
**Accepted — same-class repeat of the iter-1 build-breaker.** The typed-result change
breaks `src/routes/LocalResultsPage.tsx:35-41` (branches `run ? … : sampleRun()`, now
always-truthy / no `.summary`) and the `src/components/LocalResults.test.tsx:57` case
("returns null when an artifact 404s"). Phase 1 now:
- lists `LocalResultsPage.tsx` as a **minimal adapter edit** (success → render; typed
  failure → its localized error; the no-`?run=` in-memory-sample path unchanged, so
  `/local-results` still renders out of the box);
- lists the `LocalResults.test.tsx` 404 case as **reworked** to assert the typed failure;
- rewords the acceptance from "no page/route/nav changes" / "`/local-results` still
  renders" to **"no new routes/nav; the one `loadRun` consumer is adapted,"** which is
  accurate.

### 2. A `content-type` header guard throws on the bare fake fetchers; `.jsonl` is `text/plain` (claude)
**Accepted.** `realRun.test.ts`'s `diskFetcher` and `LocalResults.test.tsx`'s
`fakeFetcher` return objects with no `headers`, and the dev middleware serves `.jsonl` as
`text/plain`. Phase 1 now specifies **shape-sniffing as the primary mechanism** (read
`.text()`; a leading `<` or a JSON/JSONL parse failure ⇒ "artifact absent"), with
content-type only an optional hint — so the guard needs no `headers` and the existing
fetchers stay unchanged.

### 3. The "built+served app shows the empty state" criterion isn't executable (jsdom-only) (claude)
**Accepted.** devDeps have `jsdom` only — no browser — so `deploy.test.ts` can fetch HTML
but can't run the SPA. Split into two executable checks: (a) `deploy.test.ts` asserts the
static host returns `index.html`/200 for `/runs/_index`; (b) a **jsdom** render test
renders the home page with a fetcher returning a 200-HTML body and asserts the empty
state (exercising the Phase-1 shape-sniff guard). No browser dep added.

## Non-blocking — accepted

### 4. `Markdown`/`Loading` have no consumers post-purge → markdown deps are dead (claude)
**Accepted.** Phase 2 now **deletes `Markdown.tsx`/`Markdown.test.tsx`** (its only
consumers were the deleted review pages; no new view renders markdown) and **prunes**
`react-markdown`, `remark-gfm`, `remark-breaks`, `rehype-sanitize`, and
`@tailwindcss/typography`. `Loading` is kept as reused by the new async pages' loading
states; Phase 5's sweep verifies no dead dep remains. (If Phase 3/4 design unexpectedly
needs markdown, keep `Markdown` + deps and note it — the default is delete.)

### 5. `?run=` semantics change from base path to bare id (claude)
**Accepted.** Phase 3 now states the contract is a **bare run id**
(`/?run=<encodeURIComponent(id)>`), resolved to `/runs/${id}` before `loadRun`, that this
**changes** the Spec-1 `?run=/runs/<id>` form documented in `TUTORIAL.md`/arch.md, and
that an old-style value that is not a known id falls back to the default rather than
erroring. Docs updated to the id form.

### 6. `runsEndpoint.ts` is a node-only module in the client `src/` root (claude)
**Accepted.** Relocated to `apps/viewer/vite/runsEndpoint.ts` (outside `src/`) so a stray
client import can't slip in; `vite.config.ts` imports `./vite/runsEndpoint`; its test
moves alongside, and a one-line test may assert no `src/` client module imports it.

### 7. `arch-critical.md` still calls the viewer a multibrowser seed (codex minor)
**Accepted.** Phase 5's doc sweep now also corrects the always-on HOT-tier bullet in
`codev/resources/arch-critical.md` (edit the existing bullet in place, within the
HOT-tier cap), so future agents don't get stale guidance. Added to Documentation Updates.

## Correction adopted (not a dispute)

### 8. The "`#86` probe would go red" premise was overstated (claude #7, FYI)
Claude is right that the probe likely **self-seeds** today from its own class-name string
literals in `deploy.test.ts` (Tailwind v4 auto-detection scans them), so it passes by
accident rather than going red. I corrected the plan's framing from "would go red" to
"fragile / passes only by accidental self-seeding," kept the `@source inline(...)`
safelist as the right deterministic fix, and recorded the tradeoff it introduces (a
safelisted ramp can no longer catch "the app used a shade the shim doesn't define";
`noInvisibleText.test.ts` remains the invisible-text guard). Risk reclassified
Medium/High.

## Disagreements

None.
