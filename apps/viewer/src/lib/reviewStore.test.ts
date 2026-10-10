import { describe, it, expect, beforeEach } from "vitest";
import { setReviewFetch } from "./reviewApi";
import {
  ensureTraditionLoaded,
  flushReviewSaves,
  initReview,
  peekReviewState,
  peekReviewStatus,
  peekVersion,
  prefetchDrafts,
  resetReviewStore,
  updateReviewState,
  withSample,
  withScenarioCheck,
  withTraditionCheck,
  withoutTradition,
} from "./review";

type Draft = { state: unknown; version: number };

/** A tiny in-memory fake of the review API that models optimistic-concurrency versions. */
function fakeApi(seed: Record<string, Draft> = {}) {
  const store = new Map(Object.entries(seed));
  const puts: Array<{ tid: string; version: number }> = [];
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(input), "http://x").pathname;
    const method = init?.method ?? "GET";
    if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
    if (path.startsWith("/api/review/")) {
      const tid = decodeURIComponent(path.slice("/api/review/".length));
      if (method === "GET") {
        const d = store.get(tid);
        return json(d ? { state: d.state, version: d.version } : { state: null, version: 0 });
      }
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        puts.push({ tid, version: body.version });
        const cur = store.get(tid);
        const curV = cur?.version ?? 0;
        if (body.version === curV) {
          const version = curV + 1;
          store.set(tid, { state: body.state, version });
          return json({ version });
        }
        return json({ error: "conflict", state: cur?.state ?? null, version: curV }, 409);
      }
    }
    return json({ error: "not found" }, 404);
  };
  return { impl: impl as unknown as typeof fetch, puts, store };
}

beforeEach(() => resetReviewStore());

