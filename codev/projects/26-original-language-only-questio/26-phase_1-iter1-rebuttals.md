# Spec 26 Phase 1 — Rebuttal to per-phase consult (codex + claude, both REQUEST_CHANGES)

Both reviewers converged on the same two issues and both are correct. All points accepted and fixed in
`[Spec 26][Phase: implement] fix: path-based metadata channel + cross-source conflict detection`. An
architect decision that landed during the review (drop `--include-translations` entirely) resolved the
two downstream questions the reviewers raised; spec/plan updated in a companion commit.

## Blocking 1 (both) — the metadata channel cannot key the encyclicals — ACCEPTED
`convert_encyclicals` emits one `Document` per file with `work=<title>`,
`version="Vatican English text (pope, date)"` — not the target's nominal `("Papal Encyclicals",
"Vatican English", "en")`. So a `(work, version, language)`-keyed lookup resolves **zero** encyclical
documents, and (claude's sharpening) this bites the **default** run, not just a translations path: the
equality rule must read `canonical_language` to *exclude* them, so the lookup happens before exclusion.

**Fix:** replaced `metadata_for_text` (tuple lookup) with **`metadata_for_standardized_path(path,
sources)`** — path-based recovery that mirrors `license_for_standardized_path` (deepest-containing
target `standardized_dir` wins). Every encyclical file lives under the one encyclicals target directory,
so it resolves to that target's `TextMeta` regardless of the document's re-stamped `work`/`version`.
This is now the channel generation uses (fail-closed on `None`). New test
`test_metadata_for_standardized_path_resolves_by_path` writes a doc with `work="Humanae Vitae"` under the
encyclicals target dir and asserts it resolves to the encyclicals metadata (`canonical_language="la"`) —
the exact re-stamp case, plus `None` for a stray path.

## Blocking 2 (both) — `text_metadata()` silently last-wins across source files — ACCEPTED
`load_source`'s slug-agreement runs per `source.yaml`; `discover_catalogue` never cross-checks, so two
files declaring the same tuple with different metadata resolved by glob order. **Fix:** `text_metadata()`
now raises `CatalogueError` ("ambiguous metadata") on a conflicting duplicate tuple across sources, and
its docstring no longer claims slug-agreement covers this. New test
`test_text_metadata_conflicting_tuple_across_sources_fails` (two source files, same tuple, different
`requested_as`). Its role is also corrected: it is a **nominal view**, not the generation channel (the
path-based resolver is).

## Downstream questions the reviewers raised → architect decision (2026-10-20)
Both flagged that this needed an architect call before Phase 2. I raised it; the architect decided to
**drop `--include-translations` entirely** (YAGNI — canonical-language-only, full stop; excluded
targets reported in the manifest with a reason). That **moots** both:
- **Encyclicals as ~201 un-fillable one-paragraph "texts"** (claude): nothing can pull them into a
  quota run — they are excluded by the equality rule (`en != la`), full stop.
- **Talmud en/he identical `requested_as`** (claude minor): Talmud English is never generated, so the
  prompts are never indistinguishable; the identical lists stay as #27 lists them (true data about how
  people ask). Spec/plan updated to remove the flag and record exclusions in the manifest instead.

## Minors — ACCEPTED
- **slug-agreement message named all three fields regardless of which differed** (claude): now computes
  and names only the differing field(s); `test_slug_agreement_covers_canonical_language` asserts the
  narrowed `"disagree on canonical_language"`.
- **`test_first_run_question_set_digest_regenerates` is broken by *this* phase, not Phase 2** (claude):
  removing the two LDS-KJV targets orphaned a `texts/standardized/...` dir that is in the committed
  first-run manifest's `inputs`, so `filter_standardized_paths` now fail-closes on regenerate (green
  only because `texts/standardized/` is absent locally). The Phase-2 retirement rationale in the plan
  now names the Phase-1 target removal as the first cause (alongside the generator-interface change) and
  flags that it bites at Phase 6 when the corpus is rebuilt. The **re-score** half stays.
- **"papal encyclicals" lowercase renders awkwardly** (claude): moot — encyclicals are excluded.

## Net
Both blocking findings fixed with the single correct change (path-based recovery, consistent with how
`license` already travels), plus global conflict detection. The architect's flag-drop simplified the
selection contract and removed the one genuinely open design question. Full pipeline suite 336 passed.
