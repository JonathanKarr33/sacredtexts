// DEPRECATED inert seam (superseded by #51). The per-scenario results layer now lives in the
// raw tier: `queries.ts::loadRawScenario` + the scenario page's embedded `ScenarioResponses`
// section + the `/results/$runId/$groupId/$itemId` view. This function still ALWAYS returns null and nothing
// reads `Scenario.results` anymore — retained only to avoid touching the `loadScenario` shape
// mid-feature. TODO(review/simplify): remove `loadResults` + `Scenario.results`/`ScenarioResults`.

import type { Scenario, ScenarioResults } from "./model";

export function loadResults(_scenario: Pick<Scenario, "id">): ScenarioResults | null {
  return null;
}
