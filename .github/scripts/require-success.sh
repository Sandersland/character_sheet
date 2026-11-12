#!/usr/bin/env bash
# Usage: require-success.sh <job>=<result>...
set -euo pipefail

status=0
for pair in "$@"; do
  echo "$pair"
  [ "${pair#*=}" = success ] || status=1
done
exit $status
