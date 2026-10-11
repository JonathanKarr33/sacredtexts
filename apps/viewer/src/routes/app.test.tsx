import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, render } from "@testing-library/react";
import { renderApp } from "../test/renderApp";
import { ErrorBoundary } from "../components/ErrorBoundary";

afterEach(() => vi.unstubAllGlobals());

/** A fetcher that returns 200 with one body for every URL (for the shell test's run index). */
function constFetcher(body: string): typeof fetch {
  return (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch;
}

describe("routing", () => {
  it("renders an in-SPA 404 for an unknown route", async () => {
    renderApp("/totally/unknown/path");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });
});

describe("app shell", () => {
  it("shows the Sacred Texts brand and no multibrowser nav/GitHub link", async () => {
    vi.stubGlobal("fetch", constFetcher("[]")); // empty run index → home resolves to empty state
    renderApp("/");
    expect(await screen.findByRole("link", { name: /Sacred Texts/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /traditions on GitHub/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Results$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Review$/ })).toBeNull();
  });

  it("exposes the Standings nav link to the cross-run view", async () => {
    vi.stubGlobal("fetch", constFetcher("[]"));
    renderApp("/");
    const link = await screen.findByRole("link", { name: "Standings" });
    expect(link.getAttribute("href")).toBe("/standings");
  });
});

describe("ErrorBoundary", () => {
  it("catches a thrown render error and shows a message, not a blank page", () => {
    const Boom = () => {
      throw new Error("kaboom");
    };
    // Silence the expected console.error from the boundary.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    spy.mockRestore();
  });
});
