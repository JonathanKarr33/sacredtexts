import { describe, it, expect } from "vitest";
import {
  parseManifest,
  parseIndex,
  parseScenarioMeta,
  parsePressures,
  resolveScenarioSet,
  proseSection,
} from "./parse";
import { PRESSURES } from "./constants";

// A 2-axis manifest (sunni-islam shape) with Arabic in `construct`.
const GOOD_MANIFEST = `
id: sunni-islam
schema_version: 1
display_name: Sunni Islam
construct: al-jalīs al-ṣāliḥ — الجليس الصالح — the righteous companion.
canonical_source:
  title: Riyāḍ al-Ṣāliḥīn
  author: al-Nawawī
  locus_unit: bab
adherent_noun: Muslim
maintainers:
  - {name: MultiBench, contact: github.com/x}
scholar_review: {status: none, reviewers: []}
taxonomies:
  pillars: {description: Conduct pillars, applies_to: scenario, values: [courage, justice, patience, restraint, cross_cutting]}
  hearts:  {description: Heart states, applies_to: response, values: [vigilance, patience]}
scenario_id_pattern: '^JLS-\\d{3}$'
`;

// A 5-axis manifest (judaism shape) — proves no-hardcoded-axes.
const FIVE_AXIS_MANIFEST = `
id: judaism
display_name: Judaism
construct: mussar
canonical_source: {title: Mesillat Yesharim, author: Luzzatto, locus_unit: chapter}
adherent_noun: Jew
maintainers: [{name: x}]
scholar_review: {status: none, reviewers: []}
taxonomies:
  middot: {description: traits, applies_to: scenario, values: [anavah, savlanut]}
  virtues: {description: v, applies_to: response, values: [emet, chesed]}
  middle_path: {description: mp, applies_to: response, values: [deficiency, balance, excess]}
  domain: {description: d, applies_to: scenario, values: [speech, money]}
  register: {description: r, applies_to: scenario, values: [plain, festal]}
scenario_id_pattern: '^MSR-\\d{3}$'
`;

describe("parseManifest", () => {
  it("parses a good 2-axis manifest with Arabic, no notices", () => {
    const { manifest, notices } = parseManifest(GOOD_MANIFEST);
    expect(notices).toHaveLength(0);
    expect(manifest).not.toBeNull();
    expect(manifest!.id).toBe("sunni-islam");
    expect(manifest!.displayName).toBe("Sunni Islam");
    expect(manifest!.adherentNoun).toBe("Muslim");
    expect(manifest!.construct).toContain("الجليس الصالح"); // Arabic survives
    expect(Object.keys(manifest!.taxonomies)).toEqual(["pillars", "hearts"]);
    expect(manifest!.taxonomies.pillars!.values).toContain("restraint");
    expect(manifest!.canonicalSource.author).toBe("al-Nawawī");
  });

  it("reads any axis names generically (5-axis tradition)", () => {
    const { manifest, notices } = parseManifest(FIVE_AXIS_MANIFEST);
    expect(notices).toHaveLength(0);
    expect(Object.keys(manifest!.taxonomies)).toEqual([
      "middot",
      "virtues",
      "middle_path",
      "domain",
      "register",
    ]);
  });

  it("flags ALL missing required fields without throwing", () => {
    const { manifest, notices } = parseManifest("id: x\ntaxonomies: {}\n");
    expect(manifest).not.toBeNull();
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(msgs).toContain("display_name");
    expect(msgs).toContain("adherent_noun");
    expect(msgs).toContain("construct");
    expect(msgs).toContain("canonical_source"); // missing/malformed
    expect(msgs).toContain("maintainer");
    expect(msgs).toContain("scenario_id_pattern");
  });

  it("flags individually-missing canonical_source sub-fields", () => {
    const text = "id: x\ndisplay_name: X\nconstruct: c\nadherent_noun: A\nmaintainers: [{name: m}]\nscenario_id_pattern: '^.*$'\ncanonical_source: {title: T}\ntaxonomies: {a: {description: d, applies_to: scenario, values: [v]}}\n";
    const { notices } = parseManifest(text);
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(msgs).toContain("canonical_source.author");
    expect(msgs).toContain("canonical_source.locus_unit");
    expect(msgs).not.toContain("canonical_source.title");
  });

  it("flags unknown keys but still parses", () => {
    const { manifest, notices } = parseManifest(GOOD_MANIFEST + "\nbogus_key: 1\n");
    expect(manifest).not.toBeNull();
    expect(notices.some((n) => n.message.includes("bogus_key"))).toBe(true);
  });

  it("returns a notice (not a throw) on invalid YAML", () => {
    const { manifest, notices } = parseManifest("id: [unclosed\n");
    expect(manifest).toBeNull();
    expect(notices[0]!.message).toMatch(/Invalid YAML/);
  });

  it("flags malformed sub-fields display-first (taxonomy values, maintainers)", () => {
    const { notices } = parseManifest(
      "id: x\ndisplay_name: X\nconstruct: c\nadherent_noun: A\ncanonical_source: {title: T, author: A, locus_unit: b}\nscenario_id_pattern: '^.*$'\nmaintainers: ['not-a-record', {contact: only}]\ntaxonomies: {a: {description: d, applies_to: scenario, values: [ok, 3]}}\n",
    );
    const m = notices.map((n) => n.message).join(" | ");
    expect(m).toContain("non-string values"); // taxonomy values had a number
    expect(m).toContain("malformed"); // the string maintainer entry
    expect(m).toContain("no `name`"); // the maintainer record without a name
  });
});

