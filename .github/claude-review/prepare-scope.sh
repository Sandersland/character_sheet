#!/usr/bin/env bash
# Decides FULL vs INCREMENTAL review, writes the diff to .review/scope.diff and
# renders prompt.md into the `prompt` step output (#1996).
#
# The incremental base is the commit of claude[bot]'s last SUBMITTED review,
# never the event's `before`: cancel-in-progress kills a superseded run before
# it reviews, so `before` would silently skip that push's commits. Falls back
# to FULL when there is no earlier bot review, when the branch was rewritten
# (compare status not `ahead`), or when the range holds a merge commit —
# merging the base branch in would otherwise put every change that arrived
# from it into the "new commits" diff.
#
# Env: GH_TOKEN, REPO, PR, HEAD_SHA, EVENT_ACTION, GITHUB_OUTPUT.
set -euo pipefail

mkdir -p .review
echo ".review/" >> .git/info/exclude

base=$(gh api "/repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq '[.[] | select(.user.login == "claude[bot]")] | last | .commit_id // empty')
mode=full
if [ "$EVENT_ACTION" = synchronize ] && [ -n "$base" ] && [ "$base" != "$HEAD_SHA" ]; then
  # gh prints the error body to stdout on failure, so only trust a clean exit.
  mode=$(gh api "/repos/$REPO/compare/$base...$HEAD_SHA" \
    --jq 'if .status == "ahead" and ([.commits[] | select(.parents | length > 1)] | length) == 0 then "incremental" else "full" end' \
    2>/dev/null) || mode=full
  [ "$mode" = incremental ] || mode=full
fi

if [ "$mode" = incremental ]; then
  gh api -H "Accept: application/vnd.github.diff" "/repos/$REPO/compare/$base...$HEAD_SHA" > .review/scope.diff
else
  gh pr diff "$PR" > .review/scope.diff \
    || echo "(diff too large for gh pr diff — list files with gh pr view $PR --json files and Read them)" > .review/scope.diff
fi

prompt=$(cat "$(dirname "$0")/prompt.md")
prompt=${prompt//'{{REPO}}'/"$REPO"}
prompt=${prompt//'{{PR}}'/"$PR"}
prompt=${prompt//'{{MODE}}'/"$mode"}
prompt=${prompt//'{{BASE}}'/"$base"}

delim="PROMPT_$(openssl rand -hex 8)"
{
  echo "mode=$mode"
  echo "base=$base"
  echo "prompt<<$delim"
  printf '%s\n' "$prompt"
  echo "$delim"
} >> "$GITHUB_OUTPUT"

echo "Review mode: $mode (base ${base:-none}, head $HEAD_SHA, $(wc -l < .review/scope.diff) diff lines)"
