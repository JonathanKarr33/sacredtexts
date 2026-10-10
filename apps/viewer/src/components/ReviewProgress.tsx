import type { ReviewProgress } from "../lib/review";

/** A thin progress readout for a tradition's review: n / total checks, with flagged count. */
export function ReviewProgressBar({ progress }: { progress: ReviewProgress }) {
  const pct = progress.total > 0 ? Math.round((100 * progress.done) / progress.total) : 0;
  return (
    <div className="flex items-center gap-2" data-testid="review-progress">
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-default-soft"
        role="progressbar"
        aria-valuenow={progress.done}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label="Review progress"
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs text-default-500">
        {progress.done}/{progress.total} checks
        {progress.flagged > 0 && <span className="text-warning"> · {progress.flagged} flagged</span>}
        {progress.beyondSample > 0 && (
          <span className="text-default-400" data-testid="review-beyond-sample">
            {" "}
            · +{progress.beyondSample} beyond sample
          </span>
        )}
      </span>
    </div>
  );
}
