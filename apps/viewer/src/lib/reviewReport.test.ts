import { describe, it, expect } from "vitest";
import {
  MAX_ISSUE_URL_LENGTH,
  REVIEW_ISSUE_LABEL,
  blankIssueUrl,
  blobUrl,
  buildReviewReport,
  issueTitle,
  prefilledIssueUrl,
  scenarioCheckFile,
} from "./reviewReport";
import {
  REVIEW_SAMPLE_SIZE,
  emptyState,
  withSample,
  withScenarioCheck,
  withTraditionCheck,
  type ReviewState,
} from "./review";

const REPO = "owner/repo";

function sampleState(): ReviewState {
  let s = emptyState();
  // Reviewer identity comes from the account in production; seed it directly for the report fixture.
  s = { ...s, reviewer: { name: "Rev. Example", contact: "rev@example.com", background: "pastor, 20 years" } };
  s = withSample(s, "sunni-islam", ["JLS-001", "JLS-050"], "seed42");
  s = withTraditionCheck(s, "sunni-islam", "source", { status: "approved", notes: "right choice of text" });
  s = withTraditionCheck(s, "sunni-islam", "guide", { status: "flagged", suggestion: "Add the exit-ramp principle" });
  s = withScenarioCheck(s, "sunni-islam", "JLS-001", "scoring", {
    status: "flagged",
    notes: "The wronged-party exception is missing.",
    suggestion: "Cite Q4:148 explicitly.",
  });
  return s;
}

describe("buildReviewReport", () => {
  const report = buildReviewReport({
    state: sampleState(),
    traditionId: "sunni-islam",
    displayName: "Sunni Islam",
    sha: "cafebabe",
    runId: "20260803",
    repo: REPO,
    now: new Date("2026-08-13T12:00:00Z"),
  });

  it("carries the reviewer identity, date, snapshot, run, and sample (with seed)", () => {
    expect(report).toContain("# Tradition review — Sunni Islam (`sunni-islam`)");
    expect(report).toContain("- Reviewer: Rev. Example");
    expect(report).toContain("- Contact: rev@example.com");
    expect(report).toContain("- Background: pastor, 20 years");
    expect(report).toContain("- Date: 2026-08-13");
    expect(report).toContain("- Corpus snapshot: `cafebabe`");
    expect(report).toContain("- Results run: 20260803");
    expect(report).toContain("JLS-001, JLS-050");
    expect(report).toContain("(seed `seed42`)");
  });

  it("renders each check's verdict, notes as blockquote, and suggestion, with pinned file links", () => {
    expect(report).toContain("✅ looks right");
    expect(report).toContain("⚠️ needs changes");
    expect(report).toContain("> right choice of text");
    expect(report).toContain("> The wronged-party exception is missing.");
    expect(report).toContain("> Cite Q4:148 explicitly.");
    expect(report).toContain(`https://github.com/${REPO}/blob/cafebabe/traditions/sunni-islam/source.md`);
    expect(report).toContain(
      `https://github.com/${REPO}/blob/cafebabe/traditions/sunni-islam/scenarios/JLS-001/judge-guidance.md`,
    );
  });

  it("omits untouched checks but still lists every sampled scenario", () => {
    // JLS-050 has no touched checks → listed compactly, with no per-check file links spent on it.
    expect(report).toContain("### JLS-050 — _not reviewed_");
    expect(report).not.toContain(
      `https://github.com/${REPO}/blob/cafebabe/traditions/sunni-islam/scenarios/JLS-050/turn1.md`,
    );
    // The untouched "not reviewed" status line no longer appears anywhere.
    expect(report).not.toContain("◻️ not reviewed");
    // JLS-001's untouched checks (scenario/judgement/pressures) are dropped; only its flagged
    // scoring check survives, so exactly one JLS-001 file link is present.
    expect(report).not.toContain(
      `https://github.com/${REPO}/blob/cafebabe/traditions/sunni-islam/scenarios/JLS-001/turn1.md`,
    );
  });

  it("degrades when nothing is known: no sha → main links, no run → '(none published)'", () => {
    const r = buildReviewReport({
      state: emptyState(),
      traditionId: "t",
      displayName: "T",
      sha: null,
      runId: null,
      repo: REPO,
      now: new Date("2026-08-13T12:00:00Z"),
    });
    expect(r).toContain("- Corpus snapshot: (unknown)");
    expect(r).toContain("- Results run: (none published)");
    expect(r).toContain("- Scenario sample: (none)");
  });
});

