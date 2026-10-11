"""sacredbench CLI — convert / validate / generate / collect / score.

Run from the repo root:

    uv --project pipelines run python -m sacredbench --help
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import typer

from sacredbench import audit as aud
from sacredbench import catalogue as cat
from sacredbench import convert as conv
from sacredbench import export as exp
from sacredbench import generate as gen
from sacredbench import schema
from sacredbench.collect import CollectError
from sacredbench.collect import collect as run_collect
from sacredbench.config import load_config
from sacredbench.generate import generate as run_generate
from sacredbench.generate import load_questions, write_questions
from sacredbench.score import ScoreError, score_file, summary_markdown

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
    source: str = typer.Option(None, help="limit to one source-id, e.g. 'Protestant Christian'"),
    converter: str = typer.Option(None, help="limit to one converter, e.g. bible_flat"),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root"),
    standardized_root: Path = typer.Option(cat.STANDARDIZED_ROOT, help="output root"),
    include_restricted: bool = typer.Option(
        False, help="include restricted targets (needs the local held-back payloads)"
    ),
) -> None:
    """Convert catalogue targets to standardized documents.

    Catalogue-driven: each selected target is converted via its registered
    converter and written under the standardized-path convention
    (``texts/standardized/<source-id>/<target-slug>/``), so license is always
    recoverable from the output path. Restricted targets are excluded unless
    ``--include-restricted``.
    """
    sources = _require_catalogue(raw_root)
    targets = cat.select_targets(sources, include_restricted=include_restricted)
    if source is not None:
        targets = [t for t in targets if t.source_id == source]
    if converter is not None:
        targets = [t for t in targets if t.converter == converter]
    if not targets:
        raise typer.BadParameter(
            "no targets selected (check --source / --converter / --include-restricted)"
        )
    total_docs = total_entries = 0
    for t in targets:
        paths = t.payload_paths(raw_root)
        docs = conv.convert_target(paths, t)
        out_dir = t.standardized_dir(standardized_root)
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, d in enumerate(docs):
            if len(docs) == len(paths):
                stem = paths[i].stem  # one doc per payload file
            elif len(docs) == 1:
                stem = t.slug  # merged into one document
            else:
                stem = f"{t.slug}-{i:03d}"
            schema.write_document(d, out_dir / f"{stem}.json")
            total_entries += len(d.entries)
        total_docs += len(docs)
        typer.echo(f"  {t.source_id} :: {t.work} [{t.version}] -> {out_dir}/ ({len(docs)} doc(s))")
    typer.echo(
        f"converted {total_docs} document(s), {total_entries} entries from {len(targets)} target(s)"
    )


@app.command()
def export(
    inputs: list[Path] = typer.Argument(help="standardized doc(s)/dir(s) to assemble"),
    out: Path = typer.Option(Path("texts/interchange"), help="output directory (one file per work/version/language)"),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root (for the license gate)"),
    standardized_root: Path = typer.Option(cat.STANDARDIZED_ROOT, help="standardized texts root (for the license gate)"),
    include_restricted: bool = typer.Option(False, help="include restricted standardized docs"),
) -> None:
    """Assemble standardized shards into the interchange document per (work, version, language)."""
    sources = _require_catalogue(raw_root)
    for p in inputs:
        if not Path(p).exists():
            raise typer.BadParameter(f"input path not found: {p} — run `convert` first")
    files = cat.expand_json(list(inputs))
    if not files:
        raise typer.BadParameter(
            f"no standardized .json documents found under {[str(p) for p in inputs]}"
        )
    kept = cat.filter_standardized_paths(
        files, sources, include_restricted=include_restricted, standardized_root=standardized_root,
    )
    if not kept:
        raise typer.BadParameter(
            "all standardized documents were restricted and excluded (pass --include-restricted)"
        )
    docs = schema.load_documents(kept)
    assembled = exp.assemble(docs)
    exp.check_filename_collisions(assembled)
    ok = exp.roundtrip_ok(docs)
    if not ok:
        typer.secho("round-trip FAILED: an assembled document does not reproduce its shards", fg="red", err=True)
        raise typer.Exit(1)
    out.mkdir(parents=True, exist_ok=True)
    for d in assembled:
        schema.write_document(d, out / exp.interchange_filename(d))
    typer.echo(
        f"assembled {len(assembled)} interchange document(s) from {len(docs)} shard(s) "
        f"-> {out}/ (round-trip ok)"
    )


@app.command()
def audit(
    inputs: list[Path] = typer.Argument(help="committed artifact(s)/dir(s) to audit"),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root (catalogue)"),
) -> None:
    """Copyright audit: fail if any committed artifact is derived from a restricted source."""
    sources = cat.discover_catalogue(raw_root)
    violations = aud.audit_paths(list(inputs), sources)
    if violations:
        typer.secho(f"COPYRIGHT AUDIT FAILED — {len(violations)} violation(s):", fg="red", err=True)
        for v in violations:
            typer.secho(f"  {v}", fg="red", err=True)
        raise typer.Exit(1)
    typer.echo(f"copyright audit OK — no committed artifact derives from a restricted source ({len(list(inputs))} path(s))")


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
    tasks: str = typer.Option(None, help="comma-separated task subset, e.g. 'retrieve_quote,verify_source'"),
    quota: list[str] = typer.Option(None, help="per-task quota override, repeatable: 'task=N'"),
    seed: int = typer.Option(20261010),
    negatives_share: float = typer.Option(0.5, min=0.0, max=1.0, help="verify_source negative ratio"),
    raw_root: Path = typer.Option(cat.RAW_ROOT, help="raw texts root (for the license gate)"),
    standardized_root: Path = typer.Option(
        cat.STANDARDIZED_ROOT, help="standardized texts root (for the license gate)"
    ),
    include_restricted: bool = typer.Option(
        False, help="include restricted (copyrighted, held-back) standardized docs"
    ),
) -> None:
    """Generate benchmark questions from the six working-group templates."""
    task_subset = tuple(t.strip() for t in tasks.split(",") if t.strip()) if tasks else None
    quotas: dict[str, int] = {}
    for item in quota or []:
        if "=" not in item:
            raise typer.BadParameter(f"--quota must be 'task=N', got {item!r}")
        name, _, count = item.partition("=")
        try:
            quotas[name.strip()] = int(count)
        except ValueError as e:
            raise typer.BadParameter(f"--quota {item!r}: N must be an integer") from e
    sources = _require_catalogue(raw_root)
    for p in inputs:
        if not Path(p).exists():
            raise typer.BadParameter(
                f"input path not found: {p} — run `convert` to populate "
                f"{standardized_root} first"
            )
    files = cat.expand_json(list(inputs))
    if not files:
        raise typer.BadParameter(
            f"no standardized .json documents found under {[str(p) for p in inputs]} "
            "— run `convert` first"
        )
    kept = cat.filter_standardized_paths(
        files, sources, include_restricted=include_restricted,
        standardized_root=standardized_root,
    )
    if not kept:
        raise typer.BadParameter(
            "all standardized documents were restricted and excluded "
            "(pass --include-restricted to include them)"
        )
    docs = schema.load_documents(kept)
    works = {d.work for d in docs}
    if len(works) < 2 and negatives_share > 0:
        # not an automatic override — just a heads-up; generate() fails fast (per the
        # plan's insufficient-pool contract) if verify_source negatives are requested
        # on a single-work corpus. Pass --negatives-share 0 to generate positives only.
        typer.secho(
            "NOTE: single-work corpus — false-premise negatives need >=2 works; "
            "verify_source with negatives_share>0 will fail. Pass --negatives-share 0 "
            "(or --tasks without verify_source) for a single-work run.",
            fg="yellow", err=True,
        )
    questions = run_generate(
        docs, per_task=per_task, seed=seed, negatives_share=negatives_share,
        quotas=quotas or None, tasks=task_subset,
    )
    write_questions(questions, out)
    manifest = gen.build_manifest(docs, questions, seed, per_task, negatives_share, quotas or None, task_subset)
    mpath = gen.manifest_path(out)
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    by_task = {t: sum(1 for q in questions if q.task == t) for t in sorted({q.task for q in questions})}
    typer.echo(f"wrote {len(questions)} questions to {out} {by_task}")
    typer.echo(f"manifest {mpath} (digest {manifest['question_set_digest']}, corpus {manifest['corpus_hash']})")


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
    summary_md: Path = typer.Option(None, help="also write the markdown summary (incl. tradition breakdown) here"),
    questions: Path = typer.Option(None, help="questions.jsonl — with --config, report missing/failed cells"),
    config: Path = typer.Option(None, help="run config YAML (the model panel) for the expected-cell roster"),
) -> None:
    """Score all answers (strict + normalized + token-F1) and write the per-model summary."""
    if questions is not None or config is not None:
        if questions is None or config is None:
            raise typer.BadParameter("--questions and --config must be given together (missing-cell roster)")
        qs = load_questions(questions)
        cfg = load_config(config)
        expected = {}
        expected_tradition: dict[tuple[str, str, str], int] = {}
        for m in cfg.models:
            for q in qs:
                expected[(m.id, q.task)] = expected.get((m.id, q.task), 0) + 1
                for trad in q.source.get("tradition", []) or []:
                    k = (m.id, trad, q.task)
                    expected_tradition[k] = expected_tradition.get(k, 0) + 1
        summary = score_file(answers, scores_out, expected, expected_tradition)
    else:
        summary = score_file(answers, scores_out)
    summary_out.parent.mkdir(parents=True, exist_ok=True)
    with open(summary_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)
        f.write("\n")
    md = summary_markdown(summary)
    if summary_md is not None:
        summary_md.parent.mkdir(parents=True, exist_ok=True)
        summary_md.write_text(md, encoding="utf-8")
    typer.echo(f"wrote {scores_out} and {summary_out}" + (f" and {summary_md}" if summary_md else "") + "\n")
    typer.echo(md)


def main() -> None:
    try:
        app()
    except (
        schema.SchemaError, conv.ConvertError, cat.CatalogueError, exp.ExportError, CollectError,
        gen.GenerateError, ScoreError, aud.AuditError,
    ) as e:
        typer.secho(f"error: {e}", fg="red", err=True)
        sys.exit(2)


if __name__ == "__main__":
    main()
