#!/bin/sh
# Fail on an edition rule branching with `edition === "EDITION_…"` /
# `edition !== "EDITION_…"` instead of a total mapping over RulesEdition
# (#1978, generalizing #1527's subclassGateLevel pattern to every rule fn).
#
# A binary `if (edition === "EDITION_2014") … else …` (or its `!==` twin)
# silently maps a third, future RulesEdition member onto whichever branch is
# the fallback — the exact defect #1527 fixed at subclassGateLevel and
# spellListsFor's own why-comment (spellcasting-tables.ts) describes. The fix
# is always a `switch (edition)` with a `default: { const exhaustive: never =
# edition; throw … }` (or a `Record<RulesEdition, …>` lookup), which fails
# loudly at the call site — and at compile time, the moment a new
# RulesEdition member is added — instead of silently picking a branch. This
# applies equally to a boolean-returning predicate: `edition === "EDITION_X"`
# as a return value maps an unrecognized edition to `false` just as silently.
#
# Precise by construction, not by exclusion list: the pattern requires the
# comparison operator immediately before the quoted literal, so it does not
# fire on a `Record<RulesEdition, …>` literal's `"EDITION_2014": …` key (no
# `===`/`!==` precedes the colon) or a `switch` branch's `case "EDITION_2014":`
# label (no comparison operator at all) — both are the sanctioned shape this
# gate exists to push every site onto. Self-test below proves this rather than
# asserting it.
#
# A why-comment is allowed to quote the anti-pattern (this file's own header
# does, and so does spellListsFor's #1527 citation) — is_comment_line skips
# any line whose trimmed content opens with `//` or `*`, mirroring
# check-class-ts-migration.sh's same carve-out for a class name in prose.
# Known false positive: is_comment_line only skips a WHOLE-line comment, so a
# trailing `// edition === "EDITION_2014"` on a code line still fires — put
# such prose on its own line.
#
# Anti-vacuity: the self-test fails loudly if the positive probe (a real
# violation shape) doesn't match, or either negative probe (record key /
# switch case) DOES match — a broken pattern reads red, not silently green.
set -eu

PATTERN='(===|!==)[[:space:]]*"EDITION_|"EDITION_[A-Za-z0-9_]*"[[:space:]]*(===|!==)'

is_comment_line() {
  content="${1#*:}"
  trimmed=$(printf '%s' "$content" | sed -e 's/^[[:space:]]*//')
  case "$trimmed" in
    "//"* | "*"* | "/*"*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! printf '%s\n' '  if (edition === "EDITION_2014") return true;' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN no longer matches its own violation probe — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
if printf '%s\n' '    case "EDITION_2014":' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN matches a switch case label — the gate would wrongly block the sanctioned total-mapping shape" >&2
  exit 1
fi
if printf '%s\n' '  "EDITION_2014": true,' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN matches a record-literal key — the gate would wrongly block the sanctioned Record<RulesEdition, …> shape" >&2
  exit 1
fi

# Excludes *.test.*/__tests__/** (fixture literals like test-feature-rows.fixture.ts
# author both editions' data inline on purpose, not a rule fn). --others
# --exclude-standard alongside --cached so a new, not-yet-staged file carrying
# the defect is caught at pre-commit too.
FILES=$(git ls-files --cached --others --exclude-standard -- ':(glob)backend/src/**/*.ts' |
  grep -v '\.test\.' | grep -v '__tests__/' || true)
FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)

MIN_SCANNED_FILES=100
if [ "$FILE_COUNT" -lt "$MIN_SCANNED_FILES" ]; then
  echo "error: check-edition-branching.sh scanned only $FILE_COUNT files (expected >= $MIN_SCANNED_FILES) — glob is broken (anti-vacuity)" >&2
  exit 1
fi

bad=""
for f in $FILES; do
  hits=$(grep -nE "$PATTERN" "$f" || true)
  [ -z "$hits" ] && continue
  filtered=$(printf '%s\n' "$hits" | while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    is_comment_line "$hit" || printf '%s\n' "$hit"
  done)
  if [ -n "$filtered" ]; then
    bad="$bad$(printf '%s\n' "$filtered" | sed "s|^|$f:|")
"
  fi
done

if [ -n "$bad" ]; then
  echo "error: edition rule branching with a binary === / !== comparison instead of a total mapping (#1978/#1527):" >&2
  printf '%s' "$bad" >&2
  echo "Rewrite as a \`switch (edition)\` with an assertNever-typed default (or a Record<RulesEdition, …> lookup) — see subclassGateLevel (backend/src/lib/leveling/effective-levels.ts) or spellListsFor (backend/src/lib/srd/spellcasting-tables.ts)." >&2
  exit 1
fi
