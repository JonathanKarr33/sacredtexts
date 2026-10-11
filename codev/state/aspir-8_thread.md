# aspir-8 thread — [Spec 3] Tutorial centered on KJV / Qur'an / Talmud(he), 2-model panel, web-search on/off

Builder: aspir-8 · Protocol: ASPIR (strict) · Issue #8

## Phase: SPECIFY (started 2026-10-11)

### Grounding done (read real code, not docs)
- **Converters already handle ar/he.** `quran_qul` (Arabic Qur'an, QUL Uthmani) and
  `sefaria_talmud` (Hebrew/Aramaic Talmud, with an explicit en/he language cross-check)
  are both registered in `convert.py` and the `he` Talmud target IS already in
  `texts/raw/Judaism/source.yaml` (added Spec 1, commit cff38b2). The issue's "only
  English catalogued today / handle its shape in the converter" is **stale** — the
  conversion half is largely done. Real remaining converter work = verify it produces
  docs + wire the tutorial generate to the ar/he standardized paths.
- **normalize() mangles non-Latin (verified empirically).** Current `score.py normalize()`
  does NFKD + fold curly quotes/dashes + `[^\w\s]`→space + casefold. On Arabic vocalized
  basmala it yields `'ب س م ٱلل ه ٱلر ح م ن ٱلر ح يم'` (harakat→spaces split letters;
  alef-wasla ٱ NOT folded), `token_f1(vocalized,plain)=0.0`. Tatweel survives; Hebrew
  niqqud/maqaf split letters. The deferred Arabic/Hebrew normalization must land: delete
  combining marks (harakat/niqqud), remove tatweel, fold alef/hamza/alef-wasla→ا, fold
  maqaf, WITHOUT splitting letters.
- **Tools/standings identity (viewer is zero-change, req 5).** Viewer STANDINGS keys on
  `panel.provider \u0000 panel.model` (`apps/viewer/src/lib/aggregate.ts:59`). Leaderboard +
  explorer key on `model_id`. loadRun/parseSummary do NOT read any `tools` field; panel =
  {provider, model, endpoint, served_by}. ⇒ To make search on/off distinct in standings
  WITHOUT touching the viewer, the pipeline must encode the tools setting into the emitted
  `panel.model` (the standings key). Also `_panel_fingerprint` (collect.py:32) must include
  tools. 4 distinct model_ids give distinct leaderboard/explorer rows for free.
- **Panel/config shape.** `ModelSpec` (config.py) has no `tools` field yet. Panel snapshot
  built in `cli.py score` from `{provider, model, endpoint, price_in, price_out}`;
  `_anthropic` in providers.py makes a plain `messages.create` (no tools) — web_search is
  Anthropic server-side tool, needs `tools=[...]` passed when enabled.
- **Committed run.** `.gitignore`: `runs/*` + `!runs/first-run-2026-10-11/`. KJV target =
  `The Bible / KJV / en`; Qur'an = `The Qur'an / Uthmani (QUL) / ar`; Talmud-he =
  `Talmud Bavli / William Davidson Edition - Aramaic / he`. CC-BY-NC Talmud is "open" (not
  restricted) → audit-clean to commit. Run-listing needs only summary.json. Committed-run
  viewer gate = `apps/viewer/src/local/realRun.test.ts`; #86 CSS probe = `deploy.test.ts`.
- **#7 (optional).** score.py could stamp a `generated_at` into summary.json to replace the
  viewer's fragile mtime "most recent" ordering — flag in spec, optional scope.

### Decisions I'm proposing in the spec (open design areas)
1. Tools identity: encode tools into `panel.model` + `_panel_fingerprint` (zero viewer change).
2. Committed run: ADD a new `runs/tutorial-*` dir + gitignore negation, KEEP first-run so the
   existing viewer gate test is untouched (honors req-5 "zero code changes"). Flag the risk
   that a viewer index test might assert an exact run set.
3. normalize: delete-marks approach (Arabic/Hebrew ranges), real-script fixtures.

### Next
Write spec → `porch check 8` → signal SPEC_DRAFTED (porch runs 3-way consult).
