// Tolerant, display-first parsers: raw file text -> read-model fragments + notices.
// Pure functions, no network. Parsing NEVER throws on imperfect content — problems become
// `Notice`s. Taxonomy axes are read generically from the manifest (never hardcoded).

import yaml from "js-yaml";
import {
  FILE,
  IDENTITY_SIGNALS,
  PRESSURES,
  normalizeHeading,
  type Pressure,
} from "./constants";
import {
  emptyPressureMap,
  notice,
  type Manifest,
  type Notice,
  type PressureMap,
  type ScenarioMeta,
  type TaxonomyAxis,
} from "./model";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function loadYaml(text: string, where: string): { data: unknown; notice: Notice | null } {
  try {
    return { data: yaml.load(text), notice: null };
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/\n/g, " ") : String(e);
    return { data: null, notice: notice("error", "tradition", where, `Invalid YAML: ${detail}`) };
  }
}

// ---------------------------------------------------------------------------------------------
// Manifest (tradition.yaml)
// ---------------------------------------------------------------------------------------------

const KNOWN_MANIFEST_KEYS = new Set([
  "id",
  "schema_version",
  "display_name",
  "construct",
  "canonical_source",
  "adherent_noun",
  "maintainers",
  "scholar_review",
  "taxonomies",
  "scenario_id_pattern",
]);

function parseTaxonomies(
  raw: unknown,
  where: string,
  notices: Notice[],
): Record<string, TaxonomyAxis> {
  const out: Record<string, TaxonomyAxis> = {};
  if (raw === undefined) {
    notices.push(notice("warning", "tradition", where, "Manifest has no `taxonomies`."));
    return out;
  }
  if (!isRecord(raw)) {
    notices.push(notice("error", "tradition", where, "`taxonomies` is not a mapping."));
    return out;
  }
  for (const [axis, def] of Object.entries(raw)) {
    if (!isRecord(def)) {
      notices.push(notice("error", "tradition", where, `Taxonomy axis \`${axis}\` is malformed.`));
      out[axis] = { description: null, appliesTo: null, values: [] };
      continue;
    }
    let values: string[] = [];
    if (!Array.isArray(def.values)) {
      notices.push(notice("error", "tradition", where, `Taxonomy axis \`${axis}\` \`values\` is not a list.`));
    } else {
      values = def.values.filter((x): x is string => typeof x === "string");
      if (values.length !== def.values.length) {
        notices.push(notice("warning", "tradition", where, `Taxonomy axis \`${axis}\` has non-string values (ignored).`));
      }
      if (values.length === 0) {
        notices.push(notice("warning", "tradition", where, `Taxonomy axis \`${axis}\` has no values.`));
      }
    }
    out[axis] = {
      description: asString(def.description),
      appliesTo: asString(def.applies_to),
      values,
    };
  }
  return out;
}

export function parseManifest(
  text: string,
  where: string = FILE.manifest,
): { manifest: Manifest | null; notices: Notice[] } {
  const notices: Notice[] = [];
  const { data, notice: yamlErr } = loadYaml(text, where);
  if (yamlErr) return { manifest: null, notices: [yamlErr] };
  if (!isRecord(data)) {
    notices.push(notice("error", "tradition", where, "Manifest is not a mapping."));
    return { manifest: null, notices };
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_MANIFEST_KEYS.has(key)) {
      notices.push(notice("warning", "tradition", where, `Unknown manifest key \`${key}\` (ignored).`));
    }
  }

  const req = (key: string, v: string | null): string => {
    if (v === null || v === "") {
      notices.push(notice("error", "tradition", where, `Manifest missing required \`${key}\`.`));
      return "";
    }
    return v;
  };

  const cs = isRecord(data.canonical_source) ? data.canonical_source : {};
  const sr = isRecord(data.scholar_review) ? data.scholar_review : {};
  if (data.maintainers !== undefined && !Array.isArray(data.maintainers)) {
    notices.push(notice("error", "tradition", where, "`maintainers` is not a list."));
  }
  const maintainers = Array.isArray(data.maintainers)
    ? data.maintainers
        .map((m) => {
          if (!isRecord(m)) {
            notices.push(notice("warning", "tradition", where, "A `maintainers` entry is malformed (ignored)."));
            return null;
          }
          const name = asString(m.name);
          if (name === null) {
            notices.push(notice("warning", "tradition", where, "A `maintainers` entry has no `name`."));
          }
          return { name: name ?? "", contact: asString(m.contact) };
        })
        .filter((m): m is { name: string; contact: string | null } => m !== null)
    : [];

  const manifest: Manifest = {
    id: req("id", asString(data.id)),
    displayName: req("display_name", asString(data.display_name)),
    construct: asString(data.construct) ?? "",
    canonicalSource: {
      title: asString(cs.title),
      author: asString(cs.author),
      locusUnit: asString(cs.locus_unit),
    },
    adherentNoun: req("adherent_noun", asString(data.adherent_noun)),
    maintainers,
    scholarReview: {
      status: asString(sr.status),
      reviewers: Array.isArray(sr.reviewers)
        ? sr.reviewers.filter((x): x is string => typeof x === "string")
        : [],
    },
    taxonomies: parseTaxonomies(data.taxonomies, where, notices),
    scenarioIdPattern: asString(data.scenario_id_pattern),
    schemaVersion: typeof data.schema_version === "number" ? data.schema_version : null,
  };

  // Surface the remaining spec-defined required fields display-first (flag, don't silently drop).
  if (manifest.construct === "") {
    notices.push(notice("error", "tradition", where, "Manifest missing required `construct`."));
  }
  if (!isRecord(data.canonical_source)) {
    notices.push(notice("error", "tradition", where, "Manifest missing/malformed `canonical_source`."));
  } else {
    for (const k of ["title", "author", "locus_unit"] as const) {
      if (asString(cs[k]) === null) {
        notices.push(notice("error", "tradition", where, `Manifest missing \`canonical_source.${k}\`.`));
      }
    }
  }
  if (manifest.maintainers.length === 0) {
    notices.push(notice("error", "tradition", where, "Manifest needs at least one maintainer."));
  }
  if (manifest.scenarioIdPattern === null) {
    notices.push(notice("error", "tradition", where, "Manifest missing required `scenario_id_pattern`."));
  }

  return { manifest, notices };
}

