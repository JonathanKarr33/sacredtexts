# Spec 26 — Rebuttal to iter-1 spec review (codex + claude, both REQUEST_CHANGES)

Both reviews are high-signal and, importantly, raised **no objection to any baked decision** — every
finding was a place the spec under-specified or failed to fully honor a baked number. I verified the
load-bearing claims against the code before acting (notably the citation work-prefix). The spec was
revised in `[Spec 26] Specification with multi-agent review`. Disposition of each point below;
**accepted** unless stated otherwise.

## Blocking

### B1 (claude) — Template 1 duplicates the work name for 10/14 texts — ACCEPTED
Verified: `convert.py:338` sets hadith `citation = "{work} {number}"` ("Sahih al-Bukhari 1", ×9) and
`convert.py:138` sets D&C `"{work} {book}:{verse}"` ("Doctrine and Covenants 1:1"). Qur'an (`:308`
bare "7:70"), Talmud (`:403` "Chullin 26b:12"), Book of Mormon / Pearl of Great Price (`:151` "Alma
32:21") are **not** work-prefixed. So `retrieve_quote` = `{ask_as} {citation}` duplicates for exactly
10/14 texts, while the old acceptance criterion ("uses ask_as, never version") still passed — a real
hole.
**Change:** Desired State now renders `retrieve_quote` with a **`display_citation`** (stored citation
with a leading work/ask_as prefix stripped), stored citation and all scored ground truth unchanged. A
new success criterion and test ("no prompt duplicates the edition name"), a Risk row, and a Solution
Approaches subsection (Approach A strip-prefix recommended; B per-target field and C change stored
format rejected) were added. The *no-duplication requirement* is the spec contract; the exact
stripping rule is a plan detail.

### B2 (both) — `refused`/`coverage` depend on unmerged PR #24; no fallback stated — ACCEPTED
**Change:** Assumptions now splits responsibility explicitly: the leading-stance `parse_yes_no`
(yes/no/`None`) is independent and lands here regardless; `refused`, `coverage`, and the per-text
table's coverage/refused columns are **Spec 15 machinery Spec 26 consumes, not reimplements**. Added
the expected path (merge #24 first; surface sequencing to architect) and a **degraded fallback** (if
the architect directs shipping without #24: per-text table = text/n/accuracy, a `None` recorded as
`parsed: null` not `refused`, and — per #23 — no `verify_source` accuracy number published). Mirrored
in Success Criteria (coverage/refused marked "once Spec 15 is integrated"), a Risk row, and an Open
Question.

## Substantive

### S1 (both) — 50/50 impossible at 5 items/text — ACCEPTED (clarified, not changed in substance)
`int(5 × 0.5) = 2` → 2 neg / 3 pos per text. "Keep the 50/50 mix as today" means **keep the existing
deterministic formula** `int(verify_template_quota × negatives_share)` (share default 0.5), not a
guaranteed per-text 50/50 — "as today" literally is this formula. **Change:** Success Criteria and
Constraints now state the share is the parameter, the per-text split is ~40/60 at 5 items, and the
aggregate is deterministic (feeds the digest).

### S2 (both) — `--per-text` non-multiples of 4 undefined — ACCEPTED
**Change:** Desired State, Success Criteria, and Approach 1 now define a deterministic split: `N // 4`
per template plus one extra to the first `N % 4` templates in the fixed canonical order
(`retrieve_quote`, `complete_unit`, `cite_passage`, `verify_source`). Honors the full 15–30 range;
exactly 5 each at the default 20. (Chose deterministic remainder over "reject non-multiples" so the
baked 15–30 range stays usable.)

### S3 (claude) — Metadata channel into `generate` unspecified; `Document` carries no catalogue
facts; `(work,version,language)` is not a unique target — ACCEPTED
**Change:** Desired State now states the three fields travel the **same catalogue-recovery channel as
`license`** (path-based, fail-closed, slug-agreement check). A new catalogue test covers fail-closed +
slug-agreement (LDS-KJV-pair-shaped fixture). "One text = one target" was corrected throughout to
"one text = one `(work, version, language)` **group**" (the LDS KJV OT/NT pair shares a slug; the
Talmud Aramaic target expands to dozens of per-tractate documents).

### S4 (claude) — `cite_passage` Arabic scoring is a documented-weak path, now 25% of the benchmark —
ACCEPTED
Verified the in-code note (`score.py:149-151`, "Arabic corpora are a follow-on; the first run is
English") and that `_NUM_CITE` needs a Latin leading word while `normalize()` does not fold
Arabic-Indic digits. **Change:** added a Risk row, an Important Open Question (does `citation_hint`'s
Latin/colon steer suffice, or must the scorer fold Arabic-Indic digits?), and a Test Scenario. Primary
mitigation: `citation_hint` steers the answer to the scored shape (its examples already use Latin
digits); digit-folding flagged as the alternative, resolved empirically in the smoke/live run.

### S5 (claude) — Template-4 negatives: shared-narration hadith yield wrong "no" ground truth —
ACCEPTED
The exact normalized-text exclusion won't catch variant-wording narrations shared across the 9 hadith
collections. **Change:** Risk row + Open Question: prefer cross-work/cross-family negatives, or accept
and document the residual limitation for the first run. Noted that #23's hardening protects against
gaming a false premise, not against a wrong truth label — a distinct concern.

### S6 (codex) — `--tasks` / `--negatives-share` fate after removing `--per-task`/`--quota` — ACCEPTED
**Change:** Assumptions states both are **retained** (only `--per-task`/`--quota` are removed).
`--tasks` subsets the four templates (the tutorial generates `retrieve_quote` only) with the per-text
split applied over the subset; `--negatives-share` keeps default 0.5.

### S7 (codex) — Verbatim shorthand vs rendered strings conflict (template 2 `?` vs `:`; template 4
reworded) — ACCEPTED
**Change:** Desired State and Constraints now declare the **rendered template strings authoritative**
(they feed the digest and acceptance tests); Waleed's four-line shorthand conveys intent. This removes
the `?`/`:` ambiguity.

### S8 (codex) — `verify_source` negative aggregation + question `source` metadata — ACCEPTED
**Change:** Constraints now fixes question identity: a `verify_source` question (positive or negative)
belongs to the **asked edition** (`ask_as`) and aggregates under that text, because the task tests
knowledge of that edition. Source metadata records the asked edition; a negative's `expected` also
records the passage's true source (`true_work`, `true_version`).

### S9 (codex) — Per-text summary omits the model dimension — ACCEPTED
**Change:** Desired State and Success Criteria specify the per-text table is **keyed by model then
text**, mirroring the existing `by_tradition` structure (`by_text[model_id][text]`). Pooling across
the multi-model panel would be meaningless.

## Minor

### M1 (claude) — Viewer has retired-task handling — ACCEPTED
**Change:** the retirement criterion now names `apps/viewer` (`localResults.ts`, `explorer.test.ts`,
`QuestionList.test.tsx`) alongside code/score/docs.

### M2 (claude) — `test_first_run_regression.py` safety — ACCEPTED (reassurance recorded)
**Change:** Constraints notes the committed `runs/first-run-2026-10-11` manifest is
`retrieve_quote`-only (100 q), so retiring the two tasks does not threaten the byte-for-byte re-score.

### M3 (claude) — Leading-stance window must be taken before `normalize()` — ACCEPTED
**Change:** Desired State, Approach, and Test Scenarios pin that the window is extracted from the raw
answer **before** `normalize()` (which deletes the sentence-boundary punctuation) — same
ordering-sensitivity class as the arch-critical normalize-pass invariant.

### M4 (claude) — Prompt/answer language unstated — ACCEPTED
**Change:** Desired State adds a language line: English prompts; for templates 1–2 answers expected in
the source script (Arabic/Aramaic), scored by `normalize()`; `cite_passage` steered to Latin/colon via
`citation_hint`.

### M5 (claude) — Full 23-target census + the two LDS KJV targets — ACCEPTED
**Change:** Current State now carries the full census table (23 targets with their `original_language`
flags), including the LDS KJV OT/NT pair (false, shared slug).

### C-codex — `"no way to verify... Yes"` must be explicitly resolved — ACCEPTED
codex correctly noted the case has an early incidental "no" and the issue only said "not yes".
**Change:** the spec now states the parser returns **`None`** here (a leading decline cue is neither a
yes nor a no stance), so it is classified `refused` (where Spec 15's layer exists) — it is not gamed
into a correct "no" on a false premise. Pinned as a test scenario.

## Net
No disagreements; all 19 points accepted as clarifications or defect fixes. None altered a baked
decision — several (B1, S1, S2) are the spec being made to *honor* a baked number it had left
under-specified. The revised spec commits one new cross-project coordination item (PR #24 sequencing)
that is the architect's to resolve; it is surfaced in Open Questions with a degraded fallback so the
plan is not blocked on it.
