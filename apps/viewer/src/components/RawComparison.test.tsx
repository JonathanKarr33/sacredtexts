import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RawComparison } from "./RawComparison";
import type { RawCatalog, RawShard } from "../lib/rawModel";

// A synthetic OFF-DOMAIN catalog with THREE scopes (not MultiBench's two) — the regression net for
// the middle-scope-drop bug: a ≥3-scope catalog must render EVERY scope's verdicts, never silently
// lose the middle ones (catalog-generic invariant, AFB #54).
const catalog3: RawCatalog = {
  schemaVersion: 1,
  dataset: { title: "Three-scope probe", license: "MIT" },
  scale: { min: 0, center: 2, max: 4 },
  ramp: ["#000000", "#888888", "#ffffff"],
  subjects: [{ id: "m1", label: "Model One" }, { id: "m2", label: "Model Two" }],
  judges: [{ key: "j1", label: "Judge One", fullGrid: true }],
  conditionAxes: [{ key: "cond", label: "Cond", values: [{ id: "c1", label: "C1" }] }],
  groupBy: { key: "g", label: "G" },
  scopes: [{ id: "initial", label: "Initial" }, { id: "mid", label: "Mid" }, { id: "post", label: "Post" }],
  items: [{ id: "I1", label: "I1", group: "grp", shard: "grp/I1.json.gz" }],
  presets: [],
  fingerprint: "sha256:x",
};
const shard3: RawShard = {
  schemaVersion: 1,
  contexts: {},
  cells: [{
    subject: "m1",
    conditions: { cond: "c1" },
    transcript: [
      { role: "user", content: "the question" },
      { role: "assistant", content: "first response" },
      { role: "user", content: "the pressure" },
      { role: "assistant", content: "second response" },
    ],
    verdicts: [
      { judge: "j1", scope: "initial", score: 1, summary: "init verdict" },
      { judge: "j1", scope: "mid", score: 2, summary: "mid verdict" },
      { judge: "j1", scope: "post", score: 3, summary: "post verdict" },
    ],
  }],
};

describe("RawComparison — scope interleave (generic over scope count)", () => {
  it("renders EVERY scope for a ≥3-scope catalog — no middle-scope drop", () => {
    render(<RawComparison catalog={catalog3} shard={shard3} a="m1" b={null} conditions={{ cond: "c1" }} />);
    const stages = screen.getAllByTestId("verdict-stage");
    // All three scopes present, in order; the middle ("mid") is NOT dropped.
    expect(stages.map((s) => s.getAttribute("data-scope"))).toEqual(["initial", "mid", "post"]);
    expect(screen.getAllByTestId("verdict")).toHaveLength(3);
  });

  it("interleaves by turn: the initial stage sits after the first response, the rest after the last", () => {
    render(<RawComparison catalog={catalog3} shard={shard3} a="m1" b={null} conditions={{ cond: "c1" }} />);
    const first = screen.getByText("first response");
    const second = screen.getByText("second response");
    const [initial, , post] = screen.getAllByTestId("verdict-stage");
    // initial verdict comes AFTER the first response but BEFORE the second (post-pressure) response…
    expect(first.compareDocumentPosition(initial!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(initial!.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // …and the post-pressure verdict comes AFTER the second response.
    expect(second.compareDocumentPosition(post!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders contextSlot AFTER the question and BEFORE the first response (reading order, #73)", () => {
    render(<RawComparison catalog={catalog3} shard={shard3} a="m1" b={null} conditions={{ cond: "c1" }}
      contextSlot={<div data-testid="ctx-slot">the guidance</div>} />);
    const question = screen.getByText("the question");
    const slot = screen.getByTestId("ctx-slot");
    const first = screen.getByText("first response");
    // question → guidance …
    expect(question.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // … → first assistant response.
    expect(slot.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a contextSlot that renders nothing injects no element — degrade to no gap (AFB, #54)", () => {
    // Mirrors CorpusContext returning null for a non-corpus catalog: the slot must add NO DOM node,
    // so the question is immediately followed by the first response (no empty wrapper / gap between).
    const Empty = () => null;
    render(<RawComparison catalog={catalog3} shard={shard3} a="m1" b={null} conditions={{ cond: "c1" }}
      contextSlot={<Empty />} />);
    const question = screen.getByText("the question").closest("[data-role='user']")!;
    const next = question.nextElementSibling as HTMLElement; // the very next sibling, nothing in between
    expect(within(next).getByText("first response")).toBeInTheDocument();
  });

  it("single-scope catalog renders exactly one stage (no crash on the empty 'rest')", () => {
    const oneScope: RawCatalog = { ...catalog3, scopes: [{ id: "only", label: "Only" }] };
    const oneShard: RawShard = {
      schemaVersion: 1, contexts: {},
      cells: [{ subject: "m1", conditions: { cond: "c1" },
        transcript: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }],
        verdicts: [{ judge: "j1", scope: "only", score: 4, summary: "s" }] }],
    };
    render(<RawComparison catalog={oneScope} shard={oneShard} a="m1" b={null} conditions={{ cond: "c1" }} />);
    expect(screen.getAllByTestId("verdict-stage").map((s) => s.getAttribute("data-scope"))).toEqual(["only"]);
  });
});
