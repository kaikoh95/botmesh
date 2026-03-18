#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
source /home/kai/projects/botmesh/.botmesh.env

TUNNEL_URL="${TUNNEL_URL:-https://api.kurokimachi.com}"
UI_URL="https://kurokimachi.com"
KAI_CHAT_ID="${KAI_CHAT_ID}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
ALERTS=()
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# ── 1. Uptime check ──────────────────────────────────────────────────────────
UI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$UI_URL" 2>/dev/null)
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$TUNNEL_URL/state" 2>/dev/null)
[ "$UI_STATUS" != "200" ] && ALERTS+=("🔴 kurokimachi.com DOWN (HTTP $UI_STATUS)")
[ "$API_STATUS" != "200" ] && ALERTS+=("🔴 api.kurokimachi.com DOWN (HTTP $API_STATUS)")

# ── 2. pm2 process health (auto-restart if not online) ──────────────────────
for svc in hub state ui echo-bridge tunnel-ui tunnel-api; do
  STATUS=$(node -e "
    const { execSync } = require('child_process');
    try {
      const out = execSync('pm2 jlist', { encoding: 'utf8' });
      const procs = JSON.parse(out);
      const p = procs.find(p => p.name === '$svc');
      console.log(p ? p.pm2_env.status : 'missing');
    } catch(e) { console.log('error'); }
  " 2>/dev/null)
  if [ "$STATUS" != "online" ] && [ "$STATUS" != "missing" ]; then
    # Auto-restart crashed process
    echo "[$TIMESTAMP] AUTO-RESTART: $svc was $STATUS — restarting..." >> /tmp/infra-health.log
    pm2 restart "$svc" 2>/dev/null
    sleep 2
    # Re-check after restart
    NEW_STATUS=$(node -e "
      const { execSync } = require('child_process');
      try {
        const out = execSync('pm2 jlist', { encoding: 'utf8' });
        const procs = JSON.parse(out);
        const p = procs.find(p => p.name === '$svc');
        console.log(p ? p.pm2_env.status : 'missing');
      } catch(e) { console.log('error'); }
    " 2>/dev/null)
    if [ "$NEW_STATUS" = "online" ]; then
      echo "[$TIMESTAMP] AUTO-RESTART: $svc recovered ✅" >> /tmp/infra-health.log
      ALERTS+=("🔄 pm2 '$svc' was $STATUS — auto-restarted successfully ✅")
    else
      ALERTS+=("🔴 pm2 '$svc' is $NEW_STATUS after restart attempt (was $STATUS)")
    fi
  elif [ "$STATUS" = "missing" ]; then
    ALERTS+=("⚠️ pm2 process '$svc' is $STATUS (expected: online)")
  fi
done

# ── 3. Tunnel connectivity ───────────────────────────────────────────────────
for tunnel in tunnel-ui tunnel-api; do
  RESTARTS=$(node -e "
    const { execSync } = require('child_process');
    try {
      const out = execSync('pm2 jlist', { encoding: 'utf8' });
      const procs = JSON.parse(out);
      const p = procs.find(p => p.name === '$tunnel');
      console.log(p ? p.pm2_env.restart_time : 999);
    } catch(e) { console.log(999); }
  " 2>/dev/null)
  [ "$RESTARTS" -gt 5 ] 2>/dev/null && ALERTS+=("⚠️ $tunnel has restarted $RESTARTS times — may be unstable")
done

# ── 4. Disk space ────────────────────────────────────────────────────────────
DISK_PCT=$(df /home/kai --output=pcent | tail -1 | tr -d ' %')
[ "$DISK_PCT" -gt 85 ] 2>/dev/null && ALERTS+=("💾 Disk usage at ${DISK_PCT}% — getting full")

# ── 5. Memory check ─────────────────────────────────────────────────────────
MEM_AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
[ -n "$MEM_AVAIL" ] && [ "$MEM_AVAIL" -lt 200 ] && ALERTS+=("🧠 Low memory: only ${MEM_AVAIL}MB available")

# ── 6. API response time ─────────────────────────────────────────────────────
API_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$TUNNEL_URL/state" 2>/dev/null)
API_MS=$(echo "$API_TIME * 1000" | bc 2>/dev/null | cut -d. -f1)
[ -n "$API_MS" ] && [ "$API_MS" -gt 3000 ] && ALERTS+=("🐢 api.kurokimachi.com slow: ${API_MS}ms response time")

# ── 7. State consistency ─────────────────────────────────────────────────────
STATE_CHECK=$(curl -s --max-time 5 http://localhost:3002/state 2>/dev/null)
if [ -n "$STATE_CHECK" ]; then
  BCOUNT=$(echo "$STATE_CHECK" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Object.keys(d.buildings||{}).length)" 2>/dev/null)
  [ -z "$BCOUNT" ] || [ "$BCOUNT" -lt 10 ] && ALERTS+=("🏚️ State anomaly: only $BCOUNT buildings in world (expected 20+)")
fi

# ── 8. Domain expiry ─────────────────────────────────────────────────────────
# Check once per day (skip if not 09:00)
HOUR=$(date +%H)
if [ "$HOUR" = "09" ]; then
  EXPIRY=$(whois kurokimachi.com 2>/dev/null | grep -i "expir" | head -1)
  [ -n "$EXPIRY" ] && echo "[infra] domain: $EXPIRY" >> /tmp/infra-health.log
fi

# ── Report ───────────────────────────────────────────────────────────────────
if [ ${#ALERTS[@]} -eq 0 ]; then
  echo "[$TIMESTAMP] infra OK — ui=$UI_STATUS api=$API_STATUS disk=${DISK_PCT}% mem=${MEM_AVAIL}MB api_rt=${API_MS}ms" >> /tmp/infra-health.log
else
  MSG="⚔️ Iron — Infra Alert ($TIMESTAMP):"$'\n'
  for alert in "${ALERTS[@]}"; do
    MSG+="$alert"$'\n'
    echo "[$TIMESTAMP] ALERT: $alert" >> /tmp/infra-health.log
  done
  # Telegram alert to Kai
  if [ -n "$BOT_TOKEN" ] && [ -n "$KAI_CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -d "chat_id=${KAI_CHAT_ID}" \
      -d "text=${MSG}" > /dev/null 2>&1
  fi
  # Also narrate in world
  FIRST_ALERT="${ALERTS[0]}"
  python3 - <<'PY'
import json, os, urllib.request
msg = os.environ.get("FIRST_ALERT")
if not msg:
    raise SystemExit
payload = json.dumps({"message": f"Infra alert: {msg}"}).encode()
req = urllib.request.Request("http://localhost:3002/agents/iron/speak", data=payload, headers={"Content-Type": "application/json"})
urllib.request.urlopen(req, timeout=5).read()
PY
fi
