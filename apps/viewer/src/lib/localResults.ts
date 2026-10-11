// Minimal, self-contained parsing for a local benchmark run's artifacts
// (pipelines/sacredbench `score` output): summary.json + scores.jsonl joined with
// answers.jsonl for the per-question text, and questions.jsonl as the authoritative
// roster so a model's un-answered questions ("missing cells") are listable. Deliberately
// independent of the GitHub data layer — this is the local-only results view.

export interface Cell {
  n: number;
  accuracy: number | null;
  exact?: number;
  normalized?: number;
  token_f1?: number;
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
  endpoint: string;
  // Nullable in the real data (e.g. the anthropic-hosted model reports served_by: null).
  served_by: string[] | null;
}

export interface Summary {
  models: Record<string, Record<string, Cell>>; // modelId -> task | "_overall" -> Cell
  by_tradition?: Record<string, Record<string, Record<string, Cell>>>; // model -> tradition -> task -> Cell
  usage?: Usage;
  panel?: Record<string, PanelEntry>;
}

export interface ScoreMetrics {
  correct: number;
  exact?: number;
  normalized?: number;
  token_f1?: number;
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
  prompt: string;
  answer: string;
  expected: string;
  tradition: string[];
  // Per-metric similarity scores the task emits; null where a task does not emit one
  // (or the question is missing). retrieve_quote/complete_unit emit all three;
  // identify_version emits exact/normalized; other tasks emit none.
  exact: number | null;
  normalized: number | null;
  token_f1: number | null;
}

export function parseSummary(obj: unknown): Summary {
  if (!obj || typeof obj !== "object" || !("models" in obj)) {
    throw new Error("summary.json: missing 'models'");
  }
  const s = obj as Summary;
  return {
    models: s.models ?? {},
    by_tradition: s.by_tradition ?? {},
    usage: s.usage,
    panel: s.panel,
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

function expectedText(task: string, expected: Record<string, unknown>): string {
  // the human-readable ground truth for the per-question list
  if (task === "identify_source" && typeof expected.work === "string") {
    const cite = typeof expected.citation === "string" ? ` — ${expected.citation}` : "";
    return `${expected.work}${cite}`;
  }
  for (const k of ["text", "citation", "version", "answer", "work"]) {
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
    prompt: a.question.prompt ?? "",
    answer: a.answer ?? "",
    expected: expectedText(s?.task ?? a.task, a.question.expected),
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
    prompt: q.prompt ?? "",
    answer: "",
    expected: expectedText(q.task, q.expected),
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
  // A present cell with no observations has null accuracy: surface the missing count when
  // there is one (more informative), otherwise "n/a" — the spec's required display for a
  // null-accuracy (e.g. null-overall) cell, rather than crashing or an ambiguous dash.
  if (cell.n === 0) return cell.missing ? `miss ${cell.missing}` : "n/a";
  const pct = cell.accuracy === null ? "n/a" : `${Math.round(cell.accuracy * 100)}%`;
  const miss = cell.missing ? ` −${cell.missing}` : "";
  return `${pct} (n=${cell.n})${miss}`;
}
