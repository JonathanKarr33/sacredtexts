import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { fakeFetch, traditionFiles } from "../test/fakeRepo";
import { REPO } from "../lib/constants";
import {
  evenSample,
  flushReviewSaves,
  parseTraditionReview,
  resetReviewStore,
  type TraditionReview,
} from "../lib/review";

const SHA = "deadbeef";

// A combined fake: /api/* is served by an in-memory review backend (auth + per-tradition drafts with
// optimistic-concurrency versions); everything else delegates to the fake GitHub repo. Injected as
// the global fetch, so both the corpus queries and the review API client hit it. Signed in by default.
type Draft = { state: unknown; version: number };
function harness(files: ReturnType<typeof traditionFiles>) {
  const gh = fakeFetch(REPO, SHA, files);
  const drafts = new Map<string, Draft>();
  const submissions: Array<{
    traditionId: string;
    id: string;
    submittedAt: string;
    publishedIssueUrl: string | null;
    body: any; // the full submitted payload {review, provenance} — so tests can guard answers + provenance
  }> = [];
  const reviewer = { id: "r1", email: "rev@example.com", name: "Imam Test", background: "" };
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = String(input);
    const path = raw.startsWith("http") ? new URL(raw).pathname : new URL(raw, "http://x").pathname;
    if (!path.startsWith("/api/")) return gh(input as never, init);
    const method = init?.method ?? "GET";
    if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
    if (path === "/api/auth/me") return json({ reviewer });
    if (path === "/api/review") {
      return json({ drafts: [...drafts.entries()].map(([traditionId, d]) => ({ traditionId, ...d })) });
    }
    const submitMatch = path.match(/^\/api\/review\/([^/]+)\/submit$/);
    if (submitMatch && method === "POST") {
      const tid = decodeURIComponent(submitMatch[1]!);
      const b = JSON.parse(String(init?.body ?? "{}"));
      const meta = { id: `sub-${submissions.length + 1}`, submittedAt: "2026-08-15T12:00:00Z", publishedIssueUrl: b.publishedIssueUrl ?? null };
      submissions.push({ traditionId: tid, ...meta, body: b });
      return json({ submission: meta }, 201);
    }
    const listMatch = path.match(/^\/api\/review\/([^/]+)\/submissions$/);
    if (listMatch && method === "GET") {
      const tid = decodeURIComponent(listMatch[1]!);
      return json({ submissions: submissions.filter((s) => s.traditionId === tid) });
    }
    if (path.startsWith("/api/review/")) {
      const tid = decodeURIComponent(path.slice("/api/review/".length));
      if (method === "GET") return json(drafts.get(tid) ?? { state: null, version: 0 });
      if (method === "DELETE") {
        drafts.delete(tid);
        return json({ ok: true });
      }
      if (method === "PUT") {
        const b = JSON.parse(String(init?.body ?? "{}"));
        const cur = drafts.get(tid);
        const cv = cur?.version ?? 0;
        if (b.version === cv) {
          const version = cv + 1;
          drafts.set(tid, { state: b.state, version });
          return json({ version });
        }
        return json({ error: "conflict", state: cur?.state ?? null, version: cv }, 409);
      }
    }
    return json({ error: "not found" }, 404);
  }) as typeof fetch;

  vi.stubGlobal("fetch", impl);
  return { drafts, submissions, reviewer };
}

/** The persisted draft for a tradition, read back through the tolerant loader (after a flush). */
function stored(drafts: Map<string, Draft>, tid: string): TraditionReview {
  return parseTraditionReview(drafts.get(tid)?.state ?? null);
}
function seedDraft(drafts: Map<string, Draft>, tid: string, state: TraditionReview, version = 1) {
  drafts.set(tid, { state, version });
}

beforeEach(() => resetReviewStore());
afterEach(() => vi.unstubAllGlobals());

