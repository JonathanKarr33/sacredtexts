// Minimal, self-contained parsing for a local benchmark run's artifacts
// (pipelines/sacredbench `score` output): summary.json + scores.jsonl joined with
// answers.jsonl for the per-question text, and questions.jsonl as the authoritative
// roster so a model's un-answered questions ("missing cells") are listable. Deliberately
// independent of the GitHub data layer — this is the local-only results view.

export interface Cell {
  n: number;
  accuracy: number | null;
  // Spec 15 phase 3: the three-outcome split + coverage. accuracy = correct/(correct+incorrect)
  // (refusals excluded); coverage = (correct+incorrect)/n; refused_rate = refused/n. Optional so a
  // pre-phase-3 summary (or a null-accuracy stub) still parses.
  coverage?: number | null;
  correct?: number;
  incorrect?: number;
  refused?: number;
  refused_rate?: number | null;
  exact?: number;
  normalized?: number;
  token_f1?: number;
  contains_reference?: number;
  expected_n?: number;
  missing?: number;
}

export interface UsageTotals {
  calls: number;
  in: number;
  out: number;
}

export interface Usage {
  per_model: Record<string, UsageTotals>;
  total: UsageTotals;
}

export interface PanelEntry {
  provider: string;
  model: string;
  // The tools setting (e.g. ["web_search"]) is part of panel identity (Approach B): the
  // standings key incorporates it, so search-on/off stay distinct rows while a no-tools
  // entry keys identically to a bare run of the same model. Absent on pre-Approach-B runs
  // (e.g. first-run-2026-10-11) → the aggregator defaults a missing value to [].
  tools?: string[];
  endpoint: string;
  // Nullable in the real data (e.g. the anthropic-hosted model reports served_by: null).
  served_by: string[] | null;
}

export interface Summary {
  models: Record<string, Record<string, Cell>>; // modelId -> task | "_overall" -> Cell
  by_tradition?: Record<string, Record<string, Record<string, Cell>>>; // model -> tradition -> task -> Cell
  usage?: Usage;
  panel?: Record<string, PanelEntry>;
  // ISO-8601 UTC timestamp score.py stamps at summarise time: the mtime-independent recency
  // signal (Issue #7). Absent on pre-Issue-#7 runs; recency then falls back to the run id.
  generated_at?: string;
  // The named graders that scored this run (Spec 15, `score --evaluator`; default ["strict",
  // "containment"]). Preserved so the viewer can show the scoring contract and flag a cross-run
  // comparison of runs scored under DIFFERENT evaluator selections. Absent on pre-Spec-15 runs.
  evaluators?: string[];
}

export interface ScoreMetrics {
  correct: number;
  // Spec 15 phase 3: the always-on outcome on every answered cell.
  outcome?: "correct" | "incorrect" | "refused";
  exact?: number;
  normalized?: number;
  token_f1?: number;
  contains_reference?: number;
  [k: string]: unknown;
}

export interface ScoreRow {
  question_id: string;
  model_id: string;
  task: string;
  metrics: ScoreMetrics;
}

export interface AnswerRow {
  question_id: string;
  model_id: string;
  task: string;
  answer: string;
  question: { prompt: string; expected: Record<string, unknown>; source?: { tradition?: string[] } };
}

/** A row of the question roster (questions.jsonl) — the authoritative list of which
 * questions exist, independent of which a model answered. */
export interface QuestionRow {
  id: string;
  task: string;
  prompt: string;
  expected: Record<string, unknown>;
  source?: { tradition?: string[] };
}

