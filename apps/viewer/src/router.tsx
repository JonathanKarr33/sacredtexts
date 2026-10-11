import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { InterimHome } from "./routes/InterimHome";
import { NotFound } from "./routes/NotFound";

// Code-based routing (deliberate, documented deviation from "file-based"): avoids the
// router-plugin codegen step, keeps the route tree explicit, and is fully unit-testable
// with a memory history. After the multibrowser purge the tree is just `/` (the interim
// local-results home) plus a catch-all 404; the leaderboard/explorer routes land in the
// Spec 2 feature phases.

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: InterimHome,
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