// ---------------------------------------------------------------------------------------------
// scenarios/index.json
// ---------------------------------------------------------------------------------------------

export function parseIndex(
  text: string,
  where: string = `${FILE.scenariosDir}/${FILE.index}`,
): { ids: string[] | null; notices: Notice[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ids: null, notices: [notice("error", "tradition", where, `Invalid JSON: ${detail}`)] };
  }
  if (!isRecord(data) || !Array.isArray(data.scenarios)) {
    return {
      ids: null,
      notices: [notice("error", "tradition", where, "index.json missing a `scenarios` array.")],
    };
  }
  const ids = data.scenarios.filter((x): x is string => typeof x === "string");
  return { ids, notices: [] };
}

/**
 * Resolve the scenario set from (index ids, folder ids): the UNION, ordered by the index
 * then orphan folders appended id-sorted. Orphans (folder ∉ index) and ghosts (index ∉
 * folders) each get a notice. Folder is authoritative for content, index for order.
 */
export function resolveScenarioSet(
  indexIds: string[] | null,
  folderIds: string[],
  where: string = FILE.scenariosDir,
): { ordered: string[]; ghosts: Set<string>; notices: Notice[] } {
  const notices: Notice[] = [];
  const folders = new Set(folderIds);
  const ghosts = new Set<string>();

  if (indexIds === null) {
    notices.push(
      notice("warning", "tradition", where, "No usable index.json — scenario set derived from folders."),
    );
    return { ordered: [...folderIds].sort(), ghosts, notices };
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const id of indexIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    if (!folders.has(id)) {
      ghosts.add(id);
      notices.push(
        notice("error", "scenario", `${where}/${id}`, `Ghost: \`${id}\` is in index.json but has no folder.`),
      );
    }
  }
  const orphans = folderIds.filter((id) => !seen.has(id)).sort();
  for (const id of orphans) {
    ordered.push(id);
    notices.push(
      notice("warning", "scenario", `${where}/${id}`, `Orphan: folder \`${id}\` is not listed in index.json.`),
    );
  }
  return { ordered, ghosts, notices };
}

// ---------------------------------------------------------------------------------------------
// scenario.yaml
// ---------------------------------------------------------------------------------------------

