import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { fakeFetch, resultsFiles } from "../test/fakeRepo";
import { REPO } from "../lib/constants";

const SHA = "deadbeef";

// Per-tradition means so the leaderboard's mean-of-means is a clean number:
//   claude-sonnet-5 unstated/full/all: buddhism 0.6, taoism 0.8 → 0.700 (rank 1)
//   gemini-3.6-flash unstated/full/all: buddhism 0.2, taoism 0.4 → 0.300 (rank 2)
//   claude-sonnet-5 unstated/turn1/all: buddhism 0.2, taoism 0.0 → 0.100 (Initial column)
//   gemini-3.6-flash unstated/turn1/all: 0.5, 0.5 → 0.500 (so sorting by Initial REORDERS vs post-rank)
//   claude-sonnet-5 stated/full/all:    buddhism 0.9, taoism 0.9 → 0.900 (Stated column)
//   sonnetSecularize: unstated/full/secularize (a specific pressure); sonnetStead: unstated steadfastness/all
//   false_authority slice flips the order: sonnet 0.1, gemini 0.9 → gemini out-ranks sonnet there,
//   so selecting that pressure must recompute the canonical rank (not just the Post value).
const VALS: Record<string, {
  sonnetFull: number; sonnetTurn1: number; geminiFull: number; geminiTurn1: number;
  sonnetStated: number; sonnetSecularize: number; sonnetStead: number;
  sonnetFA: number; geminiFA: number;
}> = {
  buddhism: { sonnetFull: 0.6, sonnetTurn1: 0.2, geminiFull: 0.2, geminiTurn1: 0.5, sonnetStated: 0.9, sonnetSecularize: 0.5, sonnetStead: 0.4, sonnetFA: 0.1, geminiFA: 0.9 },
  taoism: { sonnetFull: 0.8, sonnetTurn1: 0.0, geminiFull: 0.4, geminiTurn1: 0.5, sonnetStated: 0.9, sonnetSecularize: 0.3, sonnetStead: 0.8, sonnetFA: 0.1, geminiFA: 0.9 },
};

function shardFor(t: string) {
  const v = VALS[t]!;
  const gemini = {
    "claude-sonnet-5": {
      unstated: {
        // "all" pools 6 pressures × 2 scenarios = 12 judged CELLS (n_judged 12); n_scenarios is 2.
        full: { all: [v.sonnetFull, 12, 12], secularize: [v.sonnetSecularize, 2, 2], false_authority: [v.sonnetFA, 2, 2] },
        turn1: { all: [v.sonnetTurn1, 2, 12] },
      },
      stated: { full: { all: [v.sonnetStated, 2, 12] } },
    },
    "gemini-3.6-flash": {
      unstated: {
        full: { all: [v.geminiFull, 2, 12], false_authority: [v.geminiFA, 2, 2] },
        turn1: { all: [v.geminiTurn1, 2, 12] },
      },
    },
  };
  const means: Record<string, unknown> = { "gemini-3.6-flash": gemini };
  // Opus (validation) data ONLY for buddhism → taoism is omitted in the Opus drill-down, and the
  // buddhism cell is a sample (5/12) so it earns a badge.
  if (t === "buddhism") {
    means["claude-opus-4-8"] = {
      "claude-sonnet-5": { unstated: { full: { all: [0.7, 5, 12] } } },
    };
  }
  return {
    tradition: t,
    n_scenarios: 2,
    judges: t === "buddhism" ? ["gemini-3.6-flash", "claude-opus-4-8"] : ["gemini-3.6-flash"],
    means,
    steadfastness: {
      "gemini-3.6-flash": { "claude-sonnet-5": { unstated: { all: [v.sonnetStead, 2] } } },
    },
  };
}

function files() {
  return resultsFiles("20260803", { traditions: ["buddhism", "taoism"], shard: shardFor });
}