export interface QuestionResult {
  question_id: string;
  model_id: string;
  task: string;
  correct: boolean;
  // True when the model produced no answer row for a question that exists in the roster
  // (a "missing cell"), as opposed to a wrong answer.
  missing: boolean;
  // True when the model answered but declined (outcome="refused", Spec 15) — distinct from both a
  // wrong answer and a missing cell. A refused cell has correct=false and missing=false.
  refused: boolean;
  prompt: string;
  answer: string;
  expected: string;
  tradition: string[];
  // Per-metric similarity scores the task emits; null where a task does not emit one
  // (or the question is missing). retrieve_quote/complete_unit emit these (per the selected
  // graders); cite_passage/verify_source emit none.
  exact: number | null;
  normalized: number | null;
  token_f1: number | null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseSummary(obj: unknown): Summary {
  if (!isRecord(obj) || !("models" in obj)) {
    throw new Error("summary.json: missing 'models'");
  }
  // Validate the nested shape the render path dereferences, so a structurally-malformed
  // summary (e.g. {"models":{"m":null}}) returns a typed "malformed" LoadResult rather than
  // throwing a TypeError deep in rankedModels/summaryTasks/leaderboardRows at render time.
  const { models, by_tradition, usage, panel } = obj as Record<string, unknown>;
  if (!isRecord(models)) {
    throw new Error("summary.json: 'models' is not an object");
  }
  for (const [id, cells] of Object.entries(models)) {
    if (!isRecord(cells)) throw new Error(`summary.json: models['${id}'] is not an object`);
  }
  if (by_tradition !== undefined && by_tradition !== null) {
    if (!isRecord(by_tradition)) throw new Error("summary.json: 'by_tradition' is not an object");
    for (const [id, perTrad] of Object.entries(by_tradition)) {
      if (!isRecord(perTrad)) throw new Error(`summary.json: by_tradition['${id}'] is not an object`);
      for (const [trad, cells] of Object.entries(perTrad)) {
        if (!isRecord(cells)) {
          throw new Error(`summary.json: by_tradition['${id}']['${trad}'] is not an object`);
        }
      }
    }
  }
  if (usage !== undefined && usage !== null) {
    if (!isRecord(usage) || !isRecord((usage as Record<string, unknown>).per_model)) {
      throw new Error("summary.json: 'usage.per_model' is not an object");
    }
  }
  if (panel !== undefined && panel !== null && !isRecord(panel)) {
    throw new Error("summary.json: 'panel' is not an object");
  }
  const s = obj as unknown as Summary;
  return {
    models: s.models,
    by_tradition: s.by_tradition ?? {},
    usage: s.usage,
    panel: s.panel,
    // Carried through for recency (Issue #7); only trusted when it is actually a string.
    generated_at: typeof s.generated_at === "string" ? s.generated_at : undefined,
    // Evaluator provenance (Spec 15): only trusted when it is an array of strings.
    evaluators:
      Array.isArray(s.evaluators) && s.evaluators.every((e) => typeof e === "string")
        ? (s.evaluators as string[])
        : undefined,
  };
}

export function parseJsonl<T>(text: string, where = "jsonl"): T[] {
  const out: T[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (e) {
      throw new Error(`${where}:${i + 1}: invalid JSON (${(e as Error).message})`);
    }
  }
  return out;
}

function expectedText(expected: Record<string, unknown>): string {
  // the human-readable ground truth for the per-question list: retrieve_quote/complete_unit → text,
  // cite_passage → citation, verify_source → answer (yes/no). Task-agnostic now that the two
  // provenance tasks (identify_version/identify_source) are retired.
  for (const k of ["text", "citation", "answer"]) {
    if (typeof expected[k] === "string") return expected[k] as string;
  }
  return JSON.stringify(expected);
}

function metricOrNull(metrics: ScoreMetrics | undefined, key: "exact" | "normalized" | "token_f1"): number | null {
  const v = metrics?.[key];
  return typeof v === "number" ? v : null;
}

function answeredResult(s: ScoreRow | undefined, a: AnswerRow, fallbackTask: string): QuestionResult {
  return {
    question_id: a.question_id,
    model_id: a.model_id,
    task: s?.task ?? a.task ?? fallbackTask,
    correct: s?.metrics.correct === 1,
    missing: false,
    refused: s?.metrics.outcome === "refused",
    prompt: a.question.prompt ?? "",
    answer: a.answer ?? "",
    expected: expectedText(a.question.expected),
    tradition: a.question.source?.tradition ?? [],
    exact: metricOrNull(s?.metrics, "exact"),
    normalized: metricOrNull(s?.metrics, "normalized"),
    token_f1: metricOrNull(s?.metrics, "token_f1"),
  };
}

function missingResult(model_id: string, q: QuestionRow): QuestionResult {
  return {
    question_id: q.id,
    model_id,
    task: q.task,
    correct: false,
    missing: true,
    refused: false,
    prompt: q.prompt ?? "",
    answer: "",
    expected: expectedText(q.expected),
    tradition: q.source?.tradition ?? [],
    exact: null,
    normalized: null,
    token_f1: null,
  };
}

/**
 * Join scores (correctness + metrics) with answers (question/answer text) on
 * (question_id, model_id).
 *
 * With `opts.roster` + `opts.models`, iterate the panel × roster so that a
 * (model, question) pair with no answer row becomes a **missing** result — this is how
 * un-answered "missing cells" are surfaced. Without a roster (the in-memory sample path),
 * iterate the scores rows (back-compat).
 */
export function joinResults(
  scores: ScoreRow[],
  answers: AnswerRow[],
  opts?: { roster?: QuestionRow[]; models?: string[] },
): QuestionResult[] {
  const answerByKey = new Map<string, AnswerRow>();
  for (const a of answers) answerByKey.set(`${a.question_id}\u0000${a.model_id}`, a);
  const scoreByKey = new Map<string, ScoreRow>();
  for (const s of scores) scoreByKey.set(`${s.question_id}\u0000${s.model_id}`, s);

  if (opts?.roster && opts?.models) {
    // The roster is authoritative (score.py binds answers to the question-set digest), so
    // we iterate models × roster: an answer row whose question_id is absent from the
    // roster is intentionally not emitted (a stale/mismatched roster would show as a count
    // gap against summary `n`).
    const out: QuestionResult[] = [];
    for (const model_id of opts.models) {
      for (const q of opts.roster) {
        const key = `${q.id}\u0000${model_id}`;
        const a = answerByKey.get(key);
        if (a) out.push(answeredResult(scoreByKey.get(key), a, q.task));
        else out.push(missingResult(model_id, q));
      }
    }
    return out;
  }

  // Back-compat: iterate scores (the sample has no roster).
  const out: QuestionResult[] = [];
  for (const s of scores) {
    const a = answerByKey.get(`${s.question_id}\u0000${s.model_id}`);
    if (a) {
      out.push(answeredResult(s, a, s.task));
    } else {
      out.push({
        question_id: s.question_id,
        model_id: s.model_id,
        task: s.task,
        correct: s.metrics.correct === 1,
        missing: false,
        refused: s.metrics.outcome === "refused",
        prompt: "",
        answer: "",
        expected: "",
        tradition: [],
        exact: metricOrNull(s.metrics, "exact"),
        normalized: metricOrNull(s.metrics, "normalized"),
        token_f1: metricOrNull(s.metrics, "token_f1"),
      });
    }
  }
  return out;
}

export type LoadResult =
  | { ok: true; summary: Summary; results: QuestionResult[] }
  | { ok: false; kind: "missing" | "http" | "malformed"; message: string };

/** Fetch one artifact's text, distinguishing missing (404 / non-JSON 200) from HTTP
 * failures. Shape-sniffing (a leading `<`) catches the SPA index.html a static host
 * returns 200 for an unknown path — so a prod host without the dev run endpoint yields a
 * clean "missing", not a crash. */
async function fetchArtifact(
  fetcher: typeof fetch,
  url: string,
): Promise<{ ok: true; text: string } | { ok: false; kind: "missing" | "http"; message: string }> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (e) {
    return { ok: false, kind: "http", message: `${url}: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, kind: res.status === 404 ? "missing" : "http", message: `${url}: HTTP ${res.status}` };
  }
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    // A body-read rejection must stay inside the LoadResult contract, not escape as a
    // thrown promise (so every caller gets a typed failure without its own try/catch).
    return { ok: false, kind: "http", message: `${url}: ${(e as Error).message}` };
  }
  if (text.trimStart().startsWith("<")) {
    return { ok: false, kind: "missing", message: `${url}: not JSON (looks like HTML) — treating as absent` };
  }
  return { ok: true, text };
}

/**
 * Load a run's artifacts from a base path (e.g. "/runs/<id>"), fetching all four of
 * summary.json + scores.jsonl + answers.jsonl + questions.jsonl. Returns a typed result
 * distinguishing a missing artifact, an HTTP failure, and malformed JSON/JSONL — the
 * caller surfaces a localized error rather than silently falling back.
 */
export async function loadRun(base: string, fetcher: typeof fetch = fetch): Promise<LoadResult> {
  const [s, sc, an, qs] = await Promise.all([
    fetchArtifact(fetcher, `${base}/summary.json`),
    fetchArtifact(fetcher, `${base}/scores.jsonl`),
    fetchArtifact(fetcher, `${base}/answers.jsonl`),
    fetchArtifact(fetcher, `${base}/questions.jsonl`),
  ]);
  // Any fetch that reported missing/http short-circuits (each narrows to the error shape).
  if (!s.ok) return s;
  if (!sc.ok) return sc;
  if (!an.ok) return an;
  if (!qs.ok) return qs;
  // Localize the summary parse (bare JSON.parse has no file context); the JSONL parses
  // are already localized to file:line by parseJsonl.
  let summary: Summary;
  try {
    summary = parseSummary(JSON.parse(s.text));
  } catch (e) {
    return { ok: false, kind: "malformed", message: `${base}/summary.json: ${(e as Error).message}` };
  }
  try {
    const scores = parseJsonl<ScoreRow>(sc.text, `${base}/scores.jsonl`);
    const answers = parseJsonl<AnswerRow>(an.text, `${base}/answers.jsonl`);
    const roster = parseJsonl<QuestionRow>(qs.text, `${base}/questions.jsonl`);
    const results = joinResults(scores, answers, { roster, models: Object.keys(summary.models) });
    return { ok: true, summary, results };
  } catch (e) {
    return { ok: false, kind: "malformed", message: (e as Error).message };
  }
}

export type SummaryResult =
  | { ok: true; summary: Summary }
  | { ok: false; kind: "missing" | "http" | "malformed"; message: string };

/**
 * Load just a run's `summary.json` from a base path. The cross-run standings view needs
 * only the per-model/panel rollup, not the per-question join, so it reads one artifact per
 * run instead of all four. Reuses the same `fetchArtifact` shape-sniff guard as `loadRun`,
 * so a production static host's 200-HTML answer for an unknown path reads as a clean
 * "missing" (that run is skipped) rather than crashing.
 */
export async function loadSummary(base: string, fetcher: typeof fetch = fetch): Promise<SummaryResult> {
  const s = await fetchArtifact(fetcher, `${base}/summary.json`);
  if (!s.ok) return s;
  try {
    return { ok: true, summary: parseSummary(JSON.parse(s.text)) };
  } catch (e) {
    return { ok: false, kind: "malformed", message: `${base}/summary.json: ${(e as Error).message}` };
  }
}

/** Tasks present across the summary's models, sorted, excluding the "_overall" key. */
export function summaryTasks(summary: Summary): string[] {
  const tasks = new Set<string>();
  for (const m of Object.values(summary.models)) {
    for (const t of Object.keys(m)) if (t !== "_overall") tasks.add(t);
  }
  return [...tasks].sort();
}

/** Models ranked by overall accuracy (null — no data — sorts last; model id breaks ties). */
export function rankedModels(summary: Summary): string[] {
  return Object.keys(summary.models).sort((a, b) => {
    const aa = summary.models[a]?._overall?.accuracy;
    const bb = summary.models[b]?._overall?.accuracy;
    const d = (bb ?? -1) - (aa ?? -1);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
}

export function formatCell(cell: Cell | undefined): string {
  if (!cell) return "—"; // no cell at all for this model × column
  // A null-accuracy cell is either fully-missing (n === 0) or fully-refused (n > 0, every answered
  // cell declined — Spec 15). The spec requires "n/a" rather than a crash or an ambiguous dash;
  // annotate with the missing count (n === 0 cells carry `{expected_n, missing}`) or, for an
  // all-refused cell, keep n and the refused count so the "n/a" isn't read as "no data".
  if (cell.accuracy === null) {
    if (cell.n > 0) return `n/a (n=${cell.n}; refused ${cell.refused ?? cell.n})`;
    return cell.missing ? `n/a (miss ${cell.missing})` : "n/a";
  }
  const miss = cell.missing ? ` −${cell.missing}` : "";
  return `${Math.round(cell.accuracy * 100)}% (n=${cell.n})${miss}`;
}

/** The coverage cell (Spec 15 phase 3): how often the model answered = (correct+incorrect)/n, with
 * the refused count beside it. "—" when the cell carries no coverage (pre-phase-3 or no data). */
export function formatCoverage(cell: Cell | undefined): string {
  if (!cell || cell.coverage === null || cell.coverage === undefined) return "—";
  const refused = cell.refused ?? 0;
  return `${Math.round(cell.coverage * 100)}%${refused ? ` (${refused} refused)` : ""}`;
}
