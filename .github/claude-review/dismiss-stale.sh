#!/usr/bin/env bash
# A clean run leaves the CHECK green, but a CHANGES_REQUESTED review the bot
# submitted on an EARLIER run is never auto-dismissed (main/staging keep
# dismiss_stale_reviews:false so human approvals survive a push). That stale
# verdict keeps reviewDecision = CHANGES_REQUESTED and blocks merge until a
# human dismisses it. Only call this after a run that actually reviewed and
# passed enforce-verdict.sh: then any remaining bot CHANGES_REQUESTED is
# provably stale. Scoped to the bot's login so a HUMAN change-request is never
# touched. REST /reviews, because the dismissals endpoint needs the integer id.
#
# Env: GH_TOKEN, REPO, PR.
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
