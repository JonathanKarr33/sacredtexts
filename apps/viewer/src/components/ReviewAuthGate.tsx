import { useEffect, useState, type ReactNode } from "react";
import { CenteredSpinner } from "./Loading";
import {
  initReview,
  loginReview,
  logoutReview,
  signupReview,
  useReviewStatus,
} from "../lib/review";

// Auth gate for the /review workspace (Spec 92, Phase 2/3). Reviewer drafts now persist to the API
// per authenticated reviewer, so the workspace requires a session. `initReview` runs once to resolve
// the session (and a CSRF token); until it resolves we show a spinner, when signed-out we show the
// sign-in / create-account form, and when signed-in we render the workspace.

export function ReviewAuthGate({ children }: { children: ReactNode }) {
  const status = useReviewStatus();

  // `initReview` is idempotent (coalesces concurrent calls) and re-arms after a reset, so calling it
  // whenever the session is still "unknown" is safe and survives test remounts.
  useEffect(() => {
    if (status.auth === "unknown") void initReview();
  }, [status.auth]);

  if (status.auth === "unknown") return <CenteredSpinner label="Checking your session…" />;
  if (status.auth === "out") return <ReviewAuthForm initError={status.error} />;
  return <>{children}</>;
}

/** "Signed in as …" strip + sign-out, for the top of the workspace. */
export function ReviewerBadge() {
  const status = useReviewStatus();
  if (!status.reviewer) return null;
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg border border-default-200 bg-surface-secondary px-3 py-2 text-sm"
      data-testid="reviewer-badge"
    >
      <span className="text-default-600">
        Signed in as <strong>{status.reviewer.name || status.reviewer.email}</strong>
      </span>
      <button
        type="button"
        onClick={() => void logoutReview()}
        className="text-xs text-primary hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}

/** A small banner reflecting the async save state (saving / error / reconciled-from-another-device). */
export function ReviewSaveStatus() {
  const status = useReviewStatus();
  if (status.error) {
    const msg =
      status.errorKind === "load"
        ? `Couldn't load your saved draft (${status.error}) — retrying.`
        : `Couldn't save your last change (${status.error}). It stays on this device and will retry.`;
    return (
      <p className="text-xs text-danger" role="status" data-testid="review-save-status">
        {msg}
      </p>
    );
  }
  if (status.reconciled) {
    return (
      <p className="text-xs text-warning" role="status" data-testid="review-save-status">
        This tradition was updated on another device — reloaded the latest version.
      </p>
    );
  }
  if (status.saving) {
    return (
      <p className="text-xs text-default-400" role="status" data-testid="review-save-status">
        Saving…
      </p>
    );
  }
  // Idle with nothing pending — say nothing rather than a premature "Saved".
  return null;
}

function ReviewAuthForm({ initError }: { initError?: string | null }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await loginReview(email, password);
      } else {
        await signupReview({ email, password, name, background, inviteCode });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded border border-default-200 bg-background px-2 py-1.5 text-sm text-default-800";

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-lg border border-default-200 p-5"
      data-testid="review-auth-form"
    >
      <h2 className="text-lg font-semibold">
        {mode === "login" ? "Sign in to review" : "Create a reviewer account"}
      </h2>
      <p className="text-sm text-default-500">
        Your review drafts are saved privately to your account and sync across your devices.
      </p>

      {initError && (
        <p className="text-sm text-danger" role="alert" data-testid="review-service-error">
          {initError}
        </p>
      )}

      {mode === "signup" && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
            Name
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
            Background (your standing to review)
            <input
              className={input}
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="e.g. parish priest, 15 years"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
            Invite code
            <input
              className={input}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
        Email
        <input
          className={input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-default-500">
        Password
        <input
          className={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert" data-testid="review-auth-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
        className="text-xs text-primary hover:underline"
      >
        {mode === "login" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
