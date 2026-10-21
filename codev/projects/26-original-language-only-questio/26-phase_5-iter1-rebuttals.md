# Spec 26 Phase 5 — Rebuttal to per-phase consult (codex + claude, both REQUEST_CHANGES)

Both reviewers confirmed arch-critical, pipelines/README (generate block + scoring contract +
Source-catalogue fields) and CODE_WALKTHROUGH are accurate. Their findings were doc-accuracy gaps —
one of them (claude's cold-tier contradiction) load-bearing before Phase 6. All fixed in `[Spec
26][Phase: implement] docs: fix cold-tier arch.md #23 contradiction + tutorial accuracy` (suite 362,
pointer-guard green).

## Blocking

### Cold-tier `arch.md` stale and self-contradictory (claude) — ACCEPTED (critical)
`arch.md` still said "six working-group templates", `_balanced_sample`, `identify_version`, and
"**verify_source … deferred — issue #23**" — the last directly contradicting the `arch-critical.md`
line this phase wrote (gate **closed**). A future agent reading the cold tier would conclude no
verify_source number may be reported — right before Phase 6 reports one. Fixed both bullets: generate.py
(four templates, original-language-only, per-text quota, `requested_as` rendering, excluded texts;
sampler + two tasks retired) and score.py (leading-stance `verify_source`, `cite_passage`, `refused ⟺
parsed is None`, "#23 PAPER GATE closed, Spec 26"). The plan's "reassess arch.md at review" is
discharged here because the contradiction can't wait for the review phase.

### TUTORIAL "three scriptures in their original languages" includes the KJV (both) — ACCEPTED
The KJV is an English translation; it is in the pool only because the benchmark treats its
`canonical_language` as English (#27 Q1). Reframed: the KJV is called out as an English edition
(translation) kept in the pool by the canonical-language rule, while the Qur'an (Arabic) and Talmud
(Aramaic) are the genuine originals; added a one-line pointer to the `language == canonical_language`
rule.

## Other findings — ACCEPTED

- **cite_passage by-example omitted** (codex): the four-template sentence now notes cite_passage
  "shows the citation format by example".
- **"exactly this run" + broken `runs/original-<date>/` placeholder** (both): `tutorial-2026-10-11`
  is reframed as a pre-Spec-26 example of the same *kind* of run (not byte-reproducible today); the
  placeholder link is removed. The current Spec-26 run is described as committed under `runs/`
  (the actual path/digest is wired in Phase 6, when the run exists — a Phase-6 handoff, not a false
  link now).
- **`--per-task` reference** (codex, criterion): removed from TUTORIAL and the run README; the
  pre-Spec-26 history is explained without the retired flag tokens (so claude's "honest historical
  explanation" is preserved while codex's literal "no doc references `--per-task`" criterion is met).
- **README "all restricted targets are translations"** (codex): corrected — restricted targets are
  copyrighted *texts* (NABRE, a translation; the Greek Orthodox TLG, an original-language edition).
- **15–30 range + default 28 documented nowhere** (claude): added to TUTORIAL (the plan deliberately
  kept them out of Typer as a doc note); README already states `--per-text 28`.
- **Stale cost numbers** (claude): step 6 now states the `--per-text 20` command's 60 questions / 240
  cells, with the 100-question/400-cell shipped example given as scale.
- **`runs/tutorial-2026-10-11/README.md` reproduce claim** (claude): its Reproducing section now says
  the run predates Spec 26 and is not reproducible with today's CLI; re-score stays deterministic
  (the regression guard pins it). Its `identify_source` mention at line 82 is a historical results
  write-up (out of scope per the spec's own enumeration), left as-is.

## Net
The one load-bearing fix (cold-tier `arch.md` #23 contradiction) is resolved before Phase 6; the rest
are factual tutorial/README corrections. The committed `tutorial-2026-10-11` run stays valid
(re-score green); only its prose was clarified. Full pipeline suite 362 passed.
