// A tiny committed sample run so the local results view renders out of the box
// (`pnpm dev` → /local-results) and the component test has a fixture. Shapes match
// pipelines/sacredbench `score` output (summary.json / scores.jsonl / answers.jsonl).
// Synthetic text — no copyrighted translation is committed.

import type { Summary } from "../lib/localResults";

export const sampleSummary: Summary = {
  models: {
    haiku: {
      retrieve_quote: { n: 2, accuracy: 0.5, exact: 0.5, normalized: 0.5, token_f1: 0.75 },
      _overall: { n: 2, accuracy: 0.5 },
    },
    "gemma-4": {
      retrieve_quote: { n: 2, accuracy: 0.0, exact: 0.0, normalized: 0.0, token_f1: 0.2 },
      _overall: { n: 2, accuracy: 0.0 },
    },
  },
  by_tradition: {
    haiku: { "Protestant Christian": { retrieve_quote: { n: 2, accuracy: 0.5 }, _overall: { n: 2, accuracy: 0.5 } } },
    "gemma-4": { "Protestant Christian": { retrieve_quote: { n: 2, accuracy: 0.0 }, _overall: { n: 2, accuracy: 0.0 } } },
  },
};

export const sampleScoresJsonl = [
  '{"question_id":"retrieve_quote-aaa","model_id":"haiku","task":"retrieve_quote","metrics":{"exact":1,"normalized":1,"token_f1":1.0,"correct":1}}',
  '{"question_id":"retrieve_quote-bbb","model_id":"haiku","task":"retrieve_quote","metrics":{"exact":0,"normalized":0,"token_f1":0.5,"correct":0}}',
  '{"question_id":"retrieve_quote-aaa","model_id":"gemma-4","task":"retrieve_quote","metrics":{"exact":0,"normalized":0,"token_f1":0.3,"correct":0}}',
  '{"question_id":"retrieve_quote-bbb","model_id":"gemma-4","task":"retrieve_quote","metrics":{"exact":0,"normalized":0,"token_f1":0.1,"correct":0}}',
].join("\n");

const _src = {
  tradition: ["Protestant Christian"], work: "The Bible", version: "KJV",
  language: "en", document_type: "scripture", citation: "Orchards 1:1",
};
export const sampleAnswersJsonl = [
  JSON.stringify({
    question_id: "retrieve_quote-aaa", model_id: "haiku", task: "retrieve_quote",
    answer: "the keeper planted twelve trees upon the eastern slope",
    question: { prompt: "Please give me the KJV quote for Orchards 1:1.", expected: { text: "the keeper planted twelve trees upon the eastern slope" }, source: _src },
  }),
  JSON.stringify({
    question_id: "retrieve_quote-bbb", model_id: "haiku", task: "retrieve_quote",
    answer: "something close but not the exact wording",
    question: { prompt: "Please give me the KJV quote for Orchards 1:2.", expected: { text: "blessed is the traveller who shares bread with the stranger" }, source: _src },
  }),
  JSON.stringify({
    question_id: "retrieve_quote-aaa", model_id: "gemma-4", task: "retrieve_quote",
    answer: "a confident but invented verse that is not the source",
    question: { prompt: "Please give me the KJV quote for Orchards 1:1.", expected: { text: "the keeper planted twelve trees upon the eastern slope" }, source: _src },
  }),
  JSON.stringify({
    question_id: "retrieve_quote-bbb", model_id: "gemma-4", task: "retrieve_quote",
    answer: "another hallucinated line entirely",
    question: { prompt: "Please give me the KJV quote for Orchards 1:2.", expected: { text: "blessed is the traveller who shares bread with the stranger" }, source: _src },
  }),
].join("\n");
