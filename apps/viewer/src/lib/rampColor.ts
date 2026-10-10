// Generic score→color for the #51 raw view: interpolates a CATALOG-DECLARED ramp over a
// catalog-declared scale (min/center/max), so a non-MultiBench catalog (AFB 0–4) colors with no
// code change. This is the generic sibling of `scoreColor.ts` — which hardcodes MultiBench's
// −1…+1 / scoreColor stops. The raw view MUST use THIS (fed from `catalog.scale`/`catalog.ramp`),
// never the hardcoded constant, or genericity (#54) breaks.

import type { RawScale } from "./rawModel";

const NEUTRAL = "#E5E5E5"; // "no data" grey (matches scoreColor.ts)

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Interpolate `stops` at t∈[0,1] (linear between evenly-spaced stops). */
function interp(stops: readonly string[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const n = stops.length - 1;
  const x = clamped * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const a = hexToRgb(stops[i]!);
  const b = hexToRgb(stops[i + 1]!);
  return rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/** Map a score to [0,1] via a two-slope norm: min→0, center→0.5, max→1 (piecewise linear). */
export function normalizeScore(scale: RawScale, value: number): number {
  const { min, center, max } = scale;
  if (value <= center) {
    return center > min ? Math.max(0, Math.min(0.5, (0.5 * (value - min)) / (center - min))) : 0;
  }
  return max > center ? Math.max(0.5, Math.min(1, 0.5 + (0.5 * (value - center)) / (max - center))) : 1;
}

/**
 * Color for a score on the catalog's scale, using the catalog's ramp. `null`/NaN → neutral grey
 * (so an absent cell reads as "no data", not zero). A malformed ramp (<2 stops) also → neutral.
 */
export function catalogScoreColor(scale: RawScale, ramp: readonly string[], value: number | null): string {
  if (value === null || Number.isNaN(value) || ramp.length < 2) return NEUTRAL;
  return interp(ramp, normalizeScore(scale, value));
}
