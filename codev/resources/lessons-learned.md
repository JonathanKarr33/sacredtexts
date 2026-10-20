# lessons-learned.md — Engineering Wisdom (COLD / reference)

On-demand reference. The always-injected subset lives in `lessons-critical.md`.
Seeded from Spec 1 (Phase 1 benchmark).

## Scoring & evaluation

- **Refusal is an OUTCOME, not a wrong answer — don't let a strict headline conflate it
  with fabrication.** `correct = normalize(answer) == normalize(expected)` alone marks both an
  honest refusal and a confident fabrication 0 (first run: gpt-oss-20b mostly refuses, gemma/llama
  fabricate — same score, opposite behaviour). Spec 15 makes this a first-class `outcome` ∈
  correct/incorrect/refused: a declined cell is `refused` and **excluded from accuracy**
  (`accuracy = correct/(correct+incorrect)`), with **coverage** (how often it answered) reported
  beside every accuracy so a high-accuracy/low-coverage model isn't misread (opus 100%/cov66% vs
  opus-search 97%/cov76%). Detection is deterministic (a leading decline cue AND the reference not
  delivered); `token_f1` is a diagnostic, never the refusal detector.
- **Citation scoring must resist containment and false-negatives.** A single-candidate
  boundary-equality check (multi-candidate hedge → 0), with the extractor chosen by the
  ground-truth citation *shape*, and spans asserting the expected citation collapsed to
  one, took 5 consult rounds to get right. Containment is gameable; a numeric-only or
  greedy-paragraph extractor regresses correct answers.
- **Non-Latin fairness = delete marks, don't let punctuation split letters.** The
  original `normalize()` ran its `[^\w\s]`→space pass *before* handling diacritics, so
  Arabic harakat / Hebrew niqqud split each vocalised word into single letters
  (token_f1→0). Fix: strip combining marks + tatweel and fold alef-wasla→alef /
  maqaf→space *first*; derive the mark set from the **real** QUL data (annotation marks
  run well past basic harakat — U+06D6–U+06ED, superscript alef U+0670, …, many mid-word),
  not from a spec. Pin a Latin byte-for-byte invariance snapshot: an over-eager global
  delete (e.g. soft-hyphen) silently regresses committed English answers.
- **A containment headline rescues correct-but-wrapped retrieval — adopt it as a deliberate
  contract change, don't report it on the side.** A web-search model returns the exact quote *plus*
  a citation/URL/caveat; under "the quote and nothing else" it scored 0, so the strict headline
  looked flat/down while the model retrieved *more* correct scripture. Spec 15 adopts
  `correct = normalized OR contains_reference` for the text-retrieval tasks (containment confined to
  them — provenance anti-evasion intact), so the lift sits in the accuracy column. The reliable
  signal is **word-bounded containment of the normalised reference**, not `token_f1` (a short quote
  diluted by an English caveat lands ~0.45). Caveat: containment has **no anti-hedge rule** (unlike
  `cite_passage`/`identify_source`), so a verse that is the model's secondary hedge guess still
  counts correct — document the few such cells rather than special-casing them.
- **Web retrieval surfaces real orthographic variance the normaliser can't fold.** A
  correct āyah can come back in a *different* Uthmani Unicode encoding (U+06E1 vs U+0652,
  Arabic Extended-A tanwīn U+08F0–08F2, U+0657, yeh/alef-maksura) that `normalize()` does
  not fold to exact equality (token_f1 up to 0.95, `correct`=0) — present in search-OFF
  answers too, so it is *not* a tool artifact. Spec 15 shipped the additive `contains_reference`
  submetric rather than folding these encodings (folding risked the Latin byte-for-byte invariance);
  the encoding near-miss stays visible as a `normalized=0` / `contains_reference=0` / high-`token_f1`
  **incorrect** cell.
- **A scoring-contract change is a SANCTIONED, evidenced rebaseline — not a forbidden re-score.**
  The byte-for-byte re-score guards exist to catch an *accidental* disturbance of committed numbers;
  a deliberate contract change (containment headline, refused outcome) reshapes `scores.jsonl` on
  purpose. Do it **once, with a durable projection-SHA oracle + an exact pre-registered flip/refused
  set** (`test_contains_reference_rebaseline.py`) so a reviewer can see only the intended fields
  moved, preserve `panel`/`usage` verbatim (a keyless re-score nulling them is the scar), and surface
  the moved numbers to the architect before writing prose. Spec 15 did exactly two such rebaselines.

