import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// A lightweight, accessible disclosure (native <details>) styled with Tailwind.
export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-default-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium">
        <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="border-t border-default-200 px-3 py-3">{children}</div>
    </details>
  );
}
