# Phase 2 (web-search tool config/collect/identity) — Iteration 1 rebuttals

Both reviewers returned **REQUEST_CHANGES / HIGH** and converged on a single blocking issue;
both verified the rest against real source (Claude checked `aggregate.ts:59`, `parseSummary`,
the SDK's `web_search_tool_20250305_param.py` TypedDict, and the committed first-run key;
Codex confirmed the pause behaviour). Every point accepted.

## Blocking (both): `_anthropic` guarded only `stop_reason == "max_tokens"`

SDK 1.13.0's `StopReason` also includes **`pause_turn`** — Anthropic's documented stop for a
long-running turn with a *server-side* tool, i.e. exactly the web-search path this phase adds —
plus `refusal` and `model_context_window_exceeded`. On any of these the turn is incomplete, and
the old code either committed whatever partial text was present (indistinguishable from a
genuinely wrong answer, corrupting the search-on/off contrast inside a public committed run) or,
when empty, fell through to the generic `empty response` retry — re-billing the web search, the
exact hazard the `max_tokens` guard existed to prevent.

**ACCEPTED — fixed.** `_anthropic` now allowlists the terminal-success reasons and raises
`ProviderError` on anything else:

```python
_TERMINAL_STOP = frozenset({"end_turn", "stop_sequence"})
...
if (stop := getattr(resp, "stop_reason", None)) not in _TERMINAL_STOP:
    raise ProviderError(f"{model.id}: incomplete turn (stop_reason={stop!r}) — ...")
```

I chose the **fail-loud** option (both reviewers offered it; Codex: "or fail loudly without
accepting partial text") over implementing the pause_turn continuation protocol: it is the
project's fail-fast norm, keeps `_anthropic` simple, and leaves no partial answer in the paid
public run. I use `{end_turn, stop_sequence}` (not Claude's `{…, tool_use}`) because our calls
pass no *client-side* tools, so `tool_use` is never a terminal success for us — failing loud on
it is the stricter, correct choice. Added a parametrised test over
`max_tokens`/`pause_turn`/`refusal`/`model_context_window_exceeded` (all raise) plus a
terminal-success test. **If Phase 3's smoke shows `pause_turn` actually occurs for these
single-turn quote retrievals, I'll implement continuation then** — but the smoke will reveal it
rather than it silently corrupting evidence.

## Non-blocking — applied

1. **Marker vs. fingerprint inconsistency** (`cli.py` hardcoded `[web_search]` while `collect.py`
   fingerprints `','.join(m.tools)`): made `cli.py` tools-general —
   `f"{m.model} [{'+'.join(m.tools)}]"` — so a future second tool can't collapse two tool sets
   into one standings identity.
2. **`max_tokens: 1024` on the no-tools entries** could trip the new (correct) truncation guard
   on a long Hebrew/Aramaic quote mid-run: bumped all four entries to `4096` (the run is unpriced;
   output volume is modest either way).
3. **Stale `≥3-model / ≥2-provider` panel header** in `summary_markdown`: reworded to "Panel
   composition … provider / model / endpoint, no secrets" so the committed 2-model `summary.md`
   is accurate.
4. **Dead `_Client` class** in the test's fake-SDK helper: removed.

## Accepted as-is, not changed

- **No whole-config unknown-key validation** (Codex/Claude, non-blocking): a misspelled key like
  `tool:` still silently no-ops. The spec's criterion ("tools parsed into `ModelSpec` and
  honored", fail-fast on an *invalid tools value*) is met. Strict unknown-key rejection across the
  whole config is a broader change with real extensibility risk and is out of this phase's scope;
  left for a future hardening if desired.

## Net

One blocking issue, fixed with the reviewer-endorsed fail-loud allowlist before Phase 3 spends
money. The parts both reviewers verified correct — the both-marked panel identity (distinct
standings rows, no first-run collision), the SDK-exact tool pin, the zero-viewer-change property —
are unchanged. 190 tests pass; scoring contract untouched.
