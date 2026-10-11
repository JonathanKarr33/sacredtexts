### Iteration 1 Reviews
- codex: REQUEST_CHANGES — Phase 1’s catalogue structure is sound, but licensing fails open and required provenance metadata is absent.
- claude: COMMENT — Phase 1 deliverables are complete and verified against the real tree (22 targets resolve, gitignore negations hold, 39 tests pass); the license gate silently no-ops when the catalogue isn't discoverable and its CLI wiring is untested.

### Builder Response to Iteration 1
# Phase 1 implementation — review rebuttal (iter 1)

Two reviewers: **codex REQUEST_CHANGES / HIGH** and **claude COMMENT / HIGH**
(claude verified against the real tree and seed; it also independently confirmed
the architect's LDS-KJV correction by diffing the full LDS NT vs Protestant KJV —
309 differing verses — validating the distinct `KJV (LDS 2013 edition)` label).
They converged on one load-bearing defect (the license gate fails open) plus a
spec-compliance gap (missing provenance). I accepted essentially all of it.

## Accepted and fixed

**1. The license gate fails open — the headline (codex #2, claude #1).** BLOCKING.
`_catalogue_or_empty` returned `[]` when the catalogue wasn't discoverable (absent
root, or running from a subdirectory with the relative default `texts/raw`), so
`convert`/`generate` ran with the restricted gate silently disabled — contrary to
the repo's fail-fast principle. claude reproduced it: a restricted payload
converted with no `--include-restricted` and no warning. Fix: a distinct
`CatalogueMissing(CatalogueError)` raised by `discover_catalogue`; the CLI helper
is now `_require_catalogue`, which fails LOUDLY (BadParameter telling the user to
run from the repo root or pass `--raw-root`). No substring-sniffing of messages.
Verified: `generate --raw-root /nonexistent` now errors instead of proceeding.

**2. Unmapped standardized paths failed open (codex #1).** `filter_standardized_paths`
previously *kept* files whose license it couldn't recover (the README's legacy
output path was the named hazard). Now **fail-closed**: a standardized file not
under any target's `standardized_dir` raises `CatalogueError` naming it. A
standardized doc must live under its target dir (the path convention), so its
provenance/license is always known; a stray file is a bug, not a pass-through.

