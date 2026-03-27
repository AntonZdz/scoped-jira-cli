#!/usr/bin/env bash
#
# Smoke test for sjira CLI against a live JIRA instance.
# Reads config from .env, runs through all operations, cleans up after itself.
#
# Usage:  ./scripts/smoke-test.sh [--dev] [--no-cleanup]
#
# Flags:
#   --dev          Use tsx instead of built dist/index.js
#   --no-cleanup   Keep created test issues in JIRA for manual inspection
#
# Prerequisites:
#   - .env file with credentials and SMOKE_TEST_PROJECT set
#   - jq installed (for JSON parsing)
#   - npm run build has been run (or run with --dev flag to use tsx)
#
set -uo pipefail

# ── Configuration ────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
else
  echo "Error: .env file not found."
  echo "Copy .env.example to .env and fill in your values."
  exit 1
fi

# Parse flags
NO_CLEANUP=false
USE_DEV=false
for arg in "$@"; do
  case "$arg" in
    --dev)        USE_DEV=true ;;
    --no-cleanup) NO_CLEANUP=true ;;
  esac
done

# CLI command
if $USE_DEV; then
  SJIRA="npx tsx $ROOT_DIR/src/index.ts"
else
  if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
    echo "Error: dist/index.js not found. Run 'npm run build' first, or use --dev flag."
    exit 1
  fi
  SJIRA="node $ROOT_DIR/dist/index.js"
fi

# ── Preflight checks ────────────────────────────────────────────

MISSING=()
[[ -z "${JIRA_SITE:-}" ]]          && MISSING+=("JIRA_SITE")
[[ -z "${JIRA_EMAIL:-}" ]]         && MISSING+=("JIRA_EMAIL")
[[ -z "${JIRA_SCOPED_TOKEN:-}" ]]  && MISSING+=("JIRA_SCOPED_TOKEN")
[[ -z "${SMOKE_TEST_PROJECT:-}" ]] && MISSING+=("SMOKE_TEST_PROJECT")

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "Error: Missing required .env variables: ${MISSING[*]}"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required for JSON parsing. Install with: brew install jq"
  exit 1
fi

# ── Test harness ─────────────────────────────────────────────────

PASSED=0
FAILED=0
CLEANUP_KEYS=()

pass() { ((PASSED++)); echo "  PASS  $1"; }
fail() { ((FAILED++)); echo "  FAIL  $1"; echo "        $2"; }

