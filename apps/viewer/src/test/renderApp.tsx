import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "../router";

/** Render the real app (router + providers) at `path`, with an isolated, no-retry QueryClient
 * (retries off so error-path tests don't wait on backoff). */
export function renderApp(path = "/") {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(history);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const result = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...result, router, qc };
}
