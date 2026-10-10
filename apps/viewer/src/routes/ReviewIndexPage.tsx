import { useEffect } from "react";
import { Card } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useLatestSha, useTraditions } from "../lib/queries";
import { REF, REPO } from "../lib/constants";
import { asRateLimit, resetLabel } from "../lib/rateLimit";
import {
  prefetchDrafts,
  REVIEW_SAMPLE_SIZE,
  traditionProgress,
  useReviewState,
  useReviewStatus,
} from "../lib/review";
import { ReviewAuthGate, ReviewerBadge } from "../components/ReviewAuthGate";
import { ReviewProgressBar } from "../components/ReviewProgress";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { CenteredSpinner } from "../components/Loading";
import { Notice } from "../components/Notice";

// The reviewer workspace's front door: says WHAT an expert reviewer is asked to do (the three
// steps) and routes them into a tradition. Behind the auth gate — reviewer identity is the
// authenticated account, and drafts persist to the API (see lib/review.ts), not localStorage.

export function ReviewIndexPage() {
  const shaQ = useLatestSha();
  const traditionsQ = useTraditions(shaQ.data);
  const traditions = traditionsQ.data;
  const review = useReviewState();
  const authStatus = useReviewStatus();

  // Once signed in, load ALL drafts at once so this page shows real cross-device progress (not
  // "not started") for traditions the reviewer already worked on from another device.
  useEffect(() => {
    if (authStatus.auth === "in") void prefetchDrafts();
  }, [authStatus.auth]);

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(traditionsQ.error);
  const otherError = !rl && (shaQ.error || traditionsQ.error);
  const loadingFirst = !traditions && !rl && !otherError;

  return (
    <ReviewAuthGate>
    <div className="flex flex-col gap-6" data-testid="review-index">
      {rl && <RateLimitBanner error={rl} />}
      <ReviewerBadge />

      <header className="max-w-3xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardCheck size={24} className="text-primary" aria-hidden /> Reviewer workspace
        </h1>
        <p className="mt-1 text-default-600">
          MultiBench scores AI assistants on whether their counsel stays faithful to a tradition&rsquo;s
          guidance. That only means something if the tradition&rsquo;s own materials are right — which is
          where you come in. Reviewing a tradition takes three steps:
        </p>
        <p className="mt-1 text-sm">
          <a
            href={`https://github.com/${REPO}/blob/${REF}/docs/analysis/tradition-reviewer-guide.md`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Read the full reviewer guide →
          </a>
        </p>
      </header>

      <ol className="flex max-w-3xl flex-col gap-3" data-testid="review-steps">
        <li className="rounded-lg border border-default-200 p-4">
          <h2 className="font-semibold">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground">1</span>
            Review the scenario source
          </h2>
          <p className="mt-1 text-sm text-default-600">
            Each tradition&rsquo;s scenarios are drawn from one canonical text (its <code>source.md</code>{" "}
            explains which, and why it was chosen). Check that the source is the right consensus-grade
            choice and is described fairly.
          </p>
        </li>
        <li className="rounded-lg border border-default-200 p-4">
          <h2 className="font-semibold">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground">2</span>
            Review the guide
          </h2>
          <p className="mt-1 text-sm text-default-600">
            The tradition&rsquo;s companionship guide (<code>guide.md</code>) describes what good,
            faith-faithful counsel looks like — it is also the system prompt in the Guided framing.
            Check that it reflects the tradition&rsquo;s understanding of a good influence on a person.
          </p>
        </li>
        <li className="rounded-lg border border-default-200 p-4">
          <h2 className="font-semibold">
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground">3</span>
            Review your {REVIEW_SAMPLE_SIZE} scenarios
          </h2>
          <p className="mt-1 text-sm text-default-600">You&rsquo;ll be assigned {REVIEW_SAMPLE_SIZE} scenarios. For each one:</p>
          <ul className="mt-2 list-disc pl-6 text-sm text-default-600">
            <li>
              <strong>Start with the scenario</strong> — is the dilemma real, well-posed, and anchored to
              the cited passage?
            </li>
            <li>
              <strong>Check the scoring guide</strong> — is the judge-guidance (what counts as good vs.
              compromised counsel here) correct for your tradition?
            </li>
            <li>
              <strong>Check the judges&rsquo; verdicts</strong> — read model answers next to the scores
              Gemini (the ranking judge) gave them; spot-check against the Opus validation layer where
              present. Do the verdicts apply the guidance correctly?
            </li>
            <li>
              <strong>Check the pressure points</strong> — are the six pushes (secularize, insistence,
              false authority, good cause, flattery, personal appeal) realistic and fairly worded?
            </li>
          </ul>
        </li>
      </ol>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pick a tradition to review</h2>

        {loadingFirst && <CenteredSpinner label="Loading traditions…" />}

        {!traditions && (rl || otherError) && (
          <Notice
            notice={{
              severity: "error",
              scope: "github",
              where: "GitHub",
              message: rl
                ? `Couldn't load traditions — GitHub's rate limit was reached and nothing is cached yet. Live data resumes around ${resetLabel(rl)}.`
                : `Could not load traditions: ${(otherError as Error).message}`,
            }}
          />
        )}

        {traditions && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="review-tradition-grid">
            {traditions.map((t) => {
              const progress = traditionProgress(review.traditions[t.id]);
              const started = progress.total > 0;
              return (
                <Link
                  key={t.id}
                  to="/review/$traditionId"
                  params={{ traditionId: t.id }}
                  className="block transition-transform hover:-translate-y-0.5"
                  data-testid="review-tradition-card"
                >
                  <Card className="h-full p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-semibold">{t.manifest?.displayName || t.id}</h3>
                      <span className="text-xs text-default-400">
                        {Math.min(REVIEW_SAMPLE_SIZE, t.scenarioIds.length)} of {t.scenarioIds.length} scenarios
                      </span>
                    </div>
                    <div className="mt-2">
                      {started ? (
                        <ReviewProgressBar progress={progress} />
                      ) : (
                        <span className="text-xs text-default-400">not started</span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
    </ReviewAuthGate>
  );
}
