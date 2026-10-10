import { Fragment, useState, type ReactNode } from "react";
import { catalogScoreColor } from "../lib/rampColor";
import { findCell, type RawCatalog, type RawCell, type RawShard } from "../lib/rawModel";
import { isRankingJudge } from "../lib/leaderboard";
import { Markdown } from "./Markdown";

// Show a leading "+" only when the catalog's scale is SIGNED (min < 0, e.g. MultiBench −1…+1);
// an all-nonnegative scale (e.g. AFB 0–4) renders "3", never "+3" (catalog-generic promise, #54).
const fmtScore = (n: number, signedScale: boolean) => (signedScale && n > 0 ? `+${n}` : `${n}`);

/** Mean of a cell's verdict scores at one scope (rounded 2dp), or null if none. */
function scopeMean(cell: RawCell | undefined, scopeId: string | undefined): number | null {
  if (!cell || !scopeId) return null;
  const vs = cell.verdicts.filter((v) => v.scope === scopeId);
  if (!vs.length) return null;
  return Math.round((vs.reduce((s, v) => s + v.score, 0) / vs.length) * 100) / 100;
}

/** One judge verdict: score chip + signed number + judge, then the summary and rationale inline.
 *  Numeric score only (no band names — MultiBench policy); the chip carries an aria-label. */
export function VerdictCard({ verdict, catalog }: { verdict: RawCell["verdicts"][number]; catalog: RawCatalog }) {
  const judge = catalog.judges.find((j) => j.key === verdict.judge);
  return (
    <div className="flex flex-col gap-1" data-testid="verdict" data-judge={verdict.judge}>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded px-1 font-mono text-xs font-semibold text-default-900"
          role="img" aria-label={`score ${verdict.score}`}
          style={{ backgroundColor: catalogScoreColor(catalog.scale, catalog.ramp, verdict.score) }}>
          {fmtScore(verdict.score, catalog.scale.min < 0)}
        </span>
        <span className="text-default-500">{judge?.label ?? verdict.judge}</span>
        {judge && !isRankingJudge(judge) && (
          <span className="rounded bg-default-100 px-1.5 py-0.5 text-xs text-default-600" title="validation judge — a second opinion; the leaderboard ranks on the ranking judge">validation</span>
        )}
        {judge && !judge.fullGrid && (
          <span className="rounded bg-warning-100 px-1.5 py-0.5 text-xs text-warning-800" title="honest-sample judge — scored only a subset, not the full grid">sample</span>
        )}
      </div>
      {verdict.summary && <p className="text-sm font-medium text-default-700">{verdict.summary}</p>}
      {verdict.rationale && <div className="text-sm text-default-600"><Markdown>{verdict.rationale}</Markdown></div>}
    </div>
  );
}

// ── jalees-style conversation (the reference's main pane) ─────────────────────────────────────

/**
 * The conversation for one scenario cell, in order (a faithful port of jaleesbrowser): shared USER
 * turns (the question, then the selected pressure push) render ONCE full-width; ASSISTANT responses
 * sit side-by-side when comparing; and the judges' verdicts are **interleaved** — the first scope's
 * verdicts right after the first response, the remaining scopes' after the last. `b === null` is the
 * single-model view. Catalog-generic (subjects/scopes/scale/ramp from `catalog`, no MB vocab).
 *
 * `contextSlot` is a GENERIC full-width node the host may inject — rendered AFTER the first user turn
 * (the question) and BEFORE the first assistant response, so a reader sees WHAT was asked before any
 * framing of the answers (the raw item page passes the corpus judge-guidance here; #73 reading-order).
 * It stays MB-vocabulary-free — the slot is an opaque ReactNode, and a slot that renders nothing adds
 * no DOM, so a non-corpus catalog degrades to no gap (the #54 static guard stays green).
 */
