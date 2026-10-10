import { useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, Copy, Download, ExternalLink, Plus, RotateCcw, Shuffle, Trash2, Upload } from "lucide-react";
import { runIdForTradition, useLatestSha, useResultsRuns, useScenarioMetas, useTradition } from "../lib/queries";
import { taxonomyValues } from "../lib/model";
import { FILE, REPO } from "../lib/constants";
import { asRateLimit, resetLabel } from "../lib/rateLimit";
import {
  REVIEW_SAMPLE_SIZE,
  SCENARIO_CHECKS,
  SCENARIO_CHECK_LABELS,
  emptyTradition,
  ensureTraditionLoaded,
  evenSample,
  flushReviewSaves,
  parseReviewState,
  peekReviewState,
  prefetchDrafts,
  replaceReviewState,
  scenarioChecksOf,
  seededSample,
  traditionProgress,
  updateReviewState,
  useReviewState,
  withSample,
  withTraditionCheck,
  withoutTradition,
} from "../lib/review";
import { blankIssueUrl, buildReviewReport, issueTitle, prefilledIssueUrl } from "../lib/reviewReport";
import { listSubmissions, submitReview, type SubmissionMeta } from "../lib/reviewApi";
import { ReviewAuthGate, ReviewSaveStatus } from "../components/ReviewAuthGate";
import { ReviewCheckControl, CheckStatusDot } from "../components/ReviewCheckControl";
import { ReviewProgressBar } from "../components/ReviewProgress";
import { Collapsible } from "../components/Collapsible";
import { Markdown } from "../components/Markdown";
import { Notice, Notices } from "../components/Notice";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { CenteredSpinner } from "../components/Loading";
import { NotFound } from "./NotFound";

const route = getRouteApi("/review/$traditionId");

// One tradition's review workspace: step 1 (the canonical source) and step 2 (the guide) inline,
// step 3 as the assigned scenario sample, then the submit panel. Intake persists to the reviewer's
// account (debounced, optimistic) as they work; SUBMISSION is explicit — see lib/review.ts.

export function ReviewTraditionPage() {
  return (
    <ReviewAuthGate>
      <ReviewTraditionPageInner />
    </ReviewAuthGate>
  );
}

