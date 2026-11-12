#!/usr/bin/env bash
# Usage: require-success.sh <name>=<result>...
# Fails unless every needs.<job>.result passed in is "success".
set -euo pipefail

status=0
for pair in "$@"; do
  echo "$pair"
  [ "${pair#*=}" = success ] || status=1
done
exit $status
