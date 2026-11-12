#!/usr/bin/env bash
# The check stays green when no review happened, so say so on the PR instead
# of letting a pass read as "reviewed". Edits its previous notice rather than
# stacking one per push.
#
# Env: GH_TOKEN, PR.
set -euo pipefail

if gh pr diff "$PR" --name-only | grep -qx '.github/workflows/claude-code-review.yml'; then
  why="this PR edits \`.github/workflows/claude-code-review.yml\`, and the review action refuses to run until that file matches the default branch. It will review normally once this merges; changes to \`.github/claude-review/\` alone do not cause a skip."
else
  why="the reviewer finished without submitting its formal review. Re-run the claude-review job."
fi
body="**claude-review did not review this commit** — $why"
echo "::warning::claude-review did not review this commit"
gh pr comment "$PR" --edit-last --create-if-none --body "$body"
