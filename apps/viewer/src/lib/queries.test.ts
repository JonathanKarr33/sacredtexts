import { describe, it, expect, afterEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  traditionIds,
  scenarioFolderIds,
  hasFile,
  loadTraditions,
  loadTradition,
  loadScenario,
  loadScenarioMeta,
  runIdForTradition,
  type ResultsRun,
} from "./queries";
import { REPO } from "./constants";
import { buildTree, fakeFetch, traditionFiles } from "../test/fakeRepo";

const SHA = "deadbeef";

function newQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => vi.unstubAllGlobals());

describe("pure tree helpers", () => {
  const files = {
    ...traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]),
    ...traditionFiles("judaism", ["MSR-001"]),
  };
  const entries = buildTree(files);

  it("traditionIds finds dirs with a tradition.yaml (sorted)", () => {
    expect(traditionIds(entries)).toEqual(["judaism", "sunni-islam"]);
  });
  it("scenarioFolderIds lists scenario dirs for a tradition", () => {
    expect(scenarioFolderIds(entries, "sunni-islam").sort()).toEqual(["JLS-001", "JLS-002"]);
    expect(scenarioFolderIds(entries, "judaism")).toEqual(["MSR-001"]);
  });
  it("hasFile detects blobs", () => {
    expect(hasFile(entries, "traditions/sunni-islam/scenarios/index.json")).toBe(true);
    expect(hasFile(entries, "traditions/sunni-islam/nope")).toBe(false);
  });
});

describe("loaders (real QueryClient + stubbed fetch)", () => {
  it("loadTraditions resolves manifests + scenario sets", async () => {
    const files = {
      ...traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]),
      ...traditionFiles("judaism", ["MSR-001"]),
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const trads = await loadTraditions(newQc(), SHA);
    expect(trads.map((t) => t.id)).toEqual(["judaism", "sunni-islam"]);
    const sunni = trads.find((t) => t.id === "sunni-islam")!;
    expect(sunni.manifest?.displayName).toBe("SUNNI-ISLAM");
    expect(sunni.scenarioIds).toEqual(["JLS-001", "JLS-002"]);
    expect(sunni.notices).toHaveLength(0);
  });

  it("loadTradition includes prose; unknown id returns null", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001"]);
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const qc = newQc();
    const t = await loadTradition(qc, SHA, "sunni-islam");
    expect(t).not.toBeNull();
    expect(t!.prose.readme).toContain("sunni-islam");
    expect(t!.prose.guide).toContain("guide of sunni-islam");
    expect(await loadTradition(qc, SHA, "does-not-exist")).toBeNull();
  });

  it("loadScenario parses all four files; results seam is inert (absent)", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001"]);
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const s = await loadScenario(newQc(), SHA, "sunni-islam", "JLS-001", { pillars: ["a", "b"], hearts: ["c", "d"] });
    expect(s.turn1).toBe("turn1 for JLS-001");
    expect(s.judgeGuidance).toContain("judge guidance");
    expect(s.pressures.secularize).toBe("s");
    expect(s.pressures.personal_appeal).toBe("pa");
    expect(s.meta?.identitySignal).toBe("clean");
    expect(s.notices).toHaveLength(0);
    expect(s.results).toBeUndefined(); // inert seam: no results in v1
  });

  it("loadScenarioMeta flags an undeclared axis", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001"]);
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const r = await loadScenarioMeta(newQc(), SHA, "sunni-islam", "JLS-001", { pillars: ["a", "b"] }); // 'hearts' not declared
    expect(r.notices.some((n) => n.message.includes("hearts"))).toBe(true);
  });

  it("derives the scenario set from folders when index.json is missing", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]);
    delete files["traditions/sunni-islam/scenarios/index.json"]; // simulate missing index
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const t = await loadTradition(newQc(), SHA, "sunni-islam");
    expect(t!.scenarioIds.sort()).toEqual(["JLS-001", "JLS-002"]);
    expect(t!.notices.some((n) => /missing|derived from folders/i.test(n.message))).toBe(true);
  });
});

describe("runIdForTradition (#94 — resolve the run per-tradition, not the global newest)", () => {
  const run = (id: string, generatedAt: string, traditions: string[]): ResultsRun => ({
    id,
    notices: [],
    // Only the fields runIdForTradition reads; cast to the full manifest shape for the test.
    manifest: { generatedAt, traditions: traditions.map((t) => ({ id: t })) } as ResultsRun["manifest"],
  });

  // The live bug: the globally-newest run scores ONLY protestantism, but a reviewer opens buddhism.
  const runs = [
    run("20260701", "2026-07-01T00:00:00Z", ["buddhism", "sunni-islam"]),
    run("20260813", "2026-08-13T00:00:00Z", ["protestantism"]), // newest overall, buddhism-less
    run("20260805", "2026-08-05T00:00:00Z", ["buddhism", "protestantism"]),
  ];

  it("picks the newest run that ACTUALLY scores the tradition, not the newest overall", () => {
    // buddhism: newest run scoring it is 20260805 — NOT the newer protestantism-only 20260813.
    expect(runIdForTradition(runs, "buddhism")).toBe("20260805");
    // protestantism: here the newest-overall run does score it.
    expect(runIdForTradition(runs, "protestantism")).toBe("20260813");
  });

  it("returns null when no published run scores the tradition (embed hides, report stamps none)", () => {
    expect(runIdForTradition(runs, "judaism")).toBeNull();
    expect(runIdForTradition([], "buddhism")).toBeNull();
  });

  it("skips runs whose manifest failed to load", () => {
    const withBroken: ResultsRun[] = [...runs, { id: "20260901", notices: [], manifest: null }];
    // The broken (manifest:null) newest-id run is ignored; buddhism still resolves to 20260805.
    expect(runIdForTradition(withBroken, "buddhism")).toBe("20260805");
  });
});
