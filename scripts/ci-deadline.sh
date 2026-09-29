#!/usr/bin/env bash
# Run a command into a log, killed at a deadline; shortly before it, list the
# processes the command started. Only that subtree is printed: other command
# lines on the runner carry its credentials and must not reach a public log.
#
# Usage: scripts/ci-deadline.sh <seconds> <log> <command> [args...]
set -uo pipefail

deadline="$1"
log="$2"
shift 2

descendants() {
  local tree="$1" frontier="$1"
  while [ -n "$frontier" ]; do
    frontier=$(ps -eo pid=,ppid= | awk -v parents=" $frontier " \
      'index(parents, " " $2 " ") { printf "%s ", $1 }')
    tree="$tree $frontier"
  done
  echo $tree
}

# Its own session: a group or session kill from inside cannot reach this script.
session=()
command -v setsid >/dev/null && session=(setsid)
"${session[@]}" timeout --signal=TERM --kill-after=30s "$deadline" "$@" >"$log" 2>&1 </dev/null &
runner=$!

snapshot="$log.processes"
(
  sleep $((deadline > 15 ? deadline - 10 : deadline))
  pids=$(descendants "$runner" | tr ' ' ',')
  echo "Processes started by '$*', ${deadline}s deadline nearly reached:"
  ps --forest -o pid,ppid,stat,etime,args -p "$pids"
) >"$snapshot" 2>&1 </dev/null &
watchdog=$!

status=0
wait "$runner" || status=$?
pkill -P "$watchdog" 2>/dev/null
kill "$watchdog" 2>/dev/null
wait "$watchdog" 2>/dev/null

cat "$log"
echo "'$*' exited with status $status"
if [ "$status" -gt 128 ] && [ "$status" -ne 137 ]; then
  echo "::error::'$*' was ended by SIG$(kill -l $((status - 128)))"
fi
if [ "$status" -ne 0 ] && ! grep -q "^test result:" "$log"; then
  echo "::error::the log has no test summary; the test binary likely died. Kernel log:"
  { dmesg 2>/dev/null || sudo -n dmesg 2>/dev/null; } | tail -n 30
fi
if [ "$status" -eq 124 ]; then
  echo "::error::'$*' exceeded its ${deadline}s deadline"
  cat "$snapshot"
elif [ "$status" -eq 137 ]; then
  echo "::error::'$*' was killed by SIGKILL before its ${deadline}s deadline"
  ps -eo pid,ppid,stat,etime,comm --forest
fi
exit "$status"
