# arch-critical.md — Always-On System-Shape Facts (HOT tier)

## Critical facts (consult before deciding)
- **Phase 1 question**: can models recognize, retrieve, and generate sacred text, and reject false premises/incorrect texts? Interpretation/recommendation is Phase 2 — out of scope. Contract: Spec 1.
- The **interchange format** is the working group's flat JSON (`{source:{tradition[],work,version,language,document_type,source_url?}, entries:[{unit_type,citation,text}]}`) — our internal representations must export to it losslessly. `tradition` is a LIST (traditions share texts).
- **Multi-faith by construction**: corpora are drop-in data (one converter registry line + a data directory per source); adding a tradition never changes core pipeline code.
- Pipeline shape is **four subsystems** (collection, scoring, analysis, visualisation) with **JSONL seams**: questions.jsonl → answers.jsonl → scores.jsonl. Stages are resumable; failed cells stay pending and exit non-zero.
- **Scoring reports both tiers + similarity** (exact / normalized / token-F1) on every answer; the semantic metric is pluggable (open group question). Per-task headline `correct` rules live in `pipelines/sacredbench/score.py`.
- **Copyright gate**: corpora derived from copyrighted translations (e.g. NABRE) are NOT committed to this public repo — `texts/*` is gitignored; converters rebuild locally from the source repos.
- `pipelines/` is a single uv project (`sacredbench`); run via `uv --project pipelines run python -m sacredbench …` from the repo root. Providers: anthropic / any OpenAI-compatible host (base_url+api_key_env) / gemini; keys from env only.
- `apps/viewer/` is a **seed port of multibench's multibrowser** (client-side GitHub data layer, SHA-pinned) — not yet adapted to this domain; read `apps/viewer/README.md` before touching it.
- **Copyright audit gate** (`pipelines/sacredbench/audit.py`, in `.codev/checks/test.sh`): no committed artifact may derive from a `restricted` source — origin always, plus a restricted-text content layer when the held-back payloads are present locally. Never commit a standardized doc or run artifact built from a restricted target.

## Map of arch.md (consult when…)
- **Texts: two tiers + catalogue** — adding/altering a corpus, `source.yaml`, or the licence gate.
- **Interchange format** — exporting or consuming the working-group flat JSON.
- **Pipeline (four subsystems)** — touching convert/generate/collect/score/providers/config.
- **Viewer local results** — rendering a run locally.
- **Run evidence layout / Test gate** — committing run evidence or wiring tests.
