import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { LeaderboardPage } from "./routes/LeaderboardPage";
import { ExplorerPage } from "./routes/ExplorerPage";
import { NotFound } from "./routes/NotFound";
import { type ExplorerFilters } from "./lib/explorer";

// Code-based routing (deliberate, documented deviation from "file-based"): avoids the
// router-plugin codegen step, keeps the route tree explicit, and is fully unit-testable
// with a memory history. The tree is `/` (the leaderboard home, selecting a run via the
// `?run=<id>` search param), `/run/$runId/model/$modelId` (the error explorer, with its
// `?task=&tradition=&correct=&mode=` filter state), plus a catch-all 404; the standings
// route lands in the final Spec 2 feature phase.

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

// The error explorer: `/run/$runId/model/$modelId` with composing filter state in the URL.
// A plain validator (zod stays pruned) coerces each param to its allowed values, dropping
// anything unexpected to undefined so a hand-edited URL never breaks the page.
const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/run/$runId/model/$modelId",
  component: ExplorerPage,
  validateSearch: (search: Record<string, unknown>): ExplorerFilters => ({
    task: typeof search.task === "string" && search.task ? search.task : undefined,
    tradition: typeof search.tradition === "string" && search.tradition ? search.tradition : undefined,
    correct:
      search.correct === "correct" || search.correct === "incorrect" ? search.correct : undefined,
    mode: search.mode === "missing" || search.mode === "wrong" ? search.mode : undefined,
  }),
});

const routeTree = rootRoute.addChildren([indexRoute, explorerRoute]);

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
