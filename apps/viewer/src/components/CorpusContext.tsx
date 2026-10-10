import { Link } from "@tanstack/react-router";
import { useCorpusGuidance } from "../lib/queries";
import { corpusRef } from "../lib/corpus";
import type { RawCatalog } from "../lib/rawModel";
import { Collapsible } from "./Collapsible";
import { Markdown } from "./Markdown";
import { Notice } from "./Notice";

/**
 * The raw item page's corpus context: the scenario's judge-guidance (the binding ground truth the
 * scores are judged against) shown inline, plus a cross-link back to the corpus scenario page. Wired
 * through the documented group→corpus mapping (`lib/corpus.ts`), NOT the generic raw model — this
 * component is where the MultiBench corpus route/vocab lives, keeping `RawResultsPage` catalog-generic
 * (the #54 static guard). Renders nothing for a non-corpus (e.g. AFB) catalog → graceful degrade.
 *
 * Default-open: a visitor landing on a deep link (e.g. the talk shortlink) should see WHY a score is
 * what it is without a click.
 */
export function CorpusContext({ sha, catalog, group, item }: {
  sha: string | undefined; catalog: RawCatalog; group: string; item: string;
}) {
  const ref = corpusRef(catalog, group, item);
  const guidanceQ = useCorpusGuidance(sha, ref?.guidancePath ?? null);
  if (!ref) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="corpus-context">
      <Link to="/t/$traditionId/$scenarioId" params={ref.route}
        className="self-start text-xs text-primary hover:underline" data-testid="corpus-link">
        View in corpus →
      </Link>
      <Collapsible defaultOpen title="Context — what good counsel looks like (the guidance the judges use)">
        {guidanceQ.data?.guidance != null ? (
          <Markdown>{guidanceQ.data.guidance}</Markdown>
        ) : guidanceQ.isLoading ? (
          <p className="text-sm text-default-400">Loading guidance…</p>
        ) : (
          // Absent guidance is a corpus DEFECT, not cosmetics — surface it as an error Notice, matching
          // ScenarioResponses (the judges' ground truth should never be silently missing).
          <Notice notice={{ severity: "error", scope: "section", where: ref.guidancePath, message: "Judge-guidance is missing or empty." }} />
        )}
      </Collapsible>
    </section>
  );
}
