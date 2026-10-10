import { describe, it, expect } from "vitest";
import { scoreColor, scoreTextColor } from "./scoreColor";

describe("scoreColor (diverging −1…+1, TwoSlopeNorm linear)", () => {
  it("maps the endpoints and centre to the palette stops", () => {
    expect(scoreColor(-1)).toBe("#9E1B32"); // first stop (deep red)
    expect(scoreColor(1)).toBe("#1B7837"); // last stop (deep green)
    expect(scoreColor(0)).toBe("#D9D2C5"); // middle stop (grey-beige)
  });

  it("returns a neutral grey for null / NaN (no data, not zero)", () => {
    expect(scoreColor(null)).toBe("#E5E5E5");
    expect(scoreColor(NaN)).toBe("#E5E5E5");
  });

  it("clamps out-of-range inputs", () => {
    expect(scoreColor(-5)).toBe("#9E1B32");
    expect(scoreColor(5)).toBe("#1B7837");
  });

  it("text color is light on the dark ends, dark in the pale middle, grey for null", () => {
    expect(scoreTextColor(-1)).toBe("#FFFFFF");
    expect(scoreTextColor(1)).toBe("#FFFFFF");
    expect(scoreTextColor(0)).toBe("#171717");
    expect(scoreTextColor(null)).toBe("#525252");
  });
});
