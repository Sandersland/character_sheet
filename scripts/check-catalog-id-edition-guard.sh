#!/bin/sh
# Fail on a client-supplied catalog id (Feat/Subclass/GrantedAbility/Background/
# Action — the five edition-tagged models, #1306) resolved by a bare
# findUnique/findFirst outside the declared allowlist below (#1345). A row
# whose `edition` doesn't match the character's must never be admitted
# silently: four of the seven real call sites were missed by the issue as
# filed, and two of those (resources.ts's learnManeuver/learnSubclassChoice)
# snapshot the wrong rule PERMANENTLY into AdvancementEntry-shaped state — the
# same failure mode the issue described for feats.
#
# ALLOWLIST pairs each real occurrence's `path:symbol` — the enclosing
# top-level declaration — with why it needs no guard here: the eight "guarded"
# sites call crossEditionRejection immediately after the lookup. The two
# exemptions differ in kind: loadManeuver reads an ALREADY-PERSISTED id and
# would falsely reject legitimate state if guarded (its own why-comment — R2
# in the #1345 plan), while pickedGrantSource is exempt by call ordering
# (#1414).
#
# The key is the enclosing symbol, never a line number (#1553): an edit ABOVE
# a lookup — a blank line, a reworded why-comment — must not re-open the
# exemption, because a red guard on a no-op edit is the shape that gets
# --no-verify'd. Only moving the lookup out of its function, renaming that
# function, or deleting it re-opens the exemption, which is exactly the set of
# changes that should. A reason therefore states WHY THE SITE IS SAFE, never
# HOW IT GOT HERE: there is no line for anything to have drifted, so a churn
# note is both false and an invitation to append the next one.
#
# Anti-vacuity: fails if fewer than MIN_OCCURRENCES real occurrences are
# found at all (the glob/pattern broke silently), AND fails if any allowlist
# entry no longer matches a real occurrence — a moved or deleted site can't
# leave a stale exemption behind.
#
# The symbol extractor is deliberately allowed to be crude because it cannot
# degrade quietly: an empty symbol trips the unresolvable check, a wrong one
# stops matching its entry and trips BOTH the unallowed and stale halves, one
# that collapses two sites trips the duplicate-key check, and a pattern that
# stops matching trips MIN_OCCURRENCES. No input yields a key that is both
# wrong and on the allowlist.
set -eu

