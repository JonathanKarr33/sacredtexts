// The run index — which runs exist under `runs/` — fetched from the dev server's
// `/runs/_index` endpoint. Shared by the leaderboard (default = most-recent run) and the
// standings view (loads every run), so the HTML-200 guard below lives in exactly one place.

/** One enumerated run. `mtimeMs` is the run directory's mtime (newest-first ordering and
 * the "most recent across runs" selection in standings); it is optional so a hand-built
 * index without it still parses. */
export interface RunRef {
  id: string;
  mtimeMs?: number;
}

export type RunIndexResult = { ok: true; runs: RunRef[] } | { ok: false; message: string };

/**
 * Fetch and parse the run index, distinguishing empty (no runs) from a genuine fetch/parse
 * failure. A 200 HTML body — a production static host with no `/runs` endpoint serving the
 * SPA shell for an unknown path — is treated as "no runs" (the empty state), never a crash.
 *
 * Runs are returned newest-first by a defensive client sort (mtime desc, id asc) rather
 * than trusting the endpoint's order, so callers can rely on `runs[0]` being the most
 * recent even if the server's ordering ever changes.
 */
export async function fetchRunIndex(fetcher: typeof fetch): Promise<RunIndexResult> {
  let res: Response;
  try {
    res = await fetcher("/runs/_index");
  } catch (e) {
    return { ok: false, message: `/runs/_index: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, message: `/runs/_index: HTTP ${res.status}` };
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    return { ok: false, message: `/runs/_index: ${(e as Error).message}` };
  }
  // Prod static host: /runs/_index falls through to index.html (200 HTML) → no runs.
  if (text.trimStart().startsWith("<")) return { ok: true, runs: [] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "/runs/_index: run index is not valid JSON" };
  }
  if (!Array.isArray(data)) return { ok: false, message: "/runs/_index: run index is not a list" };
  const runs: RunRef[] = data
    .filter((e): e is RunRef => !!e && typeof (e as RunRef).id === "string")
    .map((e) => ({ id: e.id, mtimeMs: typeof e.mtimeMs === "number" ? e.mtimeMs : 0 }));
  runs.sort(
    (a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return { ok: true, runs };
}
