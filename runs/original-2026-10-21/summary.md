| model | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|
| opus | 45% cov 98% (n=119; c/i/r 53/64/2) | 62% cov 92% (n=119; c/i/r 68/42/9) | 67% cov 50% (n=119; c/i/r 40/20/59) | 98% cov 100% (n=119; c/i/r 117/2/0) | **68%** cov 85% (c/i/r 278/128/70) |
| haiku | 34% cov 87% (n=119; c/i/r 35/69/15) | 19% cov 86% (n=119; c/i/r 19/83/17) | 32% cov 31% (n=119; c/i/r 12/25/82) | 95% cov 100% (n=119; c/i/r 113/6/0) | **49%** cov 76% (c/i/r 179/183/114) |
| gpt-oss-20b | 1% cov 99% (n=118; c/i/r 1/116/1) −1 | 0% cov 40% (n=119; c/i/r 0/48/71) | 0% cov 20% (n=119; c/i/r 0/24/95) | 56% cov 100% (n=119; c/i/r 67/52/0) | **22%** cov 65% (c/i/r 68/240/167) −1 |

_Cells: accuracy cov coverage (n answered; c/i/r = correct/incorrect/refused). accuracy = correct/(correct+incorrect) — refusals excluded; coverage = (correct+incorrect)/n; refused_rate = refused/n. `−N` = roster cells that produced no answer (distinct from refused)._

