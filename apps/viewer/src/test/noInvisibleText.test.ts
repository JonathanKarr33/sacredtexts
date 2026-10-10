import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

// Contrast sanity as a TEST, not a hope: this week shipped TWO invisible-text bugs — #55's
// `bg-default-900` (a nonexistent HeroUI shade → transparent background) and #66's `text-white`
// on a light background (white-on-white). Scan the WHOLE component/route surface (glob, not a
// hardcoded list) so a new file can't reintroduce either antipattern; use semantic tokens
// (text-primary-foreground / text-default-*) instead.
const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.isFile() && p.endsWith(".tsx") ? [p] : [];
  });
}

const BANNED: { re: RegExp; why: string }[] = [
  { re: /\btext-white\b/, why: "#66 white-on-light pill bug — use text-primary-foreground" },
  { re: /\bbg-default-900\b/, why: "#55 nonexistent-shade tooltip bug — use a defined shade" },
];

describe("no invisible-text antipatterns anywhere in the UI (contrast sanity)", () => {
  const files = tsxFiles(srcRoot).filter((f) => !f.endsWith(".test.tsx"));
  for (const f of files) {
    it(`${relative(srcRoot, f)} avoids known-bad color classes`, () => {
      // Strip comments first — the antipattern names legitimately appear in explanatory comments
      // ("the old `bg-default-900` bug"); we only care about them in actual className strings.
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1"); // // comments, but not the // in http://
      for (const { re, why } of BANNED) {
        expect(src, `${relative(srcRoot, f)} must not use ${re} (${why})`).not.toMatch(re);
      }
    });
  }
});
