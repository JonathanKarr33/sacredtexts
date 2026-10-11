# Phase 3 implementation — review rebuttal (iter 1)

**codex REQUEST_CHANGES / HIGH** (two plan-contract deviations), **claude APPROVE
/ HIGH** (converters correct — daf mapping independently verified against external
ground truth, e.g. Hillel's rule at `Shabbat 31a:6`, *lo bashamayim hi* at
`Bava Metzia 59b:5`; five non-blocking findings). I accepted codex's two and
claude's actionable five. No disputes.

## Accepted and fixed

**1. Qur'an citation must be bare `surah:ayah` (codex #1, claude #6).** The plan's
Phase 3 contract is `citation: surah:ayah` (e.g. `1:1`), and that is the universal,
unambiguous Qur'an convention (unlike the D&C case, where a bare `1:1` collides
with Bible chapter:verse, which is why D&C keeps its work prefix). I had
over-applied the Phase-2 self-identifying decision. Reverted:
`convert_quran_qul` now emits `verse_key` verbatim (`1:1` … `114:6`). (Hadith
already matches the plan's "collection + number": `Sahih al-Bukhari 1`.)

**2. en/he Talmud must be distinct versions (codex #2).** Both targets used
`version: William Davidson Edition`, distinguished only by language. The raw files
carry distinct `versionTitle`s. Set the catalogue versions to
`William Davidson Edition - English` and `William Davidson Edition - Aramaic`; a
test now asserts they differ.

**3. Line-numbering-does-not-renumber regression test (claude #1).** The
load-bearing property (a skipped markup-only line must not shift later line
numbers — 207 real Talmud locations, invisible to the aggregate count/first-cite
assertions) now has a 4-line lock: `_talmud("T", [[], [], ["<b></b>", "real"]])`
→ `T 2a:2`.

**4. Language cross-check guard (claude #2).** `convert_sefaria_talmud` now raises
`ConvertError` if a file's own `language` disagrees with the target's — so a
widened glob can't silently mislabel English tractates as `he`. Verified the real
en/he files pass (their `language` fields match). Test covers the mismatch.

**5. Hadith `idInBook` guard (claude #3).** Tightened from `is None` to
`isinstance(number, (str, int))` + non-empty (in the real data `idInBook` is a
string, so an int-only check would be wrong). Test covers a non-scalar id.

**6. Merged-converter diagnostic (claude #4).** `_require_unique_citations` in the
Talmud and NABRE merge paths now names `"<work> [<version>] (merged N files)"`
instead of `paths[0]`, so the message isn't misattributed across a 34-file merge.

## Deferred (noted, with reasons)

- **Skipped-empty-unit counts (claude #5).** 125 empty Malik hadiths and 207
  markup-only Talmud lines are dropped correctly (empty units can't be items); a
  per-target "skipped N" echo belongs with Phase 8's audit/evidence story, where
  conversion auditability is the deliverable. Noted for Phase 8.
- **Talmud scale / sharding (claude #7).** Talmud en is one 47 MB / 78k-entry
  document and `schema.load_documents` is in-memory; the spec permits sharding
  ("one document per Bible book"). This is a Phase 5 (`generate` corpus-wide)
  decision, not Phase 3. Noted for Phase 5 (and the `len(docs)==len(paths)` stem
  heuristic would need care if Talmud is sharded).

## Disagreements

None.
