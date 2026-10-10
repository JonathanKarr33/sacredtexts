import { Link } from "@tanstack/react-router";

export function NotFound({ what }: { what?: string }) {
  return (
    <div role="alert" className="mx-auto max-w-xl py-16 text-center">
      <p className="text-5xl font-bold text-default-300">404</p>
      <h1 className="mt-2 text-xl font-semibold">{what ?? "Not found"}</h1>
      <p className="mt-2 text-default-500">
        That tradition or scenario isn't in the current snapshot.
      </p>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        ← Back to all traditions
      </Link>
    </div>
  );
}
