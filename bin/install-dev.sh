#!/usr/bin/env bash
#
# Build Paseo from the currently checked-out branch and install it over
# /Applications/Paseo.app, then relaunch into the new build.
#
# Designed to be run from the Paseo "Scripts" menu. The build step is safe; the
# swap step must outlive Paseo quitting (quitting Paseo stops the daemon that
# launched this script), so the swap runs in a detached session via `setsid`.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

BRANCH="$(git branch --show-current 2>/dev/null || echo '?')"
echo "==> Building Paseo from branch '$BRANCH' (unsigned, no publish)…"
npm run build:desktop -- -c.mac.notarize=false -c.mac.identity=null --publish never

APP="$(find packages/desktop/release -maxdepth 2 -name 'Paseo.app' -type d | head -1)"
if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "!! Build finished but no Paseo.app was produced under packages/desktop/release" >&2
  exit 1
fi
APP="$REPO/$APP"
echo "==> Built: $APP"

if [ ! -w /Applications ]; then
  echo "!! /Applications is not writable by you; run the swap manually with sudo." >&2
  echo "   sudo rm -rf /Applications/Paseo.app && sudo cp -R '$APP' /Applications/" >&2
  exit 1
fi

# The daemon port must be freed before relaunch. The app attaches to whatever
# daemon already holds this port, so if a stale daemon (an old desktop build or
# a `npm run dev` daemon) is still listening, the freshly installed app re-uses
# it and never serves the new server code — new capabilities stay invisible.
# Killing the port holder lets the relaunched app's bundled server claim it.
PORT="${PASEO_PORT:-6767}"

LOG=/tmp/paseo-dev-install.log
echo "==> Build done. Scheduling detached swap + relaunch (Paseo and the daemon on :$PORT will be restarted). Log: $LOG"

# Detached into a new session so it survives Paseo (and this script's daemon)
# quitting. macOS has no `setsid` binary, so we start the session via perl,
# which is always present on macOS.
nohup perl -e 'use POSIX qw(setsid); setsid; exec @ARGV' bash -c '
  set -x
  PORT="'"$PORT"'"
  sleep 2
  osascript -e "quit app \"Paseo\"" 2>/dev/null || true
  for _ in $(seq 1 30); do pgrep -x Paseo >/dev/null 2>&1 || break; sleep 1; done
  # Free the daemon port so the relaunched app binds its own freshly-built server.
  pids="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  for _ in $(seq 1 30); do lsof -ti "tcp:$PORT" >/dev/null 2>&1 || break; sleep 1; done
  pids="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  rm -rf /Applications/Paseo.app
  cp -R "'"$APP"'" /Applications/Paseo.app
  xattr -dr com.apple.quarantine /Applications/Paseo.app 2>/dev/null || true
  open /Applications/Paseo.app
' >"$LOG" 2>&1 &

echo "==> Swap scheduled. Paseo and the daemon on :$PORT will restart on the freshly built version shortly."
