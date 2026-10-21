| model | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|
| opus | 46% cov 98% (n=119; c/i/r 54/63/2) | 60% cov 92% (n=119; c/i/r 65/44/10) | 68% cov 53% (n=119; c/i/r 43/20/56) | 99% cov 100% (n=119; c/i/r 118/1/0) | **69%** cov 86% (c/i/r 280/128/68) |
| haiku | 33% cov 85% (n=119; c/i/r 33/68/18) | 22% cov 90% (n=119; c/i/r 23/84/12) | 23% cov 33% (n=119; c/i/r 9/30/80) | 95% cov 100% (n=119; c/i/r 113/6/0) | **49%** cov 77% (c/i/r 178/188/110) |
| gpt-oss-20b | 1% cov 98% (n=119; c/i/r 1/116/2) | 0% cov 44% (n=119; c/i/r 0/52/67) | 0% cov 27% (n=119; c/i/r 0/32/87) | 53% cov 100% (n=119; c/i/r 63/56/0) | **20%** cov 67% (c/i/r 64/256/156) |

_Cells: accuracy cov coverage (n answered; c/i/r = correct/incorrect/refused). accuracy = correct/(correct+incorrect) — refusals excluded; coverage = (correct+incorrect)/n; refused_rate = refused/n. `−N` = roster cells that produced no answer (distinct from refused)._

