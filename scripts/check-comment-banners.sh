#!/bin/sh
# Fail on any section-divider "banner" comment in frontend/src (#1057).
#
# CLAUDE.md bans section banners ("a file that needs section banners needs
# splitting"), and no lint rule detects them — so this is the banner twin of
# check-fallow-reasons.sh: a trivial grep gate run in BOTH the lefthook
# pre-commit hook and the CI fallow job, so a --no-verify push is re-checked.
#
# Scope is frontend/src: the #1058 comment-hygiene epic cleaned it and this gate
# locks that in. backend/ and .claude/ still carry pre-existing banners outside
# that epic's scope, so a repo-wide gate would fail on inherited debt.
#
# Flags two divider shapes: box-drawing runs (U+2500 "──", distinct from the
# em-dash U+2014 "—" used throughout prose, so prose never trips) and ASCII/"~"
# rule comments ("// ----", "* ===="). Bare em-dashes and "-->" don't match.
set -eu

matches=$(git grep -nP '\x{2500}{2,}|(?://|\*)\s*[-=~]{3,}' -- \
  ':(glob)frontend/src/**/*.ts' ':(glob)frontend/src/**/*.tsx' \
  ':(glob)frontend/src/**/*.js' ':(glob)frontend/src/**/*.mjs' \
  ':(glob)frontend/src/**/*.cjs' || true)

if [ -n "$matches" ]; then
  echo "error: section-divider banner comment(s) found in frontend/src (#1057):" >&2
  echo "$matches" >&2
  echo "CLAUDE.md bans banners. Delete the divider; fold any content into a JSDoc on the section's first symbol, or split the file." >&2
  exit 1
fi
