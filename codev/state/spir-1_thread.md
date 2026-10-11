# spir-1 builder thread

Project 1 — [Spec 1] Seed Phase 1 benchmark pipeline, viewer, and codev infrastructure.
SPIR, strict mode (porch-driven).

## 2026-10-10 — Specify phase

- Spawned into Specify. Spec already existed and was amended today
  (commit a135373: two-tier `texts/` layout — raw/ + committed source.yaml,
  standardized/, one-command rebuild).
- Architect orientation (main, 19:04Z): much of Spec 1 already landed via PR #1
  (pipelines/sacredbench: convert/validate/generate/collect/score, 25 tests green,
  live smoke done). Remaining delta = two-tier texts/ layout + unmet success criteria
  (Quran corpus, interchange round-trip exporter). Raw payloads gitignored per
  copyright gate; YAML metadata committed.
- Reviewed the existing spec against that orientation: the delta and the named
  unmet criteria are all already captured (Desired State §1–2, Success Criteria 1–3,
  Test Scenarios). Spec is internally consistent and honors the architect's decisions
  — honored in place, not rewritten.
- Signalled SPEC_DRAFTED; porch ran a 2-way consult (codex + claude; Gemini off
  per config). Both REQUEST_CHANGES / HIGH, tightly converged. claude verified
  against the seed code.
- Accepted essentially all of it (consistency / testability / benchmark validity):
  fixed the stale Approach 1 layout, made the interchange round-trip meaningful
  (sharded standardized ↔ assembled interchange), added a per-task scoring-contract
  table, required ≥2 versions of a work (public-domain KJV/ASV) to fix degenerate
  identify_version, stated the list-valued-tradition aggregation rule, extended the
  copyright gate to derived artifacts + a provider-submission open question, named
  the .gitignore restructure + README update, added generation policy + stable
  IDs/hash resume guard, scoped visualisation to a follow-on spec, added Quran-SPOF
  + artifact-leak risk rows with a public fallback.
- Committed revised spec + consult artifacts + rebuttal.
- NOTE for the gate: two changes reopen shipped work — (a) requiring ≥2 corpus
  versions (new corpus work), (b) the round-trip redefinition. Surfacing both to
  the architect at spec-approval so the human decides.
- Reached spec-approval gate; flagged the two scope-bearing changes to architect.
- Human decision (architect main, 20:59Z): (a) REJECTED the ≥2-versions /
  KJV/ASV corpus work — instead drop that requirement+criterion and DEFER
  identify_version (template kept, marked deferred; generate skips it while each
  work is single-version). (b) ACCEPTED the shards↔assembled-interchange round-trip
  redefinition. General direction: simpler is better, two-tier raw/ absorbs
  drop-in data, don't over-engineer for corpora we don't have yet.
- Revised accordingly: removed the ≥2-versions bullet+criterion, marked
  identify_version DEFERRED in the table + generation policy + criteria + test,
  generalized the public-domain example (dropped KJV/ASV naming), added the
  drop-in-absorption note to §1. Kept all other consult fixes.
- Re-signalled the gate (round 1 of feedback).

## 2026-10-10 — Specify, feedback round 2 (real data landed)