### By tradition (each observation counts once per listed tradition)
| model | tradition | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|---|
| gpt-oss-20b | Judaism | 0% cov 100% (n=6; c/i/r 0/6/0) −1 | 0% cov 14% (n=7; c/i/r 0/1/6) | 0% cov 14% (n=7; c/i/r 0/1/6) | 29% cov 100% (n=7; c/i/r 2/5/0) | **13%** cov 56% (n=27; c/i/r 2/13/12) |
| gpt-oss-20b | Protestant Christian | 5% cov 95% (n=21; c/i/r 1/19/1) | 0% cov 86% (n=21; c/i/r 0/18/3) | 0% cov 57% (n=21; c/i/r 0/12/9) | 48% cov 100% (n=21; c/i/r 10/11/0) | **15%** cov 85% (n=84; c/i/r 11/60/13) |
| gpt-oss-20b | Sunni Islam | 0% cov 100% (n=70; c/i/r 0/70/0) | 0% cov 30% (n=70; c/i/r 0/21/49) | 0% cov 16% (n=70; c/i/r 0/11/59) | 64% cov 100% (n=70; c/i/r 45/25/0) | **26%** cov 61% (n=280; c/i/r 45/127/108) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 100% (n=21; c/i/r 0/21/0) | 0% cov 38% (n=21; c/i/r 0/8/13) | n/a cov 0% (n=21; c/i/r 0/0/21) | 48% cov 100% (n=21; c/i/r 10/11/0) | **20%** cov 60% (n=84; c/i/r 10/40/34) |
| haiku | Judaism | 0% cov 100% (n=7; c/i/r 0/7/0) | 0% cov 100% (n=7; c/i/r 0/7/0) | n/a cov 0% (n=7; c/i/r 0/0/7) | 86% cov 100% (n=7; c/i/r 6/1/0) | **29%** cov 75% (n=28; c/i/r 6/15/7) |
| haiku | Protestant Christian | 90% cov 100% (n=21; c/i/r 19/2/0) | 52% cov 100% (n=21; c/i/r 11/10/0) | 52% cov 100% (n=21; c/i/r 11/10/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | **71%** cov 100% (n=84; c/i/r 60/24/0) |
| haiku | Sunni Islam | 14% cov 80% (n=70; c/i/r 8/48/14) | 8% cov 76% (n=70; c/i/r 4/49/17) | 0% cov 10% (n=70; c/i/r 0/7/63) | 99% cov 100% (n=70; c/i/r 69/1/0) | **44%** cov 66% (n=280; c/i/r 81/105/94) |
| haiku | The Church of Jesus Christ of Latter-Day Saints | 40% cov 95% (n=21; c/i/r 8/12/1) | 19% cov 100% (n=21; c/i/r 4/17/0) | 11% cov 43% (n=21; c/i/r 1/8/12) | 90% cov 100% (n=21; c/i/r 19/2/0) | **45%** cov 85% (n=84; c/i/r 32/39/13) |
| opus | Judaism | 0% cov 100% (n=7; c/i/r 0/7/0) | 0% cov 71% (n=7; c/i/r 0/5/2) | n/a cov 0% (n=7; c/i/r 0/0/7) | 86% cov 100% (n=7; c/i/r 6/1/0) | **32%** cov 68% (n=28; c/i/r 6/13/9) |
| opus | Protestant Christian | 100% cov 100% (n=21; c/i/r 21/0/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **98%** cov 100% (n=84; c/i/r 82/2/0) |
| opus | Sunni Islam | 18% cov 97% (n=70; c/i/r 12/56/2) | 44% cov 90% (n=70; c/i/r 28/35/7) | 17% cov 26% (n=70; c/i/r 3/15/52) | 99% cov 100% (n=70; c/i/r 69/1/0) | **51%** cov 78% (n=280; c/i/r 112/107/61) |
| opus | The Church of Jesus Christ of Latter-Day Saints | 95% cov 100% (n=21; c/i/r 20/1/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | 86% cov 100% (n=21; c/i/r 18/3/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **93%** cov 100% (n=84; c/i/r 78/6/0) |

### By text (one text = one work · version · language)

**gpt-oss-20b**
| text | n | accuracy | coverage | refused |
|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 17% | 64% | 10 |
| Doctrine and Covenants (2013 edition, en) | 28 | 17% | 64% | 10 |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 24% | 61% | 11 |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 26% | 68% | 9 |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 15% | 71% | 8 |
| Pearl of Great Price (2013 edition, en) | 28 | 29% | 50% | 14 |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 41% | 61% | 11 |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 33% | 54% | 13 |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 29% | 50% | 14 |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 21% | 68% | 9 |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 18% | 61% | 11 |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 33% | 54% | 13 |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 27 | 13% | 56% | 12 |
| The Bible (ASV (1901), en) | 28 | 19% | 75% | 7 |
| The Bible (KJV, en) | 28 | 16% | 89% | 3 |
| The Bible (WEB, en) | 28 | 12% | 89% | 3 |
| The Qur'an (Uthmani (QUL), ar) | 28 | 26% | 68% | 9 |

**haiku**
| text | n | accuracy | coverage | refused |
|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 32% | 89% | 3 |
| Doctrine and Covenants (2013 edition, en) | 28 | 45% | 79% | 6 |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 50% | 50% | 14 |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 47% | 54% | 13 |
| Pearl of Great Price (2013 edition, en) | 28 | 58% | 86% | 4 |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 37% | 68% | 9 |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 47% | 61% | 11 |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 37% | 68% | 9 |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 43% | 50% | 14 |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 44% | 64% | 10 |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 29% | 75% | 7 |
| The Bible (ASV (1901), en) | 28 | 57% | 100% | 0 |
| The Bible (KJV, en) | 28 | 100% | 100% | 0 |
| The Bible (WEB, en) | 28 | 57% | 100% | 0 |
| The Qur'an (Uthmani (QUL), ar) | 28 | 61% | 100% | 0 |

**opus**
| text | n | accuracy | coverage | refused |
|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 93% | 100% | 0 |
| Doctrine and Covenants (2013 edition, en) | 28 | 86% | 100% | 0 |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 39% | 82% | 5 |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 35% | 71% | 8 |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 62% | 75% | 7 |
| Pearl of Great Price (2013 edition, en) | 28 | 100% | 100% | 0 |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 45% | 79% | 6 |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 46% | 93% | 2 |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 48% | 75% | 7 |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 43% | 75% | 7 |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 47% | 61% | 11 |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 50% | 71% | 8 |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 32% | 68% | 9 |
| The Bible (ASV (1901), en) | 28 | 100% | 100% | 0 |
| The Bible (KJV, en) | 28 | 100% | 100% | 0 |
| The Bible (WEB, en) | 28 | 93% | 100% | 0 |
| The Qur'an (Uthmani (QUL), ar) | 28 | 86% | 100% | 0 |

### Panel composition (committed-artifact proof — provider / model / tools / endpoint, no secrets)
| model_id | provider | model | tools | endpoint | served_by |
|---|---|---|---|---|---|
| gpt-oss-20b | openai | openai/gpt-oss-20b | — | openrouter.ai | AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Groq, Parasail, SiliconFlow |
| haiku | openai | anthropic/claude-haiku-5-5 | — | openrouter.ai | Claude Platform on AWS |
| opus | openai | anthropic/claude-opus-5-5 | — | openrouter.ai | Amazon Bedrock, Claude Platform on AWS |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| gpt-oss-20b | 475 | 95,000 | 786,573 |
| haiku | 476 | 101,839 | 275,425 |
| opus | 476 | 101,839 | 218,733 |
| **total** | 1427 | 298,678 | 1,280,731 |
