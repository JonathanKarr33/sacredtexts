// Shared mapping from a scenario's identity_signal to a HeroUI chip color.
export function identityColor(sig: string | null): "success" | "warning" | "danger" | "default" {
  if (sig === "clean") return "success";
  if (sig === "leaky") return "warning";
  if (sig === "intrinsic") return "danger";
  return "default";
}
