# sacredtexts

**Sacred Texts Benchmark — Phase 1**: can AI models correctly recognize,
retrieve, and generate sacred texts — with provenance — and reject false
premises and incorrect texts?

JSON files of sacred texts go in; questions are generated from the working
group's templates; several LLMs answer; answers are collected and scored.

```
source JSON ─convert─▶ standard docs ─generate─▶ questions.jsonl
questions.jsonl × model panel ─collect─▶ answers.jsonl ─score─▶ scores.jsonl + summary
```

## Layout

- `pipelines/` — the benchmark pipeline (`sacredbench`, Python/uv/Typer):
  converters to the group's standard flat JSON, question generation (six
  templates, incl. false-premise negatives), multi-provider collection
  (Anthropic / OpenAI-compatible / Gemini), scoring (strict + normalized +
  token-F1). See `pipelines/README.md`.
- `texts/` — converted standard-format corpora (gitignored pending licensing;
  rebuilt locally by the converters).
- `configs/` — model-panel configs (`models.example.yaml`; real panel gitignored).
- `apps/viewer/` — results/corpus browser SPA, seeded from multibench's
  multibrowser; not yet adapted (see `apps/viewer/README.md`).
- `codev/` — specs/plans/reviews. Start at
  `codev/specs/1-phase1-benchmark-pipeline.md`.

## Quick start

```bash
uv --project pipelines run python -m sacredbench --help
uv --project pipelines run pytest pipelines          # unit tests
pnpm -C apps/viewer test                              # viewer tests
```

## Development

This project uses [Codev](https://github.com/cluesmith/codev) (SPIR protocol,
human-gated) — see `CLAUDE.md` / `AGENTS.md`. AI-written code lands only with
human review, and benchmark outputs are validated against the sources.