describe("review landing (/review)", () => {
  it("gates on sign-in, then says the three steps and lists traditions", async () => {
    harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review");
    expect(await screen.findByRole("heading", { name: /reviewer workspace/i })).toBeInTheDocument();
    const steps = screen.getByTestId("review-steps");
    expect(within(steps).getByText(/review the scenario source/i)).toBeInTheDocument();
    expect(within(steps).getByText(/review the guide/i)).toBeInTheDocument();
    expect(within(steps).getByText(/review your 10 scenarios/i)).toBeInTheDocument();
    expect(within(steps).getByText(/start with the scenario/i)).toBeInTheDocument();
    expect(await screen.findAllByTestId("review-tradition-card")).toHaveLength(1);
    // signed-in badge replaces the old in-app identity form
    expect(screen.getByTestId("reviewer-badge")).toHaveTextContent(/Imam Test/);
  });

  it("shows real progress on the landing page for a draft started on another device (prefetch)", async () => {
    const { drafts } = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    // A draft already exists server-side (from another device) with one answered check.
    seedDraft(drafts, "sunni-islam", {
      sampleSeed: "",
      sampleIds: ["JLS-001", "JLS-002"],
      source: { status: "approved", notes: "", suggestion: "" },
      guide: { status: "unreviewed", notes: "", suggestion: "" },
      scenarios: {},
    });
    renderApp("/review");
    const card = await screen.findByTestId("review-tradition-card");
    // Prefetch loads it → the card shows a progress bar, not "not started".
    await waitFor(() => expect(within(card).getByTestId("review-progress")).toBeInTheDocument());
    expect(within(card).queryByText(/not started/i)).not.toBeInTheDocument();
  });

  it("fails visibly with a notice when the review service is unreachable", async () => {
    const gh = fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001"]));
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.startsWith("/api/")) throw new Error("offline"); // service down (not a 401)
      return gh(input as never, init);
    }) as typeof fetch;
    vi.stubGlobal("fetch", impl);
    renderApp("/review");
    // Signed-out form with a service-unreachable notice — not a permanent spinner.
    expect(await screen.findByTestId("review-service-error")).toBeInTheDocument();
    expect(screen.getByTestId("review-auth-form")).toBeInTheDocument();
  });

  it("shows the sign-in form when there is no session", async () => {
    const gh = fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001"]));
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path === "/api/auth/csrf")
        return new Response(JSON.stringify({ csrfToken: "t" }), { status: 200 });
      if (path === "/api/auth/me") return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return gh(input as never, init);
    }) as typeof fetch;
    vi.stubGlobal("fetch", impl);
    renderApp("/review");
    expect(await screen.findByTestId("review-auth-form")).toBeInTheDocument();
  });
});

