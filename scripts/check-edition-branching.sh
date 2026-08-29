#!/bin/sh
# Fail on an edition rule branching with `edition === "EDITION_…"` /
# `edition !== "EDITION_…"` (or their `==`/`!=` loose-equality twins) instead
# of a total mapping over RulesEdition (#1978, generalizing #1527's
# subclassGateLevel pattern to every rule fn).
#
# A binary `if (edition === "EDITION_2014") … else …` (or its `!==`/`==`/`!=`
# twins) silently maps a third, future RulesEdition member onto whichever
# branch is the fallback — the exact defect #1527 fixed at subclassGateLevel
# and spellListsFor's own why-comment (spellcasting-tables.ts) describes. The
# fix is always a `switch (edition)` with a `default: { const exhaustive:
# never = edition; throw … }` (or a `Record<RulesEdition, …>` lookup), which
# fails loudly at the call site — and at compile time, the moment a new
# RulesEdition member is added — instead of silently picking a branch. This
# applies equally to a boolean-returning predicate: `edition === "EDITION_X"`
# as a return value maps an unrecognized edition to `false` just as silently.
#
# Precise by construction, not by exclusion list: the pattern requires a
# comparison operator immediately before the quoted literal, so it does not
# fire on a `Record<RulesEdition, …>` literal's `"EDITION_2014": …` key (no
# operator precedes the colon) or a `switch` branch's `case "EDITION_2014":`
# label (no comparison operator at all) — both are the sanctioned shape this
# gate exists to push every site onto.
#
# is_comment_line skips whole-line comments so a why-comment may quote the
# anti-pattern. Known false positive: a trailing `// edition === "EDITION_2014"`
# on a code line still fires — put such prose on its own line.
#
# Anti-vacuity: the probes below fail loudly if the pattern stops matching a
# real violation or starts matching a sanctioned shape.
set -eu

PATTERN='(===|!==|==|!=)[[:space:]]*"EDITION_|"EDITION_[A-Za-z0-9_]*"[[:space:]]*(===|!==|==|!=)'

is_comment_line() {
  content="${1#*:}"
  trimmed=$(printf '%s' "$content" | sed -e 's/^[[:space:]]*//')
  case "$trimmed" in
    "//"* | "*"* | "/*"*) return 0 ;;
    *) return 1 ;;
  esac
}

if ! printf '%s\n' '  if (edition === "EDITION_2014") return true;' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN no longer matches its own strict-equality violation probe — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
if ! printf '%s\n' '  if (edition == "EDITION_2014") return true;' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN no longer matches its own loose-equality (==) violation probe — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
if ! printf '%s\n' '  if (edition != "EDITION_2014") return true;' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN no longer matches its own loose-equality (!=) violation probe — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
if ! printf '%s\n' '  if (edition !== "EDITION_2014") return true;' | grep -qE "$PATTERN"; then
  echo "error: check-edition-branching.sh's PATTERN no longer matches its own strict-inequality (!==) violation probe — the gate is broken (anti-vacuity)" >&2
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

# Second gate: an edition switch with no exhaustive default silently drops an
# unrecognized RulesEdition member into whatever runs after the switch — no
# throw, no compile-time `never` check. Brace-depth counting (not a fixed
# `/^}/` range) is required because every real switch(edition) body nests
# braces of its own (a multi-statement `case` block, PHB citation comments,
# etc.) — see conditionDefinition.
# Known limitation: counts `{`/`}` characters textually, so a brace inside a
# string or comment within the switch body would miscount — no real
# switch(edition) body does this today.
# Matches the generic "switch (...)" head only — the word-bound edition check
# below runs on the extracted head text, where `^`/`$` correctly anchor to
# that substring instead of the whole line. A bare substring match here would
# false-fire on `switch (expeditionPhase)` (#1980).
# Double-backslashed: awk's -v assignment runs one pass of string-escape processing before the
# value becomes a regexp, collapsing a single \( to a bare ( (a GROUP, not a literal paren) — the
# exact bug #1980 hit in subclassGateLevel's own comment, where the resulting "any characters"
# regexp matched a plain-English "switch" mention and threw off the brace-depth count downstream.
SWITCH_HEAD_PATTERN='switch[[:space:]]*\\([^)]*\\)'

