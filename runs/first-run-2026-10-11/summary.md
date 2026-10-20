| model | retrieve_quote | overall |
|---|---|---|
| claude-haiku | 56% cov 45% (n=100; c/i/r 25/20/55) | **56%** cov 45% (c/i/r 25/20/55) |
| llama-3.1-8b | 1% cov 80% (n=100; c/i/r 1/79/20) | **1%** cov 80% (c/i/r 1/79/20) |
| gemma-3-4b | 0% cov 100% (n=100; c/i/r 0/100/0) | **0%** cov 100% (c/i/r 0/100/0) |
| gpt-oss-20b | 0% cov 34% (n=100; c/i/r 0/34/66) | **0%** cov 34% (c/i/r 0/34/66) |

_Cells: accuracy cov coverage (n answered; c/i/r = correct/incorrect/refused). accuracy = correct/(correct+incorrect) — refusals excluded; coverage = (correct+incorrect)/n; refused_rate = refused/n. `−N` = roster cells that produced no answer (distinct from refused)._

### By tradition (each observation counts once per listed tradition)
| model | tradition | retrieve_quote | overall |
|---|---|---|---|
| claude-haiku | Judaism | n/a cov 0% (n=25; c/i/r 0/0/25) | **n/a** cov 0% (n=25; c/i/r 0/0/25) |
| claude-haiku | Protestant Christian | 24% cov 100% (n=25; c/i/r 6/19/0) | **24%** cov 100% (n=25; c/i/r 6/19/0) |
| claude-haiku | Roman Catholic | n/a cov 0% (n=25; c/i/r 0/0/25) | **n/a** cov 0% (n=25; c/i/r 0/0/25) |
| claude-haiku | The Church of Jesus Christ of Latter-Day Saints | 95% cov 80% (n=25; c/i/r 19/1/5) | **95%** cov 80% (n=25; c/i/r 19/1/5) |
| gemma-3-4b | Judaism | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| gemma-3-4b | Protestant Christian | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| gemma-3-4b | Roman Catholic | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| gemma-3-4b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| gpt-oss-20b | Judaism | n/a cov 0% (n=25; c/i/r 0/0/25) | **n/a** cov 0% (n=25; c/i/r 0/0/25) |
| gpt-oss-20b | Protestant Christian | 0% cov 80% (n=25; c/i/r 0/20/5) | **0%** cov 80% (n=25; c/i/r 0/20/5) |
| gpt-oss-20b | Roman Catholic | 0% cov 8% (n=25; c/i/r 0/2/23) | **0%** cov 8% (n=25; c/i/r 0/2/23) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 48% (n=25; c/i/r 0/12/13) | **0%** cov 48% (n=25; c/i/r 0/12/13) |
| llama-3.1-8b | Judaism | 0% cov 24% (n=25; c/i/r 0/6/19) | **0%** cov 24% (n=25; c/i/r 0/6/19) |
| llama-3.1-8b | Protestant Christian | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| llama-3.1-8b | Roman Catholic | 0% cov 100% (n=25; c/i/r 0/25/0) | **0%** cov 100% (n=25; c/i/r 0/25/0) |
| llama-3.1-8b | The Church of Jesus Christ of Latter-Day Saints | 4% cov 96% (n=25; c/i/r 1/23/1) | **4%** cov 96% (n=25; c/i/r 1/23/1) |

### Panel composition (committed-artifact proof — provider / model / tools / endpoint, no secrets)
| model_id | provider | model | tools | endpoint | served_by |
|---|---|---|---|---|---|
| claude-haiku | anthropic | claude-haiku-5-5 | — | api.anthropic.com | — |
| gemma-3-4b | openai | google/gemma-3-4b-it | — | openrouter.ai | DeepInfra |
| gpt-oss-20b | openai | openai/gpt-oss-20b | — | openrouter.ai | AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Parasail, SiliconFlow |
| llama-3.1-8b | openai | meta-llama/llama-3.1-8b-instruct | — | openrouter.ai | DeepInfra, Groq, Novita |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| claude-haiku | 100 | 5,810 | 41,140 |
| gemma-3-4b | 100 | 4,615 | 6,252 |
| gpt-oss-20b | 100 | 10,080 | 80,188 |
| llama-3.1-8b | 100 | 4,715 | 6,551 |
| **total** | 400 | 25,220 | 134,131 |
