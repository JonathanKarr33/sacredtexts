import { Chip } from "@heroui/react";
import type { Manifest } from "../lib/model";

export function TraditionHeader({ manifest }: { manifest: Manifest }) {
  const cs = manifest.canonicalSource;
  return (
    <header className="flex flex-col gap-2 border-b border-default-200 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{manifest.displayName || manifest.id}</h1>
        <Chip size="sm" variant="soft" color="default">
          {manifest.id}
        </Chip>
        <Chip
          size="sm"
          variant="soft"
          color={manifest.scholarReview.status === "reviewed" ? "success" : "default"}
        >
          review: {manifest.scholarReview.status ?? "unreviewed"}
        </Chip>
      </div>
      {manifest.construct && <p className="max-w-3xl text-default-600">{manifest.construct}</p>}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-default-500">
        <div>
          <dt className="inline font-medium">Source: </dt>
          <dd className="inline">
            {cs.title ?? "—"}
            {cs.author ? ` · ${cs.author}` : ""}
            {cs.locusUnit ? ` (by ${cs.locusUnit})` : ""}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Adherent: </dt>
          <dd className="inline">{manifest.adherentNoun || "—"}</dd>
        </div>
      </dl>
    </header>
  );
}
