import { Card, Chip } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import type { Tradition } from "../lib/model";

function reviewColor(status: string | null): "success" | "warning" | "default" {
  if (status === "reviewed") return "success";
  if (status === "in_progress") return "warning";
  return "default";
}

export function TraditionCard({ tradition }: { tradition: Tradition }) {
  const m = tradition.manifest;
  const title = m?.displayName || tradition.id;
  return (
    <Link
      to="/t/$traditionId"
      params={{ traditionId: tradition.id }}
      className="block transition-transform hover:-translate-y-0.5"
      data-testid="tradition-card"
    >
      <Card className="h-full p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-primary" aria-hidden />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <Chip size="sm" variant="soft" color={reviewColor(m?.scholarReview.status ?? null)}>
            {m?.scholarReview.status ?? "unreviewed"}
          </Chip>
        </div>
        <p className="mt-1 font-mono text-xs text-default-500">{tradition.id}</p>
        {m?.construct && <p className="mt-2 line-clamp-3 text-sm text-default-600">{m.construct}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-default-500">
          <dt className="font-medium">Source</dt>
          <dd>{m?.canonicalSource.title ?? "—"}</dd>
          <dt className="font-medium">Adherent</dt>
          <dd>{m?.adherentNoun ?? "—"}</dd>
          <dt className="font-medium">Scenarios</dt>
          <dd>{tradition.scenarioIds.length}</dd>
        </dl>
      </Card>
    </Link>
  );
}
