#!/bin/sh
# Enforces that a MIGRATED class (one whose 5e rules have been retabled from
# lib/classes/<class>.ts onto seeded ClassFeature rows) never reappears as a
# class-specific TS literal elsewhere in the codebase. NOT_YET_MIGRATED is an
# allow-list of what's STILL TS, not of what's forbidden — it only shrinks.
set -eu

ALL_CLASSES="barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard"
NOT_YET_MIGRATED="druid monk paladin ranger"

# Every OTHER backend/src/lib/classes/*.ts file (shared infrastructure, not a
# per-class module) — kept in sync with the tree by the reverse check below.
NON_CLASS_MODULES="ability-registry actions activation-requires announce-augmentors arcane-charge assassinate channel-divinity class class-feature-rows class-features disciplines draconic-bloodline feature-rows-select focus-cast font-of-magic hand-of-harm hand-of-ultimate-mercy heightened-focus improved-shadow-step maneuver-effect maneuvers open-hand-technique physicians-touch quivering-palm registry resources resources-state shadow-arts sneak-attack stunning-strike subclass-slug types warrior-of-elements weapon-bond"

# Reverse check: every backend/src/lib/classes/*.ts file's basename must be
# classified as EITHER a class (ALL_CLASSES) or shared infrastructure
# (NON_CLASS_MODULES), so a new file never lands unclassified (and therefore unscanned).
unclassified=""
for f in backend/src/lib/classes/*.ts; do
  base=$(basename "$f" .ts)
  case " $ALL_CLASSES " in
    *" $base "*) continue ;;
  esac
  case " $NON_CLASS_MODULES " in
    *" $base "*) continue ;;
  esac
  unclassified="$unclassified $base"
done
if [ -n "$unclassified" ]; then
  echo "error: check-class-ts-migration.sh found backend/src/lib/classes/*.ts file(s) classified as neither a class nor shared infrastructure:$unclassified" >&2
  echo "Add it to ALL_CLASSES (+ NOT_YET_MIGRATED, unless it's already fully row-driven) if it's a new class, or to NON_CLASS_MODULES if it's shared infrastructure." >&2
  exit 1
fi

# Pin on FILE EXISTENCE, never a line number. Every NOT_YET_MIGRATED entry
# must still have its lib/classes/<name>.ts, which keeps the list a ratchet.
missing_module=""
for cls in $NOT_YET_MIGRATED; do
  if [ ! -f "backend/src/lib/classes/${cls}.ts" ]; then
    missing_module="$missing_module $cls"
  fi
done
if [ -n "$missing_module" ]; then
  echo "error: check-class-ts-migration.sh's NOT_YET_MIGRATED names a class with no backend/src/lib/classes/<class>.ts:$missing_module" >&2
  echo "Either the module was deleted and this list should drop the line (a real migration), or it's a typo." >&2
  exit 1
fi

# Completeness: every NOT_YET_MIGRATED entry must be a real ALL_CLASSES
# member (catches a typo), and MIGRATED is exactly the complement.
for cls in $NOT_YET_MIGRATED; do
  case " $ALL_CLASSES " in
    *" $cls "*) ;;
    *)
      echo "error: check-class-ts-migration.sh's NOT_YET_MIGRATED contains '$cls', which is not in ALL_CLASSES" >&2
      exit 1
      ;;
  esac
done

MIGRATED=""
for cls in $ALL_CLASSES; do
  case " $NOT_YET_MIGRATED " in
    *" $cls "*) ;;
    *) MIGRATED="$MIGRATED $cls" ;;
  esac
done

# Excludes *.test.*/__tests__/** (a fixture naming a class on purpose is
# sanctioned) and backend/src/test-support/** (shared cross-suite fixtures).
# --others --exclude-standard alongside --cached so a new, not-yet-staged
# file is caught at pre-commit too.
FILES=$(git ls-files --cached --others --exclude-standard -- \
  ':(glob)backend/src/**/*.ts' ':(glob)backend/src/**/*.tsx' \
  ':(glob)frontend/src/**/*.ts' ':(glob)frontend/src/**/*.tsx' |
  grep -v '\.test\.' | grep -v '__tests__/' | grep -v '^backend/src/test-support/' || true)
FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)

MIN_SCANNED_FILES=200
if [ "$FILE_COUNT" -lt "$MIN_SCANNED_FILES" ]; then
  echo "error: check-class-ts-migration.sh scanned only $FILE_COUNT files (expected >= $MIN_SCANNED_FILES) — glob is broken (anti-vacuity)" >&2
  exit 1
fi

# Each entry below must still produce >=1 hit (anti-vacuity check 3) or it's
# a stale exemption rotting in place.
#   backend/src/lib/classes/subclass-slug.ts              # PERMANENT: pure identity/join table (#1277)
#   backend/src/lib/classes/actions.ts                     # PERMANENT: summonBondedWeapon's live-count pool has no row destination (#1854)
#   backend/src/lib/character/serialize/combat.ts          # PERMANENT: Fast Movement rule fn (#1223)
#   backend/src/lib/srd/armor-class.ts                     # PERMANENT: Unarmored Defense AC rule fn (#1223)
#   backend/src/lib/classes/sneak-attack.ts                # PERMANENT: Sneak Attack Nd6 rule fn (#1231)
#   backend/src/lib/classes/assassinate.ts                 # PERMANENT: Assassinate eligibility rule fn (#1526)
#   backend/src/lib/classes/draconic-bloodline.ts          # PERMANENT: Draconic Resilience/Wings live-play rule fns, scoped to their own class entry (#1122/#1123)
#   backend/src/lib/classes/weapon-bond.ts                 # PERMANENT: Weapon Bond eligibility rule fn (#1854)
#   backend/src/lib/classes/arcane-charge.ts                # PERMANENT: Arcane Charge augmentor rule fn (#1910)
#   backend/src/lib/srd/advancement-slots.ts               # PERMANENT: Fighting Style slot-count rule fn (#1148)
#   backend/src/lib/srd/spellcasting-tables.ts             # EXEMPTED pending #1529 (class-name-keyed spellcasting tables)
#   backend/src/lib/classes/channel-divinity.ts            # PERMANENT: shared Cleric+Paladin dispatch table (#419)
#   backend/src/lib/combat/rest.ts                         # PERMANENT: Pact Magic short-rest recharge rule fn
#   backend/src/lib/character/character-create.ts          # No destination column yet: Magic Initiate class-by-background map
#   frontend/src/features/entities/CampaignItemFields.tsx  # PERMANENT: UI placeholder copy, not rule code
#   frontend/src/lib/spellList.ts                          # Debt: tracked frontend rule mirror (#1383)
FILE_ALLOWLIST="backend/src/lib/classes/subclass-slug.ts
backend/src/lib/classes/actions.ts
backend/src/lib/character/serialize/combat.ts
backend/src/lib/srd/armor-class.ts
backend/src/lib/classes/sneak-attack.ts
backend/src/lib/classes/assassinate.ts
backend/src/lib/classes/draconic-bloodline.ts
backend/src/lib/classes/weapon-bond.ts
backend/src/lib/classes/arcane-charge.ts
backend/src/lib/srd/advancement-slots.ts
backend/src/lib/srd/spellcasting-tables.ts
backend/src/lib/classes/channel-divinity.ts
backend/src/lib/combat/rest.ts
backend/src/lib/character/character-create.ts
frontend/src/features/entities/CampaignItemFields.tsx
frontend/src/lib/spellList.ts"

is_allowlisted_file() {
  target="$1"
  printf '%s\n' "$FILE_ALLOWLIST" | grep -qxF "$target"
}