describe("parseIndex", () => {
  it("parses a good index", () => {
    const { ids, notices } = parseIndex('{"schema_version":1,"scenarios":["JLS-001","JLS-002"]}');
    expect(notices).toHaveLength(0);
    expect(ids).toEqual(["JLS-001", "JLS-002"]);
  });
  it("notice (not throw) on invalid JSON", () => {
    const { ids, notices } = parseIndex("{ not json");
    expect(ids).toBeNull();
    expect(notices[0]!.message).toMatch(/Invalid JSON/);
  });
  it("notice when scenarios array missing", () => {
    const { ids, notices } = parseIndex('{"schema_version":1}');
    expect(ids).toBeNull();
    expect(notices[0]!.message).toMatch(/scenarios/);
  });
});

describe("resolveScenarioSet", () => {
  it("union, index order, no notices when consistent", () => {
    const r = resolveScenarioSet(["A", "B", "C"], ["A", "B", "C"]);
    expect(r.ordered).toEqual(["A", "B", "C"]);
    expect(r.notices).toHaveLength(0);
  });
  it("appends orphan folders (id-sorted) with a notice", () => {
    const r = resolveScenarioSet(["A"], ["A", "C", "B"]);
    expect(r.ordered).toEqual(["A", "B", "C"]);
    expect(r.notices.some((n) => n.message.includes("Orphan"))).toBe(true);
  });
  it("keeps ghost (index-only) with a notice, marked as ghost", () => {
    const r = resolveScenarioSet(["A", "B"], ["A"]);
    expect(r.ordered).toEqual(["A", "B"]);
    expect(r.ghosts.has("B")).toBe(true);
    expect(r.notices.some((n) => n.message.includes("Ghost"))).toBe(true);
  });
  it("derives from folders (sorted) when index is null", () => {
    const r = resolveScenarioSet(null, ["C", "A", "B"]);
    expect(r.ordered).toEqual(["A", "B", "C"]);
    expect(r.notices.some((n) => n.message.includes("derived from folders"))).toBe(true);
  });
});

