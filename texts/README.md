# texts/ — corpora (two-tier: raw → standardized)

- **`raw/`** — source data exactly as obtained, organised by tradition. Seeded
  from the working group's Box folder ("Phase I / raw JSON", downloaded
  2026-10-10). Two subsets are **held back from this public repo** pending
  licensing and exist only locally (see `.gitignore`):
  - `raw/Roman Catholic/nabre.json` — NABRE is a copyrighted translation
    (Confraternity of Christian Doctrine / USCCB).
  - `raw/Greek Orthodox/` — direct extracts of the licensed TLG corpus
    (and the underlying Rahlfs Septuagint / Nestle-Aland editions are
    themselves copyrighted).
- **`standardized/`** — the working group's standard flat-format documents,
  produced from `raw/` by `sacredbench convert` (see `pipelines/README.md`).
  Rebuilt locally; corpora derived from copyrighted sources are not committed.

Per-source provenance metadata (`source.yaml`) and the conversion registry are
specified in `codev/specs/1-phase1-benchmark-pipeline.md`.
