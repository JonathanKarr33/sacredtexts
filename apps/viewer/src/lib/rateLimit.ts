import { RateLimitError } from "./github";

/** Narrow an unknown error to a RateLimitError (or null). */
export function asRateLimit(error: unknown): RateLimitError | null {
  return error instanceof RateLimitError ? error : null;
}

/** Human "resets at HH:MM" string (or a generic phrase when unknown). */
export function resetLabel(err: RateLimitError): string {
  if (!err.resetAt) return "shortly";
  return err.resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
