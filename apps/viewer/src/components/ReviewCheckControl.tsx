import { Check, TriangleAlert } from "lucide-react";
import type { CheckReview, CheckStatus } from "../lib/review";

// The one intake widget of the review workflow: a two-way verdict (looks right / needs changes),
// free-text notes, and a "suggested revision" box that flows verbatim into the submitted report.
// Notes + Suggested revision are the reviewer's way to propose changes; concrete edits ride along
// in the submitted report, not a per-check GitHub link.

const STATUS_OPTIONS: { value: Exclude<CheckStatus, "unreviewed">; label: string }[] = [
  { value: "approved", label: "Looks right" },
  { value: "flagged", label: "Needs changes" },
];

export function ReviewCheckControl({
  check,
  onChange,
  notesPlaceholder = "What did you find? Cite chapter/verse where helpful…",
  testId,
  disabled = false,
}: {
  check: CheckReview;
  onChange: (patch: Partial<CheckReview>) => void;
  notesPlaceholder?: string;
  testId?: string;
  /** While the saved draft is still loading (or its load failed), inputs are inert — an edit on a
   * blank base would be discarded when the server draft is adopted. Gate until the load succeeds. */
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-default-200 bg-surface-secondary p-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your verdict">
        <span className="text-xs font-semibold uppercase tracking-wide text-default-500">Your verdict</span>
        {STATUS_OPTIONS.map((o) => {
          const active = check.status === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              // Click again to un-answer (back to "unreviewed") — a reviewer can retract.
              onClick={() => onChange({ status: active ? "unreviewed" : o.value })}
              className={
                "flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors " +
                (active
                  ? o.value === "approved"
                    ? "border-success bg-success-soft text-success-soft-foreground"
                    : "border-warning bg-warning-soft text-warning-soft-foreground"
                  : "border-default-200 bg-background text-default-600 hover:border-default-300")
              }
            >
              {o.value === "approved" ? <Check size={14} aria-hidden /> : <TriangleAlert size={14} aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
        Notes
        <textarea
          value={check.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder={notesPlaceholder}
          rows={2}
          disabled={disabled}
          className="rounded border border-default-200 bg-background px-2 py-1 text-sm text-default-800 disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
        Suggested revision (optional — proposed replacement text, included verbatim in your report)
        <textarea
          value={check.suggestion}
          onChange={(e) => onChange({ suggestion: e.target.value })}
          placeholder="If you'd word it differently, put your version here…"
          rows={2}
          disabled={disabled}
          className="rounded border border-default-200 bg-background px-2 py-1 text-sm text-default-800 disabled:opacity-50"
        />
      </label>
    </div>
  );
}

/** Compact status glyph for checklists (e.g. the per-scenario rows on the tradition page). */
export function CheckStatusDot({ status, label }: { status: CheckStatus; label: string }) {
  const cls =
    status === "approved"
      ? "bg-success"
      : status === "flagged"
        ? "bg-warning"
        : "border border-default-300 bg-transparent";
  const text = status === "approved" ? "looks right" : status === "flagged" ? "needs changes" : "not reviewed";
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${cls}`}
      role="img"
      aria-label={`${label}: ${text}`}
      title={`${label}: ${text}`}
    />
  );
}
