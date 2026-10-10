import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "./queryClient";
import { useLatestSha, useRawFile, useTree } from "./queries";
import { RateLimitError } from "./github";
import { REPO } from "./constants";
import { fakeFetch, traditionFiles } from "../test/fakeRepo";

const SHA = "deadbeef";
const files = traditionFiles("sunni-islam", ["JLS-001"]);

function wrapper() {
  const qc = makeQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("data-layer hooks (React Query behavior)", () => {
  it("useLatestSha resolves the latest commit SHA", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { result } = renderHook(() => useLatestSha(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe(SHA));
  });

  it("useLatestSha surfaces a RateLimitError as the query error", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files, { rateLimited: true }));
    const { result } = renderHook(() => useLatestSha(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(RateLimitError));
  });

  it("useTree resolves the SHA-pinned tree", async () => {
    vi.stubGlobal("fetch", fakeFetch(REPO, SHA, files));
    const { result } = renderHook(() => useTree(SHA), { wrapper: wrapper() });
    await waitFor(() =>
      expect(result.current.data?.some((e) => e.path === "traditions/sunni-islam/tradition.yaml")).toBe(true),
    );
  });

  it("useRawFile is SHA-keyed: changing the SHA refetches the new snapshot", async () => {
    const path = "traditions/sunni-islam/README.md";
    // Serve DIFFERENT content at two SHAs so a key change yields visibly new data.
    const twoSha = ((input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url.startsWith(`https://raw.githubusercontent.com/${REPO}/sha1/${path}`))
        return Promise.resolve(new Response("# v1", { status: 200 }));
      if (url.startsWith(`https://raw.githubusercontent.com/${REPO}/sha2/${path}`))
        return Promise.resolve(new Response("# v2", { status: 200 }));
      return Promise.resolve(new Response("nf", { status: 404 }));
    }) as typeof fetch;
    vi.stubGlobal("fetch", twoSha);

    const { result, rerender } = renderHook(({ sha }) => useRawFile(sha, path), {
      wrapper: wrapper(),
      initialProps: { sha: "sha1" },
    });
    await waitFor(() => expect(result.current.data).toBe("# v1"));
    rerender({ sha: "sha2" }); // new SHA => new query key => refetch
    await waitFor(() => expect(result.current.data).toBe("# v2"));
  });
});
