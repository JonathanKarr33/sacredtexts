import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { LeaderboardPage } from "./routes/LeaderboardPage";
import { NotFound } from "./routes/NotFound";

// Code-based routing (deliberate, documented deviation from "file-based"): avoids the
// router-plugin codegen step, keeps the route tree explicit, and is fully unit-testable
// with a memory history. The tree is `/` (the leaderboard home, selecting a run via the
// `?run=<id>` search param) plus a catch-all 404; the error explorer / standings routes
// land in the later Spec 2 feature phases.

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
});

// The run selection lives in the URL as a bare run id (`?run=<id>`). A plain validator
// (not zod — pruned in the purge) keeps it to an optional string; an absent or non-string
// value becomes undefined, and the page falls back to the most-recent run.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LeaderboardPage,
  validateSearch: (search: Record<string, unknown>): { run?: string } => ({
    run: typeof search.run === "string" ? search.run : undefined,
  }),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: () => <NotFound />,
    ...(history ? { history } : {}),
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
