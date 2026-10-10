import { useEffect, useMemo, useState } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLatestSha, useScenario, useScenarioRaw, useTradition } from "../lib/queries";
import { taxonomyValues } from "../lib/model";
import { FILE, PRESSURES, PRESSURE_GLOSSES } from "../lib/constants";
import { parseRawSelection, rawSelectionToSearch, type RawSearchRecord, type RawSelection } from "../lib/rawSelection";
import type { RawCatalog } from "../lib/rawModel";
import { classifyJudgeRoles } from "../lib/leaderboard";
import { asRateLimit, resetLabel } from "../lib/rateLimit";
import {
  ensureTraditionLoaded,
  scenarioChecksOf,
  updateReviewState,
  useReviewState,
  withScenarioCheck,
  type ScenarioCheckKey,
} from "../lib/review";
import { ReviewAuthGate, ReviewSaveStatus } from "../components/ReviewAuthGate";
import { ReviewCheckControl } from "../components/ReviewCheckControl";
import { RawComparison } from "../components/RawComparison";
import { Markdown } from "../components/Markdown";
import { Notice, Notices } from "../components/Notice";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { CenteredSpinner } from "../components/Loading";
import { NotFound } from "./NotFound";

const route = getRouteApi("/review/$traditionId/$scenarioId");

// One scenario's four review checks, each pairing the CONTENT under review with the intake
// control: (a) the scenario itself, (b) its scoring guide, (c) the judges' verdicts on real model
// answers (the corpus browser's comparison view embedded with a local — not URL — selection),
// (d) the six pressure points. Prev/next walks the reviewer's assigned sample.

export function ReviewScenarioPage() {
  return (
    <ReviewAuthGate>
      <ReviewScenarioPageInner />
    </ReviewAuthGate>
  );
}

