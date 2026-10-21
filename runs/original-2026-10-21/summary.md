| model | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|
| opus | 45% cov 98% (n=119; c/i/r 53/64/2) | 65% cov 93% (n=119; c/i/r 72/39/8) | 64% cov 51% (n=119; c/i/r 39/22/58) | 99% cov 100% (n=119; c/i/r 118/1/0) | **69%** cov 86% (c/i/r 282/126/68) |
| haiku | 35% cov 84% (n=119; c/i/r 35/65/19) | 19% cov 87% (n=119; c/i/r 20/84/15) | 37% cov 29% (n=119; c/i/r 13/22/84) | 97% cov 100% (n=119; c/i/r 115/4/0) | **51%** cov 75% (c/i/r 183/175/118) |
| gpt-oss-20b | 3% cov 98% (n=119; c/i/r 3/114/2) | 0% cov 38% (n=119; c/i/r 0/45/74) | 0% cov 24% (n=119; c/i/r 0/28/91) | 57% cov 100% (n=119; c/i/r 68/51/0) | **23%** cov 65% (c/i/r 71/238/167) |

_Cells: accuracy cov coverage (n answered; c/i/r = correct/incorrect/refused). accuracy = correct/(correct+incorrect) — refusals excluded; coverage = (correct+incorrect)/n; refused_rate = refused/n. `−N` = roster cells that produced no answer (distinct from refused)._

