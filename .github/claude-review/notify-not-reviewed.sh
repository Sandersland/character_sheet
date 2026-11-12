#!/usr/bin/env bash
# A skipped review still passes the check, so say so on the PR.
set -euo pipefail

if gh pr diff "$PR" --name-only | grep -qx '.github/workflows/claude-code-review.yml'; then
  why="this PR edits its workflow file; it runs after merge."
else
  why="no review was submitted; re-run the job."
fi
body="claude-review skipped this commit: $why"
echo "::warning::claude-review did not review this commit"
gh pr comment "$PR" --edit-last --create-if-none --body "$body"
