#!/usr/bin/env bash
# Usage: wait-for-urls.sh <seconds> <url>... [-- <log-file>...]
set -uo pipefail

timeout=$1; shift
urls=(); logs=()
while [ $# -gt 0 ] && [ "$1" != -- ]; do urls+=("$1"); shift; done
[ "${1:-}" = -- ] && shift && logs=("$@")

for i in $(seq 1 "$timeout"); do
  ready=true
  for url in "${urls[@]}"; do curl -sf "$url" >/dev/null || { ready=false; break; }; done
  if $ready; then echo "ready after ${i}s: ${urls[*]}"; exit 0; fi
  sleep 1
done
echo "not ready after ${timeout}s: ${urls[*]}"
for log in "${logs[@]}"; do echo "--- $log"; cat "$log" 2>/dev/null || true; done
exit 1