describe("review store — async persistence", () => {
  it("saves a changed tradition optimistically and advances the version", async () => {
    const api = fakeApi();
    setReviewFetch(api.impl);

    updateReviewState((s) => withTraditionCheck(s, "t", "source", { status: "approved" }));
    // Optimistic: in memory immediately.
    expect(peekReviewState().traditions.t?.source.status).toBe("approved");

    await flushReviewSaves();
    expect(api.puts).toEqual([{ tid: "t", version: 0 }]); // new draft
    expect(peekVersion("t")).toBe(1);

    updateReviewState((s) => withTraditionCheck(s, "t", "guide", { status: "flagged" }));
    await flushReviewSaves();
    expect(api.puts).toEqual([
      { tid: "t", version: 0 },
      { tid: "t", version: 1 }, // update on the advanced version
    ]);
    expect(peekVersion("t")).toBe(2);
  });

  it("only saves the tradition that actually changed (reference diff)", async () => {
    setReviewFetch(fakeApi().impl);
    updateReviewState((s) => withTraditionCheck(s, "a", "source", { status: "approved" }));
    await flushReviewSaves();
    const api2 = fakeApi();
    setReviewFetch(api2.impl);
    updateReviewState((s) => withTraditionCheck(s, "b", "source", { status: "approved" }));
    await flushReviewSaves();
    expect(api2.puts.map((p) => p.tid)).toEqual(["b"]); // "a" not re-saved
  });

  it("reconciles a genuine concurrent conflict (last-write-wins) without dropping the active edit", async () => {
    // Load first (version 1), then another device advances the server to version 2 out-of-band.
    const api = fakeApi({ t: { state: { source: { status: "unreviewed" } }, version: 1 } });
    setReviewFetch(api.impl);
    await ensureTraditionLoaded("t");
    expect(peekVersion("t")).toBe(1);
    api.store.set("t", { state: { source: { status: "unreviewed" } }, version: 2 }); // concurrent write

    updateReviewState((s) => withScenarioCheck(s, "t", "S-1", "scenario", { status: "flagged" }));
    await flushReviewSaves();

    // PUT version 1 → 409 (server is at 2); retry with the server's version 2 → succeeds at 3.
    expect(api.puts).toEqual([
      { tid: "t", version: 1 },
      { tid: "t", version: 2 },
    ]);
    expect(peekVersion("t")).toBe(3);
    expect(api.store.get("t")?.version).toBe(3);
    // The active device's edit survived the reconcile.
    expect((api.store.get("t")?.state as any).scenarios["S-1"].scenario.status).toBe("flagged");
    // LWW is the design, but it must not be silent: even the SUCCESSFUL single retry (which overwrote
    // the other device's draft) raises the reconcile notice, not only the double-conflict server-wins path.
    expect(peekReviewStatus().reconciled).toBe("t");
  });

  it("does NOT overwrite a saved server draft when the initial load fails", async () => {
    // Server has a real saved draft (version 3). GET fails (network), but the user starts editing.
    const server = new Map<string, Draft>([
      ["t", { state: { source: { status: "approved", notes: "server work" } }, version: 3 }],
    ]);
    const puts: Array<{ version: number }> = [];
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") throw new Error("network down"); // draft load fails
      if (method === "PUT") {
        const b = JSON.parse(String(init?.body ?? "{}"));
        puts.push({ version: b.version });
        const cur = server.get("t")!;
        if (b.version === cur.version) {
          server.set("t", { state: b.state, version: cur.version + 1 });
          return json({ version: cur.version + 1 });
        }
        return json({ error: "conflict", state: cur.state, version: cur.version }, 409);
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    updateReviewState((s) => withTraditionCheck(s, "t", "guide", { status: "flagged" }));
    await flushReviewSaves();

    // The save must have been HELD (no PUT), because the load failed — the server draft is intact.
    expect(puts).toEqual([]);
    expect(server.get("t")?.version).toBe(3);
    expect((server.get("t")?.state as any).source.notes).toBe("server work");
    expect(peekReviewStatus().error).toBeTruthy();
  });

  it("retries a failed save on the next flush", async () => {
    let failNext = true;
    const saved = new Map<string, Draft>();
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") return json({ state: null, version: 0 });
      if (method === "PUT") {
        if (failNext) {
          failNext = false;
          throw new Error("network blip");
        }
        const b = JSON.parse(String(init?.body ?? "{}"));
        saved.set("t", { state: b.state, version: (saved.get("t")?.version ?? 0) + 1 });
        return json({ version: saved.get("t")!.version });
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    updateReviewState((s) => withTraditionCheck(s, "t", "source", { status: "approved" }));
    await flushReviewSaves(); // first attempt throws → held dirty + error
    expect(saved.has("t")).toBe(false);
    expect(peekReviewStatus().error).toBeTruthy();

    await flushReviewSaves(); // retry succeeds
    expect(saved.get("t")?.version).toBe(1);
    expect(peekReviewStatus().error).toBeNull();
  });

  it("fails visibly (signed-out) rather than hanging when the service is unreachable", async () => {
    setReviewFetch((async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    await initReview();
    const st = peekReviewStatus();
    expect(st.auth).toBe("out");
    expect(st.error).toBeTruthy();
  });

  it("adopts the server draft (not the blip edit) when a load fails then recovers", async () => {
    // GET fails once (blip), the reviewer edits during the failure, then GET recovers with the real
    // saved draft. The pre-load edit sat on a blank base, so the server draft must win (+ reconciled),
    // never overwriting the saved work.
    let getFails = true;
    const server = { source: { status: "approved", notes: "SERVER" }, sampleIds: ["S-9"], scenarios: {} };
    const puts: Array<{ version: number }> = [];
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") {
        if (getFails) {
          getFails = false;
          throw new Error("blip");
        }
        return json({ state: server, version: 7 });
      }
      if (method === "PUT") {
        puts.push({ version: JSON.parse(String(init?.body ?? "{}")).version });
        return json({ version: 8 });
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    // First load fails.
    expect(await ensureTraditionLoaded("t")).toBe(false);
    // Reviewer edits during the outage → local blank base + a flagged check.
    updateReviewState((s) => withScenarioCheck(s, "t", "S-1", "scenario", { status: "flagged" }));
    await flushReviewSaves();

    // The server draft was adopted (its sampleIds/source), the blip edit discarded, reconciled flagged.
    expect(peekReviewState().traditions.t?.source.status).toBe("approved");
    expect(peekReviewState().traditions.t?.sampleIds).toEqual(["S-9"]);
    expect(peekReviewState().traditions.t?.scenarios["S-1"]).toBeUndefined();
    expect(peekReviewStatus().reconciled).toBe("t");
  });

  it("start over deletes the server draft", async () => {
    const server = new Map<string, Draft>([["t", { state: { source: { status: "approved" } }, version: 2 }]]);
    let deleted = false;
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") return json(server.get("t") ?? { state: null, version: 0 });
      if (method === "DELETE") {
        deleted = true;
        server.delete("t");
        return json({ ok: true });
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    await ensureTraditionLoaded("t");
    updateReviewState((s) => withoutTradition(s, "t")); // "start over"
    await flushReviewSaves();
    expect(deleted).toBe(true);
    expect(server.has("t")).toBe(false);
  });

  it("clears all cached draft state when the session expires (no cross-reviewer leak)", async () => {
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") return json({ state: { source: { status: "approved", notes: "A" } }, version: 2 });
      if (method === "PUT") return json({ error: "unauthorized" }, 401); // session expired mid-save
      return json({}, 404);
    }) as unknown as typeof fetch);

    await ensureTraditionLoaded("t"); // reviewer A's saved draft is now in memory
    expect(peekReviewState().traditions.t?.source.status).toBe("approved");
    updateReviewState((s) => withTraditionCheck(s, "t", "guide", { status: "flagged" }));
    await flushReviewSaves(); // PUT → 401

    // The store is wiped and signed out — a different reviewer signing in next sees nothing of A's.
    expect(peekReviewState().traditions).toEqual({});
    expect(peekVersion("t")).toBe(0);
    expect(peekReviewStatus().auth).toBe("out");
  });

  it("serializes a start-over delete before a re-drawn save so the fresh draft wins", async () => {
    const server = new Map<string, Draft>([["t", { state: { source: { status: "approved" } }, version: 4 }]]);
    const ops: string[] = [];
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") return json(server.get("t") ?? { state: null, version: 0 });
      if (method === "DELETE") {
        ops.push("del");
        server.delete("t");
        return json({ ok: true });
      }
      if (method === "PUT") {
        ops.push("put");
        const b = JSON.parse(String(init?.body ?? "{}"));
        const cv = server.get("t")?.version ?? 0;
        if (b.version === cv) {
          server.set("t", { state: b.state, version: cv + 1 });
          return json({ version: cv + 1 });
        }
        return json({ error: "conflict", state: server.get("t")?.state ?? null, version: cv }, 409);
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    await ensureTraditionLoaded("t");
    updateReviewState((s) => withoutTradition(s, "t")); // start over → delete
    updateReviewState((s) => withSample(s, "t", ["S-1"], "")); // re-drawn fresh sample → save
    await flushReviewSaves();

    expect(ops).toEqual(["del", "put"]); // delete ran first, then the fresh save
    expect(server.get("t")?.version).toBe(1); // a fresh draft exists server-side
    expect((server.get("t")?.state as any).sampleIds).toEqual(["S-1"]);
  });

  it("clears pendingDeletes on success so a later flush can't delete a recreated draft", async () => {
    const server = new Map<string, Draft>([["t", { state: { source: { status: "approved" } }, version: 3 }]]);
    const ops: string[] = [];
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (method === "GET") return json(server.get("t") ?? { state: null, version: 0 });
      if (method === "DELETE") {
        ops.push("del");
        server.delete("t");
        return json({ ok: true });
      }
      if (method === "PUT") {
        ops.push("put");
        const b = JSON.parse(String(init?.body ?? "{}"));
        const cv = server.get("t")?.version ?? 0;
        if (b.version === cv) {
          server.set("t", { state: b.state, version: cv + 1 });
          return json({ version: cv + 1 });
        }
        return json({ error: "conflict", state: server.get("t")?.state ?? null, version: cv }, 409);
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    await ensureTraditionLoaded("t");
    updateReviewState((s) => withoutTradition(s, "t")); // start over → delete
    await flushReviewSaves();
    expect(peekReviewStatus().saving).toBe(false); // not stuck "saving"

    // Recreate the tradition, then flush AGAIN — the stale pendingDeletes must NOT re-delete it.
    updateReviewState((s) => withSample(s, "t", ["S-1"], ""));
    await flushReviewSaves();
    expect(ops).toEqual(["del", "put"]); // exactly one delete, then the recreate's save — no second del
    expect(server.get("t")?.state).toBeTruthy();
  });

  it("prefetchDrafts adopts the server draft when a blank-based local entry exists", async () => {
    const server = { source: { status: "approved", notes: "SERVER" }, sampleIds: ["S-9"], scenarios: {} };
    const puts: number[] = [];
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    let getFails = true;
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (path === "/api/review") return json({ drafts: [{ traditionId: "t", state: server, version: 9 }] });
      if (method === "GET") {
        if (getFails) {
          getFails = false;
          throw new Error("blip");
        }
        return json({ state: server, version: 9 });
      }
      if (method === "PUT") {
        puts.push(JSON.parse(String(init?.body ?? "{}")).version);
        return json({ version: 10 });
      }
      return json({}, 404);
    }) as unknown as typeof fetch);

    // Failed load, then an edit on a blank base.
    expect(await ensureTraditionLoaded("t")).toBe(false);
    updateReviewState((s) => withScenarioCheck(s, "t", "S-1", "scenario", { status: "flagged" }));
    // Prefetch (from visiting /review) must ADOPT the server draft, not just mark it loaded.
    await prefetchDrafts();
    expect(peekReviewState().traditions.t?.source.status).toBe("approved");
    expect(peekReviewState().traditions.t?.sampleIds).toEqual(["S-9"]);
    expect(peekReviewState().traditions.t?.scenarios["S-1"]).toBeUndefined(); // blip edit discarded
    expect(peekReviewStatus().reconciled).toBe("t");
  });

  it("prefetchDrafts SKIPS a tradition already loaded via its own GET (no clobber of post-load edits)", async () => {
    // The race: a tradition's GET resolves first (loadState "ok"), the reviewer edits, then the slower
    // LIST resolves. It must not re-adopt the server copy over the edit, nor overwrite the live version.
    const server = { source: { status: "approved", notes: "SERVER" }, sampleIds: ["S-1"], scenarios: {} };
    const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });
    let releaseList!: () => void;
    const listGate = new Promise<void>((r) => (releaseList = r));
    setReviewFetch((async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/csrf") return json({ csrfToken: "t" });
      if (path === "/api/review") {
        await listGate; // the LIST lands AFTER the fast GET + the reviewer's edit
        return json({ drafts: [{ traditionId: "t", state: server, version: 5 }] });
      }
      if (method === "GET") return json({ state: server, version: 5 }); // fast per-tradition load
      if (method === "PUT") return json({ version: 6 });
      return json({}, 404);
    }) as unknown as typeof fetch);

    // 1) The tradition loads via its own GET → loadState "ok", version 5.
    expect(await ensureTraditionLoaded("t")).toBe(true);
    expect(peekVersion("t")).toBe(5);
    // 2) The prefetch is in flight but parked on the list gate.
    const pf = prefetchDrafts();
    // 3) The reviewer makes a genuine post-load edit.
    updateReviewState((s) => withTraditionCheck(s, "t", "source", { status: "flagged", notes: "MY EDIT" }));
    // 4) Now the slow LIST resolves — it must skip "t" entirely.
    releaseList();
    await pf;

    expect(peekReviewState().traditions.t?.source.notes).toBe("MY EDIT"); // edit preserved, not clobbered
    expect(peekReviewState().traditions.t?.source.status).toBe("flagged");
    expect(peekVersion("t")).toBe(5); // version NOT overwritten by the LIST
    expect(peekReviewStatus().reconciled).toBeNull(); // and no spurious "reconciled" notice
  });

  it("loads an existing draft from the API tolerantly", async () => {
    const api = fakeApi({
      t: { state: { sampleIds: ["S-1"], source: { status: "approved", notes: "ok", bogus: 1 } }, version: 5 },
    });
    setReviewFetch(api.impl);
    await ensureTraditionLoaded("t");
    const t = peekReviewState().traditions.t;
    expect(t?.source.status).toBe("approved");
    expect(t?.sampleIds).toEqual(["S-1"]);
    expect(peekVersion("t")).toBe(5);
  });
});
