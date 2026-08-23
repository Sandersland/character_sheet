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
# #1223), then NINE (Rogue dropped off too, #1231), now SIX (Cleric, Warlock
# and Wizard dropped off too, #1576, once the seeded CharacterClass.
# subclassLevel gave their 2014 subclass gate a data source that survives the
# module's deletion) — and only ever shrinks. A genuinely new thirteenth
# class's lib/classes/<name>.ts is forced to be classified onto EITHER
# ALL_CLASSES/NOT_YET_MIGRATED or NON_CLASS_MODULES below by the reverse
# completeness check (search "reverse check") — without it, a new file there
# defaults to unscanned, not "migrated": #1532's own arbiter review found this
# guard exiting 0 against a lib/classes/artificer.ts probe file for exactly
# that reason. Cross-linked: #1134 tracks the retab wave itself; #1522 is the
# ClassFeature foundation epic each retab depends on.
set -eu

ALL_CLASSES="barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard"
NOT_YET_MIGRATED="bard druid monk paladin ranger sorcerer"

# Every OTHER backend/src/lib/classes/*.ts file (shared infrastructure, not a
# per-class module) — forced to stay in sync with the tree by the reverse
# check below, which fails loudly the moment a file in that directory is
# neither here nor in ALL_CLASSES, rather than silently scanning it as
# "migrated" (a thirteenth class's module would otherwise land unclassified).
NON_CLASS_MODULES="ability-registry actions activation-requires announce-augmentors arcane-charge assassinate channel-divinity class class-feature-rows class-features disciplines draconic-bloodline feature-rows-select focus-cast hand-of-harm hand-of-ultimate-mercy heightened-focus improved-shadow-step maneuver-effect maneuvers open-hand-technique physicians-touch quivering-palm registry resources resources-state shadow-arts sneak-attack stunning-strike subclass-slug types warrior-of-elements weapon-bond"

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
#   - classes/actions.ts: PERMANENT, but its reason changed shape at #1912
#     (4/4 of epic #1903): every Barbarian/Rogue/Monk DERIVED_ACTIONS row
#     (recklessAttack, cunningAction, fastHands, and the whole 31-row monk
#     block) moved onto seeded ClassFeature rows — the "cunningAction"/
#     "fastHands" PERMANENT-gap ruling this entry used to carry is retired,
#     not merely moved, the same way #1686 retired Rage's own half of the
#     #1223 exemption. What remains is `summonBondedWeapon`'s Eldritch
#     Knight row alone (`grantClass: "fighter"`, `grantSubclassSlugs:
#     ["fighter-eldritch-knight"]`) — sanctioned PERMANENT residency (#1854):
#     its `enabled` reads a synthetic pool built from a LIVE COUNT of
#     `weaponBonded` inventory rows, which no ClassFeature descriptor column
#     can express, so it has no row-driven destination to move to. If a
#     future change ever moves that row too, DERIVED_ACTIONS empties
#     entirely and this entry's own anti-vacuity check (3, below) forces its
#     deletion — never leave it as a stale exemption once its last hit is
#     gone.
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
#   - classes/arcane-charge.ts: PERMANENT (#1910). arcaneChargeAugmentor's
#     appliesTo gate reads the "fighter-eldritch-knight" SUBCLASS_SLUGS
#     identity string (subclass-slug.ts's own PERMANENT entry above) — the
#     exact same string classes/actions.ts's now-deleted withArcaneChargeReminder
#     used to read before #1910 relocated the descriptor into its own file
#     (the registry's per-feature-file convention). Same reasoning as
#     advancement-slots.ts's own entry directly above: a computed rule
#     function keyed off subclass identity + level + edition, never routed
#     through fighter's retired AuthoredFeature/resourceFn machinery.
#   - srd/spellcasting-tables.ts: PERMANENT (#1576, first triggered here —
#     Cleric/Warlock/Wizard are this guard's first MIGRATED classes that are
#     also full/Pact-Magic casters). SPELLCASTING_ABILITY/FULL_CASTER_CLASSES/
#     the slot-progression tables are closed-form 5e RAW (PHB p.114 / Basic
#     Rules), edition-invariant and shared across every caster — never part of
#     any lib/classes/<class>.ts registration or the ClassFeature-row
#     migration, same category as the XP/proficiency tables CLAUDE.md keeps in
#     code where editions agree. Sorcerer's and Druid's own names already sit
#     here unflagged only because those two classes are still NOT_YET_MIGRATED
#     — nothing about this file changed when Cleric/Warlock/Wizard's modules
#     were deleted.
#   - classes/channel-divinity.ts: PERMANENT (#419, first triggered by #1576).
#     CHANNEL_DIVINITY_OPTIONS is the shared Cleric+Paladin Channel Divinity
#     dispatch gate table (class/subclass/level per option) — independent of
#     any lib/classes/<class>.ts registration; Paladin's own "paladin"/"cleric"
#     literals already lived here unflagged (Paladin stays NOT_YET_MIGRATED).
#   - combat/rest.ts: PERMANENT (first triggered by #1576). restoreWarlockPactSlots'
#     `name.toLowerCase() === "warlock"` check is Pact Magic's own short-rest
#     recharge rule (its slots regain differently from every other caster's) —
#     a computed rule function never routed through warlock.ts's
#     AuthoredFeature/resourceFn machinery.
#   - character/character-create.ts: PERMANENT (#1130, first triggered by
#     #1576). MAGIC_INITIATE_CLASS_BY_BACKGROUND is a creation-time snapshot
#     rule (which class's spell list a background's Magic Initiate feat
#     draws from) — independent of any lib/classes/<class>.ts registration.
#   - frontend/src/features/entities/CampaignItemFields.tsx: PERMANENT (first
#     triggered by #1576). "e.g. Wizard" is UI placeholder copy on a free-text
#     prerequisite-value input, not rule code.
#   - frontend/src/lib/spellList.ts: PERMANENT (first triggered by #1576).
#     deriveSpellList's `=== "warlock"` check picks a display LABEL ("Pact
#     Magic" vs. a merged slot block) for a single-class Warlock off the wire's
#     already-server-computed class name — a UI display branch, not a
#     frontend-originated rule (CLAUDE.md).
FILE_ALLOWLIST="backend/src/lib/classes/subclass-slug.ts
backend/src/lib/classes/actions.ts
backend/src/lib/character/serialize/combat.ts
backend/src/lib/srd/armor-class.ts
backend/src/lib/classes/sneak-attack.ts
backend/src/lib/classes/assassinate.ts
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

