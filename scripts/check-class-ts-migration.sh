#!/bin/sh
# Machine-enforces that a MIGRATED class (#1522/#1134 — a class whose 5e
# rules have been retabled from lib/classes/<class>.ts onto seeded
# ClassFeature rows, per #1532's precedent for Fighter) can never quietly
# reappear as a class-specific TS literal somewhere else in the codebase —
# a `lib/srd/` record, a DERIVED_ACTIONS row, an ACTION_RESOLVERS entry, or
# any other class-name-keyed table. Without this, the tenth retab could
# silently reintroduce one and nobody would notice until the twelfth (#1532).
#
# Modelled on check-seed-data-modules.sh (scan-and-report shape) and
# check-catalog-id-edition-guard.sh (allowlist + anti-vacuity pattern) — a
# SHELL SCRIPT, not a vitest test: every existing grep gate of this shape is
# a shell script wired into both lefthook AND CI, and a lefthook-only gate is
# bypassed by the --no-verify this repo's automation routinely uses.
#
# NOT_YET_MIGRATED is the honest, ratcheting tracker of #1134 / epic #1522 —
# an allow-list of what's STILL TS, not of what's forbidden. It started at
# ELEVEN (Fighter deliberately absent — #1532 is what put it under this
# guard's scan in the first place), then TEN (Barbarian dropped off too,
# #1223), now NINE (Rogue dropped off too, #1231) — and only ever shrinks. A
# genuinely new thirteenth class's lib/classes/<name>.ts is forced to be
# classified onto EITHER ALL_CLASSES/NOT_YET_MIGRATED or NON_CLASS_MODULES
# below by the reverse completeness check (search "reverse check") — without
# it, a new file there defaults to unscanned, not "migrated": #1532's own
# arbiter review found this guard exiting 0 against a lib/classes/
# artificer.ts probe file for exactly that reason. Cross-linked: #1134 tracks
# the retab wave itself; #1522 is the ClassFeature foundation epic each retab
# depends on.
set -eu

ALL_CLASSES="barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard"
NOT_YET_MIGRATED="bard cleric druid monk paladin ranger sorcerer warlock wizard"

# Every OTHER backend/src/lib/classes/*.ts file (shared infrastructure, not a
# per-class module) — forced to stay in sync with the tree by the reverse
# check below, which fails loudly the moment a file in that directory is
# neither here nor in ALL_CLASSES, rather than silently scanning it as
# "migrated" (a thirteenth class's module would otherwise land unclassified).
NON_CLASS_MODULES="ability-registry actions activation-requires assassinate channel-divinity class class-feature-rows class-features disciplines draconic-bloodline feature-rows-select focus-cast hand-of-harm hand-of-ultimate-mercy maneuver-effect maneuvers open-hand-technique quivering-palm registry resources resources-state shadow-arts sneak-attack stunning-strike subclass-slug types warrior-of-elements weapon-bond"

# Reverse check: every backend/src/lib/classes/*.ts file's basename must be
# classified as EITHER a class (ALL_CLASSES) or shared infrastructure
# (NON_CLASS_MODULES) — the completeness check just above only validates
# NOT_YET_MIGRATED against ALL_CLASSES, which says nothing about a NEW file
# that never gets added to either list. Without this, a 13th class's module
# silently falls out of NOT_YET_MIGRATED (so it's read as "already migrated")
# and out of this scan entirely (so it's never checked at all).
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

# Pin on FILE EXISTENCE, never a line number — #1553 is the filed defect
# against the catalog-id guard's positional pinning, and this issue's own
# scope block warns not to copy it here. Every NOT_YET_MIGRATED entry must
# still have its lib/classes/<name>.ts, which makes "delete wizard.ts but
# leave wizard on the list" impossible and is what keeps the list a RATCHET.
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
# member (catches a typo), and MIGRATED is exactly the complement — never
# hand-listed separately, so the two can't drift apart from each other.
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

# Same three globs as #1532's DoD clause 2, each for the same reason:
#   - *.test.* / __tests__/**: a fixture that names a class deliberately is
#     doing its job (class-subclasses.fixture.ts names every class on
#     purpose) — already sanctioned.
#   - backend/src/test-support/**: a shared cross-suite fixture (today:
#     fighter-resource-rows.ts) cannot live under any single suite's
#     __tests__/, and *.test-fixture.ts wouldn't match the first glob
#     anyway. ARBITER ruling 2026-07-30 on #1532 — a RULING, not an
#     oversight, so a later reader doesn't "fix" this exclusion away.
# --others --exclude-standard alongside --cached so a new, not-yet-staged
# file carrying the defect is caught at pre-commit, not just after it lands
# (same reason check-enum-narrowing.sh/check-subclass-substring.sh do this).
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

