import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { queryClient } from "./lib/queryClient";
import { RAW_PERSIST_EXCLUDED } from "./lib/constants";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Persist the (SHA-pinned, immutable) query cache to localStorage so a returning visitor reuses
// it instead of re-fetching — cross-session politeness to GitHub's unauthenticated rate limit.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "multibrowser-query-cache",
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24,
            // Don't persist: the large per-scenario raw shards (`rawScenario`, ~0.7 MB each —
            // a few drill-ins would blow the localStorage quota and TanStack would then silently
            // stop persisting the WHOLE cache); and the raw source *selection* (`rawSource`) —
            // persisting a transient baked-absent → GitHub fallback would lock a run onto GitHub
            // even after the baked bundle is deployed. Both are cheap to re-resolve; everything
            // else (score tiers, traditions) still persists for cross-session rate-limit relief.
            // The excluded key roots live in `constants.ts` (RAW_PERSIST_EXCLUDED), shared with the
            // query definitions in `queries.ts`, so a rename can't silently disable this exclusion.
            dehydrateOptions: {
              shouldDehydrateQuery: (q) =>
                !RAW_PERSIST_EXCLUDED.has(q.queryKey[0] as string) && defaultShouldDehydrateQuery(q),
            },
          }}
        >
          <RouterProvider router={router} />
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