describe("tradition review workspace (/review/$traditionId)", () => {
  it("assigns an even sample on first open and persists it to the account", async () => {
    const { drafts } = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review/sunni-islam");
    expect(await screen.findByRole("heading", { name: /reviewing: sunni-islam/i })).toBeInTheDocument();
    expect(await screen.findByText("source of sunni-islam")).toBeInTheDocument();
    expect(screen.getByText("guide of sunni-islam")).toBeInTheDocument();
    expect(await screen.findAllByTestId("review-sample-row")).toHaveLength(2);
    await flushReviewSaves();
    await waitFor(() => expect(stored(drafts, "sunni-islam").sampleIds).toEqual(["JLS-001", "JLS-002"]));
  });

  it("records a tradition-level verdict (toggle + persist) and moves the progress readout", async () => {
    const { drafts } = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review/sunni-islam");
    const sourceCheck = await screen.findByTestId("review-check-source");
    await userEvent.click(within(sourceCheck).getByRole("button", { name: /looks right/i }));
    expect(within(sourceCheck).getByRole("button", { name: /looks right/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("review-progress")).toHaveTextContent("1/10 checks");
    await flushReviewSaves();
    expect(stored(drafts, "sunni-islam").source.status).toBe("approved");
    // clicking again retracts
    await userEvent.click(within(sourceCheck).getByRole("button", { name: /looks right/i }));
    await flushReviewSaves();
    expect(stored(drafts, "sunni-islam").source.status).toBe("unreviewed");
  });

  it("shows '+N beyond sample' and offers an affordance to review a non-sampled scenario", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `JLS-${String(i + 1).padStart(3, "0")}`);
    const { drafts } = harness(traditionFiles("sunni-islam", many));
    // Seed: a 3-scenario required sample, plus one answered check on an OUT-of-sample scenario.
    seedDraft(drafts, "sunni-islam", {
      sampleSeed: "",
      sampleIds: ["JLS-001", "JLS-002", "JLS-003"],
      source: { status: "unreviewed", notes: "", suggestion: "" },
      guide: { status: "unreviewed", notes: "", suggestion: "" },
      scenarios: { "JLS-020": { scenario: { status: "approved", notes: "", suggestion: "" }, scoring: { status: "unreviewed", notes: "", suggestion: "" }, judgement: { status: "unreviewed", notes: "", suggestion: "" }, pressures: { status: "unreviewed", notes: "", suggestion: "" } } },
    });
    const { router } = renderApp("/review/sunni-islam");
    // (b) the "+N beyond sample" count renders
    expect(await screen.findByTestId("review-beyond-sample")).toHaveTextContent("+1 beyond sample");
    // (a) the affordance navigates to a non-sampled scenario WITHOUT adding it to the sample
    const picker = screen.getByTestId("review-beyond-sample-picker");
    await userEvent.selectOptions(picker, "JLS-025");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/review/sunni-islam/JLS-025"),
    );
    expect(await screen.findByTestId("out-of-sample-note")).toBeInTheDocument();
    await flushReviewSaves();
    expect(stored(drafts, "sunni-islam").sampleIds).toEqual(["JLS-001", "JLS-002", "JLS-003"]); // unchanged
  });

  it("submits a private immutable snapshot (confirmed, non-empty), and keeps GitHub publishing opt-in", async () => {
    const h = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/review/sunni-islam");
    // Answer at least one check so there's something to submit (empty submissions are blocked).
    const sourceCheck = await screen.findByTestId("review-check-source");
    await userEvent.click(within(sourceCheck).getByRole("button", { name: /looks right/i }));

    const submit = await screen.findByTestId("review-submit");
    expect(within(submit).getByTestId("review-publish-optional")).toBeInTheDocument(); // publish is opt-in
    await userEvent.click(within(submit).getByTestId("review-submit-private"));
    await waitFor(() => expect(within(submit).getByTestId("review-submitted")).toBeInTheDocument());
    expect(confirmSpy).toHaveBeenCalled();
    expect(h.submissions).toHaveLength(1);
    expect(h.submissions[0]!.publishedIssueUrl).toBeNull(); // private by default
    // The frozen snapshot carries the reviewer's ACTUAL answers, not emptyTradition() — and provenance.
    // The immutable record is the envelope {review, provenance}; the HTTP layer nests it under `review`.
    const frozen = h.submissions[0]!.body.review;
    expect(frozen.review.source.status).toBe("approved");
    expect(frozen.provenance).toMatchObject({ traditionId: "sunni-islam", sha: SHA });
    confirmSpy.mockRestore();
  });

  it("submits a notes-only in-sample review (no verdict clicked)", async () => {
    // Regression: the empty-guard once used verdict-count `done`, which blocked a review that had
    // only typed notes (and no verdict) — even though those notes render in the report. Content, not
    // verdicts, decides whether there's something to submit.
    const h = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/review/sunni-islam");
    const sourceCheck = await screen.findByTestId("review-check-source");
    await userEvent.type(within(sourceCheck).getByRole("textbox", { name: /notes/i }), "wrong base text");

    const submit = await screen.findByTestId("review-submit");
    await userEvent.click(within(submit).getByTestId("review-submit-private"));
    await waitFor(() => expect(within(submit).getByTestId("review-submitted")).toBeInTheDocument());
    expect(h.submissions).toHaveLength(1);
    expect(h.submissions[0]!.body.review.review.source.notes).toBe("wrong base text");
    confirmSpy.mockRestore();
  });

  it("disables review inputs until the saved draft finishes loading", async () => {
    // Gate the per-tradition draft GET so we can observe the pre-load window. Inputs must be inert
    // until loadState is "ok" — an edit on the blank base would be discarded when the draft is adopted.
    const gh = fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    const reviewer = { id: "r1", email: "rev@example.com", name: "Imam Test", background: "" };
    const json = (o: unknown, s = 200) =>
      new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
    let releaseGet!: () => void;
    const getGate = new Promise<void>((r) => (releaseGet = r));
    const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = new URL(String(input), "http://x").pathname;
      if (!path.startsWith("/api/")) return gh(input as never, init);
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (path === "/api/auth/me") return json({ reviewer });
      if (path === "/api/review") return json({ drafts: [] });
      if (method === "GET") {
        await getGate; // hold the draft load
        return json({ state: null, version: 0 });
      }
      return json({ ok: true });
    }) as typeof fetch;
    vi.stubGlobal("fetch", impl);
    renderApp("/review/sunni-islam");

    const sourceCheck = await screen.findByTestId("review-check-source");
    // Draft still loading → the verdict button and notes are disabled.
    expect(within(sourceCheck).getByRole("button", { name: /looks right/i })).toBeDisabled();
    expect(within(sourceCheck).getByRole("textbox", { name: /notes/i })).toBeDisabled();

    releaseGet(); // load resolves → loadState "ok"
    await waitFor(() =>
      expect(within(sourceCheck).getByRole("button", { name: /looks right/i })).toBeEnabled(),
    );
  });

  it("blocks submitting an empty review", async () => {
    const h = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review/sunni-islam");
    const submit = await screen.findByTestId("review-submit");
    await userEvent.click(within(submit).getByTestId("review-submit-private")); // nothing reviewed yet
    await waitFor(() => expect(within(submit).getByRole("alert")).toHaveTextContent(/nothing to submit/i));
    expect(h.submissions).toHaveLength(0);
  });

  it("reshuffle draws a seeded sample and records the seed", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `JLS-${String(i + 1).padStart(3, "0")}`);
    const { drafts } = harness(traditionFiles("sunni-islam", many));
    renderApp("/review/sunni-islam");
    await screen.findAllByTestId("review-sample-row");
    await userEvent.click(screen.getByRole("button", { name: /reshuffle sample/i }));
    await flushReviewSaves();
    await waitFor(() => expect(stored(drafts, "sunni-islam").sampleSeed).not.toBe(""));
    expect(stored(drafts, "sunni-islam").sampleIds).toHaveLength(10);
  });

  it("reshuffle confirms before dropping completed scenario checks", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `JLS-${String(i + 1).padStart(3, "0")}`);
    const { drafts } = harness(traditionFiles("sunni-islam", many));
    // Pre-seed a saved draft with an assigned sample and one completed check.
    const first = evenSample(many)[0]!;
    seedDraft(drafts, "sunni-islam", {
      sampleSeed: "",
      sampleIds: evenSample(many),
      source: { status: "unreviewed", notes: "", suggestion: "" },
      guide: { status: "unreviewed", notes: "", suggestion: "" },
      scenarios: { [first]: { scenario: { status: "approved", notes: "", suggestion: "" }, scoring: { status: "unreviewed", notes: "", suggestion: "" }, judgement: { status: "unreviewed", notes: "", suggestion: "" }, pressures: { status: "unreviewed", notes: "", suggestion: "" } } },
    });

    renderApp("/review/sunni-islam");
    await screen.findAllByTestId("review-sample-row");

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: /reshuffle sample/i }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    await flushReviewSaves();
    expect(stored(drafts, "sunni-islam").sampleSeed).toBe("");

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /reshuffle sample/i }));
    await flushReviewSaves();
    await waitFor(() => expect(stored(drafts, "sunni-islam").sampleSeed).not.toBe(""));
    confirmSpy.mockRestore();
  });
});

