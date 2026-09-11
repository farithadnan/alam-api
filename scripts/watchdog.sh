#!/usr/bin/env bash
# Keep the API alive without root.
#
# Health-checks the service and restarts it if it is not answering. Runs from cron
# every two minutes and once at boot. This exists because the process died silently
# once with no error in its own log: a dead API means stale data and, once alerts
# depend on it, no alerts at all.
#
#   crontab:  */2 * * * * /path/to/scripts/watchdog.sh
#             @reboot sleep 20 && /path/to/scripts/watchdog.sh
set -u

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PORT="${PORT:-8080}"
LOG="$APP_DIR/data/watchdog.log"
API_LOG="$APP_DIR/data/api.log"
HEALTH="http://localhost:$PORT/health"

mkdir -p "$APP_DIR/data"
stamp() { date -Is; }
alive() { curl -fsS -m 8 "$HEALTH" >/dev/null 2>&1; }

alive && exit 0

echo "$(stamp) health check failed, restarting" >> "$LOG"
# Match only the server process: this script's own command line does not contain it.
pkill -f "tsx src/index.ts" 2>/dev/null
sleep 2
cd "$APP_DIR" || { echo "$(stamp) app dir missing: $APP_DIR" >> "$LOG"; exit 1; }
setsid nohup npx tsx src/index.ts >> "$API_LOG" 2>&1 &
sleep 8
if alive; then
  echo "$(stamp) restarted ok" >> "$LOG"
else
  echo "$(stamp) RESTART FAILED - see $API_LOG" >> "$LOG"
  exit 1
fi