- Architect (main, 21:45Z): working-group raw data landed on main (2cfda99,
  4df2b42). Rebased builder/spir-1 onto origin/main — clean (my codev/ commits
  don't overlap texts/raw). texts/raw now has 7 traditions committed verbatim;
  2 restricted held back gitignored: Roman Catholic/nabre.json (NABRE) and
  Greek Orthodox/ (TLG).
- Inspected the REAL shapes (grounds converter planning, not fixtures):
  Protestant KJV/ASV/WEB = flat [{book,chapter,verse,text}] (~31k each, 3 versions
  of one work); Quran QUL = dict "surah:ayah"→{id,verse_key,surah,ayah,text};
  hadith = {id,metadata,chapters[],hadiths[{...,arabic}]}; encyclicals =
  index.json{items[...]}+per-item; Talmud = Sefaria per-tractate en/he
  {language,title,...,text}; LDS = nested {book:{heading,chapter:{verse:text}}}.
  No source.yaml files exist yet (impl creates them).
- Spec additions (architect's 3): (1) source.yaml carries a `license` field
  (public-domain/open/restricted); (2) restricted excluded from convert+generate
  by default, opt-in via --include-restricted, validate works regardless,
  no-copyrighted-text-in-artifacts stays; (3) converters planned against the real
  committed shapes. Reconciled the spec's old blanket "raw payloads gitignored"
  to reality (public-domain raw IS committed; only restricted gitignored).
- identify_version: multi-version data (KJV/ASV/WEB) now EXISTS, so per architect
  it keeps its version-gated mechanism and simply activates for the Bible once
  converted. Reframed the wording from "deferred (all single-version)" to
  "version-gated per work" — mechanism unchanged, now factually accurate.
- Cleaned stale refs: Quran-SPOF risk removed (QUL committed), NABRE→restricted
  generalized throughout, Assumptions updated (data landed), converter tests now
  run against real committed sources + fixtures for restricted.
- Re-signalled the gate (round 2).

## 2026-10-10 — Spec approved; Plan phase

- Human approved the spec (via architect). Ran `porch approve 1 spec-approval
  --a-human-explicitly-approved-this`. Porch advanced to plan locally, but its
  git push FAILED: non-fast-forward — my architect-instructed rebase rewrote
  history vs stale origin/builder/spir-1 (6 remote-only commits were pre-rebase
  duplicates of commits I replayed, no unique work). Resolved with
  `git push --force-with-lease` (safe; my own builder branch). Now in Plan.
- Studied the shipped code to plan the DELTA, not re-plan PR #1: schema/convert/
  validate/generate/collect/score exist + 25 tests. Gaps vs approved spec:
  convert only has old nested-NABRE + encyclicals (committed Bibles are FLAT-LIST,
  and Quran/hadith/Talmud/LDS have no converter); no source.yaml/license/registry;
  generate not version-gated, positional IDs, no manifest/resume-guard; score uses
  containment (hedge games cite tasks), no tradition dimension; no exporter.
  .gitignore + texts/README already handled by the data-landing commits.
- Architect (22:49Z): shape the evidence run as the first real benchmark —
  convert all → ~100 seeded retrieve_quote → collect panel → score → commit.
- Architect (22:51Z, human pre-approved): fold into spec as a small amendment +
  reflect in plan (reviewed at plan-approval): (1) TUTORIAL.md walkthrough from
  fresh clone, every command verified; (2) MINIMAL local-only viewer in
  apps/viewer showing summary + per-question scores (no deploy/polish/adaptation
  — that's Spec 2). Loop-closure over breadth.
- Amended the spec (Desired State §7 + 3 success criteria) and wrote the plan:
  7 phases — catalogue+license-gating, converters for real shapes, exporter+
  round-trip, generation hardening, scoring contract+tradition analysis, minimal
  local viewer, first benchmark run + TUTORIAL. One PR, opened at/after Phase 7.
- Signalled PLAN_DRAFTED; porch ran 2-way consult (codex + claude). Both
  REQUEST_CHANGES / HIGH, tightly converged; claude read the real data + seed.
- Accepted essentially all of it; revised plan 7→8 phases (split the heavy
  converter phase). Key fixes: source.yaml is a `targets` manifest (not 1/source)
  + common converter interface; .gitignore negations so every source.yaml commits
  (incl. Greek Orthodox) while payloads stay ignored; standardized-path convention
  gives generate its license gate; Talmud converter strips HTML + 2a daf offset +
  skips empties; first run is ENGLISH-ONLY retrieve_quote (bounds normalization;
  Arabic/Hebrew deferred); LDS-KJV==Protestant-KJV collision → tradition-union
  merge + dedup + identify_version overlap exclusion; question-set digest bound
  through collect + test_collect.py (dead-key→nonzero→fill-missing + mismatch
  refusal); tradition balancing + quotas + insufficient-pool fail-fast; automated
  copyright audit.py in the test gate; exporter round-trip = semantic
  reconstruction; panel ≥3 models/≥2 providers; token totals (no invented prices);
  raw-count _overall.
- Committed revised plan + consult artifacts + rebuttal.
- Next: porch done → plan-approval gate (human-only). The spec amendment delta
  rides along for review. Notify architect, wait. Do NOT self-approve.

## 2026-10-11 — Plan approved; Implement Phase 1

- Human approved the plan (architect main, 00:31Z). Ran `porch approve 1
  plan-approval --a-human-explicitly-approved-this` — push clean (no divergence
  this time). `porch done` advanced to implement/phase_1.
- Architect data-fact CORRECTION folded in: LDS KJV is NOT byte-identical to
  Protestant KJV (104/2900 verses differ across first 3 NT books — editorial/
  orthographic: LORD vs Lord, ligatures, enquired/inquired). They are two
  EDITIONS. So: distinct version labels (Protestant "KJV" vs LDS
  "KJV (LDS 2013 edition)"); Phase 4 dedup only on truly byte-equal entries;
  identify_version shared-wording exclusion guards the near-dup hazard. Applied
  the version labels in the LDS source.yaml now; Phase 4/5 wording adjusts during
  impl, no re-gate (architect confirmed mechanism unchanged).
- Phase 1 scope split confirmed by re-reading the plan: Phase 1 = catalogue +
  license gate + gitignore reachability + source.yaml files; converter BODIES are
  Phase 2/3 (the plan's convert_target rewrite stays in Phase 2). So Phase 1's
  cli change is the restricted-SELECTION gate, not a catalogue-driven convert.
- Inspected the REAL tree: 5 committed tradition dirs (Protestant, Sunni, LDS,
  Judaism/Talmud, Roman Catholic) + Greek Orthodox (restricted, absent). Talmud
  gotcha confirmed: Berakhot-en and Shevuot-en live in a
  "Talmud - English Translation (Davidson)/" SUBDIR while their -he siblings are
  in the parent → payload glob must be `Talmud Bavli/**/*.json`. Quran file is
  `quran_uthmani_from_qul.json.json` (double ext, real). Talmud internal license
  CC-BY-NC → mapped to `open` + verbatim in license_detail. NABRE + Greek Orthodox
  absent locally (restricted).
- Built: `catalogue.py` (Target/Source dataclasses, fail-fast loader naming
  file+target, `discover_catalogue` globbing `texts/raw/**/source.yaml`,
  `select_targets` restricted gate, `license_for_raw_path`/
  `license_for_standardized_path` + `filter_standardized_paths`, slug +
  standardized-dir convention). 6 source.yaml (22 targets: 3+10+5+1+2+1); default
  selects 20, excludes 2 restricted (NABRE, Greek Orthodox).
- `.gitignore`: changed `Greek Orthodox/` wholesale-ignore → `Greek Orthodox/*` +
  `!Greek Orthodox/source.yaml` so every source.yaml commits while payloads +
  standardized stay ignored. Verified with `git check-ignore`.
- cli.py: new `catalogue` command (validate + list selected, honors
  --include-restricted); `convert` refuses restricted inputs unless
  --include-restricted; `generate` filters restricted standardized docs by path;
  CatalogueError caught in main().
- Tests: `test_catalogue.py` (14 tests) — load valid/invalid/unknown-license
  (names file+target), discovery, selection default-exclude vs include, raw +
  standardized path→license, filter, slug/dir, and a git check-ignore regression
  guard over the REAL repo paths. Full suite 39 passed.
- NOTE for Phase 1 consult: 6 source.yaml created (5 committed dirs + Greek
  Orthodox restricted). The plan deliverable says "7 landed traditions" — on-disk
  there are 6 tradition dirs (NABRE is a restricted TARGET inside Roman Catholic,
  not its own dir). Flagging the count to the architect.

### Phase 1 — 2-way impl consult (codex REQUEST_CHANGES/HIGH, claude COMMENT/HIGH)

- Converged on the headline defect + a spec gap. Accepted essentially all;
  revised and re-tested (47 passed, was 39).
- **Gate failed open** (both): `_catalogue_or_empty` returned [] on a
  missing/unfound catalogue → convert/generate ran with the restricted gate
  silently off (claude reproduced: restricted payload converted w/o the flag).
  Fixed: `CatalogueMissing(CatalogueError)`; `_require_catalogue` fails LOUD.
- **Unmapped standardized paths failed open** (codex): `filter_standardized_paths`
  kept unverifiable files → now fail-CLOSED (raises, names the file).
- **Missing provenance** (codex, spec-backed — spec L72-75 + criterion L218-219):
  schema only had source_url/notes. Added required `provenance`
  {retrieved_from, fetch_method, fetch_date}, source-level + per-target override
  (NABRE). Populated from upstream artifacts (Protestant README 2026-08-20,
  encyclicals index 2026-09-03) + honest "unknown" where the drop had none.
- **No CLI tests** (both): added CliRunner tests (convert refusal/opt-in,
  generate filter/fail-closed/missing-catalogue).
- **Judaism `language: mul`** (claude): split into talmud-en + talmud-he (35+35
  = all 70 shards, incl. the Davidson English subdir). Catalogue now 6 src / 23
  targets.
- Minor: `build_raw_license_index` (no per-file re-glob); texts/README.md stale
  note fixed. Deferred w/ reasons: converter-registry cross-check (Phase 2, per
  claude); `tlg` converter (restricted+absent, no committed data — flagged to
  architect). claude VERIFIED the LDS-KJV correction (309 differing verses) and
  agreed with the 6-vs-7 reading.
- Wrote 1-phase_1-iter1-rebuttals.md. Committing revisions + artifacts.

### Phase 1 — iter 2 impl consult (codex REQUEST_CHANGES/HIGH, claude COMMENT/HIGH)

- Both confirmed iter-1 fixes landed (claude re-verified the real tree). Two
  residual asymmetries + minors. Accepted all, no disputes. 53 tests pass.
- **convert raw gate still fail-open on unmapped paths** (both): `nabre (1).json`
  converted with no flag. Fixed: convert now refuses None (uncatalogued) AND
  restricted by default; --include-restricted is the single opt-in. CLI test.
- **standardized tie-break + slug collisions** (both): tie now prefers
  `restricted`; load asserts same-slug targets agree on license. Tests.
- **README drift** (both): convert examples now use the standardized_dir
  convention + NABRE has --include-restricted; generate distinguishes
  path-not-found / no-docs / unmapped. CLI test.
- **fetch_date unknown discarded a known date** (claude): texts/README.md records
  the Box drop 2026-10-10. Updated all committed sources' provenance to Box drop
  2026-10-10 (upstream dates kept in retrieved_from); restricted held-back ones
  stay unknown.
- Minor: yaml errors wrapped in CatalogueError (+ test); _slugify collapses
  doubled hyphens (before Phase 2 writes dirs). Phase-2 notes: catalogue-driven
  convert closes the raw hole structurally; keep skipping encyclicals/index.json.
- Wrote 1-phase_1-iter2-rebuttals.md. Committing + re-consulting (iter 3).

### Phase 1 — iter 3 impl consult: BOTH APPROVE / HIGH

- codex APPROVE (no remaining issues); claude APPROVE (verified live from the
  CLI: 23 targets resolve, Talmud 35+35 exact, gitignore holds, 53 tests green).
- Phase 1 DONE. claude's minor leftovers carried to Phase 2 (all non-blocking):
  (1) a `validate` license-agnostic CliRunner test; (2) `convert --out`
  unconstrained — closed structurally by Phase 2's catalogue-driven convert_target
  (resolve inputs+outputs from the catalogue); (3) `fetch_date` docstring vs
  free-string — soften or enforce YYYY-MM-DD/unknown; (4) Greek Orthodox payload
  glob `*.json` → `**/*.json` (README says drop whole folder; restricted+absent,
  no live effect); (5) pre-existing: add GenerateError to main()'s handler tuple
  (Phase 5). Fold these in opportunistically where Phase 2/5 touch the code.
- Advancing to Phase 2 (English-corpora converters). Will /compact first.
