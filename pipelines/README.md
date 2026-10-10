# pipelines

Staged pipeline code for sacredtexts. Each stage reads the previous stage's
output; data flows:

```
texts (JSON) → questions → multi-LLM answers → collected results → scored answers
```

Planned stages (to be specified in codev/specs/ once the project report lands):

- `ingest/` — load + validate sacred-text JSON inputs
- `questions/` — question generation from texts
- `llm_query/` — fan out each question to multiple LLM providers
- `collect/` — aggregate raw model responses
- `answer/` — answer evaluation / scoring

This directory is a placeholder skeleton until the first spec is written —
don't build against it yet.