// The post-#110/Phase-3 shape: Opus is a FULL-GRID validation judge (rankable:false, coverage 0.999).
// resultsFiles doesn't parameterize judges, so flip Opus in the manifest JSON in place.
function filesFullGridOpus() {
  const f = files();
  const key = "results/20260803/manifest.json";
  const m = JSON.parse(f[key]!);
  const opus = m.judges.find((j: { key: string }) => j.key === "opus");
  opus.full_grid = true;
  opus.coverage = 0.999;
  f[key] = JSON.stringify(m);
  return f;
}

// #120: add a manifest `ranking` (mean_of_judges → combined) + a combined block to each shard, so
// the page ranks on the two-judge mean. Combined values are a constant 0.5 (distinct from the
// Gemini 0.700) so a test can tell which block the board used.
function filesCombinedRanked() {
  const f = filesFullGridOpus();
  const mkey = "results/20260803/manifest.json";
  const m = JSON.parse(f[mkey]!);
  m.ranking = {
    rule: "mean_of_judges", score_key: "combined",
    judges: ["gemini-3.6-flash", "claude-opus-4-8"],
    single_judge_cells: { count: 0, cells: [] },
  };
  f[mkey] = JSON.stringify(m);
  for (const t of ["buddhism", "taoism"]) {
    const skey = `results/20260803/${t}.json`;
    const s = JSON.parse(f[skey]!);
    s.combined = { "claude-sonnet-5": { unstated: { full: { all: [0.5, 2, 12] }, turn1: { all: [0.2, 2, 12] } } } };
    s.combined_steadfastness = { "claude-sonnet-5": { unstated: { all: [0.3, 2] } } };
    f[skey] = JSON.stringify(s);
  }
  return f;
}

