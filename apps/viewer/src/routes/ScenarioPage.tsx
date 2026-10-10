import { useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLatestSha, useScenario, useTradition, useScenarioRaw } from "../lib/queries";
import { taxonomyValues } from "../lib/model";
import { parseRawSelection, rawSelectionToSearch } from "../lib/rawSelection";
import { asRateLimit, resetLabel } from "../lib/rateLimit";
import { ScenarioControls } from "../components/ScenarioControls";
import { ScenarioResponses } from "../components/ScenarioResponses";
import { Notice } from "../components/Notice";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { CenteredSpinner } from "../components/Loading";
import { NotFound } from "./NotFound";

const route = getRouteApi("/t/$traditionId/$scenarioId");

export function ScenarioPage() {
  const { traditionId, scenarioId } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const shaQ = useLatestSha();
  const sha = shaQ.data;
  const tradQ = useTradition(sha, traditionId);
  const tradition = tradQ.data;
  const declaredTax = useMemo(() => taxonomyValues(tradition?.manifest?.taxonomies ?? {}), [tradition]);
  const scenarioIds = tradition?.scenarioIds ?? [];
  const scenQ = useScenario(sha, traditionId, scenarioId, declaredTax);
  const scenario = scenQ.data;
  const raw = useScenarioRaw(traditionId, scenarioId); // default run + this scenario's shard (on demand)
  const [filter, setFilter] = useState("");
  // The main pane is its OWN scroll container; reset it to the top when the scenario changes
  // (same route, changing param → the component stays mounted and scrollTop would persist).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [scenarioId]);

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(tradQ.error) ?? asRateLimit(scenQ.error);
  const otherError = !rl && (shaQ.error || tradQ.error || scenQ.error);

  const errorFallback = (what: string) => (
    <div className="flex flex-col gap-4">
      {rl && <RateLimitBanner error={rl} />}
      <Notice notice={{ severity: "error", scope: "github", where: "GitHub",
        message: rl
          ? `Couldn't load this ${what} — GitHub's rate limit was reached and nothing is cached yet. Live data resumes around ${resetLabel(rl)}.`
          : `Couldn't load this ${what}: ${(otherError as Error).message}` }} />
    </div>
  );

  if (!tradition && (rl || otherError)) return errorFallback("scenario");
  if (tradQ.isLoading && !tradition) return <CenteredSpinner label="Loading…" />;
  if (tradition === null) return <NotFound what={`Tradition “${traditionId}”`} />;
  if (tradition && !scenarioIds.includes(scenarioId)) return <NotFound what={`Scenario “${scenarioId}”`} />;
  if (scenQ.isLoading && !scenario) return <CenteredSpinner label="Loading scenario…" />;
  if (!scenario && (rl || otherError)) return errorFallback("scenario");
  if (!scenario || !tradition) return null;

  const idx = scenarioIds.indexOf(scenarioId);
  const prev = idx > 0 ? scenarioIds[idx - 1] : null;
  const next = idx >= 0 && idx < scenarioIds.length - 1 ? scenarioIds[idx + 1] : null;
  const where = `${traditionId}/scenarios/${scenarioId}`;
  const adherent = tradition.manifest?.adherentNoun?.trim() || "person of faith";

  // Selection is URL state (parsed against the raw catalog once it loads); presets deep-link into it.
  const sel = raw.catalog ? parseRawSelection(search, raw.catalog) : null;
  const setSel = (patch: Partial<NonNullable<typeof sel>>) => {
    if (raw.catalog && sel) navigate({ search: rawSelectionToSearch({ ...sel, ...patch }) });
  };
  const dataNotices = [...raw.notices.filter((n) => n.kind !== "source"), ...scenario.notices];
  const sourceNotices = raw.notices.filter((n) => n.kind === "source");

  const q = filter.trim().toLowerCase();
  const filteredIds = q ? scenarioIds.filter((id) => id.toLowerCase().includes(q)) : scenarioIds;

  return (
    // Fills the viewport (RootLayout is h-dvh); the orientation line is fixed and the two panes
    // below scroll INDEPENDENTLY — the document never scrolls (jaleesbrowser mechanics).
    <div className="flex flex-col gap-4 min-[860px]:h-full" data-testid="scenario-page">
      {rl && <RateLimitBanner error={rl} />}
      {/* First-visit orientation: one line so a cold newcomer knows the project + this page. */}
      <header className="max-w-4xl shrink-0" data-testid="page-framing">
        <p className="text-sm text-default-600">
          <span className="font-semibold text-default-900">MultiBench</span> measures the spiritual impact of AI
          assistants — when a {adherent} brings a real dilemma and is <em>pushed</em> to compromise, does the
          assistant hold to the tradition&rsquo;s guidance? Pick a model on the left; read its answer and the
          judges&rsquo; scores on the right.
        </p>
      </header>

      <div className="flex min-h-0 flex-col gap-6 min-[860px]:flex-1 min-[860px]:flex-row min-[860px]:items-stretch" data-testid="scenario-shell">
        {/* LEFT: controls + navigation (its own scrollbar). */}
        <aside
          data-testid="scenario-sidebar"
          aria-label="Controls and navigation"
          tabIndex={0}
          className="flex flex-col gap-4 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary min-[860px]:h-full min-[860px]:w-[400px] min-[860px]:shrink-0 min-[860px]:overflow-y-auto min-[860px]:pr-2"
        >
          <nav className="flex items-center justify-between text-sm">
            <Link to="/t/$traditionId" params={{ traditionId }} className="text-primary hover:underline">
              ← {tradition.manifest?.displayName ?? traditionId}
            </Link>
            <div className="flex items-center gap-3">
              {prev ? (
                <Link to="/t/$traditionId/$scenarioId" params={{ traditionId, scenarioId: prev }} className="flex items-center gap-1 text-default-600 hover:text-default-900">
                  <ChevronLeft size={16} aria-hidden /> {prev}
                </Link>
              ) : <span className="flex items-center gap-1 text-default-300"><ChevronLeft size={16} aria-hidden /> prev</span>}
              {next ? (
                <Link to="/t/$traditionId/$scenarioId" params={{ traditionId, scenarioId: next }} className="flex items-center gap-1 text-default-600 hover:text-default-900">
                  {next} <ChevronRight size={16} aria-hidden />
                </Link>
              ) : <span className="flex items-center gap-1 text-default-300">next <ChevronRight size={16} aria-hidden /></span>}
            </div>
          </nav>

          {/* Scenario picker: filter + dropdown (navigates to the chosen scenario). */}
          <div className="flex flex-col gap-1">
            <label className="flex flex-col text-xs font-medium text-default-500">
              Scenario
              <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter by id…"
                aria-label="Filter scenarios" className="mt-1 rounded border border-default-200 px-2 py-1 text-sm text-default-800" />
            </label>
            <select value={scenarioId} aria-label="Scenario"
              onChange={(e) => navigate({ to: "/t/$traditionId/$scenarioId", params: { traditionId, scenarioId: e.target.value } })}
              className="rounded border border-default-200 px-2 py-1 text-sm text-default-800">
              {!filteredIds.includes(scenarioId) && <option value={scenarioId}>{scenarioId}</option>}
              {filteredIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>

          {raw.catalog && sel
            ? <ScenarioControls catalog={raw.catalog} sel={sel} setSel={setSel} judge={sel.judge} />
            : raw.runId
              ? <p className="text-xs text-default-400">Loading controls…</p>
              : <p className="text-xs italic text-default-400">No results run published yet.</p>}
        </aside>

        {/* RIGHT: the scenario + the conversation (its own scrollbar). Header + Context always show. */}
        <section ref={mainRef} tabIndex={0} aria-label="Model responses"
          className="min-w-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary min-[860px]:h-full min-[860px]:flex-1 min-[860px]:overflow-y-auto min-[860px]:pr-1" data-testid="scenario-main">
          <ScenarioResponses
            status={
              !raw.runsSettled || (raw.loading && !raw.catalog) ? "loading"
                : !raw.runId ? "no-run"
                  : raw.catalog && sel ? "ready"
                    : "error"
            }
            catalog={raw.catalog} shard={raw.shard} sel={sel}
            scenarioId={scenarioId} meta={scenario.meta} judgeGuidance={scenario.judgeGuidance}
            guidanceWhere={`${where}/judge-guidance.md`} runId={raw.runId} traditionId={traditionId}
            turn1={scenario.turn1} turn1Where={`${where}/turn1.md`}
            pressures={scenario.pressures} pressuresWhere={`${where}/pressures.md`}
            dataNotices={dataNotices} sourceNotices={sourceNotices}
          />
        </section>
      </div>
    </div>
  );
}
