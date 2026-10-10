// The review workflow's SUBMIT seam: turn one tradition's reviewer intake into a Markdown
// report, and build the URLs that carry it to the maintainers (prefilled GitHub issue) or
// let the reviewer propose a concrete file change (GitHub's web editor, which forks for
// non-collaborators). Pure functions — everything here is unit-testable without a browser.

import type { CheckReview, ReviewState, ScenarioCheckKey, TraditionReview } from "./review";
import { SCENARIO_CHECKS, SCENARIO_CHECK_LABELS, scenarioChecksOf } from "./review";
import { FILE } from "./constants";

/** The issue label maintainers can aggregate on (`gh issue list --label tradition-review`).
 * GitHub ignores the param for reporters without triage rights — harmless either way. */
export const REVIEW_ISSUE_LABEL = "tradition-review";

/**
 * Keep prefilled-issue URLs comfortably under GitHub's ~8K handling limit; beyond this the form
 * silently truncates. Longer reports fall back to copy-the-report + a blank issue.
 */
export const MAX_ISSUE_URL_LENGTH = 6500;

const statusLine = (c: CheckReview): string =>
  c.status === "approved" ? "✅ looks right" : c.status === "flagged" ? "⚠️ needs changes" : "◻️ not reviewed";

/** A check the reviewer actually touched: a verdict, or notes, or a suggested revision. */
function isAnswered(c: CheckReview): boolean {
  return c.status !== "unreviewed" || c.notes.trim() !== "" || c.suggestion.trim() !== "";
}

/** Quote free text as a Markdown blockquote (safe against ``` in the reviewer's own text). */
function quoted(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

/**
 * One check's report section, or `null` when the reviewer never touched it. Omitting untouched
 * checks (and their file links) keeps a full-sample report short enough to ride a prefilled-issue
 * URL — with 42 checks per tradition, always emitting a file link overflows the URL guard even
 * when nothing is filled in (the copy-report fallback would otherwise be the only path).
 */
function checkSection(heading: string, c: CheckReview, filePath: string | null, repo: string, sha: string): string | null {
  if (!isAnswered(c)) return null;
  const lines = [`${heading}: ${statusLine(c)}`];
  if (filePath) lines.push(`  - file: https://github.com/${repo}/blob/${sha}/${filePath}`);
  if (c.notes.trim()) lines.push("", "  Notes:", "", quoted(c.notes));
  if (c.suggestion.trim()) lines.push("", "  Suggested revision:", "", quoted(c.suggestion));
  return lines.join("\n");
}

export interface ReportContext {
  state: ReviewState;
  traditionId: string;
  displayName: string;
  /** The pinned corpus snapshot the reviewer was reading (for exact file links). */
  sha: string | null;
  /** The results run whose verdicts were on screen (null when none is published). */
  runId: string | null;
  repo: string;
  /** Report timestamp — injectable for deterministic tests. */
  now?: Date;
}

/**
 * One tradition's full review as a Markdown report: reviewer identity, the two tradition-level
 * checks, then each assigned scenario's four checks with notes + suggested revisions, all linked
 * to the exact files at the reviewed snapshot.
 */
export function buildReviewReport(ctx: ReportContext): string {
  const { state, traditionId, displayName, repo, runId } = ctx;
  const sha = ctx.sha ?? "main";
  const t: TraditionReview =
    state.traditions[traditionId] ??
    ({ sampleSeed: "", sampleIds: [], source: emptyLike(), guide: emptyLike(), scenarios: {} } as TraditionReview);
  const when = (ctx.now ?? new Date()).toISOString().slice(0, 10);
  const base = `traditions/${traditionId}`;

  const out: string[] = [];
  out.push(`# Tradition review — ${displayName} (\`${traditionId}\`)`);
  out.push("");
  out.push(`- Reviewer: ${state.reviewer.name.trim() || "(not given)"}`);
  if (state.reviewer.contact.trim()) out.push(`- Contact: ${state.reviewer.contact.trim()}`);
  if (state.reviewer.background.trim()) out.push(`- Background: ${state.reviewer.background.trim()}`);
  out.push(`- Date: ${when}`);
  out.push(`- Corpus snapshot: ${ctx.sha ? `\`${ctx.sha}\`` : "(unknown)"}`);
  out.push(`- Results run: ${runId ?? "(none published)"}`);
  out.push(`- Scenario sample: ${t.sampleIds.length ? t.sampleIds.join(", ") : "(none)"}${t.sampleSeed ? ` (seed \`${t.sampleSeed}\`)` : ""}`);
  out.push("");
  out.push("## 1. Scenario source");
  out.push("");
  out.push(checkSection("Verdict", t.source, `${base}/${FILE.source}`, repo, sha) ?? "_Not reviewed._");
  out.push("");
  out.push("## 2. Companionship guide");
  out.push("");
  out.push(checkSection("Verdict", t.guide, `${base}/${FILE.guide}`, repo, sha) ?? "_Not reviewed._");
  out.push("");
  out.push("## 3. Scenarios");

  for (const sid of t.sampleIds) {
    const checks = scenarioChecksOf(t, sid);
    // Only the checks the reviewer actually touched — untouched ones (and their file links) are
    // omitted so a full 10-scenario report still fits a prefilled-issue URL.
    const sections = SCENARIO_CHECKS.map((key) =>
      checkSection(`**${SCENARIO_CHECK_LABELS[key]}**`, checks[key], scenarioCheckFile(traditionId, sid, key), repo, sha),
    ).filter((s): s is string => s !== null);
    out.push("");
    if (sections.length === 0) {
      // Keep the scenario listed (it's part of the assigned sample) but spend no file links on it.
      out.push(`### ${sid} — _not reviewed_`);
      continue;
    }
    out.push(`### ${sid}`);
    out.push("");
    for (const s of sections) {
      out.push(s);
      out.push("");
    }
  }

  // ## 4 — out-of-sample commentary (Waleed): scenarios the reviewer reviewed BEYOND the required
  // sample get their own section, kept distinct from the assigned-sample reviews above.
  const sampleSet = new Set(t.sampleIds);
  const extras = Object.keys(t.scenarios)
    .filter(
      (sid) =>
        !sampleSet.has(sid) &&
        // Match the per-check rendering: notes/suggestion count as commentary even without a verdict,
        // so a notes-only out-of-sample review isn't silently dropped from this section.
        SCENARIO_CHECKS.some((key) => isAnswered(scenarioChecksOf(t, sid)[key])),
    )
    .sort();
  if (extras.length > 0) {
    out.push("");
    out.push("## 4. Beyond the assigned sample");
    out.push("");
    out.push("_Outside the required sample — the reviewer chose to comment on these as well._");
    for (const sid of extras) {
      const checks = scenarioChecksOf(t, sid);
      const sections = SCENARIO_CHECKS.map((key) =>
        checkSection(`**${SCENARIO_CHECK_LABELS[key]}**`, checks[key], scenarioCheckFile(traditionId, sid, key), repo, sha),
      ).filter((s): s is string => s !== null);
      out.push("");
      out.push(`### ${sid}`);
      out.push("");
      for (const s of sections) {
        out.push(s);
        out.push("");
      }
    }
  }

  out.push("---");
  out.push("_Submitted from the MultiBrowser review workflow (`/review`)._ ");
  return out.join("\n");
}

