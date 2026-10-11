# pipelines — sacredbench

The Phase 1 benchmark pipeline (spec: `codev/specs/1-phase1-benchmark-pipeline.md`).
One `uv` project, Typer CLI, JSONL seams between stages, fail-fast throughout.
Provider layer ported from multibench `workflows/judging/judging/providers.py`
@ 14f6c9d4.

```
source JSON ──convert──▶ standard docs ──generate──▶ questions.jsonl
questions.jsonl × model panel ──collect──▶ answers.jsonl ──score──▶ scores.jsonl + summary
```

## Source catalogue (`texts/raw/**/source.yaml`)

`texts/raw` is grouped **one directory per tradition**, each holding many works,
versions, and source shapes. Every tradition directory carries one committed
`source.yaml` — a *targets manifest*: shared provenance plus a `targets:` list,
where each target is one `(work, version, language)` unit with its `payload`
glob, `converter`, `tradition[]`, and `license`. See
`pipelines/sacredbench/catalogue.py` for the schema; loading is fail-fast.

- **`license`** is a three-value gate: `public-domain` / `open` / `restricted`
  (the real upstream string, e.g. the Talmud's `CC-BY-NC`, is kept verbatim in
  `license_detail`). `restricted` targets are copyrighted translations whose
  **payloads are git-ignored and local-only** (NABRE, the Greek Orthodox TLG
  extracts); their `source.yaml` is still committed so the catalogue stays
  complete and auditable.
- `convert` and `generate` **exclude `restricted` targets by default**; pass
  `--include-restricted` to opt in (and supply the local payload). `validate` is
  unaffected by license.
- **Standardized-path convention:** a target's converted output lives under
  `texts/standardized/<source-id>/<target-slug>/` mirroring
  `texts/raw/<source-id>`, so `generate` recovers a document's license from its
  path. The interchange `Document` format is unchanged (it carries no `license`).

```bash
# Validate the whole catalogue and list the selected (non-restricted) targets
uv --project pipelines run python -m sacredbench catalogue
uv --project pipelines run python -m sacredbench catalogue --include-restricted
```

Run everything from the **repo root**:

```bash
uv --project pipelines run python -m sacredbench --help

# 1. Convert known source shapes into the standard flat format
#    (restricted sources are refused unless --include-restricted is passed)
uv --project pipelines run python -m sacredbench convert nabre <books...|dir> \
    --out texts/bible-nabre.json --tradition Christianity --tradition Catholic
uv --project pipelines run python -m sacredbench convert encyclicals <files|dir> \
    --out texts/encyclicals --tradition Catholic

# 2. Mechanically validate any standard-format documents
uv --project pipelines run python -m sacredbench validate texts/

# 3. Generate questions (six working-group templates; deterministic; incl.
#    false-premise negatives when the corpus has >=2 works). Inputs are
#    standardized docs under texts/standardized; restricted docs are excluded
#    (opt in with --include-restricted), and a doc whose license can't be
#    recovered from its path is refused (fail-closed).
uv --project pipelines run python -m sacredbench generate texts/standardized --per-task 10

# 4. Collect answers from the model panel (resumable; non-zero exit on failures)
cp configs/models.example.yaml configs/models.yaml   # then edit; keys via env
uv --project pipelines run python -m sacredbench collect runs/questions.jsonl configs/models.yaml

# 5. Score (strict + normalized + token-F1) and print the summary table
uv --project pipelines run python -m sacredbench score runs/answers.jsonl
```

Tests: `uv --project pipelines run pytest pipelines` (fixtures are real-SHAPE but
synthetic TEXT — no copyrighted translation is committed).

Module map: `catalogue.py` `source.yaml` targets manifest + discovery + license
gating · `schema.py` standard format + validation · `convert.py` source-format
converters (registry) · `generate.py` templates → questions · `config.py` model
panel YAML · `providers.py` anthropic/openai-compatible/gemini seam ·
`collect.py` resumable fan-out · `score.py` metrics + summary · `cli.py` Typer app.

Verified live (2026-10-10): 3-question smoke vs claude-haiku-5-5 — collect and
score worked end-to-end; Haiku returned a near-miss paraphrase of Luke 19:17
(NABRE) that scored exact=0/normalized=0/token_f1=0.62, exactly the failure mode
the benchmark exists to measure.
