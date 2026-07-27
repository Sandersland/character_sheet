#!/bin/sh
# Fail on a subclass identity check that substring-matches a display name
# instead of resolving through resolveSubclassSlug (#1277). This is the
# failure class #1339 fixed at one of the seven gate sites (DERIVED_ACTIONS'
# grantSubclass) and #1277 fixed at the other six (isWarriorOfTheOpenHand,
# isWarriorOfMercy, openHandMonkEntry, attacksForClass's Valor-bard check,
# plus matchesSubclassGate itself) — a display name is freeform and a player
# can edit it, so "Warrior of the Open Handbook" must never inherit "Warrior
# of the Open Hand"'s mechanics just because the second string contains the
# first.
#
# Two shapes, both greppable without a TS parser:
#   1. `(subclass ?? "").toLowerCase().includes(...)` (or the `?.` variant) —
#      the pattern all six retired sites shared.
#   2. A bare `.includes("open hand"|"mercy"|"valor"|"shadow")` on ANY
#      expression — catches a rewritten guard that dropped the `subclass ??`
#      prefix but kept testing for one of these four words.
#
# druid.ts's wildShapeCrCap and channel-divinity.ts's CHANNEL_DIVINITY_CATALOG
# gate are deliberately NOT migrated (#1277 F9 — already exact `===`
# comparisons, not the substring-match defect this guards; #1277's follow-up
# migrates them onto slugs too) — neither matches either pattern below, so
# they need no allowlist entry.
#
# Anti-vacuity: fail unless at least one backend/src file was scanned, so a
# typo'd glob (or backend/src disappearing) turns this red, not silently green.
set -eu

# --others --exclude-standard alongside --cached so a NEW, not-yet-staged file
# carrying the defect is caught at pre-commit rather than after it lands — the
# same reason check-enum-narrowing.sh greps --untracked.
FILES=$(git ls-files --cached --others --exclude-standard -- ':(glob)backend/src/**/*.ts' | grep -v '__tests__/')
FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "error: check-subclass-substring.sh scanned 0 backend/src files — glob is broken (anti-vacuity)" >&2
  exit 1
fi

bad=""
for f in $FILES; do
  # `\?\?|\|\|` catches both null-coalescing and logical-OR defaulting: the
  # retired code used `?? ""`, but `(subclass || "")` is the same defect and
  # would otherwise slip past whenever its fragment isn't one of the four
  # literals the second alternative pins.
  hit=$(grep -nE '\(\s*[a-zA-Z0-9_.?]*subclass[a-zA-Z0-9_.?]*\s*(\?\?|\|\|)\s*""\s*\)\s*\.toLowerCase\(\)\s*\.includes\(|\.includes\("(open hand|mercy|valor|shadow)"\)' "$f" || true)
  if [ -n "$hit" ]; then
    bad="$bad$f:$hit
"
  fi
done

if [ -n "$bad" ]; then
  echo "error: subclass identity resolved by substring match, not resolveSubclassSlug (#1277):" >&2
  printf '%s' "$bad" >&2
  echo "Resolve the subclass entry through resolveSubclassSlug (backend/src/lib/classes/subclass-slug.ts)" >&2
  echo "and compare the returned SubclassSlug, never a substring of the display name." >&2
  exit 1
fi
