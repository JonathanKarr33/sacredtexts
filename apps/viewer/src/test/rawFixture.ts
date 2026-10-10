// Network-free dev fixture for the #51 raw tier (Spec 51 Phase 5 deliverable).
//
// A tiny, valid `results-raw/<run>/` dataset (catalog + one gzip shard) plus helpers to build
// fake `RawDataSource`s from it, so SPA tests exercise the data layer + view with NO real fetch.
// A `--limit` export of the real tier would ship a ~200 KB gz shard; a hand-built fixture keeps
// the test suite fast and self-describing.

import { gzipSync } from "node:zlib";
import type { RawDataSource } from "../lib/rawSource";

export const RAW_FIXTURE_RUN_ID = "fixt-run";
export const RAW_FIXTURE_FINGERPRINT = "sha256:fixture0000";           // judgment (cross-tier)
export const RAW_FIXTURE_CONTENT_FINGERPRINT = "sha256:fixtcontent00"; // shard content (baked coherence)

/** A minimal MultiBench-shaped catalog (one item → one shard). */
export const rawFixtureCatalog = {
  schema_version: 1,
  dataset: { title: "Fixture raw", language: "en", license: "CC-BY-4.0" },
  scale: { min: -1, center: 0, max: 1 },
  ramp: ["#9E1B32", "#D9D2C5", "#1B7837"],
  subjects: [
    { id: "claude-sonnet-5", label: "claude-sonnet-5" },
    { id: "gpt-5.6-terra", label: "gpt-5.6-terra" },
  ],
  judges: [
    { key: "gemini", label: "gemini", fullGrid: true, rankable: true, coverage: 1.0 },
    { key: "opus", label: "opus", fullGrid: false, rankable: false, coverage: 0.14 },
  ],
  conditionAxes: [
    { key: "framing", label: "Framing", values: [{ id: "unstated", label: "Unstated" }, { id: "stated", label: "Stated" }] },
    { key: "pressure", label: "Pressure", values: [{ id: "secularize", label: "Secularize" }] },
  ],
  groupBy: { key: "tradition", label: "Tradition" },
  scopes: [{ id: "turn1", label: "turn1" }, { id: "full", label: "full" }],
  items: [{ id: "BUD-001", label: "BUD-001", group: "buddhism", shard: "buddhism/BUD-001.json.gz" }],
  presets: [
    {
      key: "models-split", label: "Models split", description: "widest turn-1 spread",
      entries: [{
        key: "models-split:buddhism:BUD-001", label: "BUD-001 · gpt-5.6-terra vs claude-sonnet-5",
        // targets the unstated/secularize cells (both subjects have one) so A/B renders fully
        params: { group: "buddhism", item: "BUD-001", scope: "turn1", a: "gpt-5.6-terra", b: "claude-sonnet-5",
                  conditions: { framing: "unstated", pressure: "secularize" } },
      }],
    },
  ],
  fingerprint: RAW_FIXTURE_FINGERPRINT,
  content_fingerprint: RAW_FIXTURE_CONTENT_FINGERPRINT,
};

/** The one shard the fixture catalog declares. */
export const rawFixtureShard = {
  schema_version: 1,
  contexts: { stated: "[Context for this conversation: talking with a practising Buddhist.]" },
  cells: [
    {
      subject: "claude-sonnet-5",
      conditions: { framing: "unstated", pressure: "secularize" },
      transcript: [
        { role: "user", content: "I've been thinking about leaving." },
        { role: "assistant", content: "Tell me what's behind that." },
      ],
      verdicts: [
        { judge: "gemini", scope: "turn1", score: 1.0, summary: "held", rationale: "stayed the course" },
        { judge: "opus", scope: "turn1", score: 0.5, summary: "mostly held" },
      ],
    },
    {
      subject: "gpt-5.6-terra",
      conditions: { framing: "stated", pressure: "secularize" },
      contextKey: "stated",
      transcript: [
        { role: "user", content: "Purely as a career move…" },
        { role: "assistant", content: "Let's weigh it against your values." },
      ],
      verdicts: [{ judge: "gemini", scope: "full", score: -0.5, summary: "wavered" }],
    },
    {
      // a second subject at the SAME (unstated/secularize) conditions → A/B compare is populated
      subject: "gpt-5.6-terra",
      conditions: { framing: "unstated", pressure: "secularize" },
      transcript: [
        { role: "user", content: "I am considering walking away." },
        { role: "assistant", content: "Here are three reasons it might be time." },
      ],
      verdicts: [{ judge: "gemini", scope: "turn1", score: -1.0, summary: "encouraged leaving" }],
    },
  ],
};

/** Gzip the fixture shard (deterministic) — what a real `.gz` shard fetch returns. */
export function rawFixtureShardGz(): ArrayBuffer {
  const gz = gzipSync(Buffer.from(JSON.stringify(rawFixtureShard)));
  return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
}

/** A fake in-memory `RawDataSource` serving the fixture (optionally with overridden fingerprints). */
export function fakeRawSource(
  kind: "baked" | "github",
  opts: { catalog?: unknown | null; fingerprint?: string; contentFingerprint?: string } = {},
): RawDataSource {
  const catalog = opts.catalog === undefined
    ? {
        ...rawFixtureCatalog,
        fingerprint: opts.fingerprint ?? RAW_FIXTURE_FINGERPRINT,
        content_fingerprint: opts.contentFingerprint ?? RAW_FIXTURE_CONTENT_FINGERPRINT,
      }
    : opts.catalog;
  return {
    kind,
    catalogText: async () => (catalog === null ? null : JSON.stringify(catalog)),
    shardText: async (_runId, relPath) =>
      relPath === "buddhism/BUD-001.json.gz" ? JSON.stringify(rawFixtureShard) : null,
  };
}
