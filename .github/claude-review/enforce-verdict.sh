#!/usr/bin/env bash
# claude-code-action@v1 exits 0 regardless of the review verdict and exposes no
# verdict output, so a REQUEST_CHANGES review it submits would not, on its own,
# fail the check. Re-read the PR's reviews and fail when a blocking review
# landed during this run. Filters by submit time (the concurrency group
# guarantees one in-flight run per PR) rather than reviewer identity, which the
# action doesn't expose.
#
# Also reports `reviewed` — whether claude[bot] submitted any review during
# this run. It is false when the action skipped itself (a PR that edits the
# review workflow file) or the reviewer never submitted its formal review.
#
# Env: GH_TOKEN, REPO, PR, MARKER (UTC timestamp taken just before the review),
# GITHUB_OUTPUT.
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
