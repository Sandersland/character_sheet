#!/bin/sh
# Fail on an enum-narrowing migration with no row handling before the cast (#1373).
#
# Prisma emits `CREATE TYPE "X_new" AS ENUM (...)` only for a value removal or
# rename, never for a widening (verified over 70 `ADD VALUE` migrations in this
# repo, including ones inserting values mid-list in schema.prisma — Prisma
# ignores enum value order). So the swap shape IS the narrowing signal; no
# lint rule inspects migration.sql, and a value-list differ would mean
# replaying 83 migrations' SQL to reconstruct prior enum state for no better
# signal than the shape already gives.
#
# The swap's `USING ("col"::text::"X_new")` cast ABORTS if any row still holds
# a dropped value, and once a migration fails, `migrate deploy` refuses every
# migration behind it (P3009) — see docs/deployment.md, "A failed migration
# blocks every later one". So a swap must have row handling (DELETE/UPDATE)
# above it, or an explicit `-- enum-narrowing-reviewed: <reason>` acknowledging
# no row can hold a dropped value.
#
# ALLOWED is a one-entry allowlist, not an annotation: editing an applied
# migration's SQL changes its checksum and breaks `migrate dev` for everyone
# (the schema engine reports it "was modified after it was applied"), so the
# migration that broke this (20260722050000_retire_disciplines_warrior_of_elements,
# #1373) cannot be fixed in place — only excluded here.
set -eu

ALLOWED="20260722050000_retire_disciplines_warrior_of_elements"

bad=""
for f in $(git grep --untracked -lF '_new" AS ENUM' -- ':(glob)backend/prisma/migrations/**/migration.sql'); do
  skip=0
  for a in $ALLOWED; do
    case "$f" in
      *"/$a/"*) skip=1 ;;
    esac
  done
  if [ "$skip" = 0 ]; then
    hit=$(awk '
      /-- *enum-narrowing-reviewed:[ \t]*[^ \t]/            { ack = 1 }
      toupper($0) ~ /^[ \t]*(DELETE[ \t]+FROM|UPDATE[ \t])/ { handled = 1 }
      # Flags reset after each swap so every swap needs its OWN guard above it:
      # a hand-authored migration narrowing two enums must not let the guard
      # above the first swap silently cover the second. (No apostrophes in this
      # awk program -- it is single-quoted in the surrounding sh.)
      /_new" AS ENUM/ {
        if (!ack && !handled) { printf "%s:%d: unguarded enum swap\n", FILENAME, FNR }
        ack = 0; handled = 0
      }
    ' "$f")
    if [ -n "$hit" ]; then
      bad="$bad$hit
"
    fi
  fi
done

if [ -n "$bad" ]; then
  echo "error: enum-narrowing migration(s) with no row handling before the cast (#1373):" >&2
  printf '%s' "$bad" >&2
  echo "The \`USING (...::text::..._new)\` cast ABORTS on any row still holding a dropped" >&2
  echo "value, and a failed migration blocks every migration behind it (P3009 — see" >&2
  echo "docs/deployment.md). Fix: above the CREATE TYPE, UPDATE those rows to a" >&2
  echo "surviving value or DELETE them. If no row can exist, annotate the migration:" >&2
  echo "  -- enum-narrowing-reviewed: <why no row can hold a dropped value>" >&2
  exit 1
fi
