#!/usr/bin/env bash
# Spill demo launcher: starts everything fresh and prints a pass/fail checklist.
#   ./start-demo.sh         start everything
#   ./start-demo.sh stop    stop what this script started
# Lives in the repo root (the folder that contains radio/). Run it from anywhere.
# Supported: Linux, macOS, and Windows through WSL. It never prints secrets from .env.
# Ports, container prefix and web port come from radio/.env (and WEB_PORT in the environment).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RADIO="$ROOT/radio"

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    echo "Unsupported system: $(uname -s)."
    echo "This script runs on Linux, macOS, or Windows through WSL (see SETUP.md)."
    echo "Run it inside a WSL terminal, not Git Bash or PowerShell."
    exit 1 ;;
esac
if [ -n "${WSL_DISTRO_NAME:-}" ] && [ "${ROOT#/mnt/}" != "$ROOT" ]; then
  echo "Note: the project is on the Windows drive ($ROOT). Installs and file watching are slow and flaky there;"
  echo "      clone it inside the WSL filesystem (for example ~/Spill) instead."
fi

# Read one KEY from radio/.env without sourcing it (so nothing is executed or printed).
envval() {
  local v
  v="$(grep -E "^$1=" "$RADIO/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
  if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "${2:-}"; fi
}

PIDFILE="${SPILL_PIDFILE:-/tmp/spill-demo-$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1).pids}"
OK=0
BAD=0
pass() { echo "  [PASS] $1"; OK=$((OK + 1)); }
fail() { echo "  [FAIL] $1"; BAD=$((BAD + 1)); }
info() { echo "         $1"; }

