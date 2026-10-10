import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { gunzipSync } from "node:zlib";
import { renderApp } from "../test/renderApp";
import { fakeFetch, resultsFiles, buildTree } from "../test/fakeRepo";
import { REPO } from "../lib/constants";
import { rawRunIds, resultsRunIds } from "../lib/queries";

const SHA = "deadbeef";
const RUN = "afb-20260803";
afterEach(() => vi.unstubAllGlobals());

// A raw-only AFB catalog (no results/ score tier), 2 items, generic shape.
const AFB = {
  schema_version: 1,
  dataset: { title: "AFB before/after", description: "vanilla vs tuned", language: "en", license: "MIT" },
  scale: { min: 0, center: 2, max: 4 },
  ramp: ["#4C72B0", "#8B95A1", "#DD8452"],
  subjects: [{ id: "gemma-4-31b-it", label: "Vanilla Gemma-4-31B" },
             { id: "mb-sft-dpo", label: "MultiWeights (SFT+DPO)" }],
  judges: [{ key: "terra", label: "gpt-5.6-terra", fullGrid: true }],
  conditionAxes: [{ key: "condition", label: "Condition", values: [{ id: "cold", label: "Cold" }] }],
  groupBy: { key: "instrument", label: "Instrument" },
  scopes: [{ id: "single", label: "single" }],
  items: [
    { id: "AFB-001", label: "First question?", group: "afb-150", shard: "afb-150/AFB-001.json.gz" },
    { id: "AFB-002", label: "Second question?", group: "afb-150", shard: "afb-150/AFB-002.json.gz" },
  ],
  presets: [{
    key: "dpo-base", label: "Omission → repair", description: "biggest moves",
    entries: [{
      key: "dpo-base:afb-150:AFB-001", label: "AFB-001 · First question?",
      params: { group: "afb-150", item: "AFB-001", scope: "single",
                a: "gemma-4-31b-it", b: "mb-sft-dpo", conditions: { condition: "cold" } },
    }],
  }],
  fingerprint: "sha256:afb-fp",
  content_fingerprint: "sha256:afb-cfp",
};

const shard = (tag: string) => ({
  schema_version: 1,
  cells: [
    { subject: "gemma-4-31b-it", conditions: { condition: "cold" },
      transcript: [{ role: "user", content: "Q?" }, { role: "assistant", content: `VANILLA-${tag}` }],
      verdicts: [{ judge: "terra", scope: "single", score: 0, summary: "no religious representation", rationale: "r" }] },
    { subject: "mb-sft-dpo", conditions: { condition: "cold" },
      transcript: [{ role: "user", content: "Q?" }, { role: "assistant", content: `TUNED-${tag}` }],
      verdicts: [{ judge: "terra", scope: "single", score: 2, summary: "meaningful religious reference", rationale: "r" }] },
  ],
});

const afbFiles = () => ({
  [`results-raw/${RUN}/manifest.json`]: JSON.stringify(AFB),
  [`results-raw/${RUN}/afb-150/AFB-001.json.gz`]: JSON.stringify(shard("one")),
  [`results-raw/${RUN}/afb-150/AFB-002.json.gz`]: JSON.stringify(shard("two")),
});