# A why-comment legitimately naming a class is not a violation.
is_comment_line() {
  content="${1#*:}"
  trimmed=$(printf '%s' "$content" | sed -e 's/^[[:space:]]*//')
  case "$trimmed" in
    "//"* | "*"* | "/*"*) return 0 ;;
    *) return 1 ;;
  esac
}

scan_names() {
  # shellcheck disable=SC2086 -- word-splitting is the point, not a bug
  set -- $1
  pattern=$(IFS='|'; echo "$*")
  # An empty $pattern builds the degenerate regex `\b()\b`, which hangs some
  # grep implementations instead of failing loudly — no names means no hits.
  if [ -z "$pattern" ]; then
    return 0
  fi
  for f in $FILES; do
    hits=$(grep -inE "\\b($pattern)\\b" "$f" || true)
    [ -z "$hits" ] && continue
    printf '%s\n' "$hits" | while IFS= read -r hit; do
      [ -z "$hit" ] && continue
      if ! is_comment_line "$hit"; then
        echo "$f:$hit"
      fi
    done
  done
}

# Anti-vacuity check 2: each NOT_YET_MIGRATED class name must still produce
# >=1 non-comment hit under the same scan machinery, so a broken scanner
# reads as red, not green.
not_yet_migrated_hits=$(scan_names "$NOT_YET_MIGRATED")
for cls in $NOT_YET_MIGRATED; do
  cls_count=$(printf '%s\n' "$not_yet_migrated_hits" | grep -icE "\\b${cls}\\b" || true)
  if [ "$cls_count" -lt 1 ]; then
    echo "error: check-class-ts-migration.sh found 0 non-comment hits for NOT_YET_MIGRATED class '$cls' — the scanner is broken (anti-vacuity)" >&2
    exit 1
  fi
done

occurrences=$(scan_names "$MIGRATED" | cut -d: -f1,2)

# Anti-vacuity check 3: each FILE_ALLOWLIST entry must still produce >=1 hit,
# so a stale exemption is deleted rather than rotting in place.
for allowed in $FILE_ALLOWLIST; do
  allowed_count=$(printf '%s\n' "$occurrences" | grep -c "^${allowed}:" || true)
  if [ "$allowed_count" -lt 1 ]; then
    echo "error: check-class-ts-migration.sh's FILE_ALLOWLIST entry '$allowed' no longer matches any MIGRATED-class occurrence — delete the stale exemption" >&2
    exit 1
  fi
done

# mktemp (not a fixed /tmp path) so two concurrent worktree runs don't clobber each other's scratch file.
bad_file=$(mktemp)
trap 'rm -f "$bad_file"' EXIT
printf '%s\n' "$occurrences" | while IFS= read -r occ; do
  [ -z "$occ" ] && continue
  file=${occ%:*}
  if ! is_allowlisted_file "$file"; then
    echo "$occ"
  fi
done > "$bad_file"
bad=$(cat "$bad_file")

if [ -n "$bad" ]; then
  echo "error: a MIGRATED class ($MIGRATED) name reappeared as class-specific TS outside its data source (#1522/#1134/#1532):" >&2
  printf '%s\n' "$bad" >&2
  echo "Move the content back to seed data (backend/prisma/seed/), or add a reasoned FILE_ALLOWLIST entry if it's a genuine identity/join reference." >&2
  exit 1
fi

# Second job: guards two growth vectors that reappear class-specific action
# content without a class-name literal, so the scan above is blind to both —
# a new hand-authored DERIVED_ACTIONS row, and a new hardcoded-key `.map()`
# decorator grafted into the derive pipeline (the shape the announce-augmentor
# registry replaced).
#
# DERIVED_ACTIONS_MAX is a ratchet (only ever lowered): the one survivor is
# summonBondedWeapon (sanctioned PERMANENT — see its FILE_ALLOWLIST comment above).
DERIVED_ACTIONS_MAX=1