# Each entry carries its own reason; every entry must still produce >=1 hit
# below (anti-vacuity check 3) or it's a stale exemption rotting in place.
#   - subclass-slug.ts: PERMANENT, sanctioned by #1277 (CLAUDE.md: "a pure
#     identity/join table ... carries no rules text, description, or
#     mechanics — only a key that must be type-checked"). After #1546 Part A
#     it also carries subclass REGISTRATION, which strengthens rather than
#     weakens the ruling.
#   - classes/actions.ts: PERMANENT (#1231; was ALSO #1223 until #1686 moved
#     Rage's DERIVED_ACTIONS "rage"/"endRage" pair onto its ClassFeature rows
#     as a "toggle" resolverKind — the buff's resistDamageTypes/rollEffects/
#     tiered modifier now DO have descriptor columns, `effectBuffs`, so that
#     half of the #1223 exemption is retired, not merely moved). What remains
#     is Rogue's own DERIVED_ACTIONS entries — "cunningAction" (grantClass:
#     "rogue") and "fastHands" (grantSubclassSlugs: ["rogue-thief"]) — an
#     action-economy grant with no resource pool of its own, so
#     ClassFeature's descriptor columns have nothing to populate for either.
#     Unlike starting-equipment.ts above, there is no follow-up issue that
#     retires any of this — it is the same permanent gap a class-keyed
#     DERIVED_ACTIONS entry always had, not migration debt.
#     routes/character/actions.ts DROPPED OFF this list in the same #1686
#     diff that deleted its last "barbarian" occurrence
#     (computeRageDamageBonus's classEntries lookup) — the generic toggle
#     dispatcher it replaced that function with reads no class name at all.
#   - character/serialize/combat.ts, srd/armor-class.ts: PERMANENT (#1223).
#     Fast Movement's speed bonus (deriveFastMovement) and Unarmored Defense's
#     AC candidate were never part of barbarian.ts's row-migrated surface —
#     both are computed rule functions keyed off classEntryLevel(row,
#     "barbarian") / a class-name list, independent of the
#     AuthoredFeature/resourceFn machinery #1223 retired. Legitimate rule-
#     function homes under CLAUDE.md ("Rules logic is backend-owned"), not a
#     reappearance of migrated content.
#   - classes/sneak-attack.ts: PERMANENT (#1231). Sneak Attack's Nd6
#     progression, its d6 die source, and its once-per-turn eligibility guard
#     (relocated from lib/classes/rogue.ts in #1231 commit 3, ahead of this
#     guard's own commit 4) are computed rule functions keyed off the rogue
#     class entry's own level — they never went through rogue.ts's
#     AuthoredFeature/resourceFn machinery, and ClassFeature has no descriptor
#     column for a once-per-turn eligibility predicate. Already classified as
#     NON_CLASS_MODULES above (shared infrastructure, not a per-class
#     module); this is its FILE_ALLOWLIST twin, needed now that "rogue"
#     leaves NOT_YET_MIGRATED and this file's own `\brogue\b` hits (the
#     "Only a rogue (level 1+) has Sneak Attack" error string, the
#     `name.toLowerCase() === "rogue"` lookup) would otherwise flag red.
#   - classes/assassinate.ts: PERMANENT (#1526). Same shape as the
#     sneak-attack.ts entry directly above: assassinateEligible is a rule
#     function keyed off the rogue class entry's own level (plus its
#     subclass slug), never routed through rogue.ts's AuthoredFeature/
#     resourceFn machinery — ClassFeature has no descriptor column for a
#     hit-to-crit-conversion eligibility predicate. Its own
#     name.toLowerCase() === "rogue" lookup would otherwise flag red now
#     that "rogue" is MIGRATED.
#   - classes/weapon-bond.ts: PERMANENT (#1854). Eldritch Knight Weapon
#     Bond's eligibility gate (weaponBondEligible/eldritchKnightEntry) is a
#     computed rule function keyed off the fighter class entry's own level —
#     the bonded-weapon selection is InventoryItem state (a boolean column),
#     never ClassFeature/resourceFn machinery, so there is no descriptor
#     column this could have migrated onto. Sneak Attack's own FILE_ALLOWLIST
#     entry above is the direct precedent: same shape (a MIGRATED class name
#     literal — "fighter" — read only to find the right class entry), same
#     reason (NON_CLASS_MODULES above already classifies this file as shared
#     infrastructure, not a per-class module).
#   - srd/advancement-slots.ts: PERMANENT (#1148). fightingStyleFeatSlots'
#     Champion branch reads the "fighter-champion" SUBCLASS_SLUGS identity
#     string (#1277's join-key vocabulary, subclass-slug.ts's own PERMANENT
#     entry above) to gate the Additional Fighting Style second-slot
#     threshold — a computed rule function keyed off subclass identity +
#     level + edition, never routed through fighter's retired
#     AuthoredFeature/resourceFn machinery. ClassFeature has no descriptor
#     column for "how many Fighting Style feat slots this entry carries";
#     the slot-count threshold (7 in 2024, 10 in 2014) is exactly the rule
#     arithmetic CLAUDE.md keeps in lib/, same shape as armor-class.ts and
#     character/serialize/combat.ts above.
FILE_ALLOWLIST="backend/src/lib/classes/subclass-slug.ts
backend/src/lib/classes/actions.ts
backend/src/lib/character/serialize/combat.ts
backend/src/lib/srd/armor-class.ts
backend/src/lib/classes/sneak-attack.ts
backend/src/lib/classes/assassinate.ts
backend/src/lib/classes/weapon-bond.ts
backend/src/lib/srd/advancement-slots.ts"

