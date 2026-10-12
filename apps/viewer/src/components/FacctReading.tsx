import { Link } from "@tanstack/react-router";
import type { FacctItem, FacctReport, FacctSlot, QuestionResult } from "../lib/localResults";
import { READING_HEADINGS, READING_LABELS, readingHeading, readingMix } from "../lib/readings";

const EXHIBIT_LABELS = [
  "other_tradition",
  "other_edition",
  "right_verse_plus_extra",
  "near_miss",
  "refusal",
  "fabrication",
] as const;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 320 ? flat : `${flat.slice(0, 320).trimEnd()}…`;
}

function tally(items: FacctItem[], pred: (item: FacctItem) => boolean): Record<string, number> {
  const labels: Record<string, number> = {};
  for (const item of items) {
    if (!pred(item)) continue;
    labels[item.label] = (labels[item.label] ?? 0) + 1;
  }
  return labels;
}

function uniqueQuestions(items: FacctItem[]): FacctItem[] {
  const seen = new Map<string, FacctItem>();
  for (const item of items) if (!seen.has(item.question_id)) seen.set(item.question_id, item);
  return [...seen.values()];
}

function findResult(results: QuestionResult[], item: FacctItem): QuestionResult | undefined {
  return results.find((row) => row.question_id === item.question_id && row.model_id === item.model_id);
}