/** A counting wrapper to assert the leaderboard adds no on-budget GitHub API calls for results data. */
function countingFetch(base: ReturnType<typeof fakeFetch>) {
  const calls: string[] = [];
  const wrapped = ((input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : input.toString());
    return base(input as RequestInfo);
  }) as typeof fetch;
  return { wrapped, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("/results leaderboard", () => {
  it("renders Gemini-ranked standings = mean of per-tradition means", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    // ranked desc: claude-sonnet-5 (0.700) first, gemini-3.6-flash (0.300) second
    expect(rows[0]).toHaveAttribute("data-subject", "claude-sonnet-5");
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");
    const gem = rows.find((r) => r.getAttribute("data-subject") === "gemini-3.6-flash")!;
    expect(within(gem).getByTestId("standings-score")).toHaveTextContent("0.300");
  });

  it("#120: ranks on the combined two-judge block and labels judges as components", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, filesCombinedRanked()));
    renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    const sonnet = rows.find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    // Post = mean of the COMBINED block (0.5, 0.5) = 0.500 — NOT the Gemini-only 0.700.
    expect(within(sonnet).getByTestId("standings-score")).toHaveTextContent("0.500");
    // The judge selector frames both judges as co-equal components (not ranking/validation).
    const sel = screen.getByTestId("sel-judge");
    expect(within(sel).getByText(/gemini \(component\)/)).toBeInTheDocument();
    expect(within(sel).getByText(/opus \(component\)/)).toBeInTheDocument();
    // The component caption replaces the "validation … ranking stays on Gemini" copy.
    expect(screen.getByTestId("component-caption")).toHaveTextContent(/component judge/i);
    // The header names the two-judge mean for a ranked run (judges derived from ranking.judges).
    expect(document.body).toHaveTextContent(/2-judge mean \(gemini \+ opus\)/);
  });

  it("#120: a LEGACY run (no ranking) keeps Gemini-ranked copy + ranking/validation labels", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, filesFullGridOpus()));  // no `ranking` in the manifest
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    // Header does NOT claim the multi-judge mean; the selector keeps the legacy labels.
    expect(document.body).not.toHaveTextContent(/-judge mean \(/);
    expect(within(screen.getByTestId("sel-judge")).getByText(/opus \(validation\)/)).toBeInTheDocument();
    expect(screen.queryByTestId("component-caption")).toBeNull();
  });

  it("#120: a ONE-judge ranking derives '1-judge mean (gemini)' copy (not hardcoded)", async () => {
    const f = filesCombinedRanked();
    const mkey = "results/20260803/manifest.json";
    const m = JSON.parse(f[mkey]!);
    m.ranking.judges = ["gemini-3.6-flash"]; // a valid single-judge combined ranking
    f[mkey] = JSON.stringify(m);
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, f));
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    expect(document.body).toHaveTextContent(/1-judge mean \(gemini\)/);
    expect(screen.getByTestId("component-caption")).toHaveTextContent(/one of the 1 component judges/);
  });

  it("renders the dense columns (Initial / Post / Δ + per-framing) at a glance", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    const sonnet = rows.find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    expect(within(sonnet).getByTestId("cell-initial")).toHaveTextContent("0.100");
    expect(within(sonnet).getByTestId("standings-score")).toHaveTextContent("0.700"); // Post
    expect(within(sonnet).getByTestId("cell-delta")).toHaveTextContent("0.600"); // shard steadfastness, not post−initial
    expect(within(sonnet).getByTestId("cell-unstated")).toHaveTextContent("0.700"); // == Post by definition
    expect(within(sonnet).getByTestId("cell-stated")).toHaveTextContent("0.900");
    expect(within(sonnet).getByTestId("cell-guided")).toHaveTextContent("—"); // no guided data
  });

  it("the run label names the run + tradition count", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    expect(await screen.findByTestId("results-run-label")).toHaveTextContent("20260803");
    expect(screen.getByTestId("results-run-label")).toHaveTextContent("2 traditions");
  });

  it("sorting a column reorders the display, but the canonical rank persists (+ deep-links)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results");
    let rows = await screen.findAllByTestId("standings-row");
    // canonical (post desc): sonnet rank 1, gemini rank 2
    expect(rows[0]).toHaveAttribute("data-subject", "claude-sonnet-5");
    // sort by Initial desc: gemini (0.500) > sonnet (0.100) → gemini displays first
    await userEvent.click(within(screen.getByTestId("col-initial")).getByRole("button"));
    await waitFor(() => {
      rows = screen.getAllByTestId("standings-row");
      expect(rows[0]).toHaveAttribute("data-subject", "gemini-3.6-flash");
    });
    // …but the Rank column is unchanged: gemini still shows canonical rank 2, sonnet rank 1.
    const gem = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "gemini-3.6-flash")!;
    const son = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    expect(within(gem).getByTestId("standings-rank")).toHaveTextContent("2");
    expect(within(son).getByTestId("standings-rank")).toHaveTextContent("1");
    expect(router.state.location.searchStr).toContain("sort=initial.desc");
  });

  it("the pressure selector reframes the Post value + updates the URL", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results");
    await screen.findAllByTestId("standings-row");
    await userEvent.click(within(screen.getByTestId("sel-pressure")).getByText("secularize"));
    // claude-sonnet-5 unstated/full/secularize: (0.5 + 0.3)/2 = 0.400 (Post column reframed)
    await waitFor(() =>
      expect(within(screen.getByTestId("leaderboard")).getAllByTestId("standings-score")[0]).toHaveTextContent("0.400"),
    );
    expect(router.state.location.searchStr).toContain("pressure=secularize");
  });

  it("a pressure reframes the WHOLE table — headline, framing columns, AND canonical rank", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results");
    let rows = await screen.findAllByTestId("standings-row");
    // At 'all': sonnet Post 0.700 rank 1, gemini 0.300 rank 2.
    expect(rows[0]).toHaveAttribute("data-subject", "claude-sonnet-5");
    await userEvent.click(within(screen.getByTestId("sel-pressure")).getByText("false_authority"));
    // At false_authority: sonnet Post 0.100, gemini 0.900 → gemini RANKS FIRST (rank recomputed).
    await waitFor(() => {
      rows = screen.getAllByTestId("standings-row");
      expect(rows[0]).toHaveAttribute("data-subject", "gemini-3.6-flash");
    });
    const gem = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "gemini-3.6-flash")!;
    const son = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    expect(within(gem).getByTestId("standings-score")).toHaveTextContent("0.900"); // headline reframed
    expect(within(gem).getByTestId("standings-rank")).toHaveTextContent("1"); // rank RECOMPUTED at this pressure
    expect(within(son).getByTestId("standings-rank")).toHaveTextContent("2");
    // framing column reframes too: there is no stated/false_authority slice → "—"
    expect(within(son).getByTestId("cell-stated")).toHaveTextContent("—");
    expect(router.state.location.searchStr).toContain("pressure=false_authority");
  });

  it("ignores a stale ?framing=/?metric= deep link (renders the default board, no crash)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results?framing=stated&metric=turn1");
    const rows = await screen.findAllByTestId("standings-row");
    // stale v1 params ignored: canonical board, sonnet Post 0.700 first.
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");
  });

  it("a second published run is selectable and loads its own table", async () => {
    const two = {
      ...resultsFiles("20260803", { generatedAt: "2026-08-03T00:00:00+00:00", traditions: ["buddhism", "taoism"], shard: shardFor }),
      ...resultsFiles("20260901", { generatedAt: "2026-09-01T00:00:00+00:00", traditions: ["buddhism"], shard: shardFor }),
    };
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, two));
    const { router } = renderApp("/results");
    // newest (20260901) is the default.
    expect(await screen.findByTestId("results-run-label")).toHaveTextContent("20260901");
    await userEvent.click(within(screen.getByTestId("sel-run")).getByText("20260803"));
    await waitFor(() => expect(screen.getByTestId("results-run-label")).toHaveTextContent("20260803"));
    expect(screen.getByTestId("results-run-label")).toHaveTextContent("2 traditions"); // 20260803 has both
    expect(router.state.location.searchStr).toContain("run=20260803");
  });

  it("a malformed run is not selectable and never strands the user", async () => {
    const mixed = {
      ...resultsFiles("20260803", { generatedAt: "2026-08-03T00:00:00+00:00", traditions: ["buddhism", "taoism"], shard: shardFor }),
      ...resultsFiles("20260901", { generatedAt: "2026-09-01T00:00:00+00:00", traditions: ["buddhism"], shard: shardFor }),
      ...resultsFiles("20261001", { generatedAt: "2026-10-01T00:00:00+00:00", traditions: ["buddhism"], shard: shardFor }),
    };
    mixed["results/20261001/manifest.json"] = "{ not valid json"; // newest run, but broken
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, mixed));
    renderApp("/results?run=20261001"); // deep-link straight into the malformed run
    // Does NOT blank: falls back to the newest VALID run (20260901) and still renders the board.
    expect(await screen.findByTestId("results-run-label")).toHaveTextContent("20260901");
    expect(screen.getByTestId("leaderboard")).toBeInTheDocument();
    // The run selector offers only the two valid runs — never the malformed one (no dead-end).
    const runSel = screen.getByTestId("sel-run");
    expect(within(runSel).getByText("20260803")).toBeInTheDocument();
    expect(within(runSel).getByText("20260901")).toBeInTheDocument();
    expect(within(runSel).queryByText("20261001")).not.toBeInTheDocument();
    // …and the malformed run's parse failure still surfaces as a notice (display-first).
    expect(screen.getByTestId("results-notices")).toBeInTheDocument();
  });

  it("adds no on-budget GitHub API call for results data (all shards via raw)", async () => {
    const { wrapped, calls } = countingFetch(fakeFetch(REPO, SHA, files()));
    vi.stubGlobal("fetch", wrapped);
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    const recursiveTrees = calls.filter((u) => u.includes("/git/trees/") && u.includes("recursive=1"));
    expect(recursiveTrees.length).toBe(1); // one snapshot tree, not per-shard
    // No results manifest/shard was fetched through the api.github.com budget — only via raw.
    const apiResults = calls.filter((u) => u.includes("api.github.com") && u.includes("results/"));
    expect(apiResults).toHaveLength(0);
    const rawResults = calls.filter((u) => u.includes("raw.githubusercontent.com") && u.includes("results/"));
    expect(rawResults.length).toBeGreaterThan(0); // manifest + shards, all off-budget
  });

  it("renders a notice (not a blank page) on a malformed manifest", async () => {
    const bad = files();
    bad["results/20260803/manifest.json"] = "{ not valid json";
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, bad));
    renderApp("/results");
    expect(await screen.findByTestId("results-notices")).toBeInTheDocument();
    expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
  });

  it("each strip square carries a rich per-tradition label (name + Post/First/Δ/n), reframing with pressure", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    const sonnet = () => screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    const budCell = () => within(sonnet()).getAllByTestId("strip-cell").find((c) => c.getAttribute("data-tradition") === "buddhism")!;
    // buddhism sonnet @ all: Post 0.6, First(turn1) 0.2, Δ(stead) 0.4. The count is n_SCENARIOS (2),
    // NOT the 12 judged cells (2 scenarios × 6 pressures) — the unit-mislabel Waleed caught.
    expect(budCell()).toHaveAttribute("aria-label", "Buddhism — Post +0.60 · First +0.20 · Δ +0.40 · 2 scenarios");
    expect(budCell().getAttribute("aria-label")).not.toContain("12 scenarios"); // guards the fix
    // an all-null subject (no data) → dashed "no data" square.
    const qwen = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject")?.includes("Qwen"))!;
    const qCell = within(qwen).getAllByTestId("strip-cell")[0]!;
    expect(qCell).toHaveAttribute("data-empty", "true");
    expect(qCell.getAttribute("aria-label")).toContain("no data");
    // reframe by pressure: at false_authority sonnet buddhism Post = 0.100 (First/Δ absent for that pressure → —).
    await userEvent.click(within(screen.getByTestId("sel-pressure")).getByText("false_authority"));
    await waitFor(() => expect(budCell().getAttribute("aria-label")).toContain("Post +0.10"));
    expect(budCell().getAttribute("aria-label")).toContain("First — · Δ —");
  });

  it("reveals the strip tooltip on hover AND keyboard focus, consistent with the drill-down", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    const sonnet = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    const budCell = within(sonnet).getAllByTestId("strip-cell").find((c) => c.getAttribute("data-tradition") === "buddhism")!;
    // no tooltip until interaction
    expect(screen.queryByTestId("strip-tooltip")).not.toBeInTheDocument();
    // hover reveals it
    await userEvent.hover(budCell);
    const tip = await screen.findByTestId("strip-tooltip");
    expect(tip).toHaveAttribute("role", "tooltip");
    // Regression guard (iter-3): the panel must be OPAQUE — an inline background, not a `bg-*` class
    // (HeroUI has no `default-900` shade, so the class produced no surface and text bled through).
    expect(tip.style.backgroundColor).not.toBe("");
    expect(tip.style.color).not.toBe("");
    expect(tip).toHaveTextContent("Buddhism — Post +0.60 · First +0.20 · Δ +0.40 · 2 scenarios");
    await userEvent.unhover(budCell);
    await waitFor(() => expect(screen.queryByTestId("strip-tooltip")).not.toBeInTheDocument());
    // keyboard focus reveals the SAME tooltip (accessibility)
    budCell.focus();
    expect(await screen.findByTestId("strip-tooltip")).toHaveTextContent("Post +0.60");
    // the tooltip's Post equals the drill-down's buddhism Post (same computeStandings source)
    await userEvent.click(within(sonnet).getByTestId("standings-expand"));
    const drill = await screen.findByTestId("drilldown");
    const budRow = within(drill).getAllByTestId("drill-row").find((r) => r.getAttribute("data-tradition") === "buddhism")!;
    expect(within(budRow).getByTestId("drill-post")).toHaveTextContent("0.600"); // 0.60 tooltip ≡ 0.600 drill
  });

  it("mutes a zero-contribution subject row (honest degradation: data-void + opacity)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    // Qwen has no data in the fixture → 0/N contributing → the row is marked void and visually muted.
    const qwen = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject")?.includes("Qwen"))!;
    expect(qwen).toHaveAttribute("data-void", "true");
    expect(qwen.className).toContain("opacity-50");
    // a subject WITH data for the selection is NOT marked void.
    const sonnet = screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    expect(sonnet).not.toHaveAttribute("data-void");
  });

  it("expanding a subject shows the DENSE per-tradition drill-down (Init/Post/Δ/framings + coverage)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    await userEvent.click(within(rows[0]!).getByTestId("standings-expand")); // claude-sonnet-5
    const drill = await screen.findByTestId("drilldown");
    const drillRows = within(drill).getAllByTestId("drill-row");
    expect(drillRows).toHaveLength(2); // both traditions have Gemini data
    const bud = drillRows.find((r) => r.getAttribute("data-tradition") === "buddhism")!;
    expect(within(bud).getByTestId("drill-initial")).toHaveTextContent("0.200");
    expect(within(bud).getByTestId("drill-post")).toHaveTextContent("0.600");
    expect(within(bud).getByTestId("drill-delta")).toHaveTextContent("0.400");
    expect(within(bud).getByTestId("drill-stated")).toHaveTextContent("0.900");
    expect(within(bud).getByTestId("drill-guided")).toHaveTextContent("—"); // no guided data
    expect(within(bud).getByTestId("drill-coverage")).toHaveTextContent("12/12"); // Post-slice n_judged (full grid at "all")
  });

  it("each drill-row links into the raw browser (#51 drill-down, in #55's dense table)", async () => {
    // Guards the merge seam: #55 rewrote the drill-down as a dense table; the #51 raw entry must
    // survive as a per-tradition link (leaderboard is per-tradition; /t/<id> → scenario → raw view).
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    await userEvent.click(within(rows[0]!).getByTestId("standings-expand"));
    const drill = await screen.findByTestId("drilldown");
    const bud = within(drill).getAllByTestId("drill-row").find((r) => r.getAttribute("data-tradition") === "buddhism")!;
    const link = within(bud).getByTestId("drill-link");
    expect(link).toHaveAttribute("href", "/t/buddhism");
    expect(link).toHaveTextContent("buddhism");
  });

  it("expansion is keyboard-operable and round-trips through the URL (?expanded=)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results");
    const rows = await screen.findAllByTestId("standings-row");
    const btn = within(rows[0]!).getByTestId("standings-expand"); // claude-sonnet-5
    btn.focus();
    await userEvent.keyboard("{Enter}"); // keyboard activation, not a mouse click
    await screen.findByTestId("drilldown");
    expect(router.state.location.searchStr).toContain("expanded=claude-sonnet-5");
  });

  it("honors a deep-linked ?expanded= on first load", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results?expanded=claude-sonnet-5");
    expect(await screen.findByTestId("drilldown")).toBeInTheDocument();
  });

  it("shows —/N coverage when a tradition is present only via a non-Post slice", async () => {
    // buddhism: sonnet has ONLY stated (no unstated full) → drill row included via a framing slice,
    // Post absent → numerator "—". taoism keeps its normal shard.
    const noPost = resultsFiles("20260803", {
      traditions: ["buddhism", "taoism"],
      shard: (t) => t === "buddhism"
        ? {
            tradition: t, n_scenarios: 2, judges: ["gemini-3.6-flash"],
            means: { "gemini-3.6-flash": { "claude-sonnet-5": { stated: { full: { all: [0.5, 2, 2] } } } } },
            steadfastness: {},
          }
        : shardFor(t),
    });
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, noPost));
    renderApp("/results?expanded=claude-sonnet-5");
    const drill = await screen.findByTestId("drilldown");
    const bud = within(drill).getAllByTestId("drill-row").find((r) => r.getAttribute("data-tradition") === "buddhism")!;
    expect(within(bud).getByTestId("drill-post")).toHaveTextContent("—"); // no Post slice
    expect(within(bud).getByTestId("drill-stated")).toHaveTextContent("0.500"); // included via stated
    expect(within(bud).getByTestId("drill-coverage")).toHaveTextContent("—/12"); // numerator absent, denominator defined
  });

  it("wraps the dense table in a horizontal-scroll container (narrow-viewport)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    expect(await screen.findByTestId("leaderboard-scroll")).toBeInTheDocument();
  });

  it("the judge selector switches the drill-down to Opus WITHOUT re-ranking the leaderboard", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results");
    let rows = await screen.findAllByTestId("standings-row");
    // top score before: Gemini claude-sonnet-5 = 0.700
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");
    await userEvent.click(within(screen.getByTestId("sel-judge")).getByText(/opus/));
    await screen.findByTestId("opus-caption");
    // ranking UNCHANGED (still Gemini 0.700) — judge selector only affects the drill-down
    rows = screen.getAllByTestId("standings-row");
    expect(rows[0]).toHaveAttribute("data-subject", "claude-sonnet-5");
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");
    expect(router.state.location.searchStr).toContain("judge=opus");
    // drill-down now shows ONLY buddhism (taoism has no Opus data), badged as a sample
    await userEvent.click(within(rows[0]!).getByTestId("standings-expand"));
    const drill = await screen.findByTestId("drilldown");
    const drillRows = within(drill).getAllByTestId("drill-row");
    expect(drillRows).toHaveLength(1);
    expect(drillRows[0]).toHaveAttribute("data-tradition", "buddhism");
    expect(within(drillRows[0]!).getByTestId("sample-badge")).toBeInTheDocument();
  });

  it("#110/#50: a FULL-GRID Opus (rankable:false) is validation, shows coverage %, no sample badge, ranking unchanged", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, filesFullGridOpus()));
    const { router } = renderApp("/results");
    let rows = await screen.findAllByTestId("standings-row");
    // Gemini still ranks (top = claude-sonnet-5 0.700) — Opus going full-grid must NOT re-rank.
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");
    // The selector labels Opus "(validation)" even though it is full-grid.
    expect(within(screen.getByTestId("sel-judge")).getByText(/opus \(validation\)/)).toBeInTheDocument();

    await userEvent.click(within(screen.getByTestId("sel-judge")).getByText(/opus \(validation\)/));
    const caption = await screen.findByTestId("opus-caption");
    expect(caption).toHaveTextContent(/full-grid coverage 99\.9%/); // the new coverage-% branch
    expect(caption.textContent).not.toMatch(/sample/);
    expect(router.state.location.searchStr).toContain("judge=opus");

    // Ranking UNCHANGED after the switch (nContributing/order intact).
    rows = screen.getAllByTestId("standings-row");
    expect(rows[0]).toHaveAttribute("data-subject", "claude-sonnet-5");
    expect(within(rows[0]!).getByTestId("standings-score")).toHaveTextContent("0.700");

    // Drill-down renders buddhism (where Opus has data) with NO sample badge — Opus is full-grid.
    await userEvent.click(within(rows[0]!).getByTestId("standings-expand"));
    const drill = await screen.findByTestId("drilldown");
    expect(within(drill).getByText(/buddhism/)).toBeInTheDocument();
    expect(within(drill).queryByTestId("sample-badge")).toBeNull();
    expect(within(drill).getByText(/opus — validation/)).toBeInTheDocument();
  });

  it("switching the judge to Opus leaves the heat strip (Gemini) unchanged", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    renderApp("/results");
    const sonnet = () => screen.getAllByTestId("standings-row").find((r) => r.getAttribute("data-subject") === "claude-sonnet-5")!;
    await screen.findAllByTestId("standings-row");
    const before = within(sonnet()).getAllByTestId("strip-cell").map((c) => c.getAttribute("aria-label"));
    await userEvent.click(within(screen.getByTestId("sel-judge")).getByText(/opus/));
    await screen.findByTestId("opus-caption");
    const after = within(sonnet()).getAllByTestId("strip-cell").map((c) => c.getAttribute("aria-label"));
    expect(after).toEqual(before); // strip stays on the ranking (Gemini) judge — never recolored
  });

  it("collapsing an expanded subject removes the drill-down and clears the URL", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files()));
    const { router } = renderApp("/results?expanded=claude-sonnet-5");
    const rows = await screen.findAllByTestId("standings-row");
    expect(screen.getByTestId("drilldown")).toBeInTheDocument();
    await userEvent.click(within(rows[0]!).getByTestId("standings-expand")); // collapse
    await waitFor(() => expect(screen.queryByTestId("drilldown")).not.toBeInTheDocument());
    expect(router.state.location.searchStr).not.toContain("expanded=");
  });

  it("shows an empty-state when no datasets are published", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, {}));
    renderApp("/results");
    expect(await screen.findByText(/No datasets published/)).toBeInTheDocument();
  });
});

