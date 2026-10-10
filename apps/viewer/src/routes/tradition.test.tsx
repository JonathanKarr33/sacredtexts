import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../test/renderApp";
import { fakeFetch, traditionFiles } from "../test/fakeRepo";
import { REPO } from "../lib/constants";
import { FilterBar } from "../components/FilterBar";
import type { Facets, Selection } from "../lib/filtering";

const SHA = "deadbeef";

/** sunni-islam with two scenarios carrying DIFFERENT pillars tags, so filtering is observable. */
function sunniFiles() {
  const f = traditionFiles("sunni-islam", ["JLS-001", "JLS-002"]);
  f["traditions/sunni-islam/scenarios/JLS-001/scenario.yaml"] =
    "id: JLS-001\ntags: {pillars: [a], hearts: [c]}\nsource_locus: 10\nlocus_label: First\nidentity_signal: clean\n";
  f["traditions/sunni-islam/scenarios/JLS-002/scenario.yaml"] =
    "id: JLS-002\ntags: {pillars: [b], hearts: [d]}\nsource_locus: 20\nlocus_label: Second\nidentity_signal: leaky\n";
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("tradition page", () => {
  it("renders the header, taxonomy axes, and a scenario row per scenario", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, sunniFiles()));
    renderApp("/t/sunni-islam");
    expect(await screen.findByRole("heading", { name: "SUNNI-ISLAM" })).toBeInTheDocument();
    expect(await screen.findAllByTestId("scenario-row")).toHaveLength(2);
    // taxonomy axes are rendered from the manifest (pillars + hearts)
    expect(screen.getByRole("heading", { name: /taxonomies/i })).toBeInTheDocument();
  });

  it("filters the list by a manifest axis: fewer rows, count text, AND URL search params update", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, sunniFiles()));
    const { router } = renderApp("/t/sunni-islam");
    expect(await screen.findAllByTestId("scenario-row")).toHaveLength(2);
    await waitFor(() => expect(screen.getByTestId("result-count")).toHaveTextContent("2 of 2"));

    await userEvent.click(screen.getByRole("button", { name: "b", pressed: false }));

    await waitFor(() => expect(screen.getAllByTestId("scenario-row")).toHaveLength(1));
    expect(screen.getByTestId("result-count")).toHaveTextContent("1 of 2");
    // the interaction updated the deep-linkable URL search params
    expect(router.state.location.searchStr).toContain("pillars=b");
  });

  it("is deep-linkable: ?pillars=a loads pre-filtered", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, sunniFiles()));
    renderApp("/t/sunni-islam?pillars=a");
    await waitFor(() => expect(screen.getAllByTestId("scenario-row")).toHaveLength(1));
  });

  it("renders an in-SPA 404 for an unknown tradition id", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, sunniFiles()));
    renderApp("/t/does-not-exist");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });

  it("shows a friendly notice (not a blank page) on a cold-start network error", async () => {
    const erroring = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    vi.stubGlobal("fetch", erroring);
    renderApp("/t/sunni-islam");
    expect(await screen.findByText(/Couldn't load this tradition/i)).toBeInTheDocument();
  });

  it("renders scenario-row tags grouped per axis (not flattened)", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, sunniFiles()));
    renderApp("/t/sunni-islam");
    const rows = await screen.findAllByTestId("scenario-row");
    // each row labels its axes (pillars + hearts) rather than flattening values
    expect(rows[0]).toHaveTextContent("pillars");
    expect(rows[0]).toHaveTextContent("hearts");
  });
});

describe("FilterBar is data-driven (facets from loaded scenarios, handles 5-axis traditions)", () => {
  const emptySel: Selection = { axes: {}, identity: [], locusMin: null, locusMax: null, q: "", sort: "default" };
  const f = (value: string, count: number) => ({ value, count });

  it("renders a control group per discovered axis + identity, with per-value counts", () => {
    const facets: Facets = {
      axes: {
        middot: [f("anavah", 3)],
        virtues: [f("emet", 1)],
        middle_path: [f("balance", 2)],
        domain: [f("speech", 4)],
        register: [f("plain", 0)],
      },
      identity: [f("clean", 5), f("leaky", 2)],
    };
    render(
      <FilterBar facets={facets} selection={emptySel} onChange={() => {}} total={0} shown={0} loaded={0} loadedAll />,
    );
    for (const name of ["middot", "virtues", "middle_path", "domain", "register", "identity"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // value buttons keep the value as their accessible name; counts render alongside.
    expect(screen.getByRole("button", { name: "anavah" })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "clean" })).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: "plain" })).toHaveTextContent("0"); // zero-count values still render
  });

  it("shows NO tag UI when no scenario carries tags (empty axes)", () => {
    const facets: Facets = { axes: {}, identity: [f("clean", 2)] };
    render(
      <FilterBar facets={facets} selection={emptySel} onChange={() => {}} total={2} shown={2} loaded={2} loadedAll />,
    );
    expect(screen.queryByText("pillars")).not.toBeInTheDocument();
    // identity is still offered when present
    expect(screen.getByText("identity")).toBeInTheDocument();
  });
});
