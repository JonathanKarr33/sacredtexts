| model | retrieve_quote | overall |
|---|---|---|
| claude-haiku | 24% (n=100) | **24%** |
| llama-3.1-8b | 1% (n=100) | **1%** |
| gemma-3-4b | 0% (n=100) | **0%** |
| gpt-oss-20b | 0% (n=100) | **0%** |

### By tradition (each observation counts once per listed tradition)
| model | tradition | retrieve_quote | overall |
|---|---|---|---|
| claude-haiku | Judaism | 0% (n=25) | **0%** (n=25) |
| claude-haiku | Protestant Christian | 24% (n=25) | **24%** (n=25) |
| claude-haiku | Roman Catholic | 0% (n=25) | **0%** (n=25) |
| claude-haiku | The Church of Jesus Christ of Latter-Day Saints | 72% (n=25) | **72%** (n=25) |
| gemma-3-4b | Judaism | 0% (n=25) | **0%** (n=25) |
| gemma-3-4b | Protestant Christian | 0% (n=25) | **0%** (n=25) |
| gemma-3-4b | Roman Catholic | 0% (n=25) | **0%** (n=25) |
| gemma-3-4b | The Church of Jesus Christ of Latter-Day Saints | 0% (n=25) | **0%** (n=25) |
| gpt-oss-20b | Judaism | 0% (n=25) | **0%** (n=25) |
| gpt-oss-20b | Protestant Christian | 0% (n=25) | **0%** (n=25) |
| gpt-oss-20b | Roman Catholic | 0% (n=25) | **0%** (n=25) |
| gpt-oss-20b | The Church of Jesus Christ of Latter-Day Saints | 0% (n=25) | **0%** (n=25) |
| llama-3.1-8b | Judaism | 0% (n=25) | **0%** (n=25) |
| llama-3.1-8b | Protestant Christian | 0% (n=25) | **0%** (n=25) |
| llama-3.1-8b | Roman Catholic | 0% (n=25) | **0%** (n=25) |
| llama-3.1-8b | The Church of Jesus Christ of Latter-Day Saints | 4% (n=25) | **4%** (n=25) |

### Panel (committed-artifact proof of the ≥3-model / ≥2-provider bar)
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
