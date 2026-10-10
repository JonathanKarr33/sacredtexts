import { AlertTriangle, Info } from "lucide-react";
import type { Notice as NoticeT } from "../lib/model";

// A display-first "inline notice": a visibly distinct warning block rendered INTO the page
// (never a console-only log). Errors are amber/red-ish; warnings are softer.
export function Notice({ notice }: { notice: NoticeT }) {
  const isError = notice.severity === "error";
  const Icon = isError ? AlertTriangle : Info;
  return (
    <div
      role="note"
      data-severity={notice.severity}
      className={
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm " +
        (isError
          ? "border-danger-200 bg-danger-50 text-danger-700"
          : "border-warning-200 bg-warning-50 text-warning-700")
      }
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{notice.message}</span>{" "}
        <span className="opacity-60">({notice.where})</span>
      </span>
    </div>
  );
}

export function Notices({ notices }: { notices: NoticeT[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="notices">
      {notices.map((n, i) => (
        <Notice key={`${n.where}-${i}`} notice={n} />
      ))}
    </div>
  );
}