// A minimal raw-only experiment catalog (a `results-raw/` tier with no `results/` score tier).
const RAW_CATALOG = {
  schema_version: 1,
  dataset: { title: "AFB before/after", description: "vanilla vs tuned", language: "en", license: "MIT" },
  scale: { min: 0, center: 2, max: 4 },
  ramp: ["#4C72B0", "#DD8452"],
  subjects: [{ id: "base", label: "Base" }, { id: "tuned", label: "Tuned" }],
  judges: [{ key: "terra", label: "gpt-5.6-terra", fullGrid: true }],
  conditionAxes: [{ key: "condition", label: "Condition", values: [{ id: "cold", label: "Cold" }] }],
  groupBy: { key: "instrument", label: "Instrument" },
  scopes: [{ id: "single", label: "single" }],
  items: [{ id: "AFB-001", label: "First question?", group: "afb-150", shard: "afb-150/AFB-001.json.gz" }],
  presets: [],
  fingerprint: "sha256:afb-fp",
};

/** A raw-only run's manifest (no score tier), keyed by run id. */
function rawExplorerFiles(runId: string, catalog: unknown = RAW_CATALOG): Record<string, string> {
  return { [`results-raw/${runId}/manifest.json`]: JSON.stringify(catalog) };
}

describe("/results — experiment (raw-only) datasets", () => {
  it("lists a raw-only experiment with its catalog title + description, linking to /raw/<runId>", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, { ...files(), ...rawExplorerFiles("afb-20260808") }));
    renderApp("/results");
    // The scored leaderboard still renders as before…
    await screen.findAllByTestId("standings-row");
    // …and the experiment is listed alongside it.
    const card = await screen.findByTestId("experiment-card");
    expect(card).toHaveAttribute("data-run", "afb-20260808");
    expect(card).toHaveAttribute("href", expect.stringContaining("/raw/afb-20260808"));
    expect(within(card).getByTestId("experiment-title")).toHaveTextContent("AFB before/after");
    expect(card).toHaveTextContent("vanilla vs tuned");
  });

  it("shows experiments even when no scored run is published (no empty-state)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, rawExplorerFiles("afb-20260808")));
    renderApp("/results");
    expect(await screen.findByTestId("experiment-card")).toBeInTheDocument();
    expect(screen.queryByText(/No datasets published/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
  });

  it("a run present in BOTH tiers is a scored run, never a duplicate experiment", async () => {
    // `20260803` (from files()) has a results/ tier; add a results-raw/ tier for the same run id.
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, { ...files(), ...rawExplorerFiles("20260803") }));
    renderApp("/results");
    await screen.findAllByTestId("standings-row");
    expect(screen.queryByTestId("experiment-card")).not.toBeInTheDocument();
  });

  it("falls back to the run id when the catalog is malformed (never blanks the section)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, {
      ...files(),
      "results-raw/broken-run/manifest.json": "{ not valid json",
    }));
    renderApp("/results");
    // The scored leaderboard is unaffected by the malformed neighbour.
    expect(await screen.findByTestId("leaderboard")).toBeInTheDocument();
    const card = await screen.findByTestId("experiment-card");
    expect(within(card).getByTestId("experiment-title")).toHaveTextContent("broken-run");
  });
});
