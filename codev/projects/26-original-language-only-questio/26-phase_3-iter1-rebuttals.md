# Spec 26 Phase 3 — Rebuttal to per-phase consult (codex + claude, both REQUEST_CHANGES)

Both reviewers confirmed the core is right (leading-stance `parse_yes_no` read before `normalize()`,
complete task retirement + `ScoreError` for the retired tasks, `by_text` aggregating a verify_source
negative under the asked edition, rebaseline oracle + first-run re-score green). Their two findings
converged on one clean fix; the architect resolved the leniency question. All applied in `[Spec
26][Phase: implement] fix: verify_source refused⟺parsed-None, label-strip, unambiguous by_text key`
(suite 362).

## The converging fix: verify_source refused ⟺ `parsed is None`
- **codex:** "There is no way to verify this... Yes" scored `incorrect`, not `refused` (the decline
  cue is absent from the frozen `_DECLINE_CUES_RAW`, and adding it risks the Spec-15 rebaseline oracle).
- **claude:** `_with_outcome` applied verify_source refusal *ungated*, so a committed-but-hedged
  verdict "No, I cannot verify that this is from X." (parsed `no`) would be forced to `refused`.

Both are resolved by making verify_source refusal **parsed-based**: a cell is refused **iff
`parsed is None`** (no leading verdict committed). A committed leading verdict is graded even with a
trailing disclaimer (claude's case → graded `no`); a negation-evasion with no leading verdict is
refused (codex's case), never scored correct. `classify_refusal` no longer governs verify_source
(cue set untouched → oracle unaffected; verify_source is retrieve_quote-absent in committed runs
anyway). `outcomes.py`'s module + `classify_refusal` docstrings are corrected to say so.

## Leading-window + label strip (codex #1, architect decision)
codex asked for the explicit first-sentence/60-char window. Implemented `_leading_window` (strip
wrapping markup/quotes/bullets, then take the first sentence / 60 chars) — but the stance is still
the **leading token** of that window, because a window *search* would match the incidental `no` in
"no way to verify" and re-open the #23 gaming gap. The architect then set the one sanctioned
leniency: strip a bare `Answer:`/`Verdict:`/`Response:` label (`^(answer|verdict|response)\s*[:\-–]\s*`)
so "Answer: Yes" grades, while "Based on my search, yes" stays `None → refused`. Both label cases and
"Based on my search, yes" are now in `test_parse_yes_no`.

**Leniency cost surfaced (both reviewers asked):** strict leading-token means a verdict buried after a
non-label lead-in ("Based on my search, yes") is `refused`, not graded. The architect confirmed this
is the intended tightening; the Phase-6 run README will carry a `parsed is None` diagnostic (count +
10 sample verify_source rows per model) so the cost is visible.

## `by_text` unambiguous key + collision test (codex #2)
`_text_label`'s `" | "` join could collide (`("A | B","C","D")` vs `("A","B | C","D")`). Replaced with
`_text_key` returning the `(work, version, language)` tuple, joined with **NUL** for the summary key
(the project's unambiguous-key convention, as the viewer's standings key uses). Added
`test_by_text_key_is_unambiguous_no_collision` with exactly that colliding-under-naive-join pair.

## Per-text markdown columns (codex #3)
The per-text table is now a per-model section with explicit **text / n / accuracy / coverage /
refused** columns (each text's `_overall`), not a model/text × task matrix. `_text_label_display`
renders the NUL key as `work (version, language)`.

## test_outcomes vacuous test (claude #2)
`test_verify_source_decline_vs_committed` asserted `classify_refusal(..., "verify_source") is False`
for "I can't be fully sure, but yes." — vacuous (that string has no cue). Since verify_source refusal
is no longer `classify_refusal`'s job, it is replaced by a real parsed-based behavior test via
`score_answer` (committed-verdict-with-trailing-decline → graded; decline-then-buried-verdict →
refused).

## Deferred
CODE_WALKTHROUGH §3/§4 prose about `_SUBMETRICS` / "answer must be a label" is stale (Phase-5 doc
scope; pointer-guard green). The arch-critical #23 PAPER-GATE line → "closed by Spec 26" is also Phase 5.

## Net
One parsed-based refusal rule satisfies both reviewers; the architect's label-strip sets the single
sanctioned leniency; the `by_text` key is now collision-proof and the table matches the spec's
columns. Full pipeline suite 362 passed; oracle + re-score green.