ALLOWLIST="backend/src/lib/leveling/advancement.ts:resolveCatalogFeat:guarded by crossEditionRejection (Feat, #1345 Chunk 1)
backend/src/lib/classes/class.ts:applySetSubclass:guarded by crossEditionRejection (Subclass, #1345 Chunk 2)
backend/src/lib/character/character-create.ts:resolveSubclass:guarded by crossEditionRejection (Subclass, #1345 Chunk 3)
backend/src/lib/character/character-create.ts:resolveSpeciesOriginFeatGrant:guarded by crossEditionRejection (Feat, #1690, via validateOriginFeatRow)
backend/src/lib/classes/resources.ts:applyLearnManeuverOp:guarded by crossEditionRejection (GrantedAbility maneuver, #1345 Chunk 4)
backend/src/lib/classes/resources.ts:resolveChoiceOption:guarded by crossEditionRejection (GrantedAbility subclass-choice, #1345 Chunk 4)
backend/src/lib/classes/shadow-arts.ts:applyCastShadowArt:guarded by crossEditionRejection (GrantedAbility, #1345 Chunk 5)
backend/src/lib/classes/channel-divinity.ts:resolveChannelDivinityCast:guarded by crossEditionRejection (GrantedAbility, #1345 Chunk 5)
backend/src/lib/classes/maneuvers.ts:loadManeuver:persisted id, deliberately unguarded — see the why-comment at loadManeuver (#1345 R2)
backend/src/lib/classes/disciplines.ts:loadKnownDiscipline:persisted id, deliberately unguarded — same shape as loadManeuver (#1345 R2), see the why-comment at loadKnownDiscipline (#1503)
backend/src/lib/leveling/level-up-transaction.ts:resolvePickedSubclass:guarded by crossEditionRejection (Subclass, #1414)
backend/src/routes/character/level-up.ts:pickedGrantSource:reachable only after resolveLevelUpContext admitted the id — see the why-comment at pickedGrantSource (#1414)
backend/src/routes/catalog/spells.ts:resolveSubclassName:guarded by crossEditionRejection (Subclass, #1825)"

MIN_OCCURRENCES=9
PATTERN='\.(feat|subclass|grantedAbility|background|action)\.(findUnique|findFirst)\('

# --others --exclude-standard alongside --cached so a NEW, not-yet-staged file
# carrying an unguarded lookup is caught at pre-commit rather than after it
# lands — the same reason check-subclass-substring.sh greps --untracked.
# generated/ (the Prisma client) is gitignored, so it's excluded for free.
#
# `|| true` because grep exits 1 when nothing matches, and under `set -e` that
# killed the script right here — leaving the anti-vacuity message below
# unreachable in the one case it exists to explain (red, but silent).
FILES=$(git ls-files --cached --others --exclude-standard -- ':(glob)backend/src/**/*.ts' | grep -v '__tests__/' || true)
FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)
# MUST stay above the awk call: with an empty $FILES, awk gets no file operands
# and reads stdin instead — a hang, not a failure.
if [ "$FILE_COUNT" -eq 0 ]; then
  echo "error: check-catalog-id-edition-guard.sh scanned 0 backend/src files — glob is broken (anti-vacuity)" >&2
  exit 1
fi

# One awk pass emits `path<TAB>symbol<TAB>line` per occurrence. The line is
# carried for error messages ONLY — it is never part of a key (#1553).
#
# PATTERN reaches awk through the environment, not `-v`: `-v` runs escape
# processing over the value, which would strip the backslashes out of `\.` and
# `\(` and silently loosen the pattern (here it breaks the ERE outright).
# Either way PATTERN stays a single source of truth — never retype the regex.
#
# The symbol is the last COLUMN-0 declaration seen, which is what makes the
# extractor hard to fool: every declaration enclosing a lookup here is
# top-level, so a nested arrow function, a callback, an object-literal method
# or a brace inside a string cannot shift the answer. No brace counting, no
# scope tracking.
#
# None of the three declaration rules may `next`: a column-0 declaration whose
# OWN line carries a lookup (`const row = await prisma.feat.findFirst(…)`) would
# then set the symbol and skip the emit rule, dropping the occurrence entirely —
# silent, and below MIN_OCCURRENCES' notice. Falling through keys it on the
# declaration it just named, which is the right answer anyway. The rules are
# mutually exclusive at column 0, so the `next`s bought nothing.
records=$(PATTERN="$PATTERN" awk '
FNR == 1 { sym = "" }   # or a symbol leaks across a file boundary into a file
                        # whose first match precedes any declaration
/^(export[[:blank:]]+)?(default[[:blank:]]+)?(async[[:blank:]]+)?function[[:blank:]]*\*?[[:blank:]]*[A-Za-z_$][A-Za-z0-9_$]*[[:blank:]]*[(<]/ {
  s = $0
  sub(/^(export[[:blank:]]+)?(default[[:blank:]]+)?(async[[:blank:]]+)?function[[:blank:]]*\*?[[:blank:]]*/, "", s)
  sub(/[[:blank:]]*[(<].*$/, "", s)
  sym = s
}
/^(export[[:blank:]]+)?(const|let|var)[[:blank:]]+[A-Za-z_$][A-Za-z0-9_$]*[[:blank:]]*[:=]/ {
  s = $0
  sub(/^(export[[:blank:]]+)?(const|let|var)[[:blank:]]+/, "", s)
  sub(/[[:blank:]]*[:=].*$/, "", s)
  sym = s
}
/^(export[[:blank:]]+)?(default[[:blank:]]+)?(abstract[[:blank:]]+)?class[[:blank:]]+[A-Za-z_$][A-Za-z0-9_$]*/ {
  s = $0
  sub(/^(export[[:blank:]]+)?(default[[:blank:]]+)?(abstract[[:blank:]]+)?class[[:blank:]]+/, "", s)
  sub(/[^A-Za-z0-9_$].*$/, "", s)
  sym = s
}
$0 ~ ENVIRON["PATTERN"] { printf "%s\t%s\t%d\n", FILENAME, sym, FNR }
' $FILES </dev/null)

occurrence_count=$(printf '%s\n' "$records" | grep -c . || true)
if [ "$occurrence_count" -lt "$MIN_OCCURRENCES" ]; then
  echo "error: check-catalog-id-edition-guard.sh found only $occurrence_count catalog-id lookup(s), expected at least $MIN_OCCURRENCES — pattern is broken (anti-vacuity)" >&2
  exit 1
fi

# A lookup sitting above every column-0 declaration in its file has no symbol
# to key on. Keying it on the empty string would build a `path::reason`-shaped
# entry, so fail loudly rather than invent a key (#1553).
unresolved=$(printf '%s\n' "$records" | awk -F'\t' '$2 == "" { printf "  %s line %s\n", $1, $3 }')
if [ -n "$unresolved" ]; then
  echo "error: catalog-id lookup(s) with no enclosing top-level declaration, so scripts/check-catalog-id-edition-guard.sh has no stable symbol to key an ALLOWLIST entry on (#1553):" >&2
  printf '%s\n' "$unresolved" >&2
  echo "Move the lookup inside a named top-level function." >&2
  exit 1
fi

occurrences=$(printf '%s\n' "$records" | awk -F'\t' '{ print $1 ":" $2 }')

# The one property a line number had that a symbol lacks: a line is unique per
# OCCURRENCE, a symbol only per FUNCTION. Without this check a SECOND unguarded
# lookup added inside an already-allowlisted function would inherit the first
# one's exemption and pass silently — the exact hole this guard exists to close
# (#1553).
duplicates=$(printf '%s\n' "$occurrences" | sort | uniq -d)
if [ -n "$duplicates" ]; then
  echo "error: catalog-id lookups sharing one ALLOWLIST key in scripts/check-catalog-id-edition-guard.sh — an exemption covers a FUNCTION, so the extra lookup(s) would be exempted without ever being reviewed (#1553):" >&2
  printf '%s\n' "$duplicates" | while IFS= read -r key; do
    lines=$(printf '%s\n' "$records" | awk -F'\t' -v k="$key" '$1 ":" $2 == k { printf "%s%s", (n++ ? ", " : ""), $3 }')
    echo "  $key (lines $lines)" >&2
  done
  echo "Guard the extra lookup with crossEditionRejection so it needs no exemption, or split the function so each lookup gets its own reviewed entry." >&2
  exit 1
fi

# Every occurrence must be in the allowlist (an un-pinned site is either a new
# unguarded lookup, or a guarded one that needs a new allowlist entry).
#
# The line is reported OUTSIDE the key, in the same `(line N)` shape the
# duplicate-key error uses, so it stays a navigation aid and never looks like
# part of the entry to paste. Pasting it anyway fails loudly rather than
# silently: `path:symbol (line N)` matches no occurrence, so both halves fire.
unallowed=$(printf '%s\n' "$records" | while IFS="$(printf '\t')" read -r path sym line; do
  [ -z "$path" ] && continue
  if ! printf '%s\n' "$ALLOWLIST" | cut -d: -f1,2 | grep -qxF "$path:$sym"; then
    echo "$path:$sym (line $line)"
  fi
done)

# Every allowlist entry must still match a real occurrence (catches a stale
# exemption left behind by a moved, renamed or deleted site).
stale=$(printf '%s\n' "$ALLOWLIST" | while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  path_symbol=$(printf '%s' "$entry" | cut -d: -f1,2)
  if ! printf '%s\n' "$occurrences" | grep -qxF "$path_symbol"; then
    echo "$entry"
  fi
done)

if [ -n "$unallowed" ] || [ -n "$stale" ]; then
  if [ -n "$unallowed" ]; then
    echo "error: catalog-id lookup(s) not covered by the ALLOWLIST in scripts/check-catalog-id-edition-guard.sh (#1345):" >&2
    printf '%s\n' "$unallowed" >&2
    echo "Either guard the lookup with crossEditionRejection (backend/src/lib/rules/catalog-edition.ts) and add an allowlist entry, or add one with a reason if it's genuinely exempt." >&2
  fi
  if [ -n "$stale" ]; then
    echo "error: stale ALLOWLIST entries in scripts/check-catalog-id-edition-guard.sh no longer match a real occurrence — the site moved out of its function, that function was renamed, or the lookup was deleted:" >&2
    printf '%s\n' "$stale" >&2
  fi
  exit 1
fi
