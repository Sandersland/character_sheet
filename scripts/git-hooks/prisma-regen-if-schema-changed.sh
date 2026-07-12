#!/bin/sh
# Regenerate the Prisma client when a ref change moved the schema (#433).
#
# The generated client (backend/src/generated/prisma) is gitignored, so a
# checkout/merge that changes schema.prisma or migrations leaves it stale —
# pre-push tsc then fails with "Property 'x' does not exist on PrismaClient"
# and runtime ops 500 on unknown enum values. This script is the guard both
# lefthook hooks share: it no-ops (fast) unless the schema actually changed
# between the two refs.
#
# Usage:
#   prisma-regen-if-schema-changed.sh checkout <old-ref> <new-ref> <branch-flag>
#   prisma-regen-if-schema-changed.sh merge
set -eu

SCHEMA_PATHS="backend/prisma/schema.prisma backend/prisma/migrations"

mode="${1:-}"
case "$mode" in
  checkout)
    old="${2:-}"; new="${3:-}"; flag="${4:-0}"
    # flag=0 is a file checkout (git checkout -- path); only branch checkouts matter.
    [ "$flag" = "1" ] || exit 0
    # Fresh clone / orphan checkout: no old ref to diff against; the normal
    # bootstrap (docker compose / prisma migrate dev) generates the client.
    case "$old" in *[!0]*) ;; *) exit 0 ;; esac
    ;;
  merge)
    # post-merge runs after a successful merge/pull; ORIG_HEAD is the pre-merge tip.
    old="ORIG_HEAD"; new="HEAD"
    git rev-parse -q --verify ORIG_HEAD >/dev/null || exit 0
    ;;
  *)
    echo "usage: $0 checkout <old> <new> <flag> | merge" >&2
    exit 2
    ;;
esac

# shellcheck disable=SC2086
if git diff --quiet "$old" "$new" -- $SCHEMA_PATHS 2>/dev/null; then
  exit 0
fi

echo "prisma schema changed between refs — regenerating client (npx prisma generate)"
cd "$(git rev-parse --show-toplevel)/backend"

# prisma.config.ts refuses to load without DATABASE_URL (Prisma 7 dropped
# automatic .env loading), but `generate` never connects — source backend/.env
# when present, else satisfy config loading with a placeholder URL.
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi
  if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
    export DATABASE_URL
  fi
fi

npx prisma generate || {
  echo "prisma generate failed — run manually: cd backend && npx prisma generate" >&2
  exit 1
}
