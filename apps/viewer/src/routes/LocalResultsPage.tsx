import { LocalResults } from "../components/LocalResults";
import { joinResults, parseJsonl, parseSummary, type AnswerRow, type ScoreRow } from "../lib/localResults";
import { sampleAnswersJsonl, sampleScoresJsonl, sampleSummary } from "../local/sample";

// Local-only results view (Spec 1, Phase 7). Renders a committed sample run so
// `pnpm dev` → /local-results works out of the box; Phase 8's TUTORIAL points it
// at a real run under runs/. No GitHub data layer, no deploy, no domain adaptation.

export function LocalResultsPage() {
  const summary = parseSummary(sampleSummary);
  const scores = parseJsonl<ScoreRow>(sampleScoresJsonl);
  const answers = parseJsonl<AnswerRow>(sampleAnswersJsonl);
  return <LocalResults summary={summary} results={joinResults(scores, answers)} />;
}
