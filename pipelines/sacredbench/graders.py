"""Named graders for the text-retrieval tasks (Spec 15, decision #3/#5).

A *grader* decides correct-vs-incorrect for a `retrieve_quote` / `complete_unit` cell and owns a
set of reported metric fields. Graders are **selectable by name** on the `score` CLI (`--evaluator`);
the headline is the OR of the selected graders' verdicts. This module is **pure metadata + selection
logic** — the metric *values* are computed in ``score.py`` (keyed by grader name), so there is no
import cycle.

Decisions encoded here:
- `token_f1` is an always-on diagnostic owned by NO grader (see ``ALWAYS_ON``); it is always emitted
  for text-retrieval regardless of selection.
- `strict` owns ``exact``/``normalized`` (verdict: ``normalized == 1``); `containment` owns
  ``contains_reference`` (verdict: ``contains_reference == 1``). Default = both → the phase-1 headline
  ``normalized OR contains_reference`` and byte-identical metrics.
- A paid / separate-pass grader (the future Jev judge, issue #21) is expressible as a descriptor with
  ``inline=False`` and **no verdict callable**: ``score`` never computes it inline; a later resumable
  pass merges its declared ``metric_keys`` into each row's open metrics map. We do not build it here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional


class GraderError(Exception):
    pass


@dataclass(frozen=True)
class Grader:
    name: str
    metric_keys: tuple[str, ...]          # fields this grader contributes to the metrics dict
    verdict: Optional[Callable[[dict], bool]]  # None ⇒ non-inline (merged by a separate pass)
    default: bool = True                  # in the default deterministic set
    inline: bool = True                   # computed inline by `score` (vs a separate resumable pass)


# The always-on diagnostic for text-retrieval — reported regardless of grader selection, owned by
# no grader (never a headline). Kept in canonical position between strict's and containment's fields.
ALWAYS_ON: tuple[str, ...] = ("token_f1",)

# Canonical metric-field order for text-retrieval, so the emitted metrics dict is order-stable
# (byte-identical `scores.jsonl` for a given selection). token_f1 sits where phase 1 put it.
_CANONICAL_ORDER: tuple[str, ...] = ("exact", "normalized", "token_f1", "contains_reference")

GRADERS: dict[str, Grader] = {
    "strict": Grader("strict", ("exact", "normalized"), lambda m: m["normalized"] == 1),
    "containment": Grader("containment", ("contains_reference",), lambda m: m["contains_reference"] == 1),
    # Example of the separate-pass seam (NOT built here; issue #21). Registered so the shape is
    # exercisable, non-default, non-inline, verdict-less:
    # "jev": Grader("jev", ("jev_verdict", "jev_prob"), None, default=False, inline=False),
}

# The default selection: the inline, default-flagged graders, in registry order.
DEFAULT_EVALUATORS: tuple[str, ...] = tuple(
    name for name, g in GRADERS.items() if g.default and g.inline
)


def _flatten(raw: list[str] | tuple[str, ...]) -> list[str]:
    """Accept repeated flags and/or comma-separated values; strip, drop blanks, dedupe (order-stable)."""
    out: list[str] = []
    for item in raw:
        for part in str(item).split(","):
            part = part.strip()
            if part and part not in out:
                out.append(part)
    return out


def resolve_evaluators(raw: list[str] | tuple[str, ...] | None) -> list[Grader]:
    """Resolve a CLI `--evaluator` selection to inline Graders.

    None/empty-input ⇒ the default deterministic set. Unknown name ⇒ fail fast. An empty selection
    after parsing ⇒ error. A non-inline (paid/separate-pass) grader can never be run inline by
    `score`, so selecting one here fails fast — it is never in the default and is merged by its own pass.
    """
    names = _flatten(list(raw)) if raw else list(DEFAULT_EVALUATORS)
    if not names:
        raise GraderError("empty --evaluator selection; omit the flag for the default set")
    graders: list[Grader] = []
    for name in names:
        g = GRADERS.get(name)
        if g is None:
            known = ", ".join(sorted(GRADERS))
            raise GraderError(f"unknown evaluator {name!r}; known: {known}")
        if not g.inline:
            raise GraderError(
                f"evaluator {name!r} is a separate-pass grader and cannot be run inline by `score`; "
                "it is merged into scores.jsonl by its own resumable pass"
            )
        graders.append(g)
    return graders


def submetrics_for(graders: list[Grader]) -> tuple[str, ...]:
    """The canonical-ordered submetric keys emitted for a text-retrieval cell under this selection:
    the union of the selected graders' ``metric_keys`` plus the always-on diagnostics."""
    selected = set(ALWAYS_ON)
    for g in graders:
        selected.update(g.metric_keys)
    return tuple(m for m in _CANONICAL_ORDER if m in selected)
