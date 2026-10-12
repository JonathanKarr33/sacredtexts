#!/usr/bin/env bash
# Per-builder test DISPATCHER for porch's implement/review test-check.
# Ported from multibench (.codev/checks/test.sh @ 14f6c9d4).
#
# porch.checks is GLOBAL (no per-project override), so a single hardcoded command would either
# run the wrong app's tests or break builders that lack another app's toolchain. Instead, this
# script runs the test suite of each top-level app/pipeline THIS builder actually touched
# (its diff vs origin/main), looked up in the registry below.
#
# Result: a builder that only touched apps/viewer runs ONLY vitest; a Python builder that only
# touched pipelines/ runs ONLY its pytest. Adding an app = one registry line. porch runs this
# from the worktree root.
set -uo pipefail

# Registry: touched top-level dir -> test command (run from the repo root). "" = unregistered.
test_cmd_for() {
  case "$1" in
    pipelines)   echo "uv --project pipelines run pytest pipelines" ;;
    apps/viewer) echo "pnpm -C apps/viewer test" ;;
    *)           echo "" ;;
  esac
}

base="origin/main"
git rev-parse --verify --quiet "$base" >/dev/null || base="main"

changed=$(git diff --name-only "${base}...HEAD" 2>/dev/null)
# runs/** (committed evidence), texts/** (corpus), and configs/** (the example panel that
# test_phase2_tools.py loads and asserts on) map to the pipelines lane, whose pytest includes
# the committed-artifact copyright audit — so a PR touching only those paths is still tested
# and audited, not silently skipped.
touched=$(printf '%s\n' "$changed" \
  | grep -oE '^(apps/[^/]+|pipelines|runs|texts|configs)' \
  | sed -E 's#^(runs|texts|configs)$#pipelines#' | sort -u)

if [ -z "${touched//[$'\n']/}" ]; then
  echo "test-dispatcher: no app/pipeline changed vs ${base} — nothing to test."
  exit 0
fi

status=0
while IFS= read -r app; do
  [ -z "$app" ] && continue
  cmd="$(test_cmd_for "$app")"
  if [ -z "$cmd" ]; then
    echo "test-dispatcher: '$app' has no registered test command — skipping."
    continue
  fi
  echo "test-dispatcher: $app -> $cmd"
  if ! bash -c "$cmd"; then
    echo "test-dispatcher: FAILED for $app"
    status=1
  fi
done <<EOF
$touched
EOF

[ "$status" -eq 0 ] && echo "test-dispatcher: all touched apps passed."
exit "$status"
