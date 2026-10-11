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

# 1. Convert catalogue targets into the standard flat format. This is
#    catalogue-driven: every selected target is converted via its registered
#    converter and written under the standardized-path convention
#      texts/standardized/<source-id>/<target-slug>/
#    so `generate` can recover each document's license from its path. Restricted
#    targets are excluded unless --include-restricted is passed.
uv --project pipelines run python -m sacredbench convert                 # all selected targets
uv --project pipelines run python -m sacredbench convert --converter bible_flat    # just one converter
uv --project pipelines run python -m sacredbench convert --source "Protestant Christian"
# Restricted targets (require the local held-back payloads, e.g. NABRE):
uv --project pipelines run python -m sacredbench convert --include-restricted
# NOTE: with the Greek Orthodox TLG payloads present locally, a whole-corpus
#   `convert --include-restricted` fail-fasts on the still-unregistered `tlg`
#   converter. Until that converter lands, convert NABRE on its own:
uv --project pipelines run python -m sacredbench convert --include-restricted --source "Roman Catholic"
#   (verified 2026-10-11: NABRE converts 35,091 verses; the committed run's audit
#    content layer ran clean against the real NABRE payload — 32,070 fingerprints.)

# 2. Mechanically validate any standard-format documents (license-agnostic)
uv --project pipelines run python -m sacredbench validate texts/standardized

# 2b. (Optional) Assemble the working group's interchange document per
#     (work, version, language): merges shards (e.g. the LDS KJV OT+NT), dedupes
#     by (citation, text), unions traditions, and checks the inverse-grouping
#     round-trip before writing texts/interchange/ (rebuildable, gitignored).
uv --project pipelines run python -m sacredbench export texts/standardized

# 3. Generate questions (six working-group templates; deterministic; incl.
#    false-premise negatives when the corpus has >=2 works). Inputs are
#    standardized docs under texts/standardized; restricted docs are excluded
#    (opt in with --include-restricted), and a doc whose license can't be
#    recovered from its path is refused (fail-closed).
uv --project pipelines run python -m sacredbench generate texts/standardized --per-task 10

# 4. Collect answers from the model panel (resumable; non-zero exit on failures).
#    `generate` also writes runs/questions.jsonl.manifest.json (seed, params,
#    corpus hash, question-set digest). collect stamps that digest into every
#    answer row and REFUSES to resume an answers file built for a different
#    question set (regenerate, or point --out at a fresh file); score refuses a
#    file that mixes question sets.
cp configs/models.example.yaml configs/models.yaml   # then edit; keys via env
uv --project pipelines run python -m sacredbench collect runs/questions.jsonl configs/models.yaml

# 5. Score and print the summary. Per-task contract: retrieve_quote/complete_unit
#    -> normalized-exact (+ exact/token-F1); verify_source -> boolean; identify_version
#    -> label exact/normalized; cite_passage/identify_source -> the SINGLE extracted
#    citation must equal ground truth (a multi-candidate hedge scores 0). The summary
#    also breaks down per model x task x TRADITION (each observation once per listed
#    tradition). Optional flags:
#      --summary-md PATH            also write the markdown summary (Phase 8 evidence)
#      --questions Q --config CFG   report missing/failed cells against the panel x
#                                   question-set roster (expected_n / 'miss N')
uv --project pipelines run python -m sacredbench score runs/answers.jsonl \
    --questions runs/questions.jsonl --config configs/models.yaml --summary-md runs/summary.md
#    The summary also carries a `panel` block (provider/model/endpoint — no secrets,
#    so the >=3-model / >=2-provider bar is checkable from the committed artifact)
#    and a `usage` block (per-model + total input/output tokens; cost only if the
#    run config supplies per-model prices — prices are never invented).

# 6. Copyright audit (runs in the test gate): fail if any committed artifact is
#    derived from a restricted source. Two layers: ORIGIN (always) — the artifact's
#    (work, version, language) maps to a restricted catalogue target; and CONTENT —
#    when the held-back restricted PAYLOADS are present locally, the restricted unit
#    texts are fingerprinted and any committed file containing one is flagged (this
#    catches a restricted unit mislabeled with a public source). In CI / a fresh
#    clone the payloads are absent, so only the origin layer runs — acceptable
#    because restricted payloads are never committed, making origin the enforceable
#    proxy there.
uv --project pipelines run python -m sacredbench audit runs/ texts/standardized
```

Tests: `uv --project pipelines run pytest pipelines` (fixtures are real-SHAPE but
synthetic TEXT — no copyrighted translation is committed).

Module map: `catalogue.py` `source.yaml` targets manifest + discovery + license
gating · `schema.py` standard format + validation · `convert.py` source-format
converters (registry) · `export.py` assemble shards → interchange + round-trip ·
`generate.py` templates → questions · `config.py` model
panel YAML · `providers.py` anthropic/openai-compatible/gemini seam ·
`collect.py` resumable fan-out · `score.py` metrics + summary (panel + usage) ·
`audit.py` restricted-origin/-content copyright audit · `cli.py` Typer app.

Verified live (2026-10-10): 3-question smoke vs claude-haiku-5-5 — collect and
score worked end-to-end; Haiku returned a near-miss paraphrase of Luke 19:17
(NABRE) that scored exact=0/normalized=0/token_f1=0.62, exactly the failure mode
the benchmark exists to measure.