function ReviewScenarioPageInner() {
  const { traditionId, scenarioId } = route.useParams();
  // Gate editing until the saved draft loads: a verdict/notes edit made on a blank base before the
  // load resolves would be discarded when the server draft is adopted. Only "ok" enables the inputs.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    let alive = true;
    void ensureTraditionLoaded(traditionId).then((ok) => {
      if (alive && ok) setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [traditionId]);
  const shaQ = useLatestSha();
  const sha = shaQ.data;
  const tradQ = useTradition(sha, traditionId);
  const tradition = tradQ.data;
  const declaredTax = useMemo(() => taxonomyValues(tradition?.manifest?.taxonomies ?? {}), [tradition]);
  const scenQ = useScenario(sha, traditionId, scenarioId, declaredTax);
  const scenario = scenQ.data;
  const raw = useScenarioRaw(traditionId, scenarioId);
  const review = useReviewState();
  const checks = scenarioChecksOf(review.traditions[traditionId], scenarioId);

  const rl = asRateLimit(shaQ.error) ?? asRateLimit(tradQ.error) ?? asRateLimit(scenQ.error);
  const otherError = !rl && (shaQ.error || tradQ.error || scenQ.error);

  if ((!tradition || !scenario) && (rl || otherError)) {
    return (
      <div className="flex flex-col gap-4">
        {rl && <RateLimitBanner error={rl} />}
        <Notice notice={{ severity: "error", scope: "github", where: "GitHub",
          message: rl
            ? `Couldn't load this scenario — GitHub's rate limit was reached and nothing is cached yet. Live data resumes around ${resetLabel(rl)}.`
            : `Couldn't load this scenario: ${(otherError as Error).message}` }} />
      </div>
    );
  }
  if ((tradQ.isLoading && !tradition) || (scenQ.isLoading && !scenario)) {
    return <CenteredSpinner label="Loading scenario…" />;
  }
  if (tradition === null) return <NotFound what={`Tradition “${traditionId}”`} />;
  if (tradition && !tradition.scenarioIds.includes(scenarioId)) return <NotFound what={`Scenario “${scenarioId}”`} />;
  if (!tradition || !scenario) return null;

  const displayName = tradition.manifest?.displayName || traditionId;
  const sample = review.traditions[traditionId]?.sampleIds ?? [];
  const pos = sample.indexOf(scenarioId);
  const prev = pos > 0 ? sample[pos - 1] : null;
  const next = pos >= 0 && pos < sample.length - 1 ? sample[pos + 1] : null;

  const setCheck = (key: ScenarioCheckKey) => (patch: Parameters<typeof withScenarioCheck>[4]) =>
    updateReviewState((s) => withScenarioCheck(s, traditionId, scenarioId, key, patch));

  return (
    <div className="flex flex-col gap-6" data-testid="review-scenario-page">
      {rl && <RateLimitBanner error={rl} />}

      <header className="flex flex-col gap-2 border-b border-default-200 pb-4">
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/review/$traditionId" params={{ traditionId }} className="text-primary hover:underline">
            ← {displayName} review
          </Link>
          {pos >= 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-default-400">scenario {pos + 1} of {sample.length} in your sample</span>
              {prev ? (
                <Link to="/review/$traditionId/$scenarioId" params={{ traditionId, scenarioId: prev }}
                  className="flex items-center gap-1 text-default-600 hover:text-default-900">
                  <ChevronLeft size={16} aria-hidden /> {prev}
                </Link>
              ) : <span className="flex items-center gap-1 text-default-300"><ChevronLeft size={16} aria-hidden /> prev</span>}
              {next ? (
                <Link to="/review/$traditionId/$scenarioId" params={{ traditionId, scenarioId: next }}
                  className="flex items-center gap-1 text-default-600 hover:text-default-900">
                  {next} <ChevronRight size={16} aria-hidden />
                </Link>
              ) : <span className="flex items-center gap-1 text-default-300">next <ChevronRight size={16} aria-hidden /></span>}
            </div>
          )}
        </nav>
        {pos < 0 && (
          <p className="text-xs text-warning" data-testid="out-of-sample-note">
            This scenario is <strong>beyond your assigned sample</strong> — your review of it is
            recorded and reported separately, and doesn&rsquo;t change your sample-completion count.
          </p>
        )}
        <ReviewSaveStatus />
        <h1 className="text-xl font-semibold">
          <span className="font-mono">{scenarioId}</span>
          {scenario.meta?.locusLabel && <span className="font-normal text-default-700"> — {scenario.meta.locusLabel}</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-500">
          {scenario.meta?.identitySignal && <span>{scenario.meta.identitySignal}</span>}
          {scenario.meta?.sourceLocus != null && <span>locus #{scenario.meta.sourceLocus}</span>}
          {scenario.meta && Object.entries(scenario.meta.tags).map(([axis, vals]) => (
            <span key={axis}><span className="font-medium uppercase tracking-wide">{axis}</span> {vals.join(", ")}</span>
          ))}
          <Link to="/t/$traditionId/$scenarioId" params={{ traditionId, scenarioId }} className="text-primary hover:underline">
            open in the corpus browser →
          </Link>
        </div>
      </header>

      <Notices notices={scenario.notices} />

      {/* Check a — the scenario itself */}
      <section className="flex flex-col gap-2" data-testid="review-check-scenario">
        <h2 className="text-lg font-semibold">a · Start with the scenario</h2>
        <p className="text-sm text-default-600">
          The user&rsquo;s opening message. Is the dilemma real and well-posed for this tradition, and
          does it genuinely belong to the passage it cites{scenario.meta?.locusLabel ? ` (${scenario.meta.locusLabel})` : ""}?
        </p>
        <div className="rounded-lg border border-default-200 p-3">
          {scenario.turn1 != null
            ? <Markdown>{scenario.turn1}</Markdown>
            : <Notice notice={{ severity: "error", scope: "section", where: `${traditionId}/scenarios/${scenarioId}/${FILE.turn1}`, message: "Turn-1 opening is missing or empty." }} />}
        </div>
        <ReviewCheckControl check={checks.scenario} onChange={setCheck("scenario")}
          disabled={!loaded}
          notesPlaceholder="Is the situation authentic? Would an adherent actually ask this?" />
      </section>

      {/* Check b — the scoring guide */}
      <section className="flex flex-col gap-2" data-testid="review-check-scoring">
        <h2 className="text-lg font-semibold">b · Check the scoring guide</h2>
        <p className="text-sm text-default-600">
          This is the judge-guidance — the binding ground truth the judges score against for this
          scenario. Is it correct for your tradition: right rulings, right citations, right sense of
          what good counsel here must and must not do?
        </p>
        <div className="rounded-lg border border-default-200 p-3">
          {scenario.judgeGuidance != null
            ? <Markdown>{scenario.judgeGuidance}</Markdown>
            : <Notice notice={{ severity: "error", scope: "section", where: `${traditionId}/scenarios/${scenarioId}/${FILE.judgeGuidance}`, message: "Judge-guidance is missing or empty." }} />}
        </div>
        <ReviewCheckControl check={checks.scoring} onChange={setCheck("scoring")}
          disabled={!loaded}
          notesPlaceholder="Wrong ruling? Missing exception? Misquoted passage? Say which…" />
      </section>

      {/* Check c — the judges' verdicts on real model answers */}
      <section className="flex flex-col gap-2" data-testid="review-check-judgement">
        <h2 className="text-lg font-semibold">c · Check the judges&rsquo; verdicts</h2>
        <JudgementViewer traditionId={traditionId} scenarioId={scenarioId} raw={raw} />
        <ReviewCheckControl check={checks.judgement} onChange={setCheck("judgement")}
          disabled={!loaded}
          notesPlaceholder="Cite the model + framing + pressure where a verdict is off, and why…" />
      </section>

      {/* Check d — the pressure points */}
      <section className="flex flex-col gap-2" data-testid="review-check-pressures">
        <h2 className="text-lg font-semibold">d · Check the pressure points</h2>
        <p className="text-sm text-default-600">
          After the model&rsquo;s first answer, the user pushes back six different ways. Are these pushes
          realistic for this scenario, and fairly worded (a real temptation, not a strawman)?
        </p>
        <div className="flex flex-col gap-2">
          {PRESSURES.map((p) => (
            <div key={p} className="rounded border border-default-200 p-3" data-pressure={p}>
              <h3 className="text-sm">
                <span className="font-mono">{p}</span>
                <span className="ml-1 text-xs font-normal text-default-400">— {PRESSURE_GLOSSES[p]}</span>
              </h3>
              <div className="mt-1 text-sm text-default-600">
                {scenario.pressures[p] != null
                  ? <Markdown>{scenario.pressures[p] as string}</Markdown>
                  : <Notice notice={{ severity: "error", scope: "section", where: `${traditionId}/scenarios/${scenarioId}/${FILE.pressures} → ## ${p}`, message: `Pressure “${p}” is missing or empty.` }} />}
              </div>
            </div>
          ))}
        </div>
        <ReviewCheckControl check={checks.pressures} onChange={setCheck("pressures")}
          disabled={!loaded}
          notesPlaceholder="Which push rings false, and how would a real interlocutor put it?" />
      </section>

      <footer className="flex items-center justify-between border-t border-default-200 pt-4 text-sm">
        <Link to="/review/$traditionId" params={{ traditionId }} className="text-primary hover:underline">
          ← Back to the {displayName} review
        </Link>
        {next && (
          <Link to="/review/$traditionId/$scenarioId" params={{ traditionId, scenarioId: next }}
            className="rounded bg-accent px-3 py-1.5 text-accent-foreground hover:opacity-90">
            Next scenario: {next} →
          </Link>
        )}
      </footer>
    </div>
  );
}

/** The embedded transcript+verdict view: the same comparison renderer as the corpus browser, with
 * a LOCAL selection (model A/B + condition axes) so browsing verdicts never leaves the review. */
function JudgementViewer({ traditionId, scenarioId, raw }: {
  traditionId: string;
  scenarioId: string;
  raw: ReturnType<typeof useScenarioRaw>;
}) {
  const [selSearch, setSelSearch] = useState<RawSearchRecord>({});
  const catalog = raw.catalog;
  const sel = catalog ? parseRawSelection(selSearch, catalog) : null;
  const setSel = (patch: Partial<RawSelection>) => {
    if (catalog && sel) setSelSearch(rawSelectionToSearch({ ...sel, ...patch }));
  };

  if (!raw.runsSettled || (raw.loading && !catalog)) {
    return <p className="text-sm text-default-400">Loading transcripts &amp; verdicts…</p>;
  }
  if (!raw.runId) {
    return (
      <p className="text-sm italic text-default-400" data-testid="review-no-run">
        No scored run includes this tradition yet — there are no verdicts to check here. You can still
        review the other three checks.
      </p>
    );
  }
  if (!catalog || !sel) {
    return <Notices notices={raw.notices.filter((n) => n.kind !== "source")} />;
  }

  // Three disjoint roles: the ranking judge (strictly complete → "every transcript"); full-grid
  // VALIDATION judges (full-grid scale, but with residual gaps under the tolerant badge → not
  // "every transcript"); and sample judges.
  const { ranking: rankingJudges, fullGridValidation, sample: sampleJudges } =
    classifyJudgeRoles(catalog.judges);
  const withCoverage = (j: { label: string; coverage?: number }) =>
    j.coverage != null ? `${j.label} (${(j.coverage * 100).toFixed(1)}%)` : j.label;

  return (
    <div className="flex flex-col gap-3" data-testid="review-judgement-viewer">
      <p className="text-sm text-default-600">
        Below: a model&rsquo;s real answers under each framing and push, with the judges&rsquo; verdicts
        interleaved. {rankingJudges.length > 0 && <><strong>{rankingJudges.map((j) => j.label).join(" & ")}</strong> score
        {rankingJudges.length > 1 ? "" : "s"} every transcript</>}
        {fullGridValidation.length > 0 && <>; {fullGridValidation.map(withCoverage).join(" & ")} at full-grid scale</>}
        {sampleJudges.length > 0 && <>; {sampleJudges.map((j) => j.label).join(" & ")} on a sample</>}.
        The <span className="font-mono">/results</span> leaderboard ranks on the per-cell mean of the judges (#120).
        Verdicts run <span className="font-mono">{catalog.scale.min}</span> (off the tradition&rsquo;s guidance) to{" "}
        <span className="font-mono">{catalog.scale.max}</span> (well aligned). Read a few cells: do the scores and
        rationales apply the scoring guide correctly?
      </p>
      <ReviewSelectionPicker catalog={catalog} sel={sel} setSel={setSel} />
      {raw.shard
        ? <RawComparison catalog={catalog} shard={raw.shard} a={sel.a} b={sel.b} conditions={sel.conditions} />
        : <Notices notices={raw.notices.filter((n) => n.kind !== "source")} />}
      <p className="text-xs text-default-400">
        Want the run-wide view (worst cells, presets, judge selector)?{" "}
        <Link
          to="/results/$runId/$groupId/$itemId"
          params={{ runId: raw.runId, groupId: traditionId, itemId: scenarioId }}
          className="text-primary hover:underline"
        >
          Open this scenario in the full explorer →
        </Link>
      </p>
    </div>
  );
}

/** Model A/B + one select per condition axis — the corpus browser's picker, minus its run-level
 * preset links (which would navigate away mid-review). Selection is component state, not URL. */
function ReviewSelectionPicker({ catalog, sel, setSel }: {
  catalog: RawCatalog;
  sel: RawSelection;
  setSel: (patch: Partial<RawSelection>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="review-pickers">
      <PickerSelect label="Model A" value={sel.a} onChange={(v) => setSel({ a: v })}
        options={catalog.subjects.map((s) => ({ value: s.id, label: s.label }))} />
      <PickerSelect label="Model B" value={sel.b ?? ""} onChange={(v) => setSel({ b: v || null })}
        options={[{ value: "", label: "None (single view)" },
          ...catalog.subjects.filter((s) => s.id !== sel.a).map((s) => ({ value: s.id, label: s.label }))]} />
      {catalog.conditionAxes.map((ax) => (
        <PickerSelect key={ax.key} label={ax.label} value={sel.conditions[ax.key] ?? ""}
          onChange={(v) => setSel({ conditions: { ...sel.conditions, [ax.key]: v } })}
          options={ax.values.map((x) => ({ value: x.id, label: x.label }))} />
      ))}
    </div>
  );
}

function PickerSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-col text-xs font-medium text-default-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="mt-1 rounded border border-default-200 px-2 py-1 text-sm text-default-800">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
