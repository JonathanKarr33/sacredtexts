import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

// Authored corpus prose AND model transcripts both render through here. It stays SAFE:
// react-markdown renders no raw HTML (no rehype-raw), and rehype-sanitize (GitHub schema, which
// permits table/thead/tbody/tr/th/td) strips anything dangerous. Remark plugins run first (mdast),
// then sanitize runs on the resulting hast — so GFM tables survive but scripts/raw HTML do not.
//
// - remark-gfm: GFM tables, strikethrough, autolinks, task lists. Model transcripts emit real
//   markdown TABLES (verified in the raw tier, e.g. results-raw/20260803/buddhism/BUD-041) which
//   otherwise collapse to one pipe-text paragraph.
// - remark-breaks: a single newline becomes a line break. Transcripts rely on single-\n line breaks
//   for verse/blessings and tight line-lists (e.g. BUD-001's closing "May your partner heal.\nMay
//   your heart stay soft."); models don't hard-wrap paragraphs (those are \n\n-separated), so this
//   preserves the model's line structure without introducing spurious breaks.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // Wide transcript tables must scroll inside their own container, not blow out the card.
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