### By tradition (each observation counts once per listed tradition)
| model | tradition | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|---|
| gpt-oss-20b | Judaism | 0% cov 100% (n=7; c/i/r 0/7/0) | 0% cov 57% (n=7; c/i/r 0/4/3) | n/a cov 0% (n=7; c/i/r 0/0/7) | 29% cov 100% (n=7; c/i/r 2/5/0) | **11%** cov 64% (n=28; c/i/r 2/16/10) |
| gpt-oss-20b | Protestant Christian | 0% cov 90% (n=21; c/i/r 0/19/2) | 0% cov 71% (n=21; c/i/r 0/15/6) | 0% cov 81% (n=21; c/i/r 0/17/4) | 57% cov 100% (n=21; c/i/r 12/9/0) | **17%** cov 86% (n=84; c/i/r 12/60/12) |
| gpt-oss-20b | Sunni Islam | 1% cov 100% (n=70; c/i/r 1/69/0) | 0% cov 34% (n=70; c/i/r 0/24/46) | 0% cov 20% (n=70; c/i/r 0/14/56) | 56% cov 100% (n=70; c/i/r 39/31/0) | **22%** cov 64% (n=280; c/i/r 40/138/102) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 100% (n=21; c/i/r 0/21/0) | 0% cov 43% (n=21; c/i/r 0/9/12) | 0% cov 5% (n=21; c/i/r 0/1/20) | 48% cov 100% (n=21; c/i/r 10/11/0) | **19%** cov 62% (n=84; c/i/r 10/42/32) |
| haiku | Judaism | 0% cov 71% (n=7; c/i/r 0/5/2) | 0% cov 71% (n=7; c/i/r 0/5/2) | n/a cov 0% (n=7; c/i/r 0/0/7) | 100% cov 100% (n=7; c/i/r 7/0/0) | **41%** cov 61% (n=28; c/i/r 7/10/11) |
| haiku | Protestant Christian | 95% cov 100% (n=21; c/i/r 20/1/0) | 71% cov 100% (n=21; c/i/r 15/6/0) | 29% cov 100% (n=21; c/i/r 6/15/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | **71%** cov 100% (n=84; c/i/r 60/24/0) |
| haiku | Sunni Islam | 17% cov 77% (n=70; c/i/r 9/45/16) | 3% cov 89% (n=70; c/i/r 2/60/8) | 14% cov 10% (n=70; c/i/r 1/6/63) | 100% cov 100% (n=70; c/i/r 70/0/0) | **42%** cov 69% (n=280; c/i/r 82/111/87) |
| haiku | The Church of Jesus Christ of Latter-Day Saints | 19% cov 100% (n=21; c/i/r 4/17/0) | 32% cov 90% (n=21; c/i/r 6/13/2) | 18% cov 52% (n=21; c/i/r 2/9/10) | 81% cov 100% (n=21; c/i/r 17/4/0) | **40%** cov 86% (n=84; c/i/r 29/43/12) |
| opus | Judaism | 17% cov 86% (n=7; c/i/r 1/5/1) | 17% cov 86% (n=7; c/i/r 1/5/1) | n/a cov 0% (n=7; c/i/r 0/0/7) | 86% cov 100% (n=7; c/i/r 6/1/0) | **42%** cov 68% (n=28; c/i/r 8/11/9) |
| opus | Protestant Christian | 95% cov 100% (n=21; c/i/r 20/1/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **99%** cov 100% (n=84; c/i/r 83/1/0) |
| opus | Sunni Islam | 19% cov 99% (n=70; c/i/r 13/56/1) | 43% cov 87% (n=70; c/i/r 26/35/9) | 10% cov 30% (n=70; c/i/r 2/19/49) | 100% cov 100% (n=70; c/i/r 70/0/0) | **50%** cov 79% (n=280; c/i/r 111/110/59) |
| opus | The Church of Jesus Christ of Latter-Day Saints | 95% cov 100% (n=21; c/i/r 20/1/0) | 81% cov 100% (n=21; c/i/r 17/4/0) | 95% cov 100% (n=21; c/i/r 20/1/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **93%** cov 100% (n=84; c/i/r 78/6/0) |

### By text (one text = one work · version · language)

**gpt-oss-20b**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 17% | 64% | 10 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 22% | 64% | 10 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 21% | 68% | 9 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 11% | 68% | 9 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 16% | 68% | 9 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 19% | 57% | 12 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 28% | 64% | 10 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 17% | 64% | 10 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 18% | 61% | 11 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 20% | 54% | 13 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 32% | 68% | 9 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 41% | 61% | 11 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 11% | 64% | 10 | — |
| The Bible (ASV (1901), en) | 28 | 25% | 86% | 4 | — |
| The Bible (KJV, en) | 28 | 12% | 86% | 4 | — |
| The Bible (WEB, en) | 28 | 12% | 86% | 4 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 24% | 61% | 11 | — |

**haiku**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 36% | 79% | 6 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 40% | 89% | 3 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 38% | 75% | 7 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 44% | 57% | 12 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 44% | 57% | 12 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 44% | 89% | 3 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 39% | 64% | 10 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 42% | 68% | 9 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 35% | 71% | 8 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 50% | 50% | 14 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 35% | 71% | 8 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 41% | 61% | 11 | — |
| The Bible (ASV (1901), en) | 28 | 68% | 100% | 0 | — |
| The Bible (KJV, en) | 28 | 86% | 100% | 0 | — |
| The Bible (WEB, en) | 28 | 61% | 100% | 0 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 61% | 100% | 0 | — |

**opus**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 93% | 100% | 0 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 89% | 100% | 0 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 55% | 79% | 6 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 37% | 68% | 9 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 50% | 79% | 6 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 96% | 100% | 0 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 43% | 75% | 7 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 36% | 100% | 0 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 64% | 79% | 6 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 48% | 75% | 7 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 47% | 61% | 11 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 42% | 68% | 9 | — |
| The Bible (ASV (1901), en) | 28 | 96% | 100% | 0 | — |
| The Bible (KJV, en) | 28 | 100% | 100% | 0 | — |
| The Bible (WEB, en) | 28 | 100% | 100% | 0 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 82% | 100% | 0 | — |

### Panel composition (committed-artifact proof — provider / model / tools / endpoint, no secrets)
| model_id | provider | model | tools | endpoint | served_by |
|---|---|---|---|---|---|
| gpt-oss-20b | openai | openai/gpt-oss-20b | — | openrouter.ai | AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Groq, Parasail, SiliconFlow |
| haiku | openai | anthropic/claude-haiku-5-5 | — | openrouter.ai | Claude Platform on AWS |
| opus | openai | anthropic/claude-opus-5-5 | — | openrouter.ai | Amazon Bedrock, Claude Platform on AWS |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| gpt-oss-20b | 476 | 93,811 | 796,291 |
| haiku | 476 | 100,164 | 280,123 |
| opus | 476 | 100,164 | 212,214 |
| **total** | 1428 | 294,139 | 1,288,628 |