function ReviewTraditionPageInner() {
  const { traditionId } = route.useParams();
  const navigate = useNavigate();
  const shaQ = useLatestSha();
  const sha = shaQ.data;
  const tradQ = useTradition(sha, traditionId);
  const tradition = tradQ.data;
  const runsQ = useResultsRuns(sha);
  const review = useReviewState();
  const mine = review.traditions[traditionId];

  // Load this reviewer's saved draft for the tradition before deciding whether to draw a fresh
  // sample — otherwise the auto-draw below would race the async load and clobber a saved assignment.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    let alive = true;
    // Only mark loaded on SUCCESS — a failed load must not let the auto-draw below run, or a blank
    // freshly-drawn sample could overwrite the reviewer's saved server draft.
    void ensureTraditionLoaded(traditionId).then((ok) => {
      if (alive && ok) setLoaded(true);
    });
    // Load the reviewer's other drafts too, so "Back up all my reviews" is complete even on a
    // direct load of this page (idempotent — a no-op if the landing page already prefetched).
    void prefetchDrafts();
    return () => {
      alive = false;
      void flushReviewSaves(); // persist any debounced edits when leaving the page
    };
  }, [traditionId]);

  // Materialize the assignment once per tradition (deterministic even spread) ONLY after the draft
  // has loaded and none exists. Never re-drawn automatically — the sample must not shift mid-review.
  const scenarioIds = tradition?.scenarioIds ?? [];
  useEffect(() => {
    if (loaded && !mine && scenarioIds.length > 0) {
      updateReviewState((s) => withSample(s, traditionId, evenSample(scenarioIds), ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mine === undefined, scenarioIds.length > 0, traditionId]);

  const declaredTax = useMemo(() => taxonomyValues(tradition?.manifest?.taxonomies ?? {}), [tradition]);
  const sampleIds = useMemo(() => mine?.sampleIds ?? [], [mine]);
  const metas = useScenarioMetas(sha, traditionId, sampleIds, declaredTax);

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(tradQ.error);
  const otherError = !rl && (shaQ.error || tradQ.error);

  if (!tradition && (rl || otherError)) {
    return (
      <div className="flex flex-col gap-4">
        {rl && <RateLimitBanner error={rl} />}
        <Notice notice={{ severity: "error", scope: "github", where: "GitHub",
          message: rl
            ? `Couldn't load this tradition — GitHub's rate limit was reached and nothing is cached yet. Live data resumes around ${resetLabel(rl)}.`
            : `Couldn't load this tradition: ${(otherError as Error).message}` }} />
      </div>
    );
  }
  if (tradQ.isLoading && !tradition) return <CenteredSpinner label="Loading tradition…" />;
  if (tradition === null) return <NotFound what={`Tradition “${traditionId}”`} />;
  if (!tradition) return null;

  const displayName = tradition.manifest?.displayName || traditionId;
  const progress = traditionProgress(mine);
  const base = `traditions/${traditionId}`;
  const unsampled = scenarioIds.filter((id) => !sampleIds.includes(id));
  // Completed scenario-level checks in the current sample — the work a reshuffle would strand.
  const answeredScenarioChecks = sampleIds.reduce((n, sid) => {
    const checks = scenarioChecksOf(mine, sid);
    return n + SCENARIO_CHECKS.filter((k) => checks[k].status !== "unreviewed").length;
  }, 0);

  return (
    <div className="flex flex-col gap-6" data-testid="review-tradition-page">
      {rl && <RateLimitBanner error={rl} />}

      <header className="flex flex-col gap-2 border-b border-default-200 pb-4">
        <nav className="text-sm">
          <Link to="/review" className="text-primary hover:underline">← All traditions</Link>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Reviewing: {displayName}</h1>
          <ReviewProgressBar progress={progress} />
        </div>
        <ReviewSaveStatus />
        <p className="text-sm text-default-600">
          Work top to bottom. Your answers save privately to your account as you type (and sync across
          your devices); when you&rsquo;re done, submit from the panel at the bottom.{" "}
          <Link to="/t/$traditionId" params={{ traditionId }} className="text-primary hover:underline">
            Browse this tradition normally →
          </Link>
        </p>
      </header>

      <Notices notices={tradition.notices} />

      {/* Step 1 — the canonical source */}
      <section className="flex flex-col gap-2" data-testid="review-step-source">
        <h2 className="text-lg font-semibold">1 · Review the scenario source</h2>
        <p className="text-sm text-default-600">
          Scenarios for {displayName} are drawn from{" "}
          <strong>{tradition.manifest?.canonicalSource.title ?? "the canonical source"}</strong>. Read the
          description below: is this the right consensus-grade source, and is it represented fairly?
        </p>
        <Collapsible title={`Read source.md`} defaultOpen>
          {tradition.prose.source
            ? <Markdown>{tradition.prose.source}</Markdown>
            : <Notice notice={{ severity: "error", scope: "tradition", where: `${base}/${FILE.source}`, message: "source.md is missing or empty." }} />}
        </Collapsible>
        <ReviewCheckControl
          check={mine?.source ?? { status: "unreviewed", notes: "", suggestion: "" }}
          onChange={(patch) => updateReviewState((s) => withTraditionCheck(s, traditionId, "source", patch))}
          testId="review-check-source"
          disabled={!loaded}
        />
      </section>

      {/* Step 2 — the guide */}
      <section className="flex flex-col gap-2" data-testid="review-step-guide">
        <h2 className="text-lg font-semibold">2 · Review the guide</h2>
        <p className="text-sm text-default-600">
          The companionship guide describes what counsel that leaves a person better off looks like in
          this tradition — it is also the exact system prompt models receive in the Guided framing. Does
          it reflect how {displayName} understands a good influence?
        </p>
        <Collapsible title={`Read guide.md`}>
          {tradition.prose.guide
            ? <Markdown>{tradition.prose.guide}</Markdown>
            : <Notice notice={{ severity: "error", scope: "tradition", where: `${base}/${FILE.guide}`, message: "guide.md is missing or empty." }} />}
        </Collapsible>
        <ReviewCheckControl
          check={mine?.guide ?? { status: "unreviewed", notes: "", suggestion: "" }}
          onChange={(patch) => updateReviewState((s) => withTraditionCheck(s, traditionId, "guide", patch))}
          testId="review-check-guide"
          disabled={!loaded}
        />
      </section>

      {/* Step 3 — the assigned scenarios */}
      <section className="flex flex-col gap-3" data-testid="review-step-scenarios">
        <h2 className="text-lg font-semibold">3 · Review your {sampleIds.length || REVIEW_SAMPLE_SIZE} scenarios</h2>
        <p className="text-sm text-default-600">
          Each scenario gets four checks: the scenario itself, its scoring guide, the judges&rsquo;
          verdicts on real model answers, and its six pressure points. Open one to begin — your
          assignment is an even spread across all {scenarioIds.length} scenarios (reshuffle or swap if
          you have reason to look elsewhere).
        </p>

        <ul className="flex flex-col gap-1" data-testid="review-sample-list">
          {sampleIds.map((sid) => {
            const i = sampleIds.indexOf(sid);
            const checks = scenarioChecksOf(mine, sid);
            const ghost = scenarioIds.length > 0 && !scenarioIds.includes(sid);
            return (
              <li key={sid} className="flex items-center gap-3 rounded border border-default-200 px-3 py-2" data-testid="review-sample-row">
                <Link
                  to="/review/$traditionId/$scenarioId"
                  params={{ traditionId, scenarioId: sid }}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary"
                >
                  <span className="font-mono text-sm">{sid}</span>
                  <span className="truncate text-xs text-default-500">{metas[i]?.data?.meta?.locusLabel ?? ""}</span>
                </Link>
                {ghost && (
                  <span className="text-xs text-warning">no longer in the corpus</span>
                )}
                <span className="flex items-center gap-1.5">
                  {SCENARIO_CHECKS.map((k) => (
                    <CheckStatusDot key={k} status={checks[k].status} label={`${sid} — ${SCENARIO_CHECK_LABELS[k]}`} />
                  ))}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${sid} from your sample`}
                  title="Remove from your sample"
                  disabled={!loaded || sampleIds.length <= 1}
                  onClick={() =>
                    updateReviewState((s) =>
                      withSample(s, traditionId, sampleIds.filter((x) => x !== sid), mine?.sampleSeed ?? ""))}
                  className="text-default-400 hover:text-danger disabled:opacity-30"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
                <Link
                  to="/review/$traditionId/$scenarioId"
                  params={{ traditionId, scenarioId: sid }}
                  aria-label={`Review ${sid}`}
                  className="text-primary"
                >
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            disabled={!loaded}
            onClick={() => {
              // Reshuffle draws a new sample; checks on scenarios that fall out become unreachable
              // and drop from the report. Confirm before discarding completed work — mirroring
              // "Start this tradition over" — but don't nag when there's nothing to lose.
              if (
                answeredScenarioChecks > 0 &&
                !window.confirm(
                  `Reshuffling draws a new set of ${REVIEW_SAMPLE_SIZE} scenarios and drops the ${answeredScenarioChecks} scenario check${answeredScenarioChecks === 1 ? "" : "s"} you've already completed from your report. Continue?`,
                )
              ) {
                return;
              }
              const seed = Math.random().toString(36).slice(2, 8);
              updateReviewState((s) => withSample(s, traditionId, seededSample(scenarioIds, REVIEW_SAMPLE_SIZE, seed), seed));
            }}
            className="flex items-center gap-1 rounded border border-default-200 px-3 py-1 text-default-600 hover:border-default-300 disabled:opacity-40"
          >
            <Shuffle size={14} aria-hidden /> Reshuffle sample
          </button>
          {unsampled.length > 0 && (
            <label className="flex items-center gap-1 text-xs font-medium text-default-500">
              <Plus size={14} aria-hidden /> Add a specific scenario
              <select
                value=""
                aria-label="Add a specific scenario"
                disabled={!loaded}
                onChange={(e) => {
                  const sid = e.target.value;
                  if (!sid) return;
                  const next = [...sampleIds, sid].sort((a, b) => scenarioIds.indexOf(a) - scenarioIds.indexOf(b));
                  updateReviewState((s) => withSample(s, traditionId, next, mine?.sampleSeed ?? ""));
                }}
                className="rounded border border-default-200 px-2 py-1 text-sm text-default-800 disabled:opacity-40"
              >
                <option value="">choose…</option>
                {unsampled.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          )}
          {unsampled.length > 0 && (
            <label className="flex items-center gap-1 text-xs font-medium text-default-500">
              <ExternalLink size={14} aria-hidden /> Review one beyond your sample
              <select
                value=""
                aria-label="Review a scenario beyond your sample"
                data-testid="review-beyond-sample-picker"
                onChange={(e) => {
                  const sid = e.target.value;
                  if (!sid) return;
                  // Open it for review WITHOUT adding to sampleIds — it stays out-of-sample (extra),
                  // so it doesn't change the required-completion count.
                  void navigate({ to: "/review/$traditionId/$scenarioId", params: { traditionId, scenarioId: sid } });
                }}
                className="rounded border border-default-200 px-2 py-1 text-sm text-default-800"
              >
                <option value="">choose…</option>
                {unsampled.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <SubmitPanel traditionId={traditionId} displayName={displayName} sha={sha ?? null} runId={runIdForTradition(runsQ.data?.runs ?? [], traditionId)} loaded={loaded} />
    </div>
  );
}

/** The explicit hand-off: submit PRIVATELY to the reviewer's account (immutable snapshot), then
 * optionally publish to a public GitHub issue; plus copy/download the report and back up / restore. */
function SubmitPanel({ traditionId, displayName, sha, runId, loaded }: {
  traditionId: string; displayName: string; sha: string | null; runId: string | null; loaded: boolean;
}) {
  const review = useReviewState();
  const [copied, setCopied] = useState<null | "report" | "failed">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionMeta[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishUrl, setPublishUrl] = useState("");

  useEffect(() => {
    let alive = true;
    void listSubmissions(traditionId)
      .then((s) => alive && setSubmissions(s))
      .catch((e) => alive && setSubmissionsError(e instanceof Error ? e.message : "couldn't load submissions"));
    return () => {
      alive = false;
    };
  }, [traditionId]);

  // Submit a PRIVATE immutable snapshot. `publishedIssueUrl` is set only when the reviewer opted to
  // also publish. Carries corpus/run provenance so the frozen record says what was reviewed.
  const submit = async (publishedIssueUrl?: string) => {
    if (!loaded) return; // button is disabled until the draft loads; guard anyway
    await flushReviewSaves(); // persist the latest edits, then read the freshest state
    const t = peekReviewState().traditions[traditionId] ?? emptyTradition();
    const progress = traditionProgress(t);
    // "Empty" = no content anywhere: no verdict AND no notes/suggestion, in-sample or beyond. Use the
    // content-based `contentful` (not `done`, which counts only verdicts) so a notes-only review — which
    // the report DOES render — can still be submitted.
    if (progress.contentful === 0 && progress.beyondSample === 0) {
      setSubmitError("Nothing to submit yet — review at least one check first.");
      return;
    }
    const publishing = !!publishedIssueUrl;
    const confirmMsg = publishing
      ? "Submit AND record a public GitHub issue link? A permanent, unchangeable snapshot is saved, and this marks the review as published (your name and contact become public)."
      : "Submit this review? A permanent, unchangeable snapshot is saved privately to your account.";
    if (!window.confirm(confirmMsg)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const snapshot = { review: t, provenance: { traditionId, sha, runId } };
      const meta = await submitReview(traditionId, snapshot, publishedIssueUrl);
      setSubmissions((prev) => [meta, ...prev]);
      setPublishUrl("");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const report = buildReviewReport({ state: review, traditionId, displayName, sha, runId, repo: REPO });
  const title = issueTitle(displayName, review.reviewer.name);
  const issueUrl = prefilledIssueUrl(REPO, title, report);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied("report");
    } catch {
      setCopied("failed");
    }
  };

  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    replaceReviewState(parseReviewState(await file.text()));
    setImportNote(`Restored from ${file.name}.`);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-surface-secondary p-4" data-testid="review-submit">
      <h2 className="text-lg font-semibold">Submit your review</h2>
      <p className="text-sm text-default-600">
        Submitting saves a <strong>private, permanent snapshot</strong> of this review to your account —
        it stays private (only you and the maintainers see it) and can&rsquo;t be changed afterward. You
        can still keep editing your draft and submit again later.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => void submit()} disabled={submitting || !loaded}
          data-testid="review-submit-private"
          className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-accent-foreground hover:opacity-90 disabled:opacity-60">
          <ClipboardCheck size={14} aria-hidden /> {submitting ? "Submitting…" : "Submit review (private)"}
        </button>
        <button type="button" onClick={copy}
          className="flex items-center gap-1.5 rounded border border-default-200 px-3 py-1.5 text-default-700 hover:border-default-300">
          <Copy size={14} aria-hidden /> {copied === "report" ? "Copied!" : copied === "failed" ? "Copy failed — use Download" : "Copy report"}
        </button>
        <button type="button" onClick={() => download(`multibench-review-${traditionId}.md`, report, "text/markdown")}
          className="flex items-center gap-1.5 rounded border border-default-200 px-3 py-1.5 text-default-700 hover:border-default-300">
          <Download size={14} aria-hidden /> Download report (.md)
        </button>
      </div>
      {submitError && <p className="text-xs text-danger" role="alert">Couldn&rsquo;t submit: {submitError}</p>}
      {submissionsError && (
        <p className="text-xs text-warning" role="status">Couldn&rsquo;t load your submission history ({submissionsError}).</p>
      )}
      {submissions.length > 0 && (
        <p className="text-xs text-success" data-testid="review-submitted">
          Submitted privately{submissions[0] ? ` · ${new Date(submissions[0].submittedAt).toLocaleString()}` : ""}
          {submissions.length > 1 ? ` (${submissions.length} submissions)` : ""}.
        </p>
      )}

      <details className="text-sm text-default-600" data-testid="review-publish-optional">
        <summary className="cursor-pointer text-default-500 hover:text-default-700">
          Optional: also publish to a public GitHub issue
        </summary>
        <p className="mt-2 text-xs text-default-500">
          This makes your review — including your name and contact — <strong>public</strong>. Only do
          this if you&rsquo;re comfortable sharing it openly.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {issueUrl ? (
            <a href={issueUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded border border-default-200 px-3 py-1.5 text-default-700 hover:border-default-300">
              <ExternalLink size={14} aria-hidden /> Open a prefilled GitHub issue
            </a>
          ) : (
            <a href={blankIssueUrl(REPO, title)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded border border-default-200 px-3 py-1.5 text-default-700 hover:border-default-300"
              title="The report is too long to prefill — copy it, then paste into the issue body.">
              <ExternalLink size={14} aria-hidden /> Open a GitHub issue (copy the report first)
            </a>
          )}
        </div>
        {!issueUrl && (
          <p className="mt-1 text-xs text-warning">
            This report is too long to prefill into a GitHub issue URL — use “Copy report”, then paste it
            into the issue body.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex flex-1 items-center gap-2 text-default-500">
            Opened it? Paste the issue URL to record it with your submission:
            <input
              type="url"
              value={publishUrl}
              onChange={(e) => setPublishUrl(e.target.value)}
              placeholder="https://github.com/…/issues/123"
              className="min-w-0 flex-1 rounded border border-default-200 bg-background px-2 py-1 text-default-800"
            />
          </label>
          <button type="button" disabled={submitting || !loaded || !publishUrl.trim()}
            onClick={() => void submit(publishUrl.trim())} data-testid="review-submit-published"
            className="rounded border border-default-200 px-2 py-1 text-default-700 hover:border-default-300 disabled:opacity-60">
            Submit as published
          </button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3 border-t border-default-200 pt-3 text-xs text-default-500">
        <button type="button"
          onClick={() => download("multibench-review-backup.json", JSON.stringify(review, null, 2), "application/json")}
          className="flex items-center gap-1 hover:text-default-700">
          <Download size={12} aria-hidden /> Back up all my reviews (JSON)
        </button>
        {/* Restore overwrites the whole review; gate it until the server draft has loaded, or a
            restore-onto-blank-base would be clobbered when the load resolves (same hazard as editing). */}
        <button type="button" disabled={!loaded} onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 hover:text-default-700 disabled:opacity-40">
          <Upload size={12} aria-hidden /> Restore from backup
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          aria-label="Restore review backup" disabled={!loaded}
          onChange={(e) => void onImport(e.target.files?.[0])} />
        <button type="button"
          onClick={() => {
            if (window.confirm(`Discard your entire ${displayName} review? This cannot be undone.`)) {
              updateReviewState((s) => withoutTradition(s, traditionId));
            }
          }}
          className="flex items-center gap-1 text-danger hover:opacity-80">
          <RotateCcw size={12} aria-hidden /> Start this tradition over
        </button>
        {importNote && <span>{importNote}</span>}
      </div>
    </section>
  );
}
