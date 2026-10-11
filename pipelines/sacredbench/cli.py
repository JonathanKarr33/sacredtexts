"""sacredbench CLI — convert / validate / generate / collect / score.

Run from the repo root:

    uv --project pipelines run python -m sacredbench --help
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import typer

from sacredbench import catalogue as cat
from sacredbench import convert as conv
from sacredbench import schema
from sacredbench.collect import collect as run_collect
from sacredbench.config import load_config
from sacredbench.generate import generate as run_generate
from sacredbench.generate import load_questions, write_questions
from sacredbench.score import score_file, summary_markdown

app = typer.Typer(add_completion=False, no_args_is_help=True, pretty_exceptions_enable=False)


def _require_catalogue(raw_root: Path) -> list[cat.Source]:
    """Discover the catalogue for the license gate, failing LOUDLY if it is absent.

    The gate must never silently no-op: a missing catalogue is a usage error
    (wrong working directory, or a bad ``--raw-root``), not a reason to skip the
    restricted-source check."""
    try:
        return cat.discover_catalogue(raw_root)
    except cat.CatalogueMissing as e:
        raise typer.BadParameter(
            f"{e} — the license gate needs the source catalogue. Run from the repo "
            f"root or pass --raw-root pointing at texts/raw."
        ) from e


@app.command()
def catalogue(
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="root of the raw texts tree"),
    include_restricted: bool = typer.Option(
        False, help="include restricted (copyrighted, held-back) targets"
    ),
) -> None:
    """Validate the source catalogue and list the targets selected for convert/generate."""
    sources = cat.discover_catalogue(raw_root)
    targets = cat.select_targets(sources, include_restricted=include_restricted)
    all_t = cat.all_targets(sources)
    restricted = [t for t in all_t if t.license == "restricted"]
    typer.echo(
        f"{len(sources)} source(s), {len(all_t)} target(s); "
        f"selected {len(targets)} ({len(restricted)} restricted "
        f"{'included' if include_restricted else 'excluded'})"
    )
    for t in targets:
        typer.echo(
            f"  [{t.license}] {t.source_id} :: {t.work} [{t.version}] ({t.language}) "
            f"<- {t.payload} via {t.converter}"
        )


@app.command()
def convert(
    format: str = typer.Argument(help=f"source format: {', '.join(conv.CONVERTERS)}"),
    inputs: list[Path] = typer.Argument(help="source file(s) or director(ies)"),
    out: Path = typer.Option(..., help="output file (nabre: one doc) or directory (encyclicals)"),
    tradition: list[str] = typer.Option(..., help="tradition(s) this corpus belongs to (repeatable)"),
    version: str = typer.Option("NABRE", help="nabre only: translation/edition name"),
    work: str = typer.Option("The Bible", help="nabre only: work title"),
    language: str = typer.Option("en", help="nabre only: language code"),
    source_url: str = typer.Option(None, help="nabre only: provenance URL"),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root (for the license gate)"),
    include_restricted: bool = typer.Option(
        False, help="allow converting restricted (copyrighted, held-back) sources"
    ),
) -> None:
    """Convert known source JSON shapes into the standard flat format."""
    if not include_restricted:
        sources = _require_catalogue(raw_root)
        index = cat.build_raw_license_index(sources, raw_root)
        for path in cat.expand_json(list(inputs)):
            if cat.license_for_raw_path(path, sources, raw_root, index=index) == "restricted":
                raise typer.BadParameter(
                    f"refusing restricted source {path} (pass --include-restricted to convert it)"
                )
    if format == "nabre":
        docs = conv.convert_nabre(
            inputs, tradition=tradition, version=version, work=work,
            language=language, source_url=source_url,
        )
        schema.write_document(docs[0], out)
        typer.echo(f"wrote {out} ({len(docs[0].entries)} entries)")
    elif format == "encyclicals":
        docs = conv.convert_encyclicals(inputs, tradition=tradition)
        out.mkdir(parents=True, exist_ok=True)
        for d in docs:
            slug = "".join(c if c.isalnum() else "-" for c in d.work.lower()).strip("-")
            schema.write_document(d, out / f"{slug}.json")
        typer.echo(f"wrote {len(docs)} documents to {out}/")
    else:
        raise typer.BadParameter(f"unknown format {format!r} (known: {', '.join(conv.CONVERTERS)})")


@app.command()
def validate(inputs: list[Path] = typer.Argument(help="standard-format file(s)/director(ies)")) -> None:
    """Mechanically validate standard-format documents (fail-fast)."""
    docs = schema.load_documents(inputs)
    total = sum(len(d.entries) for d in docs)
    for d in docs:
        typer.echo(f"  ok: {d.work} [{d.version}] — {len(d.entries)} entries, tradition={d.tradition}")
    typer.echo(f"valid: {len(docs)} document(s), {total} entries")


@app.command()
def generate(
    inputs: list[Path] = typer.Argument(help="standard-format file(s)/director(ies)"),
    out: Path = typer.Option(Path("runs/questions.jsonl")),
    per_task: int = typer.Option(10, min=1),
    seed: int = typer.Option(20261010),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root (for the license gate)"),
    standardized_root: Path = typer.Option(
        cat.STANDARDIZED_ROOT, help="standardized texts root (for the license gate)"
    ),
    include_restricted: bool = typer.Option(
        False, help="include restricted (copyrighted, held-back) standardized docs"
    ),
) -> None:
    """Generate benchmark questions from the six working-group templates."""
    sources = _require_catalogue(raw_root)
    kept = cat.filter_standardized_paths(
        list(inputs), sources, include_restricted=include_restricted,
        standardized_root=standardized_root,
    )
    if not kept:
        raise typer.BadParameter(
            "no standardized documents to generate from "
            "(all inputs were restricted and excluded, or none matched)"
        )
    docs = schema.load_documents(kept)
    questions = run_generate(docs, per_task=per_task, seed=seed)
    works = {d.work for d in docs}
    if len(works) < 2:
        typer.secho(
            "WARNING: single-work corpus — every verify_source question is a positive "
            "(false-premise negatives need >=2 works).", fg="yellow", err=True,
        )
    write_questions(questions, out)
    typer.echo(f"wrote {len(questions)} questions ({len(questions) // len(set(q.task for q in questions))}/task) to {out}")


@app.command()
def collect(
    questions: Path = typer.Argument(help="questions.jsonl from `generate`"),
    config: Path = typer.Argument(help="run config YAML (model panel)"),
    out: Path = typer.Option(Path("runs/answers.jsonl")),
) -> None:
    """Fan questions out to the configured model panel (resumable; exits non-zero on failed cells)."""
    qs = load_questions(questions)
    cfg = load_config(config)
    typer.echo(f"{len(qs)} questions x {len(cfg.models)} models (concurrency {cfg.concurrency})")
    done, failed, messages = run_collect(
        qs, cfg, out,
        on_result=lambda q, m, text: typer.echo(f"  done {q.id} x {m.id}"),
    )
    typer.echo(f"collected {done} answers -> {out}")
    if failed:
        typer.secho(f"{failed} cell(s) FAILED (still pending; re-run to retry):", fg="red", err=True)
        for msg in messages:
            typer.secho(f"  {msg}", fg="red", err=True)
        raise typer.Exit(1)


@app.command()
def score(
    answers: Path = typer.Argument(help="answers.jsonl from `collect`"),
    scores_out: Path = typer.Option(Path("runs/scores.jsonl")),
    summary_out: Path = typer.Option(Path("runs/summary.json")),
) -> None:
    """Score all answers (strict + normalized + token-F1) and write the per-model summary."""
    summary = score_file(answers, scores_out)
    summary_out.parent.mkdir(parents=True, exist_ok=True)
    with open(summary_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)
        f.write("\n")
    typer.echo(f"wrote {scores_out} and {summary_out}\n")
    typer.echo(summary_markdown(summary))


def main() -> None:
    try:
        app()
    except (schema.SchemaError, conv.ConvertError, cat.CatalogueError) as e:
        typer.secho(f"error: {e}", fg="red", err=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
