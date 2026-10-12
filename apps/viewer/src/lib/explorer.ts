// Pure filter/predicate helpers for the error explorer — side-effect-free over the
// QuestionResult[] that loadRun() produces, so the composing filters and the missing-cell
// vs wrong-answer classification are directly unit-testable. The ExplorerPage container
// wires these to the URL (`?task=&tradition=&correct=&mode=`) and the presentational
// QuestionList / ExplorerFilters components render their output.

import type { QuestionResult } from "./localResults";

/** A failure's mode: a missing cell (the model produced no answer for a roster question)
 * vs a wrong answer (answered, but scored incorrect). A correct answer is neither. */
export type FailureMode = "missing" | "wrong";

/** Classify a result's failure mode, or null when it is not a failure (i.e. correct). */
export function failureMode(r: QuestionResult): FailureMode | null {
  if (r.correct) return null;
  return r.missing ? "missing" : "wrong";
}

/** The explorer's composing filter state — the URL search params, all optional. */
export interface ExplorerFilters {
  task?: string;
  tradition?: string;
  /** Restrict to correct or incorrect answers (a missing cell counts as incorrect). */
  correct?: "correct" | "incorrect";
  /** Restrict failures to one mode; composes with the other filters by AND. */
  mode?: FailureMode;
  /** Restrict to one reading from facct.json (exact, refusal, made up, …). */
  reading?: string;
}

/** The results for a single model, in roster order. */
export function modelQuestions(results: QuestionResult[], modelId: string): QuestionResult[] {
  return results.filter((r) => r.model_id === modelId);
}

/** Apply every active filter (AND-composed) to a model's question results. */
export function filterQuestions(results: QuestionResult[], f: ExplorerFilters): QuestionResult[] {
  return results.filter((r) => {
    if (f.task && r.task !== f.task) return false;
    if (f.tradition && !r.tradition.includes(f.tradition)) return false;
    if (f.correct === "correct" && !r.correct) return false;
    if (f.correct === "incorrect" && r.correct) return false;
    if (f.mode && failureMode(r) !== f.mode) return false;
    if (f.reading && r.reading !== f.reading) return false;
    return true;
  });
}

/** Distinct tasks present in a result set, sorted — the task-filter options. */
export function explorerTasks(results: QuestionResult[]): string[] {
  const s = new Set<string>();
  for (const r of results) s.add(r.task);
  return [...s].sort();
}

/** Distinct traditions present across a result set, sorted — the tradition-filter options.
 * A question can list more than one tradition (traditions share texts). */
export function explorerTraditions(results: QuestionResult[]): string[] {
  const s = new Set<string>();
  for (const r of results) for (const t of r.tradition) s.add(t);
  return [...s].sort();
}

export interface QuestionStats {
  total: number;
  correct: number;
  wrong: number;
  missing: number;
}

/** Counts over a result set: total, correct, wrong-answer, and missing-cell. */
export function questionStats(results: QuestionResult[]): QuestionStats {
  const stats: QuestionStats = { total: results.length, correct: 0, wrong: 0, missing: 0 };
  for (const r of results) {
    if (r.correct) stats.correct++;
    else if (r.missing) stats.missing++;
    else stats.wrong++;
  }
  return stats;
}

/** Display a per-metric similarity score; a metric the task does not emit is null → "n/a". */
export function formatMetric(v: number | null): string {
  return v === null ? "n/a" : String(v);
}
