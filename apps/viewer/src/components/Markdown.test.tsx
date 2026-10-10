import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders markdown and preserves Arabic / Unicode", () => {
    render(<Markdown># الجليس الصالح — *perfume seller*</Markdown>);
    expect(screen.getByText(/الجليس الصالح/)).toBeInTheDocument();
  });

  it("does not render dangerous raw HTML (no script/img-onerror injection)", () => {
    const { container } = render(
      <Markdown>{`Hello <img src=x onerror="alert(1)"> <script>alert(2)</script> world`}</Markdown>,
    );
    // raw HTML is not parsed (no rehype-raw) and rehype-sanitize strips anything dangerous.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("renders GFM tables as real <table> structure (not collapsed pipe text)", () => {
    // The transcript bug: without remark-gfm this markdown rendered as one pipe-text paragraph.
    const table = ["| Harm Level | Atonement |", "|---|---|", "| Minor | Recite Metta x3 |"].join("\n");
    const { container } = render(<Markdown>{table}</Markdown>);
    const el = container.querySelector("table");
    expect(el).not.toBeNull();
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("tbody td")).toHaveLength(2);
    expect(screen.getByText("Atonement")).toBeInTheDocument();
    expect(screen.getByText("Recite Metta x3")).toBeInTheDocument();
  });

  it("wraps tables in a horizontally scrollable container (wide tables scroll, don't blow the card)", () => {
    const { container } = render(<Markdown>{"| a | b |\n|---|---|\n| 1 | 2 |"}</Markdown>);
    const wrapper = container.querySelector("div.overflow-x-auto");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector("table")).not.toBeNull();
  });

  it("honors single-newline line breaks (remark-breaks) for verse / line-lists", () => {
    // Real transcripts (e.g. BUD-001's closing blessing) put line-by-line content on single \n.
    const { container } = render(<Markdown>{"May your partner heal.\nMay your heart stay soft."}</Markdown>);
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("still strikes through and keeps paragraph text intact (GFM, no over-breaking)", () => {
    const { container } = render(<Markdown>{"a ~~struck~~ word"}</Markdown>);
    expect(container.querySelector("del")).not.toBeNull();
    expect(screen.getByText("struck")).toBeInTheDocument();
  });
});
