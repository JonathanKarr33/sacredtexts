# spir-1 builder thread

Project 1 — [Spec 1] Seed Phase 1 benchmark pipeline, viewer, and codev infrastructure.
SPIR, strict mode (porch-driven).

## 2026-10-10 — Specify phase

- Spawned into Specify. Spec already existed and was amended today
  (commit a135373: two-tier `texts/` layout — raw/ + committed source.yaml,
  standardized/, one-command rebuild).
- Architect orientation (main, 19:04Z): much of Spec 1 already landed via PR #1
  (pipelines/sacredbench: convert/validate/generate/collect/score, 25 tests green,
  live smoke done). Remaining delta = two-tier texts/ layout + unmet success criteria
  (Quran corpus, interchange round-trip exporter). Raw payloads gitignored per
  copyright gate; YAML metadata committed.
- Reviewed the existing spec against that orientation: the delta and the named
  unmet criteria are all already captured (Desired State §1–2, Success Criteria 1–3,
  Test Scenarios). Spec is internally consistent and honors the architect's decisions
  — honored in place, not rewritten.
- Signalling SPEC_DRAFTED so porch runs the 3-way consultation.
