// Minimal, self-contained parsing for a local benchmark run's artifacts
// (pipelines/sacredbench `score` output): summary.json + scores.jsonl joined with
// answers.jsonl for the per-question text. Deliberately independent of the GitHub
// data layer — this is the local-only results view (Spec 1 Phase 7); the rest of
// the viewer is a seed, not yet adapted.

export interface Cell {
  n: number;
  accuracy: number | null;
  exact?: number;
  normalized?: number;
  token_f1?: number;
  expected_n?: number;
  missing?: number;
}

export interface Summary {
  models: Record<string, Record<string, Cell>>; // modelId -> task | "_overall" -> Cell
  by_tradition?: Record<string, Record<string, Record<string, Cell>>>; // model -> tradition -> task -> Cell
}

export interface ScoreRow {
  question_id: string;
  model_id: string;
  task: string;
  metrics: { correct: number; [k: string]: unknown };
}

export interface AnswerRow {
  question_id: string;
  model_id: string;
  task: string;
  answer: string;
  question: { prompt: string; expected: Record<string, unknown>; source?: { tradition?: string[] } };
}

export interface QuestionResult {
  question_id: string;
  model_id: string;
  task: string;
  correct: boolean;
  prompt: string;
  answer: string;
  expected: string;
  tradition: string[];
}

export function parseSummary(obj: unknown): Summary {
  if (!obj || typeof obj !== "object" || !("models" in obj)) {
    throw new Error("summary.json: missing 'models'");
  }
  const s = obj as Summary;
  return { models: s.models ?? {}, by_tradition: s.by_tradition ?? {} };
}

export function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

function expectedText(expected: Record<string, unknown>): string {
  // the human-readable ground truth for the per-question list
  for (const k of ["text", "citation", "version", "answer", "work"]) {
    if (typeof expected[k] === "string") return expected[k] as string;
  }
  return JSON.stringify(expected);
}

/** Join scores (correctness) with answers (question/answer text) on (question_id, model_id). */
export function joinResults(scores: ScoreRow[], answers: AnswerRow[]): QuestionResult[] {
  const byKey = new Map<string, AnswerRow>();
  for (const a of answers) byKey.set(`${a.question_id}\u0000${a.model_id}`, a);
  const out: QuestionResult[] = [];
  for (const s of scores) {
    const a = byKey.get(`${s.question_id}\u0000${s.model_id}`);
    out.push({
      question_id: s.question_id,
      model_id: s.model_id,
      task: s.task,
      correct: s.metrics.correct === 1,
      prompt: a?.question.prompt ?? "",
      answer: a?.answer ?? "",
      expected: a ? expectedText(a.question.expected) : "",
      tradition: a?.question.source?.tradition ?? [],
    });
  }
  return out;
}

/** Tasks present across the summary's models, sorted, excluding the "_overall" key. */
export function summaryTasks(summary: Summary): string[] {
  const tasks = new Set<string>();
  for (const m of Object.values(summary.models)) {
    for (const t of Object.keys(m)) if (t !== "_overall") tasks.add(t);
  }
  return [...tasks].sort();
}

/** Models ranked by overall accuracy (null — no data — sorts last). */
export function rankedModels(summary: Summary): string[] {
  return Object.keys(summary.models).sort((a, b) => {
    const aa = summary.models[a]?._overall?.accuracy;
    const bb = summary.models[b]?._overall?.accuracy;
    return (bb ?? -1) - (aa ?? -1);
  });
}

export function formatCell(cell: Cell | undefined): string {
  if (!cell) return "—";
  if (cell.n === 0) return cell.missing ? `miss ${cell.missing}` : "—";
  const pct = cell.accuracy === null ? "n/a" : `${Math.round(cell.accuracy * 100)}%`;
  const miss = cell.missing ? ` −${cell.missing}` : "";
  return `${pct} (n=${cell.n})${miss}`;
}
