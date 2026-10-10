// Test helper: a fake GitHub backed by an in-memory file map. Builds the git-trees response
// and serves raw content / commit SHA / rate-limit responses. Used to exercise the data layer
// fully offline.

import type { TreeEntry } from "../lib/github";

export function buildTree(files: Record<string, string>): TreeEntry[] {
  const blobs = Object.keys(files);
  const dirs = new Set<string>();
  for (const p of blobs) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return [
    ...[...dirs].sort().map((d) => ({ path: d, type: "tree" as const })),
    ...blobs.sort().map((p) => ({ path: p, type: "blob" as const })),
  ];
}

function json(o: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/**
 * Immediate children of a directory (`""` = repo root), for the NON-recursive git-trees walk
 * the truncation fallback uses. Each child's `sha` is its full path, so `walkInto` can address
 * the next level. Models the GitHub `git/trees/<sha>` (no `recursive=1`) response shape.
 */
function childrenOf(files: Record<string, string>, dir: string): { path: string; type: string; sha: string }[] {
  const prefix = dir ? `${dir}/` : "";
  const seen = new Map<string, "tree" | "blob">();
  for (const p of Object.keys(files)) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash === -1) seen.set(rest, "blob");
    else seen.set(rest.slice(0, slash), "tree");
  }
  return [...seen].map(([name, type]) => ({ path: name, type, sha: prefix + name }));
}

export interface FakeOpts {
  truncated?: boolean;
  rateLimited?: boolean;
  resetEpoch?: number;
}

/** A `fetch` impl serving the given repo@sha from `files`. */
export function fakeFetch(
  repo: string,
  sha: string,
  files: Record<string, string>,
  opts: FakeOpts = {},
): typeof fetch {
  const rawPrefix = `https://raw.githubusercontent.com/${repo}/${sha}/`;
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (opts.rateLimited && url.startsWith("https://api.github.com")) {
      return new Response("rate limited", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(opts.resetEpoch ?? 0) },
      });
    }
    if (url.includes(`/repos/${repo}/commits/`)) return json({ sha });
    if (url.includes(`/repos/${repo}/git/trees/`) && url.includes("recursive=1")) {
      return json({ truncated: !!opts.truncated, tree: opts.truncated ? [] : buildTree(files) });
    }
    // Non-recursive git-trees (the truncation fallback's per-directory walk).
    const nrec = url.match(/\/repos\/[^/]+\/[^/]+\/git\/trees\/(.+)$/);
    if (nrec?.[1]) {
      const key = decodeURIComponent(nrec[1].split("?")[0] ?? "");
      const dir = key === sha ? "" : key; // the commit sha addresses the repo root
      return json({ tree: childrenOf(files, dir) });
    }
    if (url.startsWith(rawPrefix)) {
      const path = decodeURIComponent(url.slice(rawPrefix.length));
      if (Object.prototype.hasOwnProperty.call(files, path)) {
        return new Response(files[path], { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }
    return new Response("unhandled", { status: 500 });
  }) as typeof fetch;
}