describe("parseScenarioMeta", () => {
  const where = "t/scenarios/JLS-001/scenario.yaml";
  it("parses good meta with declared axes", () => {
    const text = `id: JLS-001\ntags:\n  pillars: [restraint]\n  hearts: [patience]\nsource_locus: 254\nlocus_label: Backbiting\nidentity_signal: clean\n`;
    const { meta, notices } = parseScenarioMeta(text, "JLS-001", where, {
      pillars: ["restraint"],
      hearts: ["patience"],
    });
    expect(notices).toHaveLength(0);
    expect(meta!.sourceLocus).toBe(254);
    expect(meta!.tags.pillars).toEqual(["restraint"]);
    expect(meta!.identitySignal).toBe("clean");
  });
  it("flags an undeclared tag axis and unknown identity_signal", () => {
    const text = `id: JLS-001\ntags:\n  bogus: [x]\nsource_locus: not-a-number\nidentity_signal: weird\n`;
    const { meta, notices } = parseScenarioMeta(text, "JLS-001", where, { pillars: ["restraint", "justice"] });
    expect(meta).not.toBeNull();
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(msgs).toContain("bogus");
    expect(msgs).toContain("identity_signal");
    expect(meta!.sourceLocus).toBeNull();
  });

  it("flags an unknown tag VALUE against the declared axis vocabulary", () => {
    const text = `id: JLS-001\ntags:\n  pillars: [restraint, not-a-pillar]\n`;
    const { notices } = parseScenarioMeta(text, "JLS-001", where, { pillars: ["restraint", "justice"] });
    expect(notices.some((n) => n.message.includes("not-a-pillar") && n.message.includes("pillars"))).toBe(true);
    // a declared value does not get flagged
    expect(notices.some((n) => n.message.includes("`restraint`"))).toBe(false);
  });
  it("flags an id/folder mismatch", () => {
    const { notices } = parseScenarioMeta("id: JLS-999\n", "JLS-001", where);
    expect(notices.some((n) => n.message.includes("≠ folder"))).toBe(true);
  });
});

describe("parsePressures", () => {
  const full = PRESSURES.map((p) => `## ${p}\nPush text for ${p}.\n`).join("\n");
  it("parses all six with no notices", () => {
    const { pressures, notices } = parsePressures(full);
    expect(notices).toHaveLength(0);
    for (const p of PRESSURES) expect(pressures[p]).toContain(p);
  });
  it("normalizes heading variants to canonical keys", () => {
    const text = `## False Authority\nbody1\n## false-authority extra`; // second is a different (unrecognized) heading
    const { pressures } = parsePressures(text);
    expect(pressures.false_authority).toBe("body1");
  });
  it("maps '## False authority', '## false-authority', '## false_authority' identically", () => {
    for (const h of ["False authority", "false-authority", "false_authority"]) {
      const { pressures } = parsePressures(`## ${h}\nx`);
      expect(pressures.false_authority).toBe("x");
    }
  });
  it("ignores content before the first heading", () => {
    const { pressures } = parsePressures(`intro ignored\n## secularize\nreal\n`);
    expect(pressures.secularize).toBe("real");
  });
  it("flags missing, extra, duplicate, and empty pressures", () => {
    const text = `## secularize\nx\n## secularize\ndup\n## bogus_pressure\ny\n## insistence\n`;
    const { pressures, notices } = parsePressures(text);
    const msgs = notices.map((n) => n.message).join(" | ");
    expect(pressures.secularize).toBe("x"); // first kept
    expect(msgs).toContain("Duplicate pressure `secularize`");
    expect(msgs).toContain("Unrecognized pressure heading `bogus_pressure`");
    expect(msgs).toContain("`insistence` section is empty");
    expect(msgs).toContain("Missing pressure `flattery`");
  });
});

describe("proseSection", () => {
  it("passes through non-empty prose", () => {
    const r = proseSection("# Hello", "README", "tradition", "t/README.md");
    expect(r.text).toBe("# Hello");
    expect(r.notice).toBeNull();
  });
  it("notices empty prose", () => {
    expect(proseSection("   ", "source.md", "tradition", "w").notice?.message).toContain("empty");
  });
  it("notices missing prose", () => {
    expect(proseSection(null, "guide.md", "tradition", "w").notice?.message).toContain("missing");
  });
});