# check-class-ts-migration.sh's second job (#1903/#1911): actions.ts guards
# TWO growth vectors that reappear class-specific action content the same
# way a MIGRATED class name would, but neither is a class-name literal so
# the scan above is blind to both:
#   1. a new hand-authored DERIVED_ACTIONS row (content-is-data violation —
#      new class actions belong on seeded ClassFeature activation rows, not
#      here).
#   2. a new hardcoded-key `.map()` decorator grafted into the derive
#      pipeline (the shape #1910's announce-augmentor registry replaced
#      withDeflectSpecs/withArcaneChargeReminder with).
# DERIVED_ACTIONS_MAX is a RATCHET, same convention as NOT_YET_MIGRATED
# above (only ever lowered, never raised): 1 is the live count verified at
# HEAD after #1912 moved the 34-row monk/rogue/barbarian residue onto
# ClassFeature rows (was 35 after #1909's 8-row move, 43 before that). The
# one survivor is `summonBondedWeapon` (#1854, sanctioned PERMANENT — see
# its own FILE_ALLOWLIST comment above): no further class action content
# should ever land here again, so 1 is this ratchet's floor, not a waypoint.
DERIVED_ACTIONS_MAX=1

# awk range, same portable shape as the class-name scan above: from the
# array's declaration to its closing `];` — stops at the FIRST such line
# after the start, which is DERIVED_ACTIONS' own closing bracket (actions.ts
# has a second, unrelated `];` further down for a different array).
derived_actions_block=$(awk '/^const DERIVED_ACTIONS: DerivedActionRecord\[\] = \[/,/^\];/' backend/src/lib/classes/actions.ts)
derived_actions_count=$(printf '%s\n' "$derived_actions_block" | grep -c 'key:' || true)

# Anti-vacuity: if the array's own declaration line ever changes shape (a
# rename, a reformat), the awk range silently matches nothing and the count
# reads 0 — that must fail loudly, not read as "0 <= 35, pass" (same
# rationale as anti-vacuity checks 2 and 3 above).
if [ "$derived_actions_count" -lt 1 ]; then
  echo "error: check-class-ts-migration.sh found 0 DERIVED_ACTIONS entries in backend/src/lib/classes/actions.ts — the awk range is broken (anti-vacuity)" >&2
  exit 1
fi

if [ "$derived_actions_count" -gt "$DERIVED_ACTIONS_MAX" ]; then
  echo "error: DERIVED_ACTIONS grew to $derived_actions_count entries, exceeding this script's DERIVED_ACTIONS_MAX ratchet of $DERIVED_ACTIONS_MAX (#1903/#1911)." >&2
  echo "New class actions are authored as seeded ClassFeature activation rows, not DERIVED_ACTIONS TS entries. If this growth is a sanctioned exception, lower is the only direction this ratchet moves — raising it here defeats the point." >&2
  exit 1
fi

# Zero hardcoded-key decorator check (#1903/#1911): after #1910 replaced
# withDeflectSpecs/withArcaneChargeReminder with the announce-augmentor
# registry, neither deriveEntryScopedActions' per-entry pipeline nor
# buildAvailableActionsView's file should ever again compare an action's
# `key` against a literal to decide whether to graft on behavior — that
# per-feature `.map()` decorator shape is exactly what the registry exists
# to replace. A comparison against a variable (e.g. actionGrantLevel's
# `a.key === key` lookup by parameter, elsewhere in actions.ts) is not this
# pattern and is out of scope by construction below, not by allowlist.
KEY_LITERAL_PATTERN='\.key ===|\.key !=='

# Anti-vacuity: prove the pattern itself still matches an obvious decorator
# shape before trusting a zero-hit result from it — a typo'd regex must
# read red, not silently stop matching anything (same rationale as
# anti-vacuity checks 2 and 3 above).
if ! printf '%s\n' 'a.key === "x"' | grep -qE "$KEY_LITERAL_PATTERN"; then
  echo "error: check-class-ts-migration.sh's KEY_LITERAL_PATTERN no longer matches its own probe string — the decorator-check regex is broken (anti-vacuity)" >&2
  exit 1
fi

# Scoped to deriveEntryScopedActions' own function body, not the whole
# file — decorator grafts of this shape live inside its per-entry `.map()`
# chain (the entryActions pipeline), and a whole-file scope would also
# catch actionGrantLevel's unrelated variable comparison further down,
# forcing a needless allowlist entry for a non-violation.
actions_key_hits=$(awk '/^export function deriveEntryScopedActions/,/^}/ { print NR": "$0 }' backend/src/lib/classes/actions.ts | grep -E "$KEY_LITERAL_PATTERN" || true)
# buildAvailableActionsView's whole file, per #1911's scope — the file is
# announce-composition around actions, not a general-purpose module, so a
# stray literal comparison anywhere in it is in scope.
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