# awk range from the array's declaration to its closing `];` — stops at the
# FIRST such line after the start (a second, unrelated `];` closes another array further down in the same file).
derived_actions_block=$(awk '/^const DERIVED_ACTIONS: DerivedActionRecord\[\] = \[/,/^\];/' backend/src/lib/classes/actions.ts)
derived_actions_count=$(printf '%s\n' "$derived_actions_block" | grep -c 'key:' || true)

# Anti-vacuity: if the array's declaration line ever changes shape, the awk
# range silently matches nothing and the count reads 0 — that must fail loudly.
if [ "$derived_actions_count" -lt 1 ]; then
  echo "error: check-class-ts-migration.sh found 0 DERIVED_ACTIONS entries in backend/src/lib/classes/actions.ts — the awk range is broken (anti-vacuity)" >&2
  exit 1
fi

if [ "$derived_actions_count" -gt "$DERIVED_ACTIONS_MAX" ]; then
  echo "error: DERIVED_ACTIONS grew to $derived_actions_count entries, exceeding this script's DERIVED_ACTIONS_MAX ratchet of $DERIVED_ACTIONS_MAX (#1903/#1911)." >&2
  echo "New class actions are authored as seeded ClassFeature activation rows, not DERIVED_ACTIONS TS entries. If this growth is a sanctioned exception, lower is the only direction this ratchet moves — raising it here defeats the point." >&2
  exit 1
fi

# Zero hardcoded-key decorator check: neither deriveEntryScopedActions' nor
# buildAvailableActionsView's file should compare an action's `key` against a
# literal to decide whether to graft on behavior. A comparison against a
# variable (e.g. actionGrantLevel's own lookup) is a different pattern and out
# of scope by construction below.
KEY_LITERAL_PATTERN='\.key ===|\.key !=='

# Anti-vacuity: prove the pattern still matches an obvious decorator shape before trusting a zero-hit result.
if ! printf '%s\n' 'a.key === "x"' | grep -qE "$KEY_LITERAL_PATTERN"; then
  echo "error: check-class-ts-migration.sh's KEY_LITERAL_PATTERN no longer matches its own probe string — the decorator-check regex is broken (anti-vacuity)" >&2
  exit 1
fi

# Scoped to deriveEntryScopedActions' own function body, not the whole file,
# so actionGrantLevel's unrelated variable comparison further down doesn't force a needless allowlist entry.
actions_key_hits=$(awk '/^export function deriveEntryScopedActions/,/^}/ { print NR": "$0 }' backend/src/lib/classes/actions.ts | grep -E "$KEY_LITERAL_PATTERN" || true)
# buildAvailableActionsView's whole file is in scope — it's announce-composition around actions, not a general-purpose module.
classes_key_hits=$(grep -nE "$KEY_LITERAL_PATTERN" backend/src/lib/character/serialize/classes.ts || true)

key_literal_bad=""
if [ -n "$actions_key_hits" ]; then
  key_literal_bad="$key_literal_bad
$(printf '%s\n' "$actions_key_hits" | while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  is_comment_line "$hit" || echo "backend/src/lib/classes/actions.ts:$hit"
done)"
fi
if [ -n "$classes_key_hits" ]; then
  key_literal_bad="$key_literal_bad
$(printf '%s\n' "$classes_key_hits" | while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  is_comment_line "$hit" || echo "backend/src/lib/character/serialize/classes.ts:$hit"
done)"
fi
key_literal_bad=$(printf '%s\n' "$key_literal_bad" | grep -v '^$' || true)

if [ -n "$key_literal_bad" ]; then
  echo "error: a hardcoded action-key literal comparison (.key === / .key !==) reappeared in deriveEntryScopedActions or serialize/classes.ts (#1903/#1911):" >&2
  printf '%s\n' "$key_literal_bad" >&2
  echo "Register a descriptor in the announce-augmentor registry (announce-augmentors.ts) instead of grafting a per-feature .map() decorator back into the derive pipeline." >&2
  exit 1
fi
