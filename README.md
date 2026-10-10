# sacredtexts

Pipelines for question-answering evaluation over sacred texts.

The project takes JSON files of sacred texts and runs them through a staged
pipeline:

1. **Ingest** — load and normalize the sacred-text JSON files.
2. **Generate questions** — produce questions grounded in the texts.
3. **Query LLMs** — pose each question to several different LLMs.
4. **Collect results** — gather and store every model's answers.
5. **Answer / score** — evaluate the collected answers against the texts.

See `pipelines/README.md` for the pipeline layout. A detailed project report
defining scope and methodology is forthcoming; specs live in `codev/specs/`.

## Development

This project uses [Codev](https://github.com/cluesmith/codev) for AI-assisted
development — see `CLAUDE.md` / `AGENTS.md` for the workflow, and
`codev/specs|plans|reviews/` for the three documents each feature carries.
