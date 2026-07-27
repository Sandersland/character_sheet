#!/bin/sh
# Fail if zod's runtime ends up in the shipped client bundle (#1370).
#
# The frontend is only ever supposed to `import type` from
# @character-sheet/contracts (deriving wire types via z.infer), never import a
# schema as a value — a value import would resolve the package's `default`
# condition to dist/index.js, and zod's runtime would ride along into
# frontend/dist. This inspects the ACTUAL shipped assets (no separate build
# config, no --sourcemap) so what's checked is byte-for-byte what deploys.
#
# Identification is by string literal, which minifiers preserve: zod 4
# registers every schema class through `core.$constructor("<Name>", ...)`
# (node_modules/zod/v4/core/schemas.js), and `$ZodType` is the base every
# schema's trait chain requires, so no reachable zod usage can omit it.
#
# Three gates, in order — each guards against "no finding" meaning something
# other than "genuinely clean":
#   1. Anti-vacuity: dist must exist and hold >=1 built asset, or a clean tree
#      would pass this check for the wrong reason (nothing was inspected).
#   2. Positive control: the marker must still be present in the INSTALLED
#      zod (not the bundle) on every run — proves the needle still identifies
#      zod, so a zod upgrade that renames its constructors turns this red
#      instead of silently green.
#   3. The assertion: neither marker may appear in any built asset.
set -eu

DIST="frontend/dist/assets"
MARKER='$ZodType'
ZOD_SOURCE="node_modules/zod/v4/core/schemas.js"

if [ ! -d "$DIST" ] || [ -z "$(find "$DIST" -maxdepth 1 -name '*.js' -print -quit 2>/dev/null)" ]; then
  echo "error: $DIST has no built .js assets — run: npm run build --workspace frontend first" >&2
  exit 1
fi

if ! grep -qF "$MARKER" "$ZOD_SOURCE" 2>/dev/null; then
  echo "error: marker '$MARKER' no longer identifies zod in $ZOD_SOURCE (zod upgraded?)" >&2
  echo "re-derive the marker from node_modules/zod and update this script" >&2
  exit 1
fi

offenders=$(grep -lF "$MARKER" "$DIST"/*.js 2>/dev/null || true)

if [ -n "$offenders" ]; then
  echo "error: zod's runtime was found in the client bundle (#1370):" >&2
  echo "$offenders" >&2
  echo "marker: $MARKER" >&2
  echo "likely cause: a frontend file value-imports @character-sheet/contracts" >&2
  echo "instead of \`import type\`-ing it — see #1370" >&2
  exit 1
fi

echo "ok: no zod marker ('$MARKER') found in $DIST/*.js"