# One shared awk program for both the self-test probes (fed via stdin) and
# the real multi-file scan below — FNR==1 resets state per file so a switch
# straddling a file's end can never leak into the next file's count.
switch_default_scan() {
  awk -v pat="$SWITCH_HEAD_PATTERN" '
    function is_edition_switch(line,    head) {
      if (match(line, pat) == 0) return 0
      head = substr(line, RSTART, RLENGTH)
      return (head ~ /(^|[^A-Za-z])(edition|rulesEdition)([^A-Za-z]|$)/)
    }
    FNR == 1 { in_sw = 0; depth = 0; has_default = 0 }
    {
      if (!in_sw && is_edition_switch($0)) { in_sw = 1; depth = 0; has_default = 0; start = FNR }
      if (in_sw) {
        # depth == 1 means this default: belongs to the switch(edition) body itself, not to a
        # nested switch inside one of its case bodies (#1980) — a nested switch with its own
        # default would otherwise satisfy this scan while the outer edition switch stays inexhaustive.
        if (depth == 1 && $0 ~ /^[[:space:]]*default:/) has_default = 1
        n = length($0)
        for (i = 1; i <= n; i++) {
          c = substr($0, i, 1)
          if (c == "{") depth++
          else if (c == "}") {
            depth--
            if (depth == 0) {
              if (!has_default) printf "%s:%d\n", FILENAME, start
              in_sw = 0
            }
          }
        }
      }
    }
  ' "$@"
}

missing_default_probe=$(printf '%s\n' 'switch (edition) {' '  case "EDITION_2014": return 1;' '}' | switch_default_scan)
if [ -z "$missing_default_probe" ]; then
  echo "error: check-edition-branching.sh's switch-default scan did not fire on a switch (edition) with no default — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
has_default_probe=$(printf '%s\n' 'switch (edition) {' '  case "EDITION_2014": return 1;' '  default: { const x: never = edition; throw new Error("x"); }' '}' | switch_default_scan)
if [ -n "$has_default_probe" ]; then
  echo "error: check-edition-branching.sh's switch-default scan fired on a switch (edition) WITH an exhaustive default — false positive (anti-vacuity)" >&2
  exit 1
fi
fake_default_string_probe=$(printf '%s\n' 'switch (edition) {' '  case "EDITION_2014": throw new Error("default: x");' '}' | switch_default_scan)
if [ -z "$fake_default_string_probe" ]; then
  echo "error: check-edition-branching.sh's switch-default scan treats a string literal containing 'default:' inside a case body as an exhaustive default — the gate is broken (anti-vacuity)" >&2
  exit 1
fi
non_edition_switch_probe=$(printf '%s\n' 'switch (expeditionPhase) {' '  case "FIRST": return 1;' '}' | switch_default_scan)
if [ -n "$non_edition_switch_probe" ]; then
  echo "error: check-edition-branching.sh's switch-default scan fired on switch (expeditionPhase) — substring match on 'edition' instead of a word boundary (anti-vacuity)" >&2
  exit 1
fi
nested_switch_default_probe=$(printf '%s\n' \
  'switch (edition) {' \
  '  case "EDITION_2014": {' \
  '    switch (x) {' \
  '      default: break;' \
  '    }' \
  '    return 1;' \
  '  }' \
  '}' | switch_default_scan)
if [ -z "$nested_switch_default_probe" ]; then
  echo "error: check-edition-branching.sh's switch-default scan did not fire on an edition switch whose only default: belongs to a NESTED switch inside a case body — depth tracking is broken (anti-vacuity)" >&2
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

# Paths go through positional params, not an unquoted $FILES word-split, so a
# path containing a space stays one file (#1980).
tmp_file_list=$(mktemp)
trap 'rm -f "$tmp_file_list"' EXIT
printf '%s\n' "$FILES" > "$tmp_file_list"
set --
while IFS= read -r f; do
  [ -n "$f" ] || continue
  set -- "$@" "$f"
done < "$tmp_file_list"

bad=""
for f in "$@"; do
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
  echo "error: edition rule branching with a binary ===/!==/==/!= comparison instead of a total mapping (#1978/#1527):" >&2
  printf '%s' "$bad" >&2
  echo "Rewrite as a \`switch (edition)\` with an assertNever-typed default (or a Record<RulesEdition, …> lookup) — see subclassGateLevel (backend/src/lib/leveling/effective-levels.ts) or spellListsFor (backend/src/lib/srd/spellcasting-tables.ts)." >&2
  exit 1
fi

switch_default_bad=$(switch_default_scan "$@")
if [ -n "$switch_default_bad" ]; then
  echo "error: an edition switch with no exhaustive default (#1978):" >&2
  printf '%s\n' "$switch_default_bad" >&2
  echo "Add \`default: { const exhaustive: never = edition; throw new Error(...); }\` — see conditionDefinition (backend/src/lib/srd/condition-data.ts)." >&2
  exit 1
fi
