#!/usr/bin/env bash
#
# Delete JIRA issues by key. Use after running smoke-test.sh --no-cleanup.
#
# Usage:  ./scripts/cleanup.sh PROJ-42 PROJ-43
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: ./scripts/cleanup.sh <issueKey> [issueKey...]"
  echo "Example: ./scripts/cleanup.sh PROJ-42 PROJ-43"
  exit 1
fi

if [[ -f "$ROOT_DIR/dist/index.js" ]]; then
  SJIRA="node $ROOT_DIR/dist/index.js"
else
  SJIRA="npx tsx $ROOT_DIR/src/index.ts"
fi

for key in "$@"; do
  if $SJIRA issue delete "$key" 2>/dev/null; then
    echo "Deleted $key"
  else
    echo "Failed to delete $key"
  fi
done
