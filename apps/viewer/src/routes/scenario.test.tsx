import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { fakeFetch, traditionFiles } from "../test/fakeRepo";
import { REPO, PRESSURES } from "../lib/constants";

const SHA = "deadbeef";
afterEach(() => vi.unstubAllGlobals());

describe("scenario detail", () => {
  it("main pane shows the scenario header + Context (judge guidance) + a no-run placeholder", async () => {
    // No results run committed → the conversation can't render, but the scenario header and the
    // Context (the tradition's judge guidance) still show, plus a plain no-run placeholder.
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001", "JLS-002"])));
    renderApp("/t/sunni-islam/JLS-001");
    expect(await screen.findByRole("heading", { name: /JLS-001/ })).toBeInTheDocument();
    expect(screen.getByText(/judge guidance for JLS-001/)).toBeInTheDocument(); // in the Context collapsible
    expect(await screen.findByTestId("no-run")).toBeInTheDocument();
    expect(screen.getByTestId("scenario-responses").textContent ?? "").not.toMatch(/bands/i); // #51 no band names
  });

  it("falls back to the corpus (question + six pushes in canonical order) when there's no results run", async () => {
    // The corpus browser must not depend on the results tier (Spec 7 M6): with no run, the main
    // pane still shows the scenario's own question and the six pushes, in canonical order.
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001", "JLS-002"])));
    const { container } = renderApp("/t/sunni-islam/JLS-001");
    expect(await screen.findByTestId("corpus-fallback")).toBeInTheDocument();
    expect(screen.getByText("turn1 for JLS-001")).toBeInTheDocument(); // the question
    const order = [...container.querySelectorAll("[data-pressure]")].map((el) => el.getAttribute("data-pressure"));
    expect(order).toEqual([...PRESSURES]); // six pushes, canonical order
  });

  it("lays out the inverted app-shell: a controls sidebar + a scenario/conversation main pane", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001", "JLS-002"])));
    renderApp("/t/sunni-islam/JLS-001");
    const shell = await screen.findByTestId("scenario-shell");
    const sidebar = within(shell).getByTestId("scenario-sidebar");
    const main = within(shell).getByTestId("scenario-main");
    // Sidebar = navigation + the scenario picker; the Model/axes controls appear once a run loads
    // (none committed here → the controls placeholder shows instead).
    expect(within(sidebar).getByRole("combobox", { name: "Scenario" })).toBeInTheDocument();
    expect(within(sidebar).getByText(/No results run published yet/)).toBeInTheDocument();
    // Main = the scenario + conversation area.
    expect(within(main).getByTestId("scenario-responses")).toBeInTheDocument();
    // Both panes own-scroll (independent) → the document never scrolls.
    expect(sidebar).toHaveAttribute("tabindex", "0");
    expect(sidebar.className).toMatch(/overflow-y-auto/);
    expect(main.className).toMatch(/overflow-y-auto/);
    // First-visit orientation line explains the project up top.
    expect(screen.getByTestId("page-framing")).toHaveTextContent(/MultiBench measures/);
  });

  it("offers prev/next navigation in declared order", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001", "JLS-002"])));
    renderApp("/t/sunni-islam/JLS-001");
    // first scenario: next = JLS-002, prev disabled
    expect(await screen.findByRole("link", { name: /JLS-002/ })).toBeInTheDocument();
  });

  it("shows inline notices (not a crash) for a malformed scenario", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001"]);
    // Blank the judge guidance — the Context the main pane always renders.
    delete files["traditions/sunni-islam/scenarios/JLS-001/judge-guidance.md"];
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    renderApp("/t/sunni-islam/JLS-001");

    expect(await screen.findByRole("heading", { name: /JLS-001/ })).toBeInTheDocument(); // didn't crash
    expect(await screen.findByText(/missing or empty/i)).toBeInTheDocument(); // judge-guidance notice in Context
  });

  it("surfaces an unknown-tag-value notice on the scenario page", async () => {
    const files = traditionFiles("sunni-islam", ["JLS-001"]);
    // manifest declares pillars [a,b]; give the scenario an undeclared value.
    files["traditions/sunni-islam/scenarios/JLS-001/scenario.yaml"] =
      "id: JLS-001\ntags: {pillars: [not-a-pillar]}\nsource_locus: 1\nlocus_label: X\nidentity_signal: clean\n";
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    renderApp("/t/sunni-islam/JLS-001");
    expect(await screen.findByText(/not-a-pillar/)).toBeInTheDocument(); // the inline notice
  });

  it("renders an in-SPA 404 for an unknown scenario id", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, traditionFiles("sunni-islam", ["JLS-001"])));
    renderApp("/t/sunni-islam/JLS-999");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });
});
