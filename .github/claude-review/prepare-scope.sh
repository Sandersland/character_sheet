#!/usr/bin/env bash
# Picks full vs incremental review, writes .review/scope.diff, renders the prompt.
# Incremental base = claude[bot]'s last review commit (not `before`, which
# cancel-in-progress can skip past). Full on rewrites or merge commits.
set -euo pipefail

mkdir -p .review
echo ".review/" >> .git/info/exclude

base=$(gh api "/repos/$REPO/pulls/$PR/reviews" --paginate \
  --jq '[.[] | select(.user.login == "claude[bot]")] | last | .commit_id // empty')
mode=full
if [ "$EVENT_ACTION" = synchronize ] && [ -n "$base" ] && [ "$base" != "$HEAD_SHA" ]; then
  # gh writes its error body to stdout.
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