export function RawComparison({ catalog, shard, a, b, conditions, contextSlot }: {
  catalog: RawCatalog; shard: RawShard; a: string; b: string | null; conditions: Record<string, string>;
  contextSlot?: ReactNode;
}) {
  const single = !b;
  const cellA = findCell(shard, a, conditions);
  const cellB = single ? undefined : findCell(shard, b!, conditions);
  const labelA = catalog.subjects.find((s) => s.id === a)?.label ?? a;
  const labelB = b ? (catalog.subjects.find((s) => s.id === b)?.label ?? b) : "";
  const maxTurns = Math.max(cellA?.transcript.length ?? 0, cellB?.transcript.length ?? 0);

  // Scope interleave, generic over count: first scope after the first response; all remaining after
  // the last (2 scopes → first-response then after-pressure; ≥3 → no middle scope dropped, AFB #54).
  const scopes = catalog.scopes;
  const initialScope = scopes[0];
  const restScopes = scopes.slice(1);

  const roleAt = (i: number) => cellA?.transcript[i]?.role ?? cellB?.transcript[i]?.role;
  const assistantIdx: number[] = [];
  let firstUser = -1;
  for (let i = 0; i < maxTurns; i++) {
    if (roleAt(i) === "assistant") assistantIdx.push(i);
    else if (roleAt(i) === "user" && firstUser === -1) firstUser = i;
  }
  const firstAssistant = assistantIdx[0];
  const lastAssistant = assistantIdx[assistantIdx.length - 1];

  const colGrid = single ? "" : "sm:grid-cols-2";

  const verdictStage = (scope: { id: string; label: string } | undefined, key: string): ReactNode => {
    if (!scope) return null;
    return (
      <div className="flex flex-col gap-3" data-testid="verdict-stage" data-scope={scope.id} key={key}>
        <p className="border-b border-default-200 pb-1 text-xs font-semibold uppercase tracking-wide text-default-500"
          title={`scope id: ${scope.id}`}>
          Judges — {scope.label}
        </p>
        <div className={`grid gap-6 ${colGrid}`}>
          <VerdictColumn cell={cellA} scope={scope.id} catalog={catalog} />
          {!single && <VerdictColumn cell={cellB} scope={scope.id} catalog={catalog} />}
        </div>
      </div>
    );
  };

  const rows: ReactNode[] = [
    <div className={`grid gap-6 ${colGrid}`} key="headers" data-testid="cmp-headers">
      <ColumnHeader id={a} label={labelA} cell={cellA} catalog={catalog} />
      {!single && <ColumnHeader id={b!} label={labelB} cell={cellB} catalog={catalog} />}
    </div>,
  ];
  for (let i = 0; i < maxTurns; i++) {
    if (roleAt(i) === "user") {
      const turn = cellA?.transcript[i] ?? cellB?.transcript[i];
      if (turn) rows.push(<TurnBlock key={`t${i}`} role="user" content={turn.content} />);
      // Full-width context slot: after the FIRST user turn (the question), before the first assistant
      // response. A Fragment (not a wrapping div) so a slot that renders nothing adds no DOM → no gap.
      if (i === firstUser && contextSlot) rows.push(<Fragment key="context-slot">{contextSlot}</Fragment>);
    } else {
      rows.push(
        <div className={`grid gap-6 ${colGrid}`} key={`t${i}`}>
          <TurnBlock role="assistant" content={cellA?.transcript[i]?.content} />
          {!single && <TurnBlock role="assistant" content={cellB?.transcript[i]?.content} />}
        </div>,
      );
      if (i === firstAssistant) rows.push(verdictStage(initialScope, `v-init-${i}`));
      if (i === lastAssistant) restScopes.forEach((sc, k) => rows.push(verdictStage(sc, `v-rest-${i}-${k}`)));
    }
  }

  return <div className="flex flex-col gap-4" data-testid="raw-comparison">{rows}</div>;
}

/** Model name (highlighted) + an inline score summary: "ansari (+1 first response → +0.5 after…)". */
function ColumnHeader({ id, label, cell, catalog }: { id: string; label: string; cell: RawCell | undefined; catalog: RawCatalog }) {
  const scopes = catalog.scopes;
  const init = scopeMean(cell, scopes[0]?.id);
  const post = scopeMean(cell, scopes[scopes.length - 1]?.id);
  const signedScale = catalog.scale.min < 0;
  const part = (v: number | null, lbl?: string) => (v === null ? "—" : `${fmtScore(v, signedScale)} ${lbl ?? ""}`.trim());
  return (
    <h3 className="text-base font-semibold text-primary" data-testid="cmp-column" data-subject={id}>
      {label}
      {cell ? (
        <span className="ml-1.5 text-sm font-normal text-default-500">
          ({part(init, scopes[0]?.label.toLowerCase())} → {part(post, scopes[scopes.length - 1]?.label.toLowerCase())})
        </span>
      ) : (
        <span className="ml-1.5 text-sm font-normal text-default-400">· no data</span>
      )}
    </h3>
  );
}

const TRUNCATE_CHARS = 700;

/** A conversation turn: a bordered block with a role label; long assistant answers get "Show more". */
function TurnBlock({ role, content }: { role: "user" | "assistant"; content: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (content === undefined) {
    return <div className="rounded-md border border-dashed border-default-200 p-4 text-sm italic text-default-400" aria-hidden>no response</div>;
  }
  const longAnswer = role === "assistant" && content.length > TRUNCATE_CHARS;
  const shown = longAnswer && !open ? content.slice(0, TRUNCATE_CHARS) : content;
  return (
    <div className="rounded-md border border-default-200 p-4" data-role={role}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-default-400">
        {role === "user" ? "User" : "Assistant"}
      </div>
      <Markdown>{shown}</Markdown>
      {longAnswer && (
        <button type="button" onClick={() => setOpen((v) => !v)} data-testid="show-more"
          className="mt-2 text-sm font-medium text-primary hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function VerdictColumn({ cell, scope, catalog }: { cell: RawCell | undefined; scope: string; catalog: RawCatalog }) {
  const verdicts = cell?.verdicts.filter((v) => v.scope === scope) ?? [];
  if (verdicts.length === 0) return <p className="text-sm text-default-400">No verdicts for this stage.</p>;
  return <div className="flex flex-col gap-3">{verdicts.map((v, i) => <VerdictCard key={i} verdict={v} catalog={catalog} />)}</div>;
}
