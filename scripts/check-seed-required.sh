#!/bin/sh
# Fail unless every boot command that runs `prisma migrate deploy` also runs
# `prisma db seed` (#1277 defect 3). Catalog content (subclasses, spells,
# feats, packs, …) lives in seed rows, not migrations — see
# docs/deployment.md, "Catalog content ships in the seed, not in migrations".
# A fresh database that only migrated (never seeded) type-checks fine and
# 500s at runtime the moment a route reads a catalog row (#1370's lesson,
# generalized): this is the boot-contract half of that guarantee.
#
# railway.json is in scope alongside the Dockerfiles because Railway's
# preDeployCommand is a REAL boot path — it applies migrations before the new
# version is allowed to serve (#1455). Gating only container CMDs would leave
# the deployment path this repo actually ships through outside the invariant.
#
# Anti-vacuity: fail unless exactly 3 files matched `prisma migrate deploy` —
# today's Dockerfile / backend/Dockerfile / railway.json. A count drift (a new
# deploy path added a fourth, or one was deleted) means this check's premise
# changed and needs a human look, not a silent pass.
set -eu

MATCHED=0
bad=""
for f in $(git grep -lF 'prisma migrate deploy' -- ':(glob)**/Dockerfile*' 'railway.json'); do
  MATCHED=$((MATCHED + 1))
  # Skip comment lines (leading `#`, optional whitespace) — only a real
  # CMD/RUN instruction invoking migrate deploy needs the db seed twin.
  hit=$(awk '
    /^[ \t]*#/ { next }
    /prisma migrate deploy/ && !/prisma db seed/ { printf "%s:%d: %s\n", FILENAME, FNR, $0 }
  ' "$f")
  if [ -n "$hit" ]; then
    bad="$bad$hit
"
  fi
done

if [ "$MATCHED" -ne 3 ]; then
  echo "error: check-seed-required.sh expected exactly 3 deploy paths running 'prisma migrate deploy', found $MATCHED (anti-vacuity — a deploy path was added or removed; update this script's expectation deliberately)" >&2
  exit 1
fi

if [ -n "$bad" ]; then
  echo "error: a boot command runs 'prisma migrate deploy' without 'prisma db seed' (#1277 defect 3):" >&2
  printf '%s' "$bad" >&2
  echo "Catalog content ships in the seed, not in migrations — see docs/deployment.md." >&2
  echo "Add '&& npx prisma db seed' to the same command." >&2
  exit 1
fi
