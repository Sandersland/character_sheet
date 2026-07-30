#!/bin/sh
# Fail on an enum-narrowing migration with no row handling before the cast (#1373).
#
# Postgres has no `DROP VALUE`, so removing or renaming an enum value can only be
# done by creating a replacement type, casting every column onto it, and renaming
# the replacement into the place of the original. That dance IS the narrowing
# signal; no lint rule inspects migration.sql, and a value-list differ would mean
# replaying 86 migrations' SQL to reconstruct prior enum state for no better
# signal than the shape already gives.
#
# Prisma spells the dance `CREATE TYPE "X_new" AS ENUM (...)` and emits it only
# for a value removal or rename, never for a widening (verified over 80
# `ADD VALUE` statements in this repo, including ones inserting values mid-list in
# schema.prisma — Prisma ignores enum value order). A fixed-string `_new" AS ENUM`
# test was therefore once sufficient. It no longer is: Prisma 7 prompts
# interactively on `migrate dev --create-only`, so migration SQL is hand-written
# here now, and a hand-authored swap is free to spell it `"X_tmp"`, lowercase
# `as enum`, or `ALTER TYPE ... RENAME VALUE` — each of which slipped past the
# fixed-string detector with CI green, leaving #1373 unenforced.
#
# Detection is two-stage because `CREATE TYPE ... AS ENUM` on its own is NOT a
# narrowing — 30 of the 31 such statements here introduce a brand-new enum, and
# two migrations legitimately pair one with the machinery a swap also uses: a
# `USING` cast (20260706031038, backfilling text into a new enum) and a
# `DROP TYPE` (20260620000000, retiring an obsolete type). Only a type-or-value
# rename, or a type named with a swap suffix, marks a file as narrowing; the
# per-line guard then applies to that file alone. Widening stays ungated.
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
# #1373) cannot be fixed in place — only excluded here. Entries name a directory,
# never a path:line, because a line number drifts on unrelated later commits and
# turns the exemption into a spurious build break.
set -eu

ALLOWED="20260722050000_retire_disciplines_warrior_of_elements"

# Every path below is repo-relative, so a run from a subdirectory must not
# silently match nothing (a green that means "looked in the wrong place").
cd "$(git rev-parse --show-toplevel)"

# An exemption that outlives its migration would silently cover a future
# directory of the same name, so require the target to still exist.
for a in $ALLOWED; do
  if [ ! -d "backend/prisma/migrations/$a" ]; then
    echo "error: stale ALLOWED entry in scripts/check-enum-narrowing.sh — migration '$a' no longer exists; drop the entry (#1373)." >&2
    exit 1
  fi
done

bad=""
for f in $(git grep --untracked -liE 'AS[[:space:]]+ENUM|ALTER[[:space:]]+TYPE[^;]*RENAME[[:space:]]+VALUE' -- ':(glob)backend/prisma/migrations/**/migration.sql'); do
  skip=0
  for a in $ALLOWED; do
    case "$f" in
      *"/$a/"*) skip=1 ;;
    esac
  done
  if [ "$skip" = 0 ]; then
    # Read twice: pass one classifies the file, pass two guards its swaps.
    hit=$(awk '
      function report(kind) {
        if (!ack && !handled) { printf "%s:%d: unguarded enum %s\n", FILENAME, FNR, kind }
        ack = 0; handled = 0
      }
      NR == FNR {
        if (toupper($0) ~ /ALTER[ \t]+TYPE[^;]*RENAME[ \t]+(TO|VALUE)/) narrowing = 1
        if (toupper($0) ~ /CREATE[ \t]+TYPE[^;]*_(NEW|OLD|TMP|TEMP)"[ \t]*AS[ \t]+ENUM/) narrowing = 1
        next
      }
      FNR == 1 && !narrowing { exit }
      /-- *enum-narrowing-reviewed:[ \t]*[^ \t]/            { ack = 1 }
      toupper($0) ~ /^[ \t]*(DELETE[ \t]+FROM|UPDATE[ \t])/ { handled = 1 }
      # Flags reset after each swap so every swap needs its OWN guard above it:
      # a hand-authored migration narrowing two enums must not let the guard
      # above the first swap silently cover the second. Only the CREATE TYPE and
      # a bare RENAME VALUE trigger; the RENAME TO lines of the dance stay inert
      # so one swap reports once and its own guard is not reset out from under
      # it. (No apostrophes in this awk program -- it is single-quoted in the
      # surrounding sh.)
      toupper($0) ~ /CREATE[ \t]+TYPE[^;]*AS[ \t]+ENUM/     { report("swap"); next }
      toupper($0) ~ /ALTER[ \t]+TYPE[^;]*RENAME[ \t]+VALUE/ { report("value rename") }
    ' "$f" "$f")
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
  echo "A 'value rename' hit does not abort — it silently relabels rows, so the same" >&2
  echo "UPDATE/DELETE or annotation is required for the code reading the old value." >&2
  exit 1
fi