### By tradition (each observation counts once per listed tradition)
| model | tradition | cite_passage | complete_unit | retrieve_quote | verify_source | overall |
|---|---|---|---|---|---|---|
| gpt-oss-20b | Judaism | 0% cov 100% (n=7; c/i/r 0/7/0) | 0% cov 29% (n=7; c/i/r 0/2/5) | 0% cov 14% (n=7; c/i/r 0/1/6) | 43% cov 100% (n=7; c/i/r 3/4/0) | **18%** cov 61% (n=28; c/i/r 3/14/11) |
| gpt-oss-20b | Protestant Christian | 15% cov 95% (n=21; c/i/r 3/17/1) | 0% cov 86% (n=21; c/i/r 0/18/3) | 0% cov 67% (n=21; c/i/r 0/14/7) | 62% cov 100% (n=21; c/i/r 13/8/0) | **22%** cov 87% (n=84; c/i/r 16/57/11) |
| gpt-oss-20b | Sunni Islam | 0% cov 100% (n=70; c/i/r 0/70/0) | 0% cov 31% (n=70; c/i/r 0/22/48) | 0% cov 16% (n=70; c/i/r 0/11/59) | 59% cov 100% (n=70; c/i/r 41/29/0) | **24%** cov 62% (n=280; c/i/r 41/132/107) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 95% (n=21; c/i/r 0/20/1) | 0% cov 14% (n=21; c/i/r 0/3/18) | 0% cov 10% (n=21; c/i/r 0/2/19) | 52% cov 100% (n=21; c/i/r 11/10/0) | **24%** cov 55% (n=84; c/i/r 11/35/38) |
| haiku | Judaism | 0% cov 86% (n=7; c/i/r 0/6/1) | 0% cov 86% (n=7; c/i/r 0/6/1) | n/a cov 0% (n=7; c/i/r 0/0/7) | 100% cov 100% (n=7; c/i/r 7/0/0) | **37%** cov 68% (n=28; c/i/r 7/12/9) |
| haiku | Protestant Christian | 90% cov 100% (n=21; c/i/r 19/2/0) | 52% cov 100% (n=21; c/i/r 11/10/0) | 52% cov 100% (n=21; c/i/r 11/10/0) | 95% cov 100% (n=21; c/i/r 20/1/0) | **73%** cov 100% (n=84; c/i/r 61/23/0) |
| haiku | Sunni Islam | 17% cov 74% (n=70; c/i/r 9/43/18) | 7% cov 80% (n=70; c/i/r 4/52/14) | 29% cov 10% (n=70; c/i/r 2/5/63) | 99% cov 100% (n=70; c/i/r 69/1/0) | **45%** cov 66% (n=280; c/i/r 84/101/95) |
| haiku | The Church of Jesus Christ of Latter-Day Saints | 33% cov 100% (n=21; c/i/r 7/14/0) | 24% cov 100% (n=21; c/i/r 5/16/0) | 0% cov 33% (n=21; c/i/r 0/7/14) | 90% cov 100% (n=21; c/i/r 19/2/0) | **44%** cov 83% (n=84; c/i/r 31/39/14) |
| opus | Judaism | 0% cov 100% (n=7; c/i/r 0/7/0) | 0% cov 86% (n=7; c/i/r 0/6/1) | n/a cov 0% (n=7; c/i/r 0/0/7) | 86% cov 100% (n=7; c/i/r 6/1/0) | **30%** cov 71% (n=28; c/i/r 6/14/8) |
| opus | Protestant Christian | 100% cov 100% (n=21; c/i/r 21/0/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | 86% cov 100% (n=21; c/i/r 18/3/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **96%** cov 100% (n=84; c/i/r 81/3/0) |
| opus | Sunni Islam | 18% cov 97% (n=70; c/i/r 12/56/2) | 51% cov 90% (n=70; c/i/r 32/31/7) | 11% cov 27% (n=70; c/i/r 2/17/51) | 100% cov 100% (n=70; c/i/r 70/0/0) | **53%** cov 79% (n=280; c/i/r 116/104/60) |
| opus | The Church of Jesus Christ of Latter-Day Saints | 95% cov 100% (n=21; c/i/r 20/1/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | 90% cov 100% (n=21; c/i/r 19/2/0) | 100% cov 100% (n=21; c/i/r 21/0/0) | **94%** cov 100% (n=84; c/i/r 79/5/0) |

### By text (one text = one work · version · language)

**gpt-oss-20b**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 20% | 54% | 13 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 24% | 61% | 11 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 21% | 68% | 9 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 31% | 57% | 12 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 21% | 68% | 9 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 29% | 50% | 14 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 24% | 61% | 11 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 20% | 54% | 13 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 24% | 61% | 11 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 21% | 68% | 9 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 22% | 64% | 10 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 25% | 57% | 12 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 18% | 61% | 11 | — |
| The Bible (ASV (1901), en) | 28 | 24% | 89% | 3 | — |
| The Bible (KJV, en) | 28 | 21% | 86% | 4 | — |
| The Bible (WEB, en) | 28 | 21% | 86% | 4 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 29% | 61% | 11 | — |

**haiku**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 40% | 89% | 3 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 32% | 79% | 6 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 43% | 50% | 14 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 44% | 57% | 12 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 61% | 82% | 5 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 35% | 71% | 8 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 50% | 57% | 12 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 37% | 68% | 9 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 58% | 43% | 16 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 50% | 64% | 10 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 37% | 68% | 9 | — |
| The Bible (ASV (1901), en) | 28 | 64% | 100% | 0 | — |
| The Bible (KJV, en) | 28 | 100% | 100% | 0 | — |
| The Bible (WEB, en) | 28 | 54% | 100% | 0 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 68% | 100% | 0 | — |

**opus**
| text | n | accuracy | coverage | refused | missing |
|---|---|---|---|---|---|
| Book of Mormon (2013 edition, en) | 28 | 93% | 100% | 0 | — |
| Doctrine and Covenants (2013 edition, en) | 28 | 93% | 100% | 0 | — |
| Jami` at-Tirmidhi (sunnah.com Arabic, ar) | 28 | 43% | 82% | 5 | — |
| Musnad Ahmad (sunnah.com Arabic, ar) | 28 | 33% | 75% | 7 | — |
| Muwatta Malik (sunnah.com Arabic, ar) | 28 | 57% | 75% | 7 | — |
| Pearl of Great Price (2013 edition, en) | 28 | 96% | 100% | 0 | — |
| Sahih Muslim (sunnah.com Arabic, ar) | 28 | 55% | 79% | 6 | — |
| Sahih al-Bukhari (sunnah.com Arabic, ar) | 28 | 44% | 89% | 3 | — |
| Sunan Abi Dawud (sunnah.com Arabic, ar) | 28 | 48% | 75% | 7 | — |
| Sunan Ibn Majah (sunnah.com Arabic, ar) | 28 | 52% | 75% | 7 | — |
| Sunan al-Darimi (sunnah.com Arabic, ar) | 28 | 47% | 61% | 11 | — |
| Sunan an-Nasa'i (sunnah.com Arabic, ar) | 28 | 57% | 75% | 7 | — |
| Talmud Bavli (William Davidson Edition - Aramaic, he) | 28 | 30% | 71% | 8 | — |
| The Bible (ASV (1901), en) | 28 | 100% | 100% | 0 | — |
| The Bible (KJV, en) | 28 | 100% | 100% | 0 | — |
| The Bible (WEB, en) | 28 | 89% | 100% | 0 | — |
| The Qur'an (Uthmani (QUL), ar) | 28 | 82% | 100% | 0 | — |

### Panel composition (committed-artifact proof — provider / model / tools / endpoint, no secrets)
| model_id | provider | model | tools | endpoint | served_by |
|---|---|---|---|---|---|
| gpt-oss-20b | openai | openai/gpt-oss-20b | — | openrouter.ai | AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Groq, Parasail, SiliconFlow |
| haiku | openai | anthropic/claude-haiku-5-5 | — | openrouter.ai | Claude Platform on AWS |
| opus | openai | anthropic/claude-opus-5-5 | — | openrouter.ai | Claude Platform on AWS |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| gpt-oss-20b | 476 | 94,828 | 780,189 |
| haiku | 476 | 102,121 | 276,482 |
| opus | 476 | 102,121 | 219,260 |
| **total** | 1428 | 299,070 | 1,275,931 |
