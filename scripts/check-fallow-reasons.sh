#!/bin/sh
# Fail on any fallow suppression missing a `-- <reason>` (#1045).
#
# fallow has no built-in reason requirement, so this is the fallow twin of the
# eslint `require-description` gate: a suppression must justify itself in the diff.
# Runs in BOTH the lefthook pre-commit fallow job and the CI fallow job, so a
# headless/`--no-verify` run can't slip an unexplained suppression past review.
# (eslint-disable* reasons are enforced by eslint itself — see eslint.config.js.)
set -eu

# Tracked source files only — node_modules/dist are gitignored, so git grep skips
# them. A directive is compliant iff it carries a ` -- ` reason after the rule.
# Both forms are gated: `-next-line` for a line-scoped issue, `-file` for a
# whole-file one (an unused-file finding has no line to anchor to).
matches=$(git grep -nE 'fallow-ignore-(next-line|file)' -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.cjs' \
  | grep -v ' -- ' || true)

if [ -n "$matches" ]; then
  echo "error: fallow suppression(s) missing a '-- <reason>' (#1045):" >&2
  echo "$matches" >&2
  echo "Fix: // fallow-ignore-next-line <rule> -- why this suppression is intentional" >&2
  exit 1
fi
