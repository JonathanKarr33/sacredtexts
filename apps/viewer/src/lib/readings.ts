/** The mutually exclusive reading of one retrieve_quote answer. */

export const READING_LABELS = [
  "exact",
  "right_verse_plus_extra",
  "other_tradition",
  "other_edition",
  "near_miss",
  "refusal",
  "empty",
  "fabrication",
] as const;

export type ReadingLabel = (typeof READING_LABELS)[number];

export const READING_HEADINGS: Record<ReadingLabel, string> = {
  exact: "exact",
  right_verse_plus_extra: "verse plus extra",
  other_tradition: "other tradition",
  other_edition: "other edition",
  near_miss: "near miss",
  refusal: "refusal",
  empty: "empty",
  fabrication: "made up",
};

export function isReadingLabel(value: string): value is ReadingLabel {
  return (READING_LABELS as readonly string[]).includes(value);
}

export function readingHeading(label: string): string {
  return isReadingLabel(label) ? READING_HEADINGS[label] : label;
}

/** Non-zero kinds, in the fixed label order. */
export function readingMix(labels: Record<string, number>): string {
  return READING_LABELS
    .filter((label) => (labels[label] ?? 0) > 0)
    .map((label) => `${READING_HEADINGS[label]} ${labels[label]}`)
    .join(", ");
}
