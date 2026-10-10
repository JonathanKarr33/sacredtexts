// The multibrowser deployment's mapping from a raw-results (group, item) back to the source corpus.
//
// The raw explorer is catalog-generic (#54): the raw MODEL (`rawModel.ts`) and renderer
// (`RawComparison`) carry NO MultiBench vocabulary, so a non-MB catalog rides unchanged. This module
// is the ONE documented seam that knows MultiBench's corpus shape — the identity mapping the scenario
// page's "Open in the full explorer" link already assumes: raw `group` = tradition id, raw `item` =
// scenario id. It lets the raw item page show the scenario's judge-guidance inline and cross-link to
// the corpus page, WITHOUT teaching the generic model/renderer anything MB-specific.
//
// It resolves ONLY for the MultiBench corpus (grouping axis `tradition`); any other catalog (e.g.
// AFB's `instrument` grouping, #54) yields `null`, and the raw page degrades gracefully — no guidance
// section, no cross-link.

import { FILE } from "./constants";
import type { RawCatalog } from "./rawModel";

/** The MultiBench grouping-axis key a raw catalog declares when its items are tradition scenarios. */
const CORPUS_GROUP_KEY = "tradition";

export interface CorpusRef {
  /** Repo path to the scenario's judge-guidance.md (also the human-facing locator for a notice). */
  guidancePath: string;
  /** Corpus route params for `/t/$traditionId/$scenarioId`. */
  route: { traditionId: string; scenarioId: string };
}

/**
 * Map a raw (group, item) to its source-corpus references, or `null` when the catalog is not the
 * MultiBench tradition corpus (so the raw page shows no guidance / cross-link and stays generic).
 */
export function corpusRef(catalog: RawCatalog, group: string, item: string): CorpusRef | null {
  if (catalog.groupBy.key !== CORPUS_GROUP_KEY) return null;
  return {
    guidancePath: ["traditions", group, FILE.scenariosDir, item, FILE.judgeGuidance].join("/"),
    route: { traditionId: group, scenarioId: item },
  };
}
