import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { IndexPage } from "./routes/IndexPage";
import { TraditionPage } from "./routes/TraditionPage";
import { ScenarioPage } from "./routes/ScenarioPage";
import { ResultsPage } from "./routes/ResultsPage";
import { RawResultsPage } from "./routes/RawResultsPage";
import { RawRunPage } from "./routes/RawRunPage";
import { ReviewIndexPage } from "./routes/ReviewIndexPage";
import { ReviewTraditionPage } from "./routes/ReviewTraditionPage";
import { ReviewScenarioPage } from "./routes/ReviewScenarioPage";
import { NotFound } from "./routes/NotFound";
import { parseSearch, stringifySearch } from "./lib/searchParams";
import { searchSchema } from "./lib/filtering";
import { resultsSearchSchema } from "./lib/resultsSelection";
import { rawSearchSchema } from "./lib/rawSelection";

// Code-based routing (deliberate, documented deviation from the plan's "file-based" choice):
// avoids the router-plugin codegen step, keeps the route tree explicit, and is fully unit-
// testable with a memory history. Same library, same deep-linkable URLs.

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: IndexPage });

export const traditionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$traditionId",
  component: TraditionPage,
  // Validate the flat search shape at the route boundary (fail-soft); axis-vs-reserved meaning
  // is interpreted per-tradition in the page via parseSelection.
  validateSearch: searchSchema,
});

export const scenarioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$traditionId/$scenarioId",
  component: ScenarioPage,
  // The embedded responses' selection (model A/B + condition axes) lives in the URL so it's
  // shareable and sidebar "guided example" presets deep-link into it (reuses the raw-view schema).
  validateSearch: rawSearchSchema,
});

export const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/results",
  component: ResultsPage,
  validateSearch: resultsSearchSchema,
});

// The #51 raw-results view: run + group (tradition) + item (scenario) path params, plus the
// A/B subjects, condition-axis, scope, and judge selection in the (fail-soft) search state.
export const rawResultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/results/$runId/$groupId/$itemId",
  component: RawResultsPage,
  validateSearch: rawSearchSchema,
});

// A standalone raw-only explorer's run landing (#54): presets + a generic item index into the raw
// view. No search state of its own (it only builds links), so no validateSearch.
export const rawRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/raw/$runId",
  component: RawRunPage,
});

// The reviewer workspace: expert validation of a tradition's source, guide, and a scenario
// sample, with locally-retained intake (lib/review.ts). No search state — intake never rides
// the URL (it is private until explicitly submitted).
export const reviewIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review",
  component: ReviewIndexPage,
});

export const reviewTraditionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review/$traditionId",
  component: ReviewTraditionPage,
});

export const reviewScenarioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/review/$traditionId/$scenarioId",
  component: ReviewScenarioPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute, traditionRoute, scenarioRoute, resultsRoute, rawResultsRoute, rawRunRoute,
  reviewIndexRoute, reviewTraditionRoute, reviewScenarioRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: () => <NotFound />,
    parseSearch,
    stringifySearch,
    ...(history ? { history } : {}),
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