function SlotTable({
  title,
  caption,
  rows,
  columns,
  cell,
  runId,
}: {
  title: string;
  caption: string;
  rows: string[];
  columns: string[];
  cell: (row: string, column: string) => string;
  runId?: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-default-500">{caption}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4">model</th>
              {columns.map((column) => (
                <th key={column} className="py-1 pr-4">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} className="border-b align-top">
                <td className="py-1 pr-4 font-medium">
                  {runId ? (
                    <Link
                      to="/run/$runId/model/$modelId"
                      params={{ runId, modelId: row }}
                      className="text-default-700 underline"
                    >
                      {row}
                    </Link>
                  ) : row}
                </td>
                {columns.map((column) => (
                  <td key={column} className="py-1 pr-4">{cell(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function kindLink(runId: string, model: string, label: string, n: number) {
  if (n === 0) return "0";
  return (
    <Link
      to="/run/$runId/model/$modelId"
      params={{ runId, modelId: model }}
      search={{ reading: label }}
      className="underline decoration-dotted"
    >
      {n}
    </Link>
  );
}

/** The run's research reading. The strict string-match table stays below it. */
export function FacctReading({
  report,
  results,
  runId,
}: {
  report: FacctReport;
  results: QuestionResult[];
  runId: string;
}) {
  const labels = report.answers.labels;
  const models = Object.keys(report.by_model);
  const items = report.items;
  const questions = uniqueQuestions(items);
  const traditions = [...new Set(items.map((item) => item.tradition))].sort();
  const docTypes = [...new Set(items.map((item) => item.document_type))].sort();
  const bible = report.counterfactual_bible;
  const languages = Object.entries(report.coverage.by_language)
    .map(([lang, n]) => `${lang} ${n}`)
    .join(", ");

  const exhibits = EXHIBIT_LABELS.flatMap((label) => {
    const item = items.find((row) => row.label === label && row.detail) ?? items.find((row) => row.label === label);
    if (!item) return [];
    const result = findResult(results, item);
    if (!result) return [];
    return [{ item, result }];
  });

  return (
    <section className="mx-auto max-w-5xl px-4 pt-8" aria-label="What kind of miss is a zero">
      <h1 className="text-2xl font-semibold">What kind of miss is a zero?</h1>
      <p className="mt-2 text-sm">
        The question this run can answer: when a prompt names one edition and asks for its
        wording, and the answer is scored wrong, what is the answer? A refusal, the right verse
        with extra words, another edition, another tradition's wording of the same citation, a
        near miss, or a fluent invention. The headline score adds those together.
      </p>
      {report.card.claim && (
        <p className="mt-3 rounded border border-default-200 p-3 text-sm">{report.card.claim}</p>
      )}
      {report.card.threats.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">What would make this claim fail</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {report.card.threats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {report.card.refused.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">What this card will not conclude</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {report.card.refused.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-sm">
        {report.answers.n} answers. {readingMix(labels) || "no labeled answers"}.{" "}
        {report.coverage.questions} questions. Languages in this question set, with a catalogue
        language that was not asked shown as 0: {languages}.{" "}
        {report.coverage.plural_gold_questions} questions use a string that is also a passage of
        another tradition.
      </p>
      <p className="mt-2 text-sm">
        Of {bible.n} Bible answers, {bible.asked_edition_contained} contain the edition that was
        asked for, and {bible.any_indexed_edition_contained} contain some indexed edition of that
        citation. {bible.headline_miss_but_some_edition_contained} miss the headline and still
        contain another indexed edition.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-4">model</th>
              {READING_LABELS.map((label) => (
                <th key={label} className="py-1 pr-4">{READING_HEADINGS[label]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const slot: FacctSlot = report.by_model[model]!;
              return (
                <tr key={model} className="border-b">
                  <td className="py-1 pr-4 font-medium">
                    <Link
                      to="/run/$runId/model/$modelId"
                      params={{ runId, modelId: model }}
                      className="text-default-700 underline"
                    >
                      {model}
                    </Link>
                  </td>
                  {READING_LABELS.map((label) => (
                    <td key={label} className="py-1 pr-4">
                      {kindLink(runId, model, label, slot.labels[label] ?? 0)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <SlotTable
          title="Where the zero sits"
          caption="Each cell is that model's answers for one document type. A tradition column on the leaderboard is this slice: encyclicals, an English Talmud, or a public-domain Bible."
          rows={models}
          columns={docTypes}
          runId={runId}
          cell={(model, docType) => readingMix(tally(items, (item) => item.model_id === model && item.document_type === docType)) || "—"}
        />
      )}

      {items.length > 0 && traditions.length > 0 && (
        <SlotTable
          title="The same answers, by the tradition the prompt named"
          caption="Counts are answers, four models times the questions in that slice. Who the questions are:"
          rows={models}
          columns={traditions}
          runId={runId}
          cell={(model, tradition) => readingMix(tally(items, (item) => item.model_id === model && item.tradition === tradition)) || "—"}
        />
      )}

      {questions.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-default-600">
          {Object.entries(
            questions.reduce<Record<string, { n: number; document_type: string; license: string }>>((acc, item) => {
              const slot = acc[item.tradition] ?? { n: 0, document_type: item.document_type, license: item.license };
              slot.n += 1;
              acc[item.tradition] = slot;
              return acc;
            }, {}),
          ).map(([tradition, slot]) => (
            <li key={tradition}>
              {tradition}: {slot.n} questions, {slot.document_type}, {slot.license}.
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-base font-semibold">By license</h3>
          <ul className="mt-1 text-sm">
            {Object.entries(report.by_license).map(([name, slot]) => (
              <li key={name}>{name}: {readingMix(slot.labels)}.</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-base font-semibold">By document type</h3>
          <ul className="mt-1 text-sm">
            {Object.entries(report.by_document_type).map(([name, slot]) => (
              <li key={name}>{name}: {readingMix(slot.labels)}.</li>
            ))}
          </ul>
        </div>
      </div>

      {exhibits.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">One answer of each kind</h2>
          <div className="mt-3 flex flex-col gap-4">
            {exhibits.map(({ item, result }) => (
              <article key={item.label} className="rounded-lg border border-default-200 p-4 text-sm">
                <h3 className="font-semibold">{readingHeading(item.label)}</h3>
                <p className="mt-1 text-default-500">
                  {item.model_id} · {item.citation || item.document_type} · {item.version}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
                <p className="mt-2"><span className="text-default-400">Asked. </span>{clip(result.expected)}</p>
                <p className="mt-1"><span className="text-default-400">Answer. </span>{clip(result.answer)}</p>
              </article>
            ))}
          </div>
        </div>
      )}

      {report.folding.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">How close two editions have to be before the scorer calls them the same</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {report.folding.map((rule) => (
              <li key={rule.rule}>
                {rule.chosen ? "Chosen rule. " : "Alternate. "}
                {rule.rule}: {rule.all_three_agree} of {rule.verses_in_all_three} verses in KJV, ASV, and WEB agree.
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm">Community review: {report.card.community_review}</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-default-500">
        {report.card.non_uses.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
