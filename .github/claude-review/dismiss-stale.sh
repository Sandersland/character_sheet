#!/usr/bin/env bash
# Dismiss the bot's own leftover change-requests after a clean review;
# dismiss_stale_reviews is off, so they would otherwise block merge.
set -euo pipefail

bot='claude[bot]'
ids=$(gh api "/repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq ".[] | select(.state == \"CHANGES_REQUESTED\" and .user.login == \"$bot\") | .id")
if [ -z "$ids" ]; then
  echo "No stale ${bot} change-request to dismiss."
  exit 0
fi
for id in $ids; do
  echo "Dismissing stale ${bot} review $id (superseded by clean re-run)."
  gh api -X PUT "/repos/$REPO/pulls/$PR/reviews/$id/dismissals" \
    -f message="Superseded: claude-review re-ran clean on a later commit." \
    -f event="DISMISS" >/dev/null
done