**3. Missing provenance metadata — spec-compliance gap (codex #3).** CORRECT and
spec-backed (spec lines 72–75 and success criterion 218–219: each `source.yaml`
must carry "where it came from (URL/repo/commit), how it was fetched, fetch date").
My schema had only optional `source_url`/`notes`. Fix: a required `provenance`
block (`retrieved_from`, `fetch_method`, `fetch_date`), validated fail-fast,
source-level with an optional per-target override (used for the NABRE target).
Populated from what the upstream artifacts record (Protestant README build date
2026-08-20; encyclicals index `generatedAt` 2026-09-03) and an honest `unknown`
where the working-group drop carried no date — recorded, not fabricated.

**4. No CLI-level tests for the gate (codex #4, claude #2).** The phase's acceptance
criterion is CLI behavior; my tests were library-level only. Added `CliRunner`
tests: `convert` refuses restricted by default and passes the guard with
`--include-restricted`; `generate` filters restricted docs, fails closed on an
unmapped doc, and fails loudly when the catalogue is missing.

**5. Judaism `language: mul` broke the one-(work,version,language) invariant
(claude #4).** It also collided en and he into one `standardized_dir`, which would
block the Phase 8 English-only run's path-based selection. Fix: **split into two
targets** — `talmud-en` (glob `Talmud Bavli/**/*- en -*.json`) and `talmud-he`
(`*- he -*.json`). Verified against the real tree: 35 en + 35 he = all 70 shards,
none missed or double-counted; the `**` glob still picks up the English tractates
in the `Talmud - English Translation (Davidson)/` subdirectory. (Catalogue is now
6 sources / 23 targets.)

**6. Minor (claude #5).** `license_for_raw_path` re-globbed the whole catalogue per
input file — added `build_raw_license_index` (resolve once) and the CLI uses it.
Updated the stale `texts/README.md` "once implemented" note (the flag exists now)
and its provenance pointer. The duplicate LDS `The Bible` slug is a Phase 2 note
(the `lds_nested` converter writes distinct filenames inside the shared dir).

## Noted / deferred (with reasons)

- **Converter-registry cross-check (claude #3).** claude itself scoped this to
  Phase 2 ("bodies land in 2/3"). The catalogue intentionally treats `converter`
  as an opaque string at load so a `source.yaml` can name converters that land in
  later phases; Phase 2 adds a registry cross-check over *selected* targets.
- **`tlg` converter (claude #3).** No plan phase ships a Greek Orthodox / TLG
  converter, and the source is restricted with its payload absent, so it never
  runs by default. The `source.yaml` records `converter: tlg` for provenance and
  documents the payload is held back; wiring a real TLG converter is out of scope
  for Spec 1 (no committed data to build it against). Flagged to the architect.

## Disagreements

None of substance. codex's framing that `convert` should enforce
`Target.standardized_dir()` output paths (part of #1) is really the Phase 2
catalogue-driven-`convert` rewrite (the plan's `convert_target` work); Phase 1's
scope is the restricted **selection/gate**, which is now fail-closed and
loud. The underlying fail-open defect codex named is fixed.


### Iteration 2 Reviews
- codex: REQUEST_CHANGES — Prior licensing and provenance defects are fixed, but two remaining fail-open paths undermine the catalogue as the licensing control point.
- claude: COMMENT — Phase 1 is complete and independently verified against the real tree (6 sources/23 targets, all globs resolve, 70 Talmud shards partitioned exactly, gitignore negations hold, 47 tests pass); the iter-1 fail-open fix is genuinely in the code, with small residual asymmetries worth closing.

### Builder Response to Iteration 2
# Phase 1 implementation — review dispositions (iter 2)

Both reviewers confirmed the iter-1 fixes landed (claude re-verified against the
real tree: 6 sources/23 targets, all globs resolve, 70 Talmud shards partitioned
exactly, gitignore holds, 47 tests, the fail-open fix genuinely in code). Two
residual asymmetries remained. **codex REQUEST_CHANGES / HIGH**, **claude COMMENT
/ HIGH**. I accepted everything — no disputes.

## Accepted and fixed

**1. `convert`'s raw-path gate was still fail-open for out-of-catalogue paths
(codex #1, claude #1).** `license_for_raw_path` returns `None` for an unmapped
file and the gate only refused `"restricted"`, so a renamed/misplaced restricted
payload (`nabre (1).json`) converted with no flag — asymmetric with the now
fail-closed standardized filter. Fixed: default `convert` now refuses `None`
(uncatalogued) as well as `restricted`, with distinct messages; `--include-restricted`
is the single opt-in for both. CLI test added (`nabre (1).json` refused).

**2. `license_for_standardized_path` tie-break + slug collisions (codex #2,
claude #3).** It kept the first equal-depth match; a same-slug collision with
mixed licenses could expose restricted output. Two fixes: (a) on a depth tie the
most-conservative license (`restricted`) now wins; (b) `load_source` asserts that
targets sharing a standardized slug agree on license, rejecting a conflicting
manifest at load. Tests for both. (No live collision exists — LDS OT/NT share a
slug but are both public-domain — but the class is closed.)

**3. README drift surfaced by the fail-closed path (codex #3, claude #2).** Step 1
wrote legacy gitignored paths while step 3 reads `texts/standardized`, so a
verbatim run hit the fail-closed message as a misleading "license" error on an
absent directory, and the NABRE example omitted `--include-restricted`. Fixed:
convert examples now target the `standardized_dir` convention and the NABRE one
carries `--include-restricted` (and a note that Phase 2 makes `convert`
catalogue-driven). `generate` now distinguishes *input path not found* and *no
documents found* from *exists-but-unmapped*, with a CLI test.

**4. `fetch_date: unknown` discarded a known date (claude #4).** `texts/README.md`
records the working-group Box drop ("Phase I / raw JSON", downloaded 2026-10-10).
Updated every committed source's provenance to `fetch_method: working-group Box
drop ("Phase I / raw JSON")`, `fetch_date: "2026-10-10"`, with upstream attribution
(and upstream build/export dates: Protestant 2026-08-20, encyclicals 2026-09-03)
kept in `retrieved_from`. The two held-back restricted sources keep `fetch_date:
unknown` (we never fetched them) but point `fetch_method` at the Box channel.

**5. Minor (claude #5, #6).** `yaml.safe_load` errors are now wrapped in
`CatalogueError` (loud `error:` + exit 2, not a traceback) with a malformed-YAML
test; `_slugify` now collapses runs of non-alnum to a single hyphen
(`the-bible-asv-1901-en`, not `...asv--1901--en`) — cheap now, before Phase 2
writes standardized directories where the slug is load-bearing.

## Noted for Phase 2 (not this phase)

- **Catalogue-driven `convert` closes the raw-path hole structurally** (claude #1):
  Phase 2's `convert_target` must resolve inputs *only* from catalogue targets, so
  the explicit-path escape disappears rather than relying on the now-symmetric
  fail-closed guard.
- **`encyclicals/index.json`** (claude #7) sits outside the `encyclicals/en/*.json`
  payload glob (correctly excluded today); a catalogue-driven convert expanding the
  encyclicals directory must keep skipping it (the converter already filters
  `index.json` by name).

## Disagreements

None.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