is_allowlisted_file() {
  target="$1"
  printf '%s\n' "$FILE_ALLOWLIST" | grep -qxF "$target"
}

# Strips a `lineno:content` grep hit down to its content, then reports
# whether that content — after leading whitespace — starts a comment line
# (`//`, `*`, or `/*`). Mirrors the goal grep's `rg -v ':\s*(//|\*|/\*)'`:
# ~60 why-comments legitimately name a class (CLAUDE.md requires them), so
# this guard is about executed rules, never about the word appearing at all.
is_comment_line() {
  content="${1#*:}"
  trimmed=$(printf '%s' "$content" | sed -e 's/^[[:space:]]*//')
  case "$trimmed" in
    "//"* | "*"* | "/*"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Scans $FILES ONCE for a case-insensitive, word-bounded match of any
# $1-listed name, returning `file:line:content` triples with comment lines
# already stripped — one pass over every file rather than one pass per class
# name, since re-walking the whole tree eleven+one times (once per
# NOT_YET_MIGRATED entry, plus once for MIGRATED) measurably slowed this
# down. `set --` re-splits on whitespace (rather than a bare
# `tr ' ' '|'`, which turns MIGRATED's own leading space — from the
# `MIGRATED="$MIGRATED $cls"` accumulator above — into a leading empty
# alternative, `|fighter`, an invalid empty subexpression under -E) before
# joining with `|`.
scan_names() {
  # shellcheck disable=SC2086 -- word-splitting is the point, not a bug
  set -- $1
  pattern=$(IFS='|'; echo "$*")
  # Guard an empty name list (e.g. MIGRATED emptied out by an edit that makes
  # ALL_CLASSES == NOT_YET_MIGRATED): an empty $pattern builds the degenerate
  # regex `\b()\b`, an empty alternation that hangs some grep implementations
  # (measured >2min) instead of failing loudly. No names to scan for means no
  # hits, not a hang.
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
# >=1 non-comment hit under the SAME scan machinery — if the comment-
# stripper or the glob silently broke, every one of these would go to zero
# and this check catches that (a broken scanner reads as red, not green). One
# combined scan, then partitioned per class name in-memory (no re-walk).
not_yet_migrated_hits=$(scan_names "$NOT_YET_MIGRATED")
for cls in $NOT_YET_MIGRATED; do
  cls_count=$(printf '%s\n' "$not_yet_migrated_hits" | grep -icE "\\b${cls}\\b" || true)
  if [ "$cls_count" -lt 1 ]; then
    echo "error: check-class-ts-migration.sh found 0 non-comment hits for NOT_YET_MIGRATED class '$cls' — the scanner is broken (anti-vacuity)" >&2
    exit 1
  fi
done

# The real check: every MIGRATED class name's non-comment hits, outside the
# allow-listed files. `cut` drops the captured line CONTENT (kept above only
# for the per-class partitioning), leaving plain `file:line`.
occurrences=$(scan_names "$MIGRATED" | cut -d: -f1,2)

# Anti-vacuity check 3: each FILE_ALLOWLIST entry must still produce >=1 hit
# — forces the temporary starting-equipment.ts line to be deleted the
# moment #1534 removes STARTING_EQUIPMENT's Fighter key, rather than
# rotting as a permanent-looking exemption.
for allowed in $FILE_ALLOWLIST; do
  allowed_count=$(printf '%s\n' "$occurrences" | grep -c "^${allowed}:" || true)
  if [ "$allowed_count" -lt 1 ]; then
    echo "error: check-class-ts-migration.sh's FILE_ALLOWLIST entry '$allowed' no longer matches any MIGRATED-class occurrence — delete the stale exemption" >&2
    exit 1
  fi
done

# A fixed /tmp path would let two concurrent worktree runs (this guard is
# invoked from both lefthook and CI) clobber each other's scratch file;
# mktemp gives each invocation its own.
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
