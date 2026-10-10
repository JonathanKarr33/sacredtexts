// Client for the review backend (apps/api). The SPA and API are separate origins, so every request
// is credentialed (`credentials: "include"`) and mutations echo the CSRF token in the X-CSRF-Token
// header (the token is delivered in login/signup bodies + GET /api/auth/csrf, since JS can't read the
// cross-origin cookie). `fetch` is injectable so tests drive a fake API without a live server.

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl = (...args) => fetch(...args);
/** Test seam: swap the fetch used by every call. */
export function setReviewFetch(impl: FetchImpl): void {
  fetchImpl = impl;
}

let csrfToken: string | null = null;

export class ReviewApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ReviewApiError";
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = init.method ?? "GET";
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET" && method !== "HEAD" && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  return fetchImpl(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export interface Reviewer {
  id: string;
  email: string;
  name: string;
  background?: string | null;
}

/** Fetch (and cache) a CSRF token so subsequent mutations can echo it. */
export async function fetchCsrf(): Promise<void> {
  const res = await call("/api/auth/csrf");
  if (res.ok) csrfToken = (await readJson(res))?.csrfToken ?? null;
}

/** The signed-in reviewer, or null if there is no valid session. Throws on a 5xx (service error). */
export async function me(): Promise<Reviewer | null> {
  const res = await call("/api/auth/me");
  if (res.status === 200) return (await readJson(res))?.reviewer ?? null;
  if (res.status >= 500) throw new ReviewApiError(res.status, "review service error");
  return null; // 401 / not signed in
}

async function authPost(path: string, body: unknown): Promise<Reviewer> {
  const res = await call(path, { method: "POST", body: JSON.stringify(body) });
  const json = await readJson(res);
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? `request failed (${res.status})`);
  csrfToken = json?.csrfToken ?? csrfToken;
  return json.reviewer;
}

export function login(email: string, password: string): Promise<Reviewer> {
  return authPost("/api/auth/login", { email, password });
}

export function signup(input: {
  email: string;
  password: string;
  name: string;
  background?: string;
  inviteCode: string;
}): Promise<Reviewer> {
  return authPost("/api/auth/signup", input);
}

export async function logout(): Promise<void> {
  await call("/api/auth/logout", { method: "POST" });
  csrfToken = null;
}

export interface DraftEnvelope {
  /** The stored TraditionReview shape (opaque here; the caller's tolerant zod parses it). */
  state: unknown;
  version: number;
}

/** All of the reviewer's drafts (for the landing page's cross-device progress). */
export async function listDrafts(): Promise<Array<{ traditionId: string } & DraftEnvelope>> {
  const res = await call("/api/review");
  if (res.status === 401) throw new ReviewApiError(401, "unauthorized");
  const json = await readJson(res);
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? "list failed");
  return (json?.drafts ?? []).map((d: any) => ({
    traditionId: d.traditionId,
    state: d.state ?? null,
    version: d.version ?? 0,
  }));
}

/** Discard a tradition's draft ("start over"). Idempotent. */
export async function deleteDraft(traditionId: string): Promise<void> {
  const res = await call(`/api/review/${encodeURIComponent(traditionId)}`, { method: "DELETE" });
  if (res.status === 401) throw new ReviewApiError(401, "unauthorized");
  if (!res.ok) throw new ReviewApiError(res.status, "delete failed");
}

export interface SubmissionMeta {
  id: string;
  submittedAt: string;
  publishedIssueUrl: string | null;
}

/**
 * Submit a review — a PRIVATE, immutable snapshot into the reviewer's account. `publishedIssueUrl` is
 * passed only if the reviewer also chose to publish to a public GitHub issue (opt-in).
 */
export async function submitReview(
  traditionId: string,
  review: unknown,
  publishedIssueUrl?: string,
): Promise<SubmissionMeta> {
  const res = await call(`/api/review/${encodeURIComponent(traditionId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ review, publishedIssueUrl }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? "submit failed");
  return json.submission;
}

/** This reviewer's submissions for a tradition (newest first, metadata only). */
export async function listSubmissions(traditionId: string): Promise<SubmissionMeta[]> {
  const res = await call(`/api/review/${encodeURIComponent(traditionId)}/submissions`);
  if (res.status === 401) throw new ReviewApiError(401, "unauthorized");
  const json = await readJson(res);
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? "list submissions failed");
  return json?.submissions ?? [];
}

/** Load a tradition's draft. Absent → {state: null, version: 0}. */
export async function getDraft(traditionId: string): Promise<DraftEnvelope> {
  const res = await call(`/api/review/${encodeURIComponent(traditionId)}`);
  if (res.status === 401) throw new ReviewApiError(401, "unauthorized");
  const json = await readJson(res);
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? "load failed");
  return { state: json?.state ?? null, version: json?.version ?? 0 };
}

export type PutDraftResult = { ok: true; version: number } | { ok: false; conflict: DraftEnvelope };

/** Save a tradition's draft with optimistic concurrency. A 409 returns the current server draft. */
export async function putDraft(
  traditionId: string,
  state: unknown,
  version: number,
): Promise<PutDraftResult> {
  const res = await call(`/api/review/${encodeURIComponent(traditionId)}`, {
    method: "PUT",
    body: JSON.stringify({ state, version }),
  });
  const json = await readJson(res);
  if (res.status === 409) {
    return { ok: false, conflict: { state: json?.state ?? null, version: json?.version ?? 0 } };
  }
  if (!res.ok) throw new ReviewApiError(res.status, json?.error ?? "save failed");
  return { ok: true, version: json.version };
}
