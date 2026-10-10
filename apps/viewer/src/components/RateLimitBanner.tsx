import { Clock } from "lucide-react";
import type { RateLimitError } from "../lib/github";
import { resetLabel } from "../lib/rateLimit";

// Shown when GitHub's unauthenticated rate limit (60/hr per IP) is hit. Non-blocking: the
// app keeps showing whatever data is already cached.
export function RateLimitBanner({ error }: { error: RateLimitError }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-800"
    >
      <Clock size={16} aria-hidden />
      <span>
        GitHub's rate limit was reached. Showing the latest cached data; live updates resume around{" "}
        <strong>{resetLabel(error)}</strong>.
      </span>
    </div>
  );
}