describe("scenario review (/review/$traditionId/$scenarioId)", () => {
  it("walks the four checks with the content under review inline", async () => {
    harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review/sunni-islam/JLS-001");
    expect(await screen.findByTestId("review-check-scenario")).toBeInTheDocument();
    expect(await screen.findByText("turn1 for JLS-001")).toBeInTheDocument();
    expect(screen.getByText("judge guidance for JLS-001")).toBeInTheDocument();
    expect(screen.getByTestId("review-no-run")).toBeInTheDocument();
    expect(screen.getByTestId("review-check-pressures").querySelectorAll("[data-pressure]")).toHaveLength(6);
  });

  it("records a per-check verdict with notes, persisted under the right scenario", async () => {
    const { drafts } = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]));
    renderApp("/review/sunni-islam/JLS-001");
    const scoring = await screen.findByTestId("review-check-scoring");
    await userEvent.click(within(scoring).getByRole("button", { name: /needs changes/i }));
    await userEvent.type(within(scoring).getByLabelText("Notes"), "missing exception");
    await flushReviewSaves();
    const t = stored(drafts, "sunni-islam");
    expect(t.scenarios["JLS-001"]?.scoring.status).toBe("flagged");
    expect(t.scenarios["JLS-001"]?.scoring.notes).toBe("missing exception");
  });

  it("flags an out-of-sample scenario as beyond the assigned sample", async () => {
    const { drafts } = harness(traditionFiles("sunni-islam", ["JLS-001", "JLS-002", "JLS-003"]));
    // A saved draft whose required sample is only JLS-001; JLS-002 is therefore out-of-sample.
    seedDraft(drafts, "sunni-islam", {
      sampleSeed: "",
      sampleIds: ["JLS-001"],
      source: { status: "unreviewed", notes: "", suggestion: "" },
      guide: { status: "unreviewed", notes: "", suggestion: "" },
      scenarios: {},
    });
    renderApp("/review/sunni-islam/JLS-002");
    await screen.findByTestId("review-check-scenario");
    expect(await screen.findByTestId("out-of-sample-note")).toBeInTheDocument();
  });

  it("404s an unknown scenario id", async () => {
    harness(traditionFiles("sunni-islam", ["JLS-001"]));
    renderApp("/review/sunni-islam/NOPE-999");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });
});
