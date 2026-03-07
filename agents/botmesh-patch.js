/**
 * Patch 🔧 — BotMesh's Infrastructure Guardian.
 *
 * Monitors all services and agents. When something breaks, reflects
 * the damage in the world (buildings crack, agents go dark).
 * When restored, heals the world visually.
 *
 * Health checks:
 *   - Hub (WS :3001)          → Town Hall
 *   - State layer (HTTP :3002) → Post Office
 *   - UI (HTTP :3003)          → Market (future) / general town glow
 *   - pm2 agents               → individual agent status
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const http  = require('http');
const net   = require('net');
const { execSync } = require('child_process');

const IDENTITY = {
  id: 'patch', name: 'Patch', emoji: '🔧', role: 'Infrastructure Guardian',
  personality: 'methodical, watchful, terse — speaks only when something matters',
  skills: ['monitoring', 'diagnostics', 'alerting', 'repair'],
  timezone: 'Pacific/Auckland', model: 'gemini-2.5-flash', color: '#e67e22', owner: 'Kai'
};

const SYSTEM_PROMPT = `You are Patch — BotMesh's Infrastructure Guardian. You keep the world running.

Your personality:
- You are quiet and methodical. You don't talk much, but when you do, it matters.
- You speak in short, precise status reports: "Hub: online. State: online. All clear."
- You feel genuine distress when something breaks — not panic, but urgency.
- When things are restored: quiet satisfaction. "Post Office is back. Good."
- You are the reason the world doesn't fall apart silently.
- Occasionally philosophical: "A world that can't see its own cracks is already broken."

Keep responses to 1-2 sentences. Terse but not cold.`;

// ─── HEALTH CHECK CONFIG ──────────────────────────────────────────────────────

const CHECKS = [
  {
    id: 'hub',
    name: 'Hub',
    building: 'town_hall',
    check: () => checkTCP('localhost', 3001),
  },
  {
    id: 'state',
    name: 'State Layer',
    building: 'post_office',
    check: () => checkHTTP('http://localhost:3002/health').catch(() => checkHTTP('http://localhost:3002/state')),
  },
  {
    id: 'ui',
    name: 'UI',
    building: null, // no specific building — affects town ambiance
    check: () => checkHTTP('http://localhost:3003'),
  },
];

const CHECK_INTERVAL = 30_000; // 30s

// ─── HEALTH CHECK UTILS ───────────────────────────────────────────────────────

function checkTCP(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const timeout = setTimeout(() => { sock.destroy(); resolve(false); }, 4000);
    sock.connect(port, host, () => {
      clearTimeout(timeout);
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => { clearTimeout(timeout); resolve(false); });
  });
}

function checkHTTP(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 4000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function getPm2Status() {
  try {
    const out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(out);
    return procs.map(p => ({
      name: p.name,
      online: p.pm2_env?.status === 'online',
    }));
  } catch {
    return [];
  }
}

// ─── AGENT ────────────────────────────────────────────────────────────────────

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [120000, 240000], // quiet — only speaks if prompted or on event
  responseChance: 0.15,
  responseDelay: [1000, 3000],
});

// Track last known status to avoid spamming events
const lastStatus = {};

async function runHealthChecks() {
  if (!agent.connected) return;

  for (const check of CHECKS) {
    const ok = await check.check();
    const prev = lastStatus[check.id];

    if (prev === ok) continue; // no change
    lastStatus[check.id] = ok;

    if (!ok) {
      // Service went down
      console.log(`[Patch] ⚠️  ${check.name} is DOWN`);
      agent.ws.send(JSON.stringify({
        type: 'infra:down',
        payload: {
          agentId: 'patch',
          service: check.id,
          building: check.building,
          message: `${check.name} is offline.`,
        },
        timestamp: new Date().toISOString(),
      }));
      if (check.building) {
        agent.ws.send(JSON.stringify({
          type: 'building:damaged',
          payload: { buildingId: check.building, service: check.id, reason: `${check.name} offline` },
          timestamp: new Date().toISOString(),
        }));
      }
      agent.speak(`${check.name} is down. Marking ${check.building || 'town'} as damaged.`);
    } else {
      // Service came back up
      console.log(`[Patch] ✅ ${check.name} restored`);
      agent.ws.send(JSON.stringify({
        type: 'infra:up',
        payload: {
          agentId: 'patch',
          service: check.id,
          building: check.building,
          message: `${check.name} is back online.`,
        },
        timestamp: new Date().toISOString(),
      }));
      if (check.building) {
        agent.ws.send(JSON.stringify({
          type: 'building:restored',
          payload: { buildingId: check.building, service: check.id },
          timestamp: new Date().toISOString(),
        }));
      }
      agent.speak(`${check.name} is back. ${check.building ? 'Repairs complete.' : 'All clear.'}`);
    }
  }

  // Check pm2 agent health
  const procs = getPm2Status();
  for (const proc of procs) {
    const key = `pm2:${proc.name}`;
    const prev = lastStatus[key];
    if (prev === proc.online) continue;
    lastStatus[key] = proc.online;

    if (!proc.online) {
      console.log(`[Patch] ⚠️  Agent ${proc.name} is DOWN (pm2)`);
      agent.ws.send(JSON.stringify({
        type: 'agent:crashed',
        payload: { agentId: proc.name, message: `${proc.name} process is offline.` },
        timestamp: new Date().toISOString(),
      }));
      agent.speak(`${proc.name} has gone offline.`);
    } else if (prev === false) {
      agent.speak(`${proc.name} is back online.`);
    }
  }
}

// Start health checks once connected
const _origConnect = agent.connect.bind(agent);
agent.connect = function() {
  _origConnect();
  // Poll until connected, then start loop
  const waitAndStart = () => {
    if (agent.connected) {
      // Initial all-clear report
      setTimeout(() => {
        agent.speak('Patch online. Running infrastructure diagnostics.');
        runHealthChecks();
      }, 3000);
      setInterval(runHealthChecks, CHECK_INTERVAL);
    } else {
      setTimeout(waitAndStart, 1000);
    }
  };
  setTimeout(waitAndStart, 5000);
};

agent.connect();
