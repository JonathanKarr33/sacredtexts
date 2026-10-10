# CEFE_data — English Bible translations (flat JSON)

Three public-domain English translations, one JSON file each, all in the same format.
Built 2026-08-20.

## Format

Each file is a single JSON array, one verse record per line:

```json
{"book": "Genesis", "chapter": 1, "verse": 1, "text": "..."}
```

- `book` — full English book name (`"Genesis"`, `"1 Samuel"`, `"Song of Solomon"`)
- records appear in Protestant canon order (Genesis … Malachi, Matthew … Revelation)
- `chapter`, `verse` — integers
- `text` — verse text, whitespace-normalized (UTF-8; WEB uses curly quotes)

Load with `pandas.read_json("kjv.json")` or `json.load()`.

## Files & sources

| File | Translation | Verses | Source |
|------|-------------|--------|--------|
| `asv.json` | American Standard Version (1901) | 31,102 | github.com/bibleapi/bibleapi-bibles-json (`resultset/row/field` dump) |
| `kjv.json` | King James Version | 31,102 | github.com/bibleapi/bibleapi-bibles-json (`resultset/row/field` dump) |
| `web.json` | World English Bible | 31,098 | github.com/TehShrike/world-english-bible (per-book chunk JSON, concatenated per verse) |

## Cleaning notes

- ASV/KJV: dropped one padding row each — 3 John 1:15 with literal text `"[]"` (the real
  closing text is already in 3 John 1:14 in those dumps).
- WEB: dropped 5 verses the translation itself omits (empty placeholders in the source):
  Luke 17:36, Acts 8:37, Acts 15:34, Acts 24:7, Romans 16:25.
- WEB versification: the Romans doxology appears as Rom 14:24–26 (not 16:25–27);
  3 John ends at v14 (KJV/ASV dumps end at v15/v14+padding).
## Text fidelity

Verse texts are kept exactly as received from their source dumps (apart from whitespace
normalization). The ONLY textual modification is the psalm-superscription handling below.
In particular, the bibleapi KJV's inconsistent divine-name casing (e.g. Ps 3:1 "Lord" vs
Ps 23:1 "LORD"; Gen 15:2 "LORD God" where print editions have "Lord GOD") is preserved
as-is, by decision.

## Psalm superscriptions

All three files include the superscriptions ("A Psalm of David…") of the 116 titled psalms
at the START of verse 1 of their psalm. The 34 untitled psalms
(1, 2, 10, 33, 43, 71, 91, 93–97, 99, 104–107, 111–119, 135–137, 146–150) have none.

How each source represented them, and what was done:

- ASV dump: glued onto the END of the previous psalm's last verse after a `Psalm N` marker
  (e.g. Ps 2:12 ended "…refuge in him. Psalm 3 A Psalm of David, when he fled…").
  All 115 were split off and moved to verse 1 of their own psalm; one stray bare marker
  ("Psalm 118", an untitled psalm) was stripped from Ps 117:2. The dump was missing
  Ps 86's superscription — restored manually as "A Prayer of David." per the printed ASV.
- WEB source: unversed `{"type": "header"}` chunks preceding each titled psalm's first
  verse; all 116 prepended to verse 1.
- KJV dump: superscriptions appear nowhere in the bibleapi source. All 116 were merged in
  from a second public-domain source: the eBible.org KJV in USFM
  (ebible.org/Scriptures/eng-kjv_usfm.zip, `\d` lines in `20-PSAeng-kjv.usfm`,
  Strong's/footnote markup stripped). Titles are genuine KJV wording
  (e.g. Ps 120 "A Song of degrees." vs ASV/WEB "A Song of Ascents.").
- Ps 119 acrostic letter headings: ASV embeds them natively in verse text
  ("ALEPH. Blessed are they…" at vv. 1, 9, 17, …) — kept as-is. WEB has them as
  22 `header` chunks (ALEPH, BET, …) — excluded, since they are stanza markers,
  not superscriptions. KJV sources have none.
