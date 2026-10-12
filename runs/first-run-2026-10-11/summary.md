| model | retrieve_quote | overall |
|---|---|---|
| claude-haiku | 56% cov 45% (n=100) | **56%** cov 45% |
| llama-3.1-8b | 1% cov 82% (n=100) | **1%** cov 82% |
| gemma-3-4b | 0% cov 100% (n=100) | **0%** cov 100% |
| gpt-oss-20b | 0% cov 34% (n=100) | **0%** cov 34% |

### By tradition (each observation counts once per listed tradition)
| model | tradition | retrieve_quote | overall |
|---|---|---|---|
| claude-haiku | Judaism | n/a cov 0% (n=25) | **n/a** cov 0% (n=25) |
| claude-haiku | Protestant Christian | 24% cov 100% (n=25) | **24%** cov 100% (n=25) |
| claude-haiku | Roman Catholic | n/a cov 0% (n=25) | **n/a** cov 0% (n=25) |
| claude-haiku | The Church of Jesus Christ of Latter-Day Saints | 95% cov 80% (n=25) | **95%** cov 80% (n=25) |
| gemma-3-4b | Judaism | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| gemma-3-4b | Protestant Christian | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| gemma-3-4b | Roman Catholic | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| gemma-3-4b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| gpt-oss-20b | Judaism | n/a cov 0% (n=25) | **n/a** cov 0% (n=25) |
| gpt-oss-20b | Protestant Christian | 0% cov 80% (n=25) | **0%** cov 80% (n=25) |
| gpt-oss-20b | Roman Catholic | 0% cov 8% (n=25) | **0%** cov 8% (n=25) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% cov 48% (n=25) | **0%** cov 48% (n=25) |
| llama-3.1-8b | Judaism | 0% cov 32% (n=25) | **0%** cov 32% (n=25) |
| llama-3.1-8b | Protestant Christian | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| llama-3.1-8b | Roman Catholic | 0% cov 100% (n=25) | **0%** cov 100% (n=25) |
| llama-3.1-8b | The Church of Jesus Christ of Latter-Day Saints | 4% cov 96% (n=25) | **4%** cov 96% (n=25) |

### Panel composition (committed-artifact proof — provider / model / endpoint, no secrets)
| model_id | provider | model | endpoint | served_by |
|---|---|---|---|---|
| claude-haiku | anthropic | claude-haiku-5-5 | api.anthropic.com | — |
| gemma-3-4b | openai | google/gemma-3-4b-it | openrouter.ai | DeepInfra |
| gpt-oss-20b | openai | openai/gpt-oss-20b | openrouter.ai | AkashML, Amazon Bedrock, CoreWeave, Darkbloom, DeepInfra, DekaLLM, Google, Parasail, SiliconFlow |
| llama-3.1-8b | openai | meta-llama/llama-3.1-8b-instruct | openrouter.ai | DeepInfra, Groq, Novita |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| claude-haiku | 100 | 5,810 | 41,140 |
| gemma-3-4b | 100 | 4,615 | 6,252 |
| gpt-oss-20b | 100 | 10,080 | 80,188 |
| llama-3.1-8b | 100 | 4,715 | 6,551 |
| **total** | 400 | 25,220 | 134,131 |
