import { useEffect, useRef } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { REF, REPO } from "../lib/constants";
import { useLatestSha } from "../lib/queries";

export function RootLayout() {
  // Point the GitHub link at the CONFIGURED repo and the exact loaded snapshot (the polled SHA),
  // falling back to the configured ref — so the link always matches the source the UI is showing.
  const { data: sha } = useLatestSha();
  const ref = sha ?? REF;

  // `main` is the app's scroll container (h-dvh shell) — its scrollTop would otherwise persist across
  // route changes. Reset it to the top on every pathname change.
  const mainRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [pathname]);
  return (
    // Viewport-height app shell: the header is fixed; the scroll lives INSIDE (main for normal pages,
    // or a page's own panes). So `document` never overflows — a page fits one screen; scrollbars do
    // the rest (the scenario page relies on this to scroll its two panes independently).
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-default-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-4">
            <Link to="/" className="text-lg font-semibold">
              Multi<span className="text-primary">Browser</span>
            </Link>
            <Link
              to="/results"
              className="text-sm text-default-500 hover:text-default-700 [&.active]:text-primary"
            >
              Results
            </Link>
            <Link
              to="/review"
              className="text-sm text-default-500 hover:text-default-700 [&.active]:text-primary"
            >
              Review
            </Link>
          </div>
          <a
            href={`https://github.com/${REPO}/tree/${ref}/traditions`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-default-500 hover:text-default-700"
          >
            <Github size={16} aria-hidden /> traditions on GitHub
          </a>
        </div>
      </header>
      {/* Fallback scroll container: normal pages scroll HERE (not the document). A page that fills
          `h-full` (the scenario page) makes main non-scrolling and owns its internal scroll instead. */}
      <main ref={mainRef} className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