function emptyLike(): CheckReview {
  return { status: "unreviewed", notes: "", suggestion: "" };
}

/** The corpus file each scenario check reads against (judgement → the judge-guidance it applies). */
export function scenarioCheckFile(tid: string, sid: string, key: ScenarioCheckKey): string {
  const base = `traditions/${tid}/${FILE.scenariosDir}/${sid}`;
  switch (key) {
    case "scenario":
      return `${base}/${FILE.turn1}`;
    case "scoring":
    case "judgement":
      return `${base}/${FILE.judgeGuidance}`;
    case "pressures":
      return `${base}/${FILE.pressures}`;
  }
}

/**
 * A prefilled new-issue URL carrying the report, or `null` when the report is too long to ride
 * a URL (the caller then offers copy-report + `blankIssueUrl`).
 */
export function prefilledIssueUrl(repo: string, title: string, body: string): string | null {
  const url =
    `https://github.com/${repo}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&labels=${encodeURIComponent(REVIEW_ISSUE_LABEL)}` +
    `&body=${encodeURIComponent(body)}`;
  return url.length <= MAX_ISSUE_URL_LENGTH ? url : null;
}

export function blankIssueUrl(repo: string, title: string): string {
  return (
    `https://github.com/${repo}/issues/new` +
    `?title=${encodeURIComponent(title)}` +
    `&labels=${encodeURIComponent(REVIEW_ISSUE_LABEL)}`
  );
}

export function issueTitle(displayName: string, reviewerName: string): string {
  const who = reviewerName.trim() ? ` — ${reviewerName.trim()}` : "";
  return `Tradition review: ${displayName}${who}`;
}

/** A pinned read link to the exact reviewed snapshot of a file. */
export function blobUrl(repo: string, shaOrRef: string, path: string): string {
  return `https://github.com/${repo}/blob/${shaOrRef}/${path}`;
}
