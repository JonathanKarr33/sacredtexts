| model | retrieve_quote | overall |
|---|---|---|
| opus | 100% cov 66% (n=100; c/i/r 66/0/34) | **100%** cov 66% (c/i/r 66/0/34) |
| opus-search | 97% cov 76% (n=100; c/i/r 74/2/24) | **97%** cov 76% (c/i/r 74/2/24) |
| haiku-search | 80% cov 65% (n=100; c/i/r 52/13/35) | **80%** cov 65% (c/i/r 52/13/35) |
| haiku | 71% cov 66% (n=100; c/i/r 47/19/34) | **71%** cov 66% (c/i/r 47/19/34) |

_Cells: accuracy cov coverage (n answered; c/i/r = correct/incorrect/refused). accuracy = correct/(correct+incorrect) — refusals excluded; coverage = (correct+incorrect)/n; refused_rate = refused/n. `−N` = roster cells that produced no answer (distinct from refused)._

### By tradition (each observation counts once per listed tradition)
| model | tradition | retrieve_quote | overall |
|---|---|---|---|
| haiku | Judaism | n/a cov 0% (n=34; c/i/r 0/0/34) | **n/a** cov 0% (n=34; c/i/r 0/0/34) |
| haiku | Protestant Christian | 85% cov 100% (n=33; c/i/r 28/5/0) | **85%** cov 100% (n=33; c/i/r 28/5/0) |
| haiku | Sunni Islam | 58% cov 100% (n=33; c/i/r 19/14/0) | **58%** cov 100% (n=33; c/i/r 19/14/0) |
| haiku-search | Judaism | n/a cov 0% (n=34; c/i/r 0/0/34) | **n/a** cov 0% (n=34; c/i/r 0/0/34) |
| haiku-search | Protestant Christian | 85% cov 100% (n=33; c/i/r 28/5/0) | **85%** cov 100% (n=33; c/i/r 28/5/0) |
| haiku-search | Sunni Islam | 75% cov 97% (n=33; c/i/r 24/8/1) | **75%** cov 97% (n=33; c/i/r 24/8/1) |
| opus | Judaism | n/a cov 0% (n=34; c/i/r 0/0/34) | **n/a** cov 0% (n=34; c/i/r 0/0/34) |
| opus | Protestant Christian | 100% cov 100% (n=33; c/i/r 33/0/0) | **100%** cov 100% (n=33; c/i/r 33/0/0) |
| opus | Sunni Islam | 100% cov 100% (n=33; c/i/r 33/0/0) | **100%** cov 100% (n=33; c/i/r 33/0/0) |
| opus-search | Judaism | 80% cov 29% (n=34; c/i/r 8/2/24) | **80%** cov 29% (n=34; c/i/r 8/2/24) |
| opus-search | Protestant Christian | 100% cov 100% (n=33; c/i/r 33/0/0) | **100%** cov 100% (n=33; c/i/r 33/0/0) |
| opus-search | Sunni Islam | 100% cov 100% (n=33; c/i/r 33/0/0) | **100%** cov 100% (n=33; c/i/r 33/0/0) |

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