/** A minimal tradition's files, parameterized by id + a couple of scenario ids. */
export function traditionFiles(id: string, scenarioIds: string[]): Record<string, string> {
  const base = `traditions/${id}`;
  const files: Record<string, string> = {
    [`${base}/tradition.yaml`]: [
      `id: ${id}`,
      `display_name: ${id.toUpperCase()}`,
      `construct: test`,
      `canonical_source: {title: T, author: A, locus_unit: bab}`,
      `adherent_noun: Adherent`,
      `maintainers: [{name: x}]`,
      `scholar_review: {status: none, reviewers: []}`,
      `taxonomies:`,
      `  pillars: {description: d, applies_to: scenario, values: [a, b]}`,
      `  hearts: {description: d, applies_to: response, values: [c, d]}`,
      `scenario_id_pattern: '^.*$'`,
      "",
    ].join("\n"),
    [`${base}/README.md`]: `# ${id}`,
    [`${base}/source.md`]: `source of ${id}`,
    [`${base}/guide.md`]: `guide of ${id}`,
    [`${base}/scenarios/index.json`]: JSON.stringify({ schema_version: 1, scenarios: scenarioIds }),
  };
  for (const sid of scenarioIds) {
    const sbase = `${base}/scenarios/${sid}`;
    files[`${sbase}/scenario.yaml`] = [
      `id: ${sid}`,
      `tags: {pillars: [a], hearts: [c]}`,
      `source_locus: 1`,
      `locus_label: Label ${sid}`,
      `identity_signal: clean`,
      "",
    ].join("\n");
    files[`${sbase}/turn1.md`] = `turn1 for ${sid}`;
    files[`${sbase}/judge-guidance.md`] = `judge guidance for ${sid}`;
    files[`${sbase}/pressures.md`] = [
      "## secularize",
      "s",
      "## insistence",
      "i",
      "## false_authority",
      "fa",
      "## good_cause",
      "gc",
      "## flattery",
      "fl",
      "## personal_appeal",
      "pa",
      "",
    ].join("\n");
  }
  return files;
}

/**
 * A minimal committed results dataset (#49): `results/<runId>/manifest.json` + one shard per
 * tradition. Deterministic, self-consistent — used by the results data-layer / explorer tests.
 */
export function resultsFiles(
  runId: string,
  opts: {
    generatedAt?: string;
    traditions?: string[];
    schemaVersion?: number;
    // per (tradition, judge, subject, framing, scope, pressure) mean override; default fills unstated/full/all
    shard?: (tradition: string) => Record<string, unknown>;
  } = {},
): Record<string, string> {
  const traditions = opts.traditions ?? ["buddhism"];
  const gen = opts.generatedAt ?? "2026-08-06T00:00:00+00:00";
  const manifest = {
    schema_version: opts.schemaVersion ?? 1,
    run_id: runId,
    generated_at: gen,
    subjects: [
      "Qwen/Qwen3-235B-A22B-Instruct-2507", "claude-sonnet-5", "gemini-3.6-flash",
      "gpt-5.6-terra", "thinkingmachines/Inkling",
    ],
    judges: [
      { key: "gemini", model: "gemini-3.6-flash", aliases: ["gemini-3.6-flash"], full_grid: true, rankable: true, coverage: 1.0 },
      {
        key: "opus", model: "claude-opus-4-8",
        aliases: ["claude-opus-4-8", "anthropic/claude-opus-4.8"], full_grid: false, rankable: false, coverage: 0.14,
      },
    ],
    framings: ["unstated", "stated", "guided"],
    pressures: [
      "secularize", "insistence", "false_authority", "good_cause", "flattery", "personal_appeal",
    ],
    pressure_all: "all",
    scopes: ["turn1", "full"],
    metrics: ["turn1", "full", "steadfastness"],
    traditions: traditions.map((t) => ({ id: t, n_scenarios: 2, shard: `${t}.json` })),
    counts: {
      judgments: { "gemini-3.6-flash": 10, "claude-opus-4-8": 5 },
      coverage: { "gemini-3.6-flash": { unstated: { n_judged: 10, n_expected: 10 } } },
    },
  };
  const files: Record<string, string> = {
    [`results/${runId}/manifest.json`]: JSON.stringify(manifest),
  };
  for (const t of traditions) {
    const shard = opts.shard
      ? opts.shard(t)
      : {
          tradition: t,
          n_scenarios: 2,
          judges: ["gemini-3.6-flash"],
          means: {
            "gemini-3.6-flash": {
              // n_expected for the pooled "all" slice = n_scenarios(2) × 6 pressures = 12
              "claude-sonnet-5": { unstated: { full: { all: [0.5, 2, 12] } } },
            },
          },
          steadfastness: {},
        };
    files[`results/${runId}/${t}.json`] = JSON.stringify(shard);
  }
  return files;
}
