// Flat repeated-param URL <-> search-record (de)serialization for TanStack Router (spec §5.3):
// arrays become repeated params (?pillars=a&pillars=b); fail-soft, never throws.

import type { SearchRecord } from "./filtering";

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item != null && String(item) !== "") params.append(k, String(item));
    } else if (String(v) !== "") {
      params.set(k, String(v));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function parseSearch(searchStr: string): SearchRecord {
  const qs = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(qs);
  const out: SearchRecord = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}