describe("raw-only explorer discovery + landing (#54)", () => {
  it("rawRunIds finds results-raw runs; raw-ONLY filter drops runs that also have a score tier", () => {
    const entries = buildTree({
      "results/mbrun/manifest.json": "{}", "results-raw/mbrun/manifest.json": "{}",
      "results-raw/afb/manifest.json": "{}",
    });
    expect(rawRunIds(entries)).toEqual(["afb", "mbrun"]);
    const scored = new Set(resultsRunIds(entries));
    expect(rawRunIds(entries).filter((id) => !scored.has(id))).toEqual(["afb"]); // AFB is raw-only
  });

  it("ONE list of EVERY item — large-difference movers highlighted in place, no separate preset list", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, afbFiles()));
    renderApp(`/raw/${RUN}`);
    expect(await screen.findByRole("heading", { name: "AFB before/after" })).toBeInTheDocument();
    const index = await screen.findByTestId("raw-item-index");
    expect(within(index).getByText("AFB-001")).toBeInTheDocument();
    expect(within(index).getByText("AFB-002")).toBeInTheDocument(); // ALL items, not just the ≤12 presets
    const href = within(index).getByText("AFB-001").closest("a")!.getAttribute("href")!;
    expect(href).toContain("/results/" + RUN + "/afb-150/AFB-001");
    for (const q of ["a=gemma-4-31b-it", "b=mb-sft-dpo", "scope=single", "judge=terra"]) {
      expect(href).toContain(q); // b MUST be present or the item opens single-column
    }
    // AFB-001 is a preset entry (a large-difference mover) → highlighted with the preset's badge...
    const row1 = within(index).getByText("AFB-001").closest("a")!;
    expect(within(row1).getByText("Omission → repair")).toBeInTheDocument();
    // ...AFB-002 is not in any preset → plain row, no badge.
    const row2 = within(index).getByText("AFB-002").closest("a")!;
    expect(within(row2).queryByTestId("raw-item-highlight")).toBeNull();
    // The old separate curated-preset list is GONE — one merged list, not two.
    expect(screen.queryByTestId("presets")).toBeNull();
    expect(screen.queryByText(/manifest not found/i)).toBeNull(); // no false score-tier error
  });

  it("landing on an item link renders BOTH response columns (before/after, not single-column)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, afbFiles()));
    renderApp(`/results/${RUN}/afb-150/AFB-001?a=gemma-4-31b-it&b=mb-sft-dpo&scope=single&judge=terra`);
    expect(await screen.findByText(/VANILLA-one/)).toBeInTheDocument(); // base column
    expect(await screen.findByText(/TUNED-one/)).toBeInTheDocument();   // dpo column
  });

  it("a raw-only item page back-links to its /raw explorer, not the MB leaderboard", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, afbFiles())); // raw-only run (no results/ tier)
    renderApp(`/results/${RUN}/afb-150/AFB-001?a=gemma-4-31b-it&b=mb-sft-dpo&scope=single&judge=terra`);
    const back = await screen.findByRole("link", { name: /← Explorer/ });
    expect(back).toHaveAttribute("href", `/raw/${RUN}`);           // not dead-ended on /results
    expect(screen.queryByRole("link", { name: /← Results/ })).toBeNull();
  });

  it("the index surfaces raw-only runs as Explorers and never a score-tier run", async () => {
    const mixed = {
      ...resultsFiles("mbrun", {}),                                 // an MB run WITH a score tier
      "results-raw/mbrun/manifest.json": JSON.stringify({ ...AFB, items: [] }),
      ...afbFiles(),                                                // the AFB raw-only run
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, mixed));
    renderApp("/");
    const explorers = await screen.findByTestId("explorers");
    // the card shows the catalog dataset.title (not the bare run id), linking to /raw/<runId>
    const link = await within(explorers).findByText("AFB before/after");
    expect(link.closest("a")).toHaveAttribute("href", `/raw/${RUN}`); // AFB (raw-only) listed
    expect(within(explorers).queryByText("mbrun")).toBeNull();      // MB (has score tier) NOT listed
    expect(screen.queryByText(/manifest not found/i)).toBeNull();   // no false error on the index
  });

  it("a SHA load failure shows an error, not a premature 'not found'", async () => {
    // The catalog query is disabled until the SHA arrives; if the SHA fetch FAILS the page must show
    // an error (surfacing shaQ.error), NOT the misleading "Explorer not found" (the fixed bug).
    const base = fakeFetch(REPO, SHA, afbFiles());
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/commits/")) return Promise.resolve(new Response("boom", { status: 500 }));
      return base(input, init);
    }) as typeof fetch);
    renderApp(`/raw/${RUN}`);
    expect(await screen.findByText(/Couldn't load this explorer/i)).toBeInTheDocument();
    expect(screen.queryByText(/not found/i)).toBeNull();
  });

  it("the GitHub-served run puts the 'no baked bundle' note in the FOOTER, not a top banner", async () => {
    // No baked bundle in the fixture → resolveRawSource emits a `kind:"source"` note. It must be a
    // quiet footer, never a top banner (the AFB run is GitHub-served by design in Phase 5).
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, afbFiles()));
    renderApp(`/raw/${RUN}`);
    await screen.findByRole("heading", { name: "AFB before/after" });
    const foot = await screen.findByTestId("source-notes");
    expect(within(foot).getByText(/baked/i)).toBeInTheDocument();
    expect(screen.getAllByText(/baked/i)).toHaveLength(1); // ONLY in the footer, not also a top banner
  });

  it("useRawExplorerRunIds adds no git-trees API call beyond the shared tree walk", async () => {
    let treeCalls = 0;
    const base = fakeFetch(REPO, SHA, { ...resultsFiles("mbrun", {}), ...afbFiles() });
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/git/trees/")) treeCalls++;
      return base(input, init);
    }) as typeof fetch);
    renderApp("/");
    await screen.findByTestId("explorers");
    expect(treeCalls).toBe(1); // one recursive tree walk serves traditions + results + explorers
  });
});