cleanup() {
  if [[ ${#CLEANUP_KEYS[@]} -gt 0 ]]; then
    if $NO_CLEANUP; then
      echo ""
      echo "Kept ${#CLEANUP_KEYS[@]} test issue(s): ${CLEANUP_KEYS[*]}"
    else
      echo ""
      echo "Cleanup: deleting ${#CLEANUP_KEYS[@]} test issue(s)..."
      for key in "${CLEANUP_KEYS[@]}"; do
        if $SJIRA issue delete "$key" &>/dev/null; then
          echo "  Deleted $key"
        else
          echo "  Could not delete $key (may need manual cleanup)"
        fi
      done
    fi
  fi

  echo ""
  echo "════════════════════════════════════════"
  echo "  Results: $PASSED passed, $FAILED failed"
  echo "════════════════════════════════════════"

  if [[ $FAILED -gt 0 ]]; then exit 1; else exit 0; fi
}

trap cleanup EXIT

# ── Tests ────────────────────────────────────────────────────────

PROJECT="$SMOKE_TEST_PROJECT"

echo ""
echo "sjira smoke test"
echo "Site:    $JIRA_SITE.atlassian.net"
echo "Project: $PROJECT"
echo "════════════════════════════════════════"
echo ""

# 1. Search — verifies connection, Cloud ID resolution, auth
echo "1. Connection & search"
SEARCH_OUT=$($SJIRA --json search -j "project = $PROJECT ORDER BY created DESC" --limit 1 2>&1) && {
  echo "$SEARCH_OUT" | jq -e '.issues' &>/dev/null \
    && pass "search returns valid JSON with issues array" \
    || fail "search JSON structure" "Missing .issues key"
} || fail "search command" "$SEARCH_OUT"

# 2. Create issue A
echo ""
echo "2. Create issue"
CREATE_A=$($SJIRA --json issue create \
  -p "$PROJECT" \
  -t Task \
  -s "sjira smoke test $(date +%s)" \
  -d "Automated smoke test — safe to delete" \
  --priority Medium \
  -l sjira-smoke-test 2>&1) && {
  KEY_A=$(echo "$CREATE_A" | jq -r '.key')
  if [[ "$KEY_A" != "null" && -n "$KEY_A" ]]; then
    pass "created $KEY_A"
    CLEANUP_KEYS+=("$KEY_A")
  else
    fail "create issue A" "No key in response: $CREATE_A"
  fi
} || { fail "create issue A" "$CREATE_A"; KEY_A=""; }

# Guard: skip dependent tests if create failed
if [[ -z "${KEY_A:-}" ]]; then
  echo ""
  echo "Skipping remaining tests — issue creation failed."
  exit 1
fi

# 3. Get issue
echo ""
echo "3. Get issue"
GET_OUT=$($SJIRA --json issue get "$KEY_A" 2>&1) && {
  GOT_KEY=$(echo "$GET_OUT" | jq -r '.key')
  GOT_SUMMARY=$(echo "$GET_OUT" | jq -r '.fields.summary')
  [[ "$GOT_KEY" == "$KEY_A" ]] \
    && pass "get $KEY_A — summary: $GOT_SUMMARY" \
    || fail "get issue" "Expected key $KEY_A, got $GOT_KEY"
} || fail "get issue" "$GET_OUT"

# 4. Get issue (plain text)
PLAIN_OUT=$($SJIRA issue get "$KEY_A" 2>&1) && {
  echo "$PLAIN_OUT" | grep -q "$KEY_A" \
    && pass "get $KEY_A plain text contains key" \
    || fail "get plain text" "Key not found in output"
} || fail "get plain text" "$PLAIN_OUT"

# 5. Update issue
echo ""
echo "4. Update issue"
UPDATE_OUT=$($SJIRA issue update "$KEY_A" \
  -s "sjira smoke test UPDATED $(date +%s)" \
  --add-label updated-by-cli 2>&1) && {
  pass "update $KEY_A"
} || fail "update issue" "$UPDATE_OUT"

# Verify update took effect
VERIFY_UPDATE=$($SJIRA --json issue get "$KEY_A" 2>&1) && {
  HAS_LABEL=$(echo "$VERIFY_UPDATE" | jq -r '.fields.labels[]' 2>/dev/null | grep -c "updated-by-cli")
  [[ "$HAS_LABEL" -gt 0 ]] \
    && pass "verified label 'updated-by-cli' present" \
    || fail "verify update" "Label not found after update"
} || fail "verify update" "$VERIFY_UPDATE"

# 6. List transitions
echo ""
echo "5. Transitions"
TRANS_LIST=$($SJIRA --json issue transition "$KEY_A" --list 2>&1) && {
  TRANS_COUNT=$(echo "$TRANS_LIST" | jq 'length')
  if [[ "$TRANS_COUNT" -gt 0 ]]; then
    pass "found $TRANS_COUNT available transition(s)"
    FIRST_TRANS_NAME=$(echo "$TRANS_LIST" | jq -r '.[0].name')
    FIRST_TRANS_TO=$(echo "$TRANS_LIST" | jq -r '.[0].to.name')
    echo "        Will transition using: \"$FIRST_TRANS_NAME\" -> $FIRST_TRANS_TO"
  else
    fail "list transitions" "No transitions available"
    FIRST_TRANS_NAME=""
  fi
} || { fail "list transitions" "$TRANS_LIST"; FIRST_TRANS_NAME=""; }

# 7. Execute transition
if [[ -n "${FIRST_TRANS_NAME:-}" ]]; then
  TRANS_OUT=$($SJIRA issue transition "$KEY_A" --to "$FIRST_TRANS_NAME" 2>&1) && {
    pass "transitioned $KEY_A to \"$FIRST_TRANS_TO\""
  } || fail "transition issue" "$TRANS_OUT"
else
  echo "        Skipping transition — no transitions found"
fi

# 8. Add comment
echo ""
echo "6. Comments"
COMMENT_OUT=$($SJIRA --json comment add "$KEY_A" \
  -b "Automated smoke test comment at $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>&1) && {
  COMMENT_ID=$(echo "$COMMENT_OUT" | jq -r '.id')
  [[ "$COMMENT_ID" != "null" && -n "$COMMENT_ID" ]] \
    && pass "added comment (id: $COMMENT_ID)" \
    || fail "add comment" "No comment ID in response"
} || fail "add comment" "$COMMENT_OUT"

# 9. List comments
LIST_COMMENTS=$($SJIRA --json comment list "$KEY_A" --limit 5 2>&1) && {
  COMMENT_COUNT=$(echo "$LIST_COMMENTS" | jq 'length')
  [[ "$COMMENT_COUNT" -gt 0 ]] \
    && pass "listed $COMMENT_COUNT comment(s)" \
    || fail "list comments" "Expected at least 1 comment"
} || fail "list comments" "$LIST_COMMENTS"

# 10. Create issue B for linking
echo ""
echo "7. Links"
CREATE_B=$($SJIRA --json issue create \
  -p "$PROJECT" \
  -t Task \
  -s "sjira link target $(date +%s)" \
  -l sjira-smoke-test 2>&1) && {
  KEY_B=$(echo "$CREATE_B" | jq -r '.key')
  if [[ "$KEY_B" != "null" && -n "$KEY_B" ]]; then
    pass "created link target $KEY_B"
    CLEANUP_KEYS+=("$KEY_B")
  else
    fail "create issue B" "No key in response"
    KEY_B=""
  fi
} || { fail "create issue B" "$CREATE_B"; KEY_B=""; }

# 11. Link issues
if [[ -n "${KEY_B:-}" ]]; then
  LINK_OUT=$($SJIRA link add "$KEY_A" "$KEY_B" -t Relates 2>&1) && {
    pass "linked $KEY_A -> $KEY_B (Relates)"
  } || fail "link issues" "$LINK_OUT"
else
  echo "        Skipping link — second issue creation failed"
fi

# 12. Search with JQL filter
echo ""
echo "8. Filtered search"
SEARCH_FILTER=$($SJIRA --json search \
  -j "project = $PROJECT AND labels = sjira-smoke-test ORDER BY created DESC" \
  --limit 10 2>&1) && {
  FOUND=$(echo "$SEARCH_FILTER" | jq '.issues | length')
  [[ "$FOUND" -ge 1 ]] \
    && pass "found $FOUND issue(s) with label sjira-smoke-test" \
    || fail "filtered search" "Expected at least 1 result, got $FOUND"
} || fail "filtered search" "$SEARCH_FILTER"

echo ""
echo "Tests complete."
