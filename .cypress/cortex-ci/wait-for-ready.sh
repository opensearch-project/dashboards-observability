#!/usr/bin/env bash
# Block until cortex + alertmanager are ready.
# Total wait budget defaults to 60s; the workflow target is ~30s.
set -euo pipefail

BUDGET="${1:-60}"
deadline=$(( $(date +%s) + BUDGET ))

probe() {
  local name="$1" url="$2" match="${3:-}"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    body=$(curl -sS --max-time 2 "$url" 2>/dev/null || true)
    if [ -n "$match" ]; then
      if echo "$body" | grep -q "$match"; then
        echo "[ready] $name"; return 0
      fi
    elif [ -n "$body" ]; then
      echo "[ready] $name"; return 0
    fi
    sleep 1
  done
  echo "[FAIL] $name not ready within ${BUDGET}s" >&2
  return 1
}

probe cortex       'http://localhost:9090/ready'   'ready' &
probe alertmanager 'http://localhost:9093/-/ready' ''      &
wait