describe("scenarioCheckFile", () => {
  it("maps each check to the corpus file it reads against", () => {
    expect(scenarioCheckFile("t", "S-1", "scenario")).toBe("traditions/t/scenarios/S-1/turn1.md");
    expect(scenarioCheckFile("t", "S-1", "scoring")).toBe("traditions/t/scenarios/S-1/judge-guidance.md");
    expect(scenarioCheckFile("t", "S-1", "judgement")).toBe("traditions/t/scenarios/S-1/judge-guidance.md");
    expect(scenarioCheckFile("t", "S-1", "pressures")).toBe("traditions/t/scenarios/S-1/pressures.md");
  });
});

describe("submission URLs", () => {
  it("prefills title, label, and body (URL-encoded) when the report fits", () => {
    const url = prefilledIssueUrl(REPO, "Tradition review: X", "line one\nline two");
    expect(url).not.toBeNull();
    expect(url).toContain(`https://github.com/${REPO}/issues/new?title=`);
    expect(url).toContain(encodeURIComponent("Tradition review: X"));
    expect(url).toContain("labels=tradition-review");
    expect(url).toContain(encodeURIComponent("line one\nline two"));
  });

  it("returns null for a report too long to ride a URL (caller falls back to copy + blank issue)", () => {
    const url = prefilledIssueUrl(REPO, "t", "x".repeat(MAX_ISSUE_URL_LENGTH + 1));
    expect(url).toBeNull();
    expect(blankIssueUrl(REPO, "t")).toContain(`https://github.com/${REPO}/issues/new?title=t`);
  });

  // Regression for the real sample size: a full REVIEW_SAMPLE_SIZE report must still ride a
  // prefilled-issue URL. Before untouched checks were omitted, 42 always-emitted file links
  // overflowed MAX_ISSUE_URL_LENGTH even with zero answers, so production reviewers (10-scenario
  // samples) never got the prefilled path — only the copy fallback. (Prior tests used a 2-scenario
  // fixture and missed it.)
  it("keeps a full 10-scenario report within the prefilled-issue URL budget", () => {
    const ids = Array.from({ length: REVIEW_SAMPLE_SIZE }, (_, i) => `JLS-${String(i + 1).padStart(3, "0")}`);

    // Zero answers filled — the worst case for the old always-emit-every-link behavior.
    const blank = buildReviewReport({
      state: withSample(emptyState(), "sunni-islam", ids, "seed42"),
      traditionId: "sunni-islam",
      displayName: "Sunni Islam",
      sha: "cafebabe",
      runId: "20260803",
      repo: REPO,
      now: new Date("2026-08-13T12:00:00Z"),
    });
    expect(prefilledIssueUrl(REPO, "Tradition review: Sunni Islam", blank)).not.toBeNull();

    // A realistic partially-filled review (every check touched, with modest notes) still fits.
    let s = withSample(emptyState(), "sunni-islam", ids, "seed42");
    s = withTraditionCheck(s, "sunni-islam", "source", { status: "approved" });
    s = withTraditionCheck(s, "sunni-islam", "guide", { status: "flagged", notes: "add the exit-ramp principle" });
    for (const sid of ids) {
      s = withScenarioCheck(s, "sunni-islam", sid, "scoring", {
        status: "flagged",
        notes: "the wronged-party exception is missing here",
      });
    }
    const filled = buildReviewReport({
      state: s,
      traditionId: "sunni-islam",
      displayName: "Sunni Islam",
      sha: "cafebabe",
      runId: "20260803",
      repo: REPO,
      now: new Date("2026-08-13T12:00:00Z"),
    });
    expect(prefilledIssueUrl(REPO, "Tradition review: Sunni Islam", filled)).not.toBeNull();
  });

  // The label maintainers aggregate on (`gh issue list --label tradition-review`). It must exist
  // in the repo for GitHub to honor the `?labels=` param; pin the exact name so a rename here
  // can't silently diverge from the repo label.
  it("labels submitted issues with the aggregation label", () => {
    expect(REVIEW_ISSUE_LABEL).toBe("tradition-review");
    expect(prefilledIssueUrl(REPO, "t", "body")).toContain("labels=tradition-review");
    expect(blankIssueUrl(REPO, "t")).toContain("labels=tradition-review");
  });

  it("lists out-of-sample reviews in their own section (Beyond the assigned sample)", () => {
    let s = withSample(emptyState(), "sunni-islam", ["JLS-001", "JLS-002"], "");
    // A review of a scenario NOT in the required sample.
    s = withScenarioCheck(s, "sunni-islam", "JLS-099", "scenario", { status: "approved", notes: "extra look" });
    const report = buildReviewReport({
      state: s,
      traditionId: "sunni-islam",
      displayName: "Sunni Islam",
      sha: "cafebabe",
      runId: null,
      repo: REPO,
      now: new Date("2026-08-15T12:00:00Z"),
    });
    expect(report).toContain("## 4. Beyond the assigned sample");
    // The out-of-sample scenario appears AFTER the beyond-sample heading, not in the sample section.
    const beyondIdx = report.indexOf("## 4. Beyond the assigned sample");
    expect(report.indexOf("JLS-099", beyondIdx)).toBeGreaterThan(beyondIdx);
    const sampleSection = report.slice(report.indexOf("## 3. Scenarios"), beyondIdx);
    expect(sampleSection).not.toContain("JLS-099");
  });

  it("includes NOTES-ONLY out-of-sample commentary (no verdict clicked)", () => {
    let s = withSample(emptyState(), "sunni-islam", ["JLS-001"], "");
    // Notes typed on an out-of-sample scenario, but no verdict button clicked (status stays unreviewed).
    s = withScenarioCheck(s, "sunni-islam", "JLS-077", "scoring", { notes: "the exception is mishandled" });
    const report = buildReviewReport({ state: s, traditionId: "sunni-islam", displayName: "Sunni Islam", sha: null, runId: null, repo: REPO, now: new Date("2026-08-15T12:00:00Z") });
    expect(report).toContain("## 4. Beyond the assigned sample");
    const beyondIdx = report.indexOf("## 4. Beyond the assigned sample");
    expect(report.indexOf("JLS-077", beyondIdx)).toBeGreaterThan(beyondIdx);
    expect(report).toContain("the exception is mishandled");
  });

  it("omits the beyond-sample section when there is no out-of-sample review", () => {
    const s = withSample(emptyState(), "sunni-islam", ["JLS-001"], "");
    const report = buildReviewReport({ state: s, traditionId: "sunni-islam", displayName: "Sunni Islam", sha: null, runId: null, repo: REPO, now: new Date("2026-08-15T12:00:00Z") });
    expect(report).not.toContain("Beyond the assigned sample");
  });

  it("issueTitle includes the reviewer when known", () => {
    expect(issueTitle("Sunni Islam", "A. Reviewer")).toBe("Tradition review: Sunni Islam — A. Reviewer");
    expect(issueTitle("Sunni Islam", "  ")).toBe("Tradition review: Sunni Islam");
  });

  it("blob links pin the reviewed snapshot", () => {
    expect(blobUrl(REPO, "cafebabe", "traditions/t/guide.md")).toBe(
      `https://github.com/${REPO}/blob/cafebabe/traditions/t/guide.md`,
    );
  });
});