# Directory a process was started from (Linux /proc, macOS lsof). Used so we only ever touch OUR processes.
cwd_of() {
  if [ -d "/proc/$1" ]; then readlink "/proc/$1/cwd" 2>/dev/null
  else lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1; fi
}
# PIDs matching a command-line pattern whose working directory is inside this checkout.
mine() {
  local pid dir
  for pid in $(pgrep -f "$1" 2>/dev/null); do
    [ "$pid" = "$$" ] && continue
    dir="$(cwd_of "$pid")"
    case "$dir" in "$ROOT"|"$ROOT"/*) echo "$pid" ;; esac
  done
}

stop_all() {
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do
      [ -n "$pid" ] || continue
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null
    done < "$PIDFILE"
    rm -f "$PIDFILE"
  fi
  # Leftovers from manual runs or from a launch without setsid. These cause duplicate audio and a flipping page.
  local p
  for p in "tsx watch" "tsx src/main.ts" "vite" "ffmpeg.*icecast"; do
    for pid in $(mine "$p"); do kill "$pid" 2>/dev/null; done
  done
  sleep 1
}

if [ "${1:-}" = "stop" ]; then
  stop_all
  echo "Stopped API, worker, front end and encoder started from $ROOT. Docker containers left running."
  exit 0
fi

echo "== Spill demo launcher =="
[ -f "$RADIO/.env" ] || { echo "Missing $RADIO/.env. Copy radio/.env.example to radio/.env and edit it (see SETUP.md)."; exit 1; }

WEB_PORT="${WEB_PORT:-5173}"
API_PORT="$(envval API_PORT 4000)"
ICE_PORT="$(envval ICECAST_PORT 8000)"
RELAY_PORT="$(envval RELAY_PORT 7777)"
PREFIX="$(envval SPILL_CONTAINER_PREFIX spill)"
API="http://localhost:$API_PORT"
ICE="http://localhost:$ICE_PORT"
MOUNT="$(envval ICECAST_MOUNT /live)"
CONTAINERS=("$PREFIX-postgres" "$PREFIX-redis" "$PREFIX-icecast" "$PREFIX-relay")

echo "-- Prerequisites"
for cmd in docker node curl pnpm dotenv ffmpeg; do
  if command -v "$cmd" >/dev/null 2>&1; then pass "$cmd found"; else fail "$cmd not found (install it, then rerun; see SETUP.md)"; fi
done
[ "$BAD" -gt 0 ] && { echo "Fix the failures above and rerun."; exit 1; }
LAUNCH=(nohup)
if command -v setsid >/dev/null 2>&1; then LAUNCH=(setsid nohup); else info "setsid not found (normal on macOS): using nohup"; fi

echo "-- Stopping old copies (prevents duplicate workers)"
stop_all
pass "old API/worker/front end/encoder processes from this folder stopped"

echo "-- Docker containers"
for c in "${CONTAINERS[@]}"; do
  if docker start "$c" >/dev/null 2>&1; then pass "$c running"
  else fail "$c could not start. Create the containers once: cd radio && docker compose -f docker-compose.dev.yml up -d"; fi
done

echo "-- Starting API and worker"
cd "$RADIO" || exit 1
: > "$PIDFILE"
"${LAUNCH[@]}" dotenv -e .env -- pnpm dev:api > tmp_api.log 2>&1 &
echo $! >> "$PIDFILE"
"${LAUNCH[@]}" dotenv -e .env -- pnpm --filter @blocktek/worker dev > tmp_worker.log 2>&1 &
echo $! >> "$PIDFILE"

echo "-- Building and starting the front end (steadier than the dev server)"
cd "$ROOT" || exit 1
# Vite bakes these in at build time. Defaults match the ports in radio/.env.
export VITE_RADIO_API_URL="${VITE_RADIO_API_URL:-$API}"
export VITE_RADIO_STREAM_URL="${VITE_RADIO_STREAM_URL:-$ICE$MOUNT}"
export VITE_NOSTR_RELAYS="${VITE_NOSTR_RELAYS:-ws://localhost:$RELAY_PORT}"
if pnpm build > "$RADIO/tmp_web_build.log" 2>&1; then
  pass "front end built"
  "${LAUNCH[@]}" pnpm exec vite preview --port "$WEB_PORT" --strictPort > "$RADIO/tmp_web.log" 2>&1 &
  echo $! >> "$PIDFILE"
else
  fail "front end build failed (see radio/tmp_web_build.log); falling back to the dev server"
  "${LAUNCH[@]}" pnpm exec vite --port "$WEB_PORT" --strictPort > "$RADIO/tmp_web.log" 2>&1 &
  echo $! >> "$PIDFILE"
fi

echo "-- Waiting for services (up to 60 seconds)"
for i in $(seq 1 30); do
  if curl -s "$API/api/v1/health" | grep -q '"status":"ok"' \
     && curl -s -o /dev/null "http://localhost:$WEB_PORT/" \
     && curl -s "$ICE/status-json.xsl" | grep -q "$MOUNT"; then
    break
  fi
  sleep 2
done

echo "-- Checks"
cd "$RADIO" || exit 1

curl -s "$API/api/v1/health" | grep -q '"status":"ok"' && pass "API healthy" || fail "API not healthy (radio/tmp_api.log)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$ICE/")" = "200" ] && pass "Icecast answering" || fail "Icecast not answering on $ICE_PORT"
curl -s "$ICE/status-json.xsl" | grep -q "$MOUNT" && pass "worker is streaming to $MOUNT" || fail "no $MOUNT source (radio/tmp_worker.log)"

ENC=0
for pid in $(mine "ffmpeg.*icecast"); do ENC=$((ENC + 1)); done
if [ "$ENC" = "1" ]; then pass "exactly one encoder is running"
else fail "encoders running: $ENC (should be 1). Run ./start-demo.sh stop, then start again"; fi

curl -s "$API/api/v1/radio/now" | grep -q '"current":{' && pass "radio/now has a current item" || fail "radio/now has no current item"
curl -s -D - -o /dev/null -H "Origin: http://localhost:$WEB_PORT" "$API/api/v1/radio/now" | grep -qi "access-control-allow-origin" \
  && pass "API allows the front end origin (CORS)" || fail "API CORS missing for port $WEB_PORT (add http://localhost:$WEB_PORT to CORS_ORIGINS in radio/.env)"
curl -s -D - -o /dev/null --max-time 2 "$ICE$MOUNT" 2>/dev/null | grep -qi "access-control-allow-origin" \
  && pass "stream sends CORS header (waveform works)" || fail "stream has no CORS header (waveform will be static)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$WEB_PORT/")" = "200" ] && pass "front end up on port $WEB_PORT" || fail "front end not answering on $WEB_PORT"

MEDIA="$(envval MEDIA_ROOT ./media)"
case "$MEDIA" in /*) ;; *) MEDIA="$RADIO/$MEDIA" ;; esac
AUDIO=$(ls "$MEDIA/radio" 2>/dev/null | grep -ciE '\.(mp3|m4a|wav|ogg|webm|aac)$')
TRANS=$(ls "$MEDIA"/radio/*.transcript.json 2>/dev/null | wc -l | tr -d ' ')
[ "$TRANS" -ge 1 ] && pass "transcripts present ($TRANS transcripts, $AUDIO audio files)" || fail "no transcripts in $MEDIA/radio"
[ "$AUDIO" -ne "$TRANS" ] && info "counts differ: files without a manifest entry are skipped on purpose"
MUSIC=$(ls "$MEDIA/music" 2>/dev/null | grep -ciE '\.(mp3|m4a|wav|ogg|opus|flac|aac)$')
[ "$MUSIC" -ge 1 ] && pass "music clips present ($MUSIC)" || fail "$MEDIA/music is empty (no music breaks)"

grep -q '^AI_PROVIDER=groq' .env && pass "AI provider is groq" || fail "AI_PROVIDER is not groq in .env"
[ "$(grep -c '^GROQ_API_KEY=.' .env)" = "1" ] && pass "Groq key is set" || fail "GROQ_API_KEY missing in .env"

RELAY_PORT="$RELAY_PORT" node -e '
const ws = new WebSocket("ws://localhost:" + process.env.RELAY_PORT);
const t = setTimeout(() => process.exit(1), 4000);
ws.onopen = () => { clearTimeout(t); process.exit(0); };
ws.onerror = () => process.exit(1);
' >/dev/null 2>&1 && pass "local Nostr relay reachable (ws://localhost:$RELAY_PORT)" || fail "local Nostr relay not reachable on $RELAY_PORT"

echo
echo "== $OK passed, $BAD failed =="
echo "Open:  http://localhost:$WEB_PORT/radio   and   http://localhost:$WEB_PORT/feed"
echo "Before presenting: press play once on the radio page, test the mic, and keep the laptop plugged in."
echo "Logs:  radio/tmp_api.log  radio/tmp_worker.log  radio/tmp_web.log"
echo "Stop:  ./start-demo.sh stop"
[ "$BAD" -eq 0 ]