- **A marker baked into an identity string to force non-collision orphans the
  pre-existing bare rows.** Spec 8 encoded tool-use into `panel.model`
  (`[no-tools]`/`[web_search]`) to keep search-on/off distinct *without* a viewer change;
  but the marked key could then never collide with an earlier run's bare
  `claude-haiku-5-5`, so a stale row sat beside it forever. Promote the dimension to a
  real field (`panel.tools`) and have the consumer's standings key incorporate it
  (`(provider, model, tools)`) so same-model/same-tools rows dedupe and legacy bare rows
  become supersedable (Spec 11, Approach B — the shape Spec 8 deferred). Lesson: don't
  encode a new identity dimension as a string marker to dodge a consumer change; the
  marker you add to separate two arms also wrongly separates two runs that should merge.

## Live runs & providers

- **Reasoning models can return empty content** when `max_tokens` is exhausted by
  hidden reasoning (gpt-oss-20b at 1024 → empty; 4096 fixed it). Budget output tokens
  per model; the resumable `collect` then fills the stragglers without re-paying.
- **Keep a budgeted live smoke in the loop** — mocking the provider seam hides
  live-only failures; the smoke caught the empty-output mode before the full run.
- **Validate model slugs against the provider's own catalogue** (OpenRouter
  `/models`) before a run, rather than guessing.
- **A server-side tool (e.g. Anthropic `web_search`) must be part of panel identity and
  fail loud, not silent.** Bake the `tools` setting into the panel fingerprint and the
  emitted `panel.model` so on/off never collapse into one row; pin the tool version
  (`web_search_20250305`) and a `max_uses`; and treat any non-terminal `stop_reason`
  (`max_tokens`, `pause_turn`) as a hard error — a silent retry over a per-request-billed
  tool re-bills forever and the cell never converges. Such a run is **unpriced** (web
  search bills per request, uncaptured in in/out tokens) — never invent a cost.

## Evidence & copyright

- **Write run evidence to a fresh `runs/<id>/`; never re-run `collect`/`score`/
  `generate` over committed evidence** — `collect` resume-skips all cells (zero calls)
  and a keyless `score` overwrites the committed panel proof with nulls. (Promoted to
  `lessons-critical.md`.)
- **Origin is the enforceable copyright proxy in CI/clone** (restricted payloads are
  never committed, so there's nothing to content-match against); a content-fingerprint
  layer adds value only when the held-back payloads are present locally.
- **Make committed evidence self-describing** (a run `README.md`): a standalone reader
  must not misread `0%` as inability when it is refusal.
- **Model answers are committed as collected — no manual clearance/redaction pass.**
  Binding project policy (human ruling, Spec 8): a web-search model may incidentally echo
  copyrighted translation text in an answer; the maintainers treat that as fair use for
  academic benchmarking, and answers are never truncated or edited (the explorer shows
  them verbatim). The **automated `audit` gate remains the enforcement line** — it still
  blocks any committed artifact derived from a *restricted* source — but there is no human
  copyright-clearance step over collected answers. Don't reintroduce one.

## Process / SPIR

- **The strongest consults re-run the pipeline**, not just read it — codex caught the
  collect-into-committed and keyless-overwrite bugs by executing TUTORIAL verbatim;
  tests did not. Prefer a consult environment that can execute.
- **Disposition every consult finding explicitly** (Addressed / Rebutted / N/A),
  including non-blocking COMMENTs, so nothing is silently dropped between iterations.
- **Derive formats from the real reference data, not its docs** (BoM heading-as-verse,
  encyclical `paragraph: null`, Talmud daf offsets).
- **`porch rollback <id> plan` REPLAYS the old plan's iteration history — it does not reset the
  counter.** After a rollback, each `porch done` bumps the iteration (2→3…) and `porch next` returns
  "Fix issues from iteration N" with **no consult task**, because the old plan's iterN review files
  still exist on disk. Net trap: a freshly re-scoped plan can advance plan→implement **without a
  fresh multi-agent consult**. Mitigation (Spec 15): run a manual `consult` (codex+claude) over the
  re-scoped plan, commit its outputs + a rebuttal, and fold the findings before implementing — don't
  trust the replayed green. Also note porch's implement loop has a `max_iterations` safety ceiling
  (3) that **force-advances** a phase that keeps drawing REQUEST_CHANGES, recording the last rebuttal
  as the disposition — fine when the residual is a documented out-of-scope item, but verify that's
  what happened rather than assuming the phase passed cleanly.

## Map
- (This cold archive pairs with `lessons-critical.md`'s hot tier; demote hot entries
  here as that file approaches its cap.)