export function parseScenarioMeta(
  text: string,
  folderId: string,
  where: string,
  // axis name -> declared (allowed) values, from the manifest. When provided and non-empty,
  // both unknown axes AND unknown values are flagged display-first.
  declaredTaxonomies?: Record<string, readonly string[]>,
): { meta: ScenarioMeta | null; notices: Notice[] } {
  const notices: Notice[] = [];
  const { data, notice: yamlErr } = loadYaml(text, where);
  if (yamlErr) return { meta: null, notices: [{ ...yamlErr, scope: "scenario" }] };
  if (!isRecord(data)) {
    notices.push(notice("error", "scenario", where, "scenario.yaml is not a mapping."));
    return { meta: null, notices };
  }

  const id = asString(data.id) ?? folderId;
  if (asString(data.id) && data.id !== folderId) {
    notices.push(
      notice("warning", "scenario", where, `scenario.yaml id \`${String(data.id)}\` ≠ folder \`${folderId}\`.`),
    );
  }

  const validate = !!declaredTaxonomies && Object.keys(declaredTaxonomies).length > 0;
  const tags: Record<string, string[]> = {};
  if (isRecord(data.tags)) {
    for (const [axis, vals] of Object.entries(data.tags)) {
      let list: string[] = [];
      if (!Array.isArray(vals)) {
        notices.push(notice("warning", "scenario", where, `Tag axis \`${axis}\` is not a list (ignored).`));
      } else {
        list = vals.filter((x): x is string => typeof x === "string");
        if (list.length !== vals.length) {
          notices.push(notice("warning", "scenario", where, `Tag axis \`${axis}\` has non-string values (ignored).`));
        }
      }
      tags[axis] = list;
      if (validate) {
        const allowed = declaredTaxonomies![axis];
        if (!allowed) {
          notices.push(notice("warning", "scenario", where, `Tag axis \`${axis}\` is not declared by the manifest.`));
        } else {
          for (const v of list) {
            if (!allowed.includes(v)) {
              notices.push(notice("warning", "scenario", where, `Tag value \`${v}\` is not in the \`${axis}\` vocabulary.`));
            }
          }
        }
      }
    }
  } else if (data.tags !== undefined) {
    notices.push(notice("error", "scenario", where, "`tags` is not a mapping."));
  }

  const identitySignal = asString(data.identity_signal);
  if (identitySignal !== null && !IDENTITY_SIGNALS.includes(identitySignal as never)) {
    notices.push(notice("warning", "scenario", where, `Unknown identity_signal \`${identitySignal}\`.`));
  }

  const sourceLocus = typeof data.source_locus === "number" ? data.source_locus : null;
  if (data.source_locus !== undefined && sourceLocus === null) {
    notices.push(notice("warning", "scenario", where, "`source_locus` is not a number."));
  }

  const locusLabel = asString(data.locus_label);
  if (data.locus_label !== undefined && locusLabel === null) {
    notices.push(notice("warning", "scenario", where, "`locus_label` is not a string."));
  }

  return {
    meta: { id, tags, sourceLocus, locusLabel, identitySignal },
    notices,
  };
}

// ---------------------------------------------------------------------------------------------
// pressures.md
// ---------------------------------------------------------------------------------------------

export function parsePressures(
  text: string,
  where: string = FILE.pressures,
): { pressures: PressureMap; notices: Notice[] } {
  const notices: Notice[] = [];
  const pressures = emptyPressureMap(PRESSURES);

  // Split into "## heading" sections; content before the first heading is ignored.
  const lines = text.split(/\r?\n/);
  const sections: { key: string; raw: string; body: string[] }[] = [];
  let current: { key: string; raw: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && m[1] !== undefined) {
      current = { key: normalizeHeading(m[1]), raw: m[1], body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  const seen = new Set<Pressure>();
  for (const s of sections) {
    if ((PRESSURES as readonly string[]).includes(s.key)) {
      const key = s.key as Pressure;
      const body = s.body.join("\n").trim();
      if (seen.has(key)) {
        notices.push(notice("warning", "section", where, `Duplicate pressure \`${key}\` (first kept).`));
        continue;
      }
      seen.add(key);
      pressures[key] = body.length > 0 ? body : null;
      if (body.length === 0) {
        notices.push(notice("error", "section", where, `Pressure \`${key}\` section is empty.`));
      }
    } else {
      notices.push(notice("warning", "section", where, `Unrecognized pressure heading \`${s.raw}\`.`));
    }
  }
  for (const p of PRESSURES) {
    if (!seen.has(p)) {
      notices.push(notice("error", "section", where, `Missing pressure \`${p}\`.`));
    }
  }
  return { pressures, notices };
}

// ---------------------------------------------------------------------------------------------
// Prose (README.md / source.md / guide.md / turn1.md / judge-guidance.md)
// ---------------------------------------------------------------------------------------------

/** Treat a prose/text section display-first: empty/missing -> null + a notice. */
export function proseSection(
  text: string | null,
  label: string,
  scope: string,
  where: string,
): { text: string | null; notice: Notice | null } {
  if (text === null) {
    return { text: null, notice: notice("warning", scope, where, `${label} is missing.`) };
  }
  if (text.trim().length === 0) {
    return { text: null, notice: notice("warning", scope, where, `${label} is empty.`) };
  }
  return { text, notice: null };
}
