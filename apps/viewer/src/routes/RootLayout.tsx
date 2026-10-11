import { useEffect, useRef } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

export function RootLayout() {
  // `main` is the app's scroll container (h-dvh shell) — its scrollTop would otherwise persist across
  // route changes. Reset it to the top on every pathname change.
  const mainRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [pathname]);
  return (
    // Viewport-height app shell: the header is fixed; the scroll lives INSIDE (main for normal pages).
    // So `document` never overflows — a page fits one screen; the inner scroll does the rest.
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-default-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Sacred Texts <span className="text-primary">Benchmark</span>
          </Link>
        </div>
      </header>
      <main ref={mainRef} className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
