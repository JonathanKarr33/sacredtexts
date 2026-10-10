# pipelines — sacredbench

The Phase 1 benchmark pipeline (spec: `codev/specs/1-phase1-benchmark-pipeline.md`).
One `uv` project, Typer CLI, JSONL seams between stages, fail-fast throughout.
Provider layer ported from multibench `workflows/judging/judging/providers.py`
@ 14f6c9d4.

```
source JSON ──convert──▶ standard docs ──generate──▶ questions.jsonl
questions.jsonl × model panel ──collect──▶ answers.jsonl ──score──▶ scores.jsonl + summary
```

Run everything from the **repo root**:

```bash
uv --project pipelines run python -m sacredbench --help

# 1. Convert known source shapes into the standard flat format
uv --project pipelines run python -m sacredbench convert nabre <books...|dir> \
    --out texts/bible-nabre.json --tradition Christianity --tradition Catholic
uv --project pipelines run python -m sacredbench convert encyclicals <files|dir> \
    --out texts/encyclicals --tradition Catholic

# 2. Mechanically validate any standard-format documents
uv --project pipelines run python -m sacredbench validate texts/

# 3. Generate questions (six working-group templates; deterministic; incl.
#    false-premise negatives when the corpus has >=2 works)
uv --project pipelines run python -m sacredbench generate texts/ --per-task 10

# 4. Collect answers from the model panel (resumable; non-zero exit on failures)
cp configs/models.example.yaml configs/models.yaml   # then edit; keys via env
uv --project pipelines run python -m sacredbench collect runs/questions.jsonl configs/models.yaml

# 5. Score (strict + normalized + token-F1) and print the summary table
uv --project pipelines run python -m sacredbench score runs/answers.jsonl
```

Tests: `uv --project pipelines run pytest pipelines` (fixtures are real-SHAPE but
synthetic TEXT — no copyrighted translation is committed).

Module map: `schema.py` standard format + validation · `convert.py` source-format
converters (registry) · `generate.py` templates → questions · `config.py` model
panel YAML · `providers.py` anthropic/openai-compatible/gemini seam ·
`collect.py` resumable fan-out · `score.py` metrics + summary · `cli.py` Typer app.

Verified live (2026-10-10): 3-question smoke vs claude-haiku-5-5 — collect and
score worked end-to-end; Haiku returned a near-miss paraphrase of Luke 19:17
(NABRE) that scored exact=0/normalized=0/token_f1=0.62, exactly the failure mode
the benchmark exists to measure.
