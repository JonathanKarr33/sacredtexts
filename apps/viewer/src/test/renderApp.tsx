import { render } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "../router";

/** Render the real app (router + layout) at `path`. The GitHub data layer and its
 * QueryClient are gone after the multibrowser purge, so this is just the router. */
export function renderApp(path = "/") {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(history);
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}