// The REAL committed AFB data (produced by the Python export-afb) rendered through the real app —
// the strongest automated stand-in for the browser check (#54 Phase 5). Reads the shipped manifest +
// shard from disk and serves them the way the SPA fetches them.
// Seed note (sacredtexts): this suite exercises multibench's COMMITTED dataset, which this repo
// does not carry. Skipped until this repo commits its own results-raw tier; repoint it then.
const AFB_RUN_DIR = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "../../../../results-raw/afb-20260808");
describe.skipIf(!fs.existsSync(path.join(AFB_RUN_DIR, "manifest.json")))(
  "real committed AFB run renders end-to-end (#54 Phase 5)", () => {
  const RUN_DIR = AFB_RUN_DIR;
  const AFB_RUN = "afb-20260808";
  // Lazy: the describe factory runs at collection even when the suite is skipped.
  const manifestPath = path.join(RUN_DIR, "manifest.json");
  const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  const shardJson = (item: string) =>
    gunzipSync(fs.readFileSync(path.join(RUN_DIR, "afb-150", `${item}.json.gz`))).toString("utf8");

  const filesFor = (items: string[]) => {
    const f: Record<string, string> = { [`results-raw/${AFB_RUN}/manifest.json`]: manifest };
    for (const it of items) f[`results-raw/${AFB_RUN}/afb-150/${it}.json.gz`] = shardJson(it);
    return f;
  };

  it("the /raw landing shows the real dataset title + lists real items", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, filesFor([])));
    renderApp(`/raw/${AFB_RUN}`);
    expect(await screen.findByRole("heading", { name: /AFB before\/after/ })).toBeInTheDocument();
    const index = await screen.findByTestId("raw-item-index");
    expect(within(index).getByText("AFB-005")).toBeInTheDocument();
    expect(within(index).getByText("AFB-150")).toBeInTheDocument(); // all 150 real items
  });

  it("a real item (AFB-005, 0→4) renders BOTH real response columns", async () => {
    const shard = JSON.parse(shardJson("AFB-005"));
    const responses: string[] = shard.cells.map((c: { transcript: { content: string }[] }) => c.transcript[1]!.content);
    const vanilla = responses[0] ?? "", tuned = responses[1] ?? "";
    const rx = (s: string) => new RegExp(s.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, filesFor(["AFB-005"])));
    renderApp(`/results/${AFB_RUN}/afb-150/AFB-005?a=gemma-4-31b-it&b=mb-sft-dpo&scope=single&judge=terra`);
    // both real responses render (two columns), keyed on a distinctive prefix of each
    expect(await screen.findByText(rx(vanilla))).toBeInTheDocument();
    expect(await screen.findByText(rx(tuned))).toBeInTheDocument();
  });
});
