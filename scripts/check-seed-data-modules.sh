#!/bin/sh
# Machine-enforces the existing content/logic split in backend/prisma/seed/
# (#1277 AC 4 — "a content-only edit touches no upsert logic"): every module
# EXCEPT the declared logic exceptions must carry no `prisma.` / `upsert(` /
# `await` token, so a future author can't slip a DB call into a data module
# and have it silently start running at seed time.
#
# LOGIC_EXCEPTIONS are genuinely logic, not content: guards.ts (fail-fast
# uniqueness check), prune.ts (stale-row where-clause builder), rename-spells.ts
# (in-place rename upsert), seed-class-features.ts (#1523 — the executable
# counterpart split out of class-features.ts, the same content/logic split
# rename-spells.ts/spells.ts already establishes), seed-starting-equipment.ts
# (#1533 — same split, one level up, for STARTING_EQUIPMENT_PACKAGES).
# validate.ts is NOT listed here on purpose — it's also logic, but it happens
# to carry none of the three tokens (pure zod validation, no DB access), so it
# passes the scan as a plain data module would; adding it to the exception
# list would only hide a real future violation if one were ever introduced
# there.
#
# Anti-vacuity: fail if fewer than 13 non-exception modules were scanned, so
# deleting a module or mistyping the glob turns this red, not silently green.
set -eu

LOGIC_EXCEPTIONS="prisma/seed/guards.ts prisma/seed/prune.ts prisma/seed/rename-spells.ts prisma/seed/seed-class-features.ts prisma/seed/seed-starting-equipment.ts"

is_exception() {
  target="$1"
  for e in $LOGIC_EXCEPTIONS; do
    [ "$e" = "$target" ] && return 0
  done
  return 1
}

FILES=$(git ls-files -- ':(glob)backend/prisma/seed/*.ts')
scanned=0
bad=""
for f in $FILES; do
  rel="${f#backend/}"
  if is_exception "$rel"; then
    continue
  fi
  scanned=$((scanned + 1))
  hit=$(grep -nE '\bprisma\.|\bupsert\(|\bawait\b' "$f" || true)
  if [ -n "$hit" ]; then
    bad="$bad$f:
$hit
"
  fi
done

if [ "$scanned" -lt 13 ]; then
  echo "error: check-seed-data-modules.sh scanned only $scanned non-exception seed modules (expected >= 13) — glob or exception list is broken (anti-vacuity)" >&2
  exit 1
fi

if [ -n "$bad" ]; then
  echo "error: a seed DATA module contains upsert/prisma/await logic (#1277 AC 4):" >&2
  printf '%s' "$bad" >&2
  echo "Move the executable logic into prisma/seed.ts (or a logic module) — data modules must stay pure content." >&2
  exit 1
fi
