import { QueryClient } from "@tanstack/react-query";
import { RateLimitError } from "./github";

/** The app-wide QueryClient. Don't retry on rate-limit (it won't help until reset) or on a
 * deliberate 404; retry transient errors a couple of times. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => !(error instanceof RateLimitError) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = makeQueryClient();
