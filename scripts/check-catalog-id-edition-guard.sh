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
# ALLOWLIST pairs each real occurrence's `path:line` with why it needs no
# guard here: the seven "guarded" sites call crossEditionRejection
# (backend/src/lib/rules/catalog-edition.ts) immediately after the lookup;
# the other two are read-only or re-validated downstream and would falsely
# reject legitimate ALREADY-PERSISTED state if guarded (maneuvers.ts's
# loadManeuver carries its own why-comment — R2 in the #1345 plan).
#
# Anti-vacuity: fails if fewer than MIN_OCCURRENCES real occurrences are
# found at all (the glob/pattern broke silently), AND fails if any allowlist
# entry no longer matches a real occurrence — a moved or deleted site can't
# leave a stale exemption pinning a line that no longer exists.
set -eu

ALLOWLIST="backend/src/lib/leveling/advancement.ts:359:guarded by crossEditionRejection (Feat, #1345 Chunk 1)
backend/src/lib/classes/class.ts:89:guarded by crossEditionRejection (Subclass, #1345 Chunk 2)
backend/src/lib/character/character-create.ts:167:guarded by crossEditionRejection (Subclass, #1345 Chunk 3)
backend/src/lib/classes/resources.ts:338:guarded by crossEditionRejection (GrantedAbility maneuver, #1345 Chunk 4)
backend/src/lib/classes/resources.ts:476:guarded by crossEditionRejection (GrantedAbility subclass-choice, #1345 Chunk 4)
backend/src/lib/classes/shadow-arts.ts:95:guarded by crossEditionRejection (GrantedAbility, #1345 Chunk 5)
backend/src/lib/classes/channel-divinity.ts:194:guarded by crossEditionRejection (GrantedAbility, #1345 Chunk 5)
backend/src/lib/classes/maneuvers.ts:99:persisted id, deliberately unguarded — see the why-comment at loadManeuver (#1345 R2)
backend/src/lib/leveling/level-up-transaction.ts:138:resolves to a name for the pure validator; applySetSubclass re-validates in-tx (#1345 Group 4)
backend/src/routes/character/level-up.ts:58:read-only ?subclassId= plan preview; the commit path (class.ts) rejects (#1345 Group 4)"

MIN_OCCURRENCES=9
PATTERN='\.(feat|subclass|grantedAbility|background|action)\.(findUnique|findFirst)\('

# --others --exclude-standard alongside --cached so a NEW, not-yet-staged file
# carrying an unguarded lookup is caught at pre-commit rather than after it
# lands — the same reason check-subclass-substring.sh greps --untracked.
# generated/ (the Prisma client) is gitignored, so it's excluded for free.
FILES=$(git ls-files --cached --others --exclude-standard -- ':(glob)backend/src/**/*.ts' | grep -v '__tests__/')
FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)
if [ "$FILE_COUNT" -eq 0 ]; then
  echo "error: check-catalog-id-edition-guard.sh scanned 0 backend/src files — glob is broken (anti-vacuity)" >&2
  exit 1
fi

occurrences=""
for f in $FILES; do
  hits=$(grep -nE "$PATTERN" "$f" || true)
  [ -z "$hits" ] && continue
  while IFS= read -r hit; do
    lineno=${hit%%:*}
    occurrences="$occurrences$f:$lineno
"
  done <<HITS
$hits
HITS
done

occurrence_count=$(printf '%s\n' "$occurrences" | grep -c . || true)
if [ "$occurrence_count" -lt "$MIN_OCCURRENCES" ]; then
  echo "error: check-catalog-id-edition-guard.sh found only $occurrence_count catalog-id lookup(s), expected at least $MIN_OCCURRENCES — pattern is broken (anti-vacuity)" >&2
  exit 1
fi

# Every occurrence must be in the allowlist (an un-pinned site is either a new
# unguarded lookup, or a guarded one that needs a new allowlist entry).
unallowed=""
printf '%s\n' "$occurrences" | while IFS= read -r occ; do
  [ -z "$occ" ] && continue
  if ! printf '%s\n' "$ALLOWLIST" | grep -qF "$occ:"; then
    echo "$occ"
  fi
done > /tmp/check-catalog-id-edition-guard.unallowed
unallowed=$(cat /tmp/check-catalog-id-edition-guard.unallowed)
rm -f /tmp/check-catalog-id-edition-guard.unallowed

# Every allowlist entry must still match a real occurrence (catches a stale
# exemption left behind by a moved/deleted/renumbered site).
stale=""
printf '%s\n' "$ALLOWLIST" | while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  path_line=$(printf '%s' "$entry" | cut -d: -f1,2)
  if ! printf '%s\n' "$occurrences" | grep -qxF "$path_line"; then
    echo "$entry"
  fi
done > /tmp/check-catalog-id-edition-guard.stale
stale=$(cat /tmp/check-catalog-id-edition-guard.stale)
rm -f /tmp/check-catalog-id-edition-guard.stale

if [ -n "$unallowed" ] || [ -n "$stale" ]; then
  if [ -n "$unallowed" ]; then
    echo "error: catalog-id lookup(s) not covered by the ALLOWLIST in scripts/check-catalog-id-edition-guard.sh (#1345):" >&2
    printf '%s\n' "$unallowed" >&2
    echo "Either guard the lookup with crossEditionRejection (backend/src/lib/rules/catalog-edition.ts) and add an allowlist entry, or add one with a reason if it's genuinely exempt." >&2
  fi
  if [ -n "$stale" ]; then
    echo "error: stale ALLOWLIST entries in scripts/check-catalog-id-edition-guard.sh no longer match a real occurrence — the site moved, was deleted, or its line number drifted:" >&2
    printf '%s\n' "$stale" >&2
  fi
  exit 1
fi
