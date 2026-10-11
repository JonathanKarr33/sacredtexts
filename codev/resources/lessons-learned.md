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

## Live runs & providers

- **Reasoning models can return empty content** when `max_tokens` is exhausted by
  hidden reasoning (gpt-oss-20b at 1024 → empty; 4096 fixed it). Budget output tokens
  per model; the resumable `collect` then fills the stragglers without re-paying.
- **Keep a budgeted live smoke in the loop** — mocking the provider seam hides
  live-only failures; the smoke caught the empty-output mode before the full run.
- **Validate model slugs against the provider's own catalogue** (OpenRouter
  `/models`) before a run, rather than guessing.

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
