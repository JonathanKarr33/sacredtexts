import { Spinner } from "@heroui/react";

export function CenteredSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-12 text-default-500">
      <Spinner size="sm" aria-label={label} />
      <span>{label}</span>
    </div>
  );
}

/** A simple skeleton bar (Tailwind-based to avoid coupling to HeroUI Skeleton's API). */
export function SkeletonRow() {
  return <div className="h-10 w-full animate-pulse rounded-md bg-default-100" aria-hidden />;
}
