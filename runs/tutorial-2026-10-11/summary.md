| model | retrieve_quote | overall |
|---|---|---|
| opus-search | 74% (n=100) | **74%** |
| opus | 66% (n=100) | **66%** |
| haiku-search | 52% (n=100) | **52%** |
| haiku | 47% (n=100) | **47%** |

### By tradition (each observation counts once per listed tradition)
| model | tradition | retrieve_quote | overall |
|---|---|---|---|
| haiku | Judaism | 0% (n=34) | **0%** (n=34) |
| haiku | Protestant Christian | 85% (n=33) | **85%** (n=33) |
| haiku | Sunni Islam | 58% (n=33) | **58%** (n=33) |
| haiku-search | Judaism | 0% (n=34) | **0%** (n=34) |
| haiku-search | Protestant Christian | 85% (n=33) | **85%** (n=33) |
| haiku-search | Sunni Islam | 73% (n=33) | **73%** (n=33) |
| opus | Judaism | 0% (n=34) | **0%** (n=34) |
| opus | Protestant Christian | 100% (n=33) | **100%** (n=33) |
| opus | Sunni Islam | 100% (n=33) | **100%** (n=33) |
| opus-search | Judaism | 24% (n=34) | **24%** (n=34) |
| opus-search | Protestant Christian | 100% (n=33) | **100%** (n=33) |
| opus-search | Sunni Islam | 100% (n=33) | **100%** (n=33) |

### Panel composition (committed-artifact proof — provider / model / endpoint, no secrets)
| model_id | provider | model | endpoint | served_by |
|---|---|---|---|---|
| haiku | anthropic | claude-haiku-5-5 [no-tools] | api.anthropic.com | — |
| haiku-search | anthropic | claude-haiku-5-5 [web_search] | api.anthropic.com | — |
| opus | anthropic | claude-opus-5-5 [no-tools] | api.anthropic.com | — |
| opus-search | anthropic | claude-opus-5-5 [web_search] | api.anthropic.com | — |

### Token usage
| model_id | calls | in | out |
|---|---|---|---|
| haiku | 100 | 5,166 | 44,375 |
| haiku-search | 100 | 1,460,684 | 80,986 |
| opus | 100 | 5,166 | 39,954 |
| opus-search | 100 | 2,772,157 | 83,210 |
| **total** | 400 | 4,243,173 | 248,525 |
