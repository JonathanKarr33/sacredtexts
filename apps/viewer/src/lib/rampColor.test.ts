import { describe, expect, it } from "vitest";
import { catalogScoreColor, normalizeScore } from "./rampColor";

const MB = { min: -1, center: 0, max: 1 };
const AFB = { min: 0, center: 2, max: 4 };
const RAMP = ["#000000", "#808080", "#ffffff"]; // low → mid → high

describe("normalizeScore (two-slope, catalog-declared scale)", () => {
  it("maps min→0, center→0.5, max→1 on the MultiBench scale", () => {
    expect(normalizeScore(MB, -1)).toBeCloseTo(0);
    expect(normalizeScore(MB, 0)).toBeCloseTo(0.5);
    expect(normalizeScore(MB, 1)).toBeCloseTo(1);
    expect(normalizeScore(MB, -0.5)).toBeCloseTo(0.25);
  });
  it("works generically on a 0–4 scale (min→0, center→0.5, max→1)", () => {
    expect(normalizeScore(AFB, 0)).toBeCloseTo(0);
    expect(normalizeScore(AFB, 2)).toBeCloseTo(0.5);
    expect(normalizeScore(AFB, 4)).toBeCloseTo(1);
    expect(normalizeScore(AFB, 3)).toBeCloseTo(0.75);
  });
  it("clamps out-of-range values", () => {
    expect(normalizeScore(MB, -5)).toBe(0);
    expect(normalizeScore(MB, 5)).toBe(1);
  });
});

describe("catalogScoreColor", () => {
  it("returns neutral grey for null (no data)", () => {
    expect(catalogScoreColor(MB, RAMP, null)).toBe("#E5E5E5");
  });
  it("interpolates the catalog ramp at the endpoints and center", () => {
    expect(catalogScoreColor(MB, RAMP, -1)).toBe("#000000");
    expect(catalogScoreColor(MB, RAMP, 0)).toBe("#808080");
    expect(catalogScoreColor(MB, RAMP, 1)).toBe("#FFFFFF");
  });
  it("the SAME score means DIFFERENT colors under different catalog scales (genericity)", () => {
    // score 2: on the MB scale it's clamped high (max=1→white); on AFB it's the center (grey)
    expect(catalogScoreColor(MB, RAMP, 2)).toBe("#FFFFFF");
    expect(catalogScoreColor(AFB, RAMP, 2)).toBe("#808080");
  });
  it("returns neutral for a malformed ramp", () => {
    expect(catalogScoreColor(MB, ["#000000"], 0)).toBe("#E5E5E5");
  });
});
