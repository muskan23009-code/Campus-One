#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
startup_lock="/tmp/campus-one-start.lock"
server_lock="/tmp/campus-one-server.lock"
log_file="/tmp/campus-one-dev.log"

cd "$project_root"
exec 9>"$startup_lock"
flock 9

if curl --fail --silent http://127.0.0.1:5173/api/auth/bootstrap-status >/dev/null; then
  printf '%s\n' 'Campus One is already responding on port 5173.'
  exit 0
fi

nohup flock --nonblock "$server_lock" env PORT=5173 npm run dev >>"$log_file" 2>&1 </dev/null 9>&- &
server_pid=$!

for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:5173/api/auth/bootstrap-status >/dev/null; then
    printf '%s\n' 'Campus One is responding on port 5173.'
    exit 0
  fi

  if ! kill -0 "$server_pid" 2>/dev/null; then
    printf '%s\n' 'Campus One failed to start. Recent server output:' >&2
    tail -40 "$log_file" >&2 || true
    exit 1
  fi

  sleep 1
done

printf '%s\n' 'Campus One did not become ready on port 5173 within 60 seconds. Recent server output:' >&2
tail -40 "$log_file" >&2 || true
exit 1
