# lessons-learned.md — Engineering Wisdom (COLD / reference)

On-demand reference. The always-injected subset lives in `lessons-critical.md`.
Seeded from Spec 1 (Phase 1 benchmark).

## Scoring & evaluation

- **A strict exact-text `retrieve_quote` headline conflates two very different
  failures.** `correct = normalize(answer) == normalize(expected)` ("exact text and
  nothing else") marks both an honest refusal and a confident fabrication as 0. In the
  first run gpt-oss-20b mostly refuses while gemma/llama fabricate — the same score,
  opposite behaviour. Report the **abstention-vs-hallucination split** (deferred to
  Spec 2; the contract is gated). `token_f1` alongside the headline surfaces the
  near-misses (claude-haiku: 17 correct-text answers lost to the "nothing else" rule).
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
- **The strict `retrieve_quote` headline penalises correct-but-wrapped retrieval.** A
  web-search model that returns the exact quote *plus* a citation/URL/caveat scores 0
  under "the quote and nothing else," so the headline can look flat/down while the model
  actually retrieves *more* correct scripture. The honest search-on/off cut is **whether
  the normalised reference is contained in the answer**, not `token_f1` (a short quote
  diluted by an English caveat lands ~0.45, not near 1.0). Report the contains-exact
  numbers in the run README; don't reshape the headline contract to chase them.
- **Web retrieval surfaces real orthographic variance the normaliser can't fold.** A
  correct āyah can come back in a *different* Uthmani Unicode encoding (U+06E1 vs U+0652,
  Arabic Extended-A tanwīn U+08F0–08F2, U+0657, yeh/alef-maksura) that `normalize()` does
  not fold to exact equality (token_f1 up to 0.95, `correct`=0) — present in search-OFF
  answers too, so it is *not* a tool artifact. Future refinement: fold these, or add a
  pipeline-level `contains_reference` submetric — deferred because either reshapes
  `scores.jsonl` and breaks the byte-for-byte re-score regression guard.

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

## Map
- (This cold archive pairs with `lessons-critical.md`'s hot tier; demote hot entries
  here as that file approaches its cap.)
