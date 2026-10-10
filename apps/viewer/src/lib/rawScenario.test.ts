import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { loadRawScenario, type RawSources } from "./queries";
import { GitHubRawSource } from "./rawSource";
import { RAW_PERSIST_EXCLUDED, RAW_SOURCE_QK } from "./constants";
import {
  RAW_FIXTURE_FINGERPRINT,
  fakeRawSource,
  rawFixtureCatalog,
  rawFixtureShardGz,
} from "../test/rawFixture";

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Injected sources: baked serves the fixture (content fingerprint overridable to simulate a stale
 * bake); GitHub serves the fixture catalog + gz over a fake fetch (the authoritative tier). */
function sources(staleBakedContent?: string): RawSources {
  const gz = rawFixtureShardGz();
  const fetchImpl = (async (url: string) => {
    if (url.endsWith("manifest.json")) return new Response(JSON.stringify(rawFixtureCatalog), { status: 200 });
    if (url.endsWith(".json.gz")) return new Response(gz, { status: 200 });
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  return {
    baked: fakeRawSource("baked", staleBakedContent ? { contentFingerprint: staleBakedContent } : {}),
    github: new GitHubRawSource("owner/repo", "sha", fetchImpl),
  };
}

describe("loadRawScenario (integration)", () => {
  it("loads catalog + shard via the coherent baked source", async () => {
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "BUD-001",
      RAW_FIXTURE_FINGERPRINT, sources());
    expect(r.catalog?.items).toHaveLength(1);
    expect(r.shard?.cells).toHaveLength(3);
    expect(r.notices).toHaveLength(0); // coherent baked → no fallback notice
  });

  it("notices a missing item", async () => {
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "NOPE",
      RAW_FIXTURE_FINGERPRINT, sources());
    expect(r.shard).toBeNull();
    expect(r.notices.some((n) => /no item/.test(n.message))).toBe(true);
  });

  it("rejects an unsafe run id before any fetch", async () => {
    const r = await loadRawScenario(qc(), "sha", "../evil", "buddhism", "BUD-001", null, sources());
    expect(r.catalog).toBeNull();
    expect(r.notices[0]?.message).toMatch(/unsafe run id/);
  });

  it("re-resolves when the score fingerprint transitions null → known (distinct cache keys)", async () => {
    const client = qc();
    const src = sources();
    // Baked-vs-GitHub coherence is by CONTENT fingerprint, independent of the score fingerprint, so
    // baked is served in BOTH cases; the score fingerprint is part of the query key, so the two
    // loads resolve under DISTINCT cache entries (a late-arriving score fp busts the first).
    const first = await loadRawScenario(client, "sha", "fixt-run", "buddhism", "BUD-001", null, src);
    expect(first.notices).toHaveLength(0);
    expect(first.shard?.cells).toHaveLength(3);
    const second = await loadRawScenario(client, "sha", "fixt-run", "buddhism", "BUD-001",
      RAW_FIXTURE_FINGERPRINT, src);
    expect(second.notices).toHaveLength(0);
    expect(second.shard?.cells).toHaveLength(3);
    const sourceKeys = client.getQueryCache().getAll().filter((q) => q.queryKey[0] === RAW_SOURCE_QK);
    expect(sourceKeys).toHaveLength(2); // two distinct resolutions, keyed by the score fingerprint
  });

  it("serves the GitHub gz shard when baked CONTENT is stale (transcript correction)", async () => {
    // Same judgment fingerprint, but the baked bundle's content fingerprint is old → fall back.
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "BUD-001",
      RAW_FIXTURE_FINGERPRINT, sources("sha256:STALE-CONTENT"));
    expect(r.notices.some((n) => /stale \(content fingerprint mismatch\)/.test(n.message))).toBe(true);
    expect(r.shard?.cells).toHaveLength(3); // still renders — from the GitHub gz fallback
  });

  it("the resolved query key is in the persistence-exclusion set (guards a silent rename)", async () => {
    // If the rawSource query key in queries.ts ever drifts from RAW_PERSIST_EXCLUDED (constants.ts),
    // main.tsx would silently stop excluding it → a persisted source selection / eventual quota blowup.
    const client = qc();
    await loadRawScenario(client, "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, sources());
    const sourceKey = client.getQueryCache().getAll().find((q) => q.queryKey[0] === RAW_SOURCE_QK);
    expect(sourceKey, "loadRawScenario must create a RAW_SOURCE_QK-rooted query").toBeDefined();
    expect(RAW_PERSIST_EXCLUDED.has(sourceKey!.queryKey[0] as string)).toBe(true);
  });

  it("survives cache persistence/hydration (no class instance is cached)", async () => {
    const client = qc();
    const src = sources();
    await loadRawScenario(client, "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, src);
    // simulate a localStorage round-trip: every cached value becomes a plain object
    for (const q of client.getQueryCache().getAll()) {
      if (q.state.data !== undefined) {
        client.setQueryData(q.queryKey, JSON.parse(JSON.stringify(q.state.data)));
      }
    }
    // a later load in the same run must still work — the source is reconstructed from `kind`,
    // not read back as a (now method-less) hydrated instance
    const r = await loadRawScenario(client, "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, src);
    expect(r.shard?.cells).toHaveLength(3);
    expect(r.notices).toHaveLength(0);
  });

  it("falls back to the GitHub shard when a coherent baked bundle is missing that shard", async () => {
    const gz = rawFixtureShardGz();
    // GitHub serves a COHERENT catalog (matching fingerprint) + the gz shard.
    const ghFetch = (async (url: string) => {
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(rawFixtureCatalog), { status: 200 });
      if (url.endsWith(".json.gz")) return new Response(gz, { status: 200 });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const src: RawSources = {
      // baked catalog is coherent, but this shard isn't uploaded (partial bake) → shardText null
      baked: { kind: "baked", catalogText: fakeRawSource("baked").catalogText, shardText: async () => null },
      github: new GitHubRawSource("owner/repo", "sha", ghFetch),
    };
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, src);
    expect(r.shard?.cells).toHaveLength(3); // served from GitHub
    expect(r.notices.some((n) => /baked shard unavailable — served from GitHub/.test(n.message))).toBe(true);
  });

  it("declines the per-shard GitHub fallback when the GitHub catalog is incoherent", async () => {
    const gz = rawFixtureShardGz();
    const ghFetch = (async (url: string) => {
      // GitHub catalog has a DIFFERENT fingerprint than the run (drifted tier)
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify({ ...rawFixtureCatalog, fingerprint: "sha256:GH-DRIFT" }), { status: 200 });
      if (url.endsWith(".json.gz")) return new Response(gz, { status: 200 });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const src: RawSources = {
      baked: { kind: "baked", catalogText: fakeRawSource("baked").catalogText, shardText: async () => null },
      github: new GitHubRawSource("owner/repo", "sha", ghFetch),
    };
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, src);
    expect(r.shard).toBeNull(); // did NOT mix an incoherent GitHub shard with the baked catalog
    expect(r.notices.some((n) => /GitHub raw tier disagrees/.test(n.message))).toBe(true);
  });

  it("reads the GitHub catalog for coherence but never the heavy GitHub SHARD when baked is coherent", async () => {
    // Content coherence compares baked against the authoritative GitHub catalog, so the small
    // manifest IS read once — but the ~0.7 MB per-scenario shard stays same-origin baked. That's the
    // documented "partial rate-limit immunity": the heavy fetches, not the one manifest, are immune.
    let catalogCalls = 0, shardCalls = 0;
    const src: RawSources = {
      baked: fakeRawSource("baked"),
      github: {
        kind: "github",
        catalogText: async () => { catalogCalls++; return JSON.stringify(rawFixtureCatalog); },
        shardText: async () => { shardCalls++; return null; },
      },
    };
    const r = await loadRawScenario(qc(), "sha", "fixt-run", "buddhism", "BUD-001", RAW_FIXTURE_FINGERPRINT, src);
    expect(r.shard?.cells).toHaveLength(3); // served from baked
    expect(catalogCalls).toBe(1);           // one small manifest read to confirm content coherence
    expect(shardCalls).toBe(0);             // heavy shard stays same-origin baked (rate-limit immunity)
  });
});
