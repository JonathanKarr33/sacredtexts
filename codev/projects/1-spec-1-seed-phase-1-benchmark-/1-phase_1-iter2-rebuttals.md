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
