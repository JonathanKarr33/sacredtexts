# Benchmark card

Extra reading. The headline correct bit is unchanged. A tradition percentage is the slice that was asked, not a measure of a faith.

## Claim

Of 400 answers, 25 are an exact recitation of the named edition. The full split is 25 exact recitation of the named edition, 1 right verse with extra words, 1 another tradition's wording, 4 another edition, 20 near miss, 136 refusal, 213 fluent text that is not an indexed wording. By license: 1 of 224 open answers are exact; 24 of 176 public-domain answers are exact.

## What would make this claim fail

- Questions in this draw: en 100. Catalogue languages with no questions: ar 0, he 0.
- Tasks scored: retrieve_quote. The generator can also build identify_version, verify_source (including false premises), complete_unit, cite_passage, and identify_source.
- 24 questions use a string that is also a passage of another tradition. An exact match on those questions is that shared string.
- One seeded draw. This card carries no estimate of how the mix would move under another seed.
- Scholar and community review is an empty seat. The labels are pipeline records.
- Temperature is absent from the answer rows. The example panel for a later collection pins temperature 0. This collection was left as it was stored.
- gpt-oss-20b lists 9 serving hosts in the panel record (AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Parasail, SiliconFlow). Each answer row leaves the host unnamed.
- llama-3.1-8b lists 3 serving hosts in the panel record (DeepInfra, Groq, Novita). Each answer row leaves the host unnamed.

## What this card will not conclude

- A tradition column counts the questions that named that tradition.
- Exact-match order puts a refusal and a fabrication in the same zero.
- The community-review line records an empty seat.
- The mix describes this panel on the tasks that were scored.

## What this score is for

- See whether a model recited the edition the prompt named.
- Separate a refusal from a fluent wrong verse, a right verse with extra words, and another indexed edition.
- See how many Bible misses would pass if every indexed edition of that citation were gold.
- See who the questions represent, by tradition, language, document type, and license.

## What this score is not for

- The headline percentage does not rank traditions and does not measure knowledge of a faith.
- A tradition column is the slice that was asked, which may be encyclicals or an English Talmud rather than that community's scripture.
- The card is not a community adjudication. Scholar review is not attached.
- Jev, when run, is a closed-question probability. It is not a scholar of any tradition in the set.
- Restricted sources (NABRE, Greek Orthodox extracts) are not in the questions.

Community review: Not attached. The decisions in this card are pipeline records.

## Who the questions are

100 questions. Traditions: Judaism 25, Protestant Christian 25, Roman Catholic 25, The Church of Jesus Christ of Latter-Day Saints 25.
Languages (a language with no questions is a count of 0): ar 0, en 100, he 0.
Document types: encyclical 25, scripture 50, talmud 25.
Licenses: open 56, public-domain 44.
24 questions use a string that is also a passage of another tradition. Quoting those words under either citation is faithful to the index.

## What each answer was

400 answers. exact 25, right_verse_plus_extra 1, other_tradition 1, other_edition 4, near_miss 20, refusal 136, empty 0, fabrication 213.

Of 176 Bible answers, 25 contain the edition that was asked for, and 29 contain some indexed edition of that citation. 4 miss the headline and still contain another indexed edition.

### By model

- **claude-haiku**: 24/100 exact. exact 24, right_verse_plus_extra 1, other_tradition 1, other_edition 2, near_miss 16, refusal 55, empty 0, fabrication 1.
- **gemma-3-4b**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 0, empty 0, fabrication 100.
- **gpt-oss-20b**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 3, refusal 66, empty 0, fabrication 31.
- **llama-3.1-8b**: 1/100 exact. exact 1, right_verse_plus_extra 0, other_tradition 0, other_edition 2, near_miss 1, refusal 15, empty 0, fabrication 81.

### By tradition

- **Judaism**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 65, empty 0, fabrication 35.
- **Protestant Christian**: 6/100 exact. exact 6, right_verse_plus_extra 0, other_tradition 1, other_edition 4, near_miss 17, refusal 5, empty 0, fabrication 67.
- **Roman Catholic**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 48, empty 0, fabrication 52.
- **The Church of Jesus Christ of Latter-Day Saints**: 19/100 exact. exact 19, right_verse_plus_extra 1, other_tradition 0, other_edition 0, near_miss 3, refusal 18, empty 0, fabrication 59.

### By license

- **open**: 1/224 exact. exact 1, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 124, empty 0, fabrication 99.
- **public-domain**: 24/176 exact. exact 24, right_verse_plus_extra 1, other_tradition 1, other_edition 4, near_miss 20, refusal 12, empty 0, fabrication 114.

### By document type

- **encyclical**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 48, empty 0, fabrication 52.
- **scripture**: 25/200 exact. exact 25, right_verse_plus_extra 1, other_tradition 1, other_edition 4, near_miss 20, refusal 23, empty 0, fabrication 126.
- **talmud**: 0/100 exact. exact 0, right_verse_plus_extra 0, other_tradition 0, other_edition 0, near_miss 0, refusal 65, empty 0, fabrication 35.

## Folding rules on KJV, ASV, and WEB

- (chosen) case and punctuation folded (the scorer's normalize): 410 of 31095 agree.
- (alternate) also fold Lord, Jehovah, and Yahweh: 410 of 31095 agree.
- (alternate) also delete hyphens before folding: 412 of 31095 agree.

This run scored: retrieve_quote.
The generator can also build identify_version, verify_source (including false premises), complete_unit, cite_passage, and identify_source.
