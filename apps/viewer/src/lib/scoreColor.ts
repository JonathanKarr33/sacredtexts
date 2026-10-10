// Diverging score palette — the TS port of workflows/analysis/analysis/colors.py (the single
// source of truth for the −1…+1 score colormap across the repo's reports and this explorer).
// Seven evenly-spaced stops (deep red → grey-beige → deep green); a score maps via a linear
// TwoSlopeNorm(−1, 0, +1): −1→0, 0→0.5, +1→1. No band names anywhere (numeric scale only).

const STOPS = [
  "#9E1B32", "#D6604D", "#F4A582", "#D9D2C5", "#A6D49A", "#5AAE61", "#1B7837",
] as const;

function hexToRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Interpolate the seven stops at position t∈[0,1]. */
function interp(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const n = STOPS.length - 1;
  const x = clamped * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const a = hexToRgb(STOPS[i]!);
  const b = hexToRgb(STOPS[i + 1]!);
  return rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/**
 * Diverging color for a score on the −1…+1 scale (TwoSlopeNorm(−1,0,1), linear).
 * A `null` (no coverage) returns a neutral grey so empty cells read as "no data", not zero.
 */
export function scoreColor(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "#E5E5E5";
  return interp((value + 1) / 2);
}

/** A readable text color (black/white) for a cell filled with `scoreColor(value)`. */
export function scoreTextColor(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "#525252";
  // Dark ends (deep red / deep green) need light text; the pale middle needs dark text.
  const t = (value + 1) / 2;
  return t < 0.28 || t > 0.72 ? "#FFFFFF" : "#171717";
}
