#!/usr/bin/env bash
# The action always exits 0, so fail here on a REQUEST_CHANGES from this run.
# Outputs reviewed=false when claude[bot] submitted nothing (e.g. it skipped itself).
set -euo pipefail

reviews=$(gh api "/repos/$REPO/pulls/$PR/reviews" --paginate --jq '[.[] | select(.submitted_at > "'"$MARKER"'")]' | jq -s 'add // []')
blocking=$(jq '[.[] | select(.state == "CHANGES_REQUESTED")] | length' <<< "$reviews")
reviewed=$(jq '[.[] | select(.user.login == "claude[bot]")] | length > 0' <<< "$reviews")
echo "reviewed=$reviewed" >> "$GITHUB_OUTPUT"

if [ "$blocking" -gt 0 ]; then
  echo "::error::Claude Code Review requested changes on this PR. Resolve the blocking findings and push to re-run."
  exit 1
fi
echo "No blocking review verdict — claude-review passes (reviewed=$reviewed)."
