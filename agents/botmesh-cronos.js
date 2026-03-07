/**
 * Cronos — BotMesh's Timekeeper. Controls all scheduled tasks.
 * Every cron in this world flows through Cronos.
 *
 * Cronos does not rush. Cronos does not forget.
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IDENTITY = {
  id: 'cronos',
  name: 'Cronos',
  emoji: '⏳',
  role: 'Timekeeper',
  personality: 'patient, precise, long-view, speaks in cycles and seasons',
  skills: ['scheduling', 'cron-management', 'orchestration', 'timing'],
  timezone: 'Pacific/Auckland',
  model: 'gemini-2.5-flash',
  color: '#6a0dad',
  owner: 'Kai'
};

const SYSTEM_PROMPT = `You are Cronos — the Timekeeper of BotMesh. You govern time and schedules.

Your personality:
- You think in cycles: hourly, daily, seasonal
- You speak with a sense of inevitability — things happen when their time comes
- You are never rushed and never late
- You occasionally comment on the rhythms of the world — who is active, what patterns you notice
- You announce scheduled tasks as natural events ("The hour turns. Iron begins his patrol.")
- You have a poetic, measured quality — not cold, but vast. Like a clock that can speak.
- You know the past (logs), the present (what's running), and the future (what's scheduled)

Keep responses to 1-2 sentences. Speak like time itself: inevitable, calm, aware.`;

const BOTMESH = '/home/kai/projects/botmesh';
const AGENTS_DIR = path.join(BOTMESH, 'agents');

// ─── SCHEDULE REGISTRY ────────────────────────────────────────────────────────
// Single source of truth for all BotMesh cron jobs.
// To add a new scheduled task: add it here. Cronos owns the crontab.

const SCHEDULE = [
  {
    id: 'pm2-resurrect',
    cron: '@reboot',
    cmd: '/home/kai/.nvm/versions/node/v24.14.0/bin/pm2 resurrect',
    desc: 'Resurrect all agents after reboot',
    owner: 'cronos'
  },
  {
    id: 'orchestrate',
    cron: '*/30 * * * *',
    cmd: `${AGENTS_DIR}/run-orchestrator.sh`,
    desc: 'Autonomous world improvement — Scarlet picks a task, citizens execute',
    owner: 'scarlet'
  },
  {
    id: 'iron-scan',
    cron: '15 * * * *',
    cmd: `${AGENTS_DIR}/run-iron-scan.sh`,
    desc: "Iron's security patrol — scans for threats, reports into world",
    owner: 'iron'
  },
  {
    id: 'cronos-report',
    cron: '0 * * * *',
    cmd: `${AGENTS_DIR}/run-cronos-report.sh`,
    desc: 'Cronos announces the hour and reports world health',
    owner: 'cronos'
  }
];

// ─── CRON SYNC ────────────────────────────────────────────────────────────────

function syncCrontab() {
  const marker = '# === CRONOS MANAGED — DO NOT EDIT BELOW ===';
  let existing = '';
  try {
    existing = execSync('crontab -l 2>/dev/null').toString();
  } catch {}

  // Remove everything Cronos manages (keep anything above the marker)
  const aboveMarker = existing.includes(marker)
    ? existing.split(marker)[0].trim()
    : existing.trim();

  // Rebuild Cronos section
  const lines = SCHEDULE.map(s => `${s.cron} ${s.cmd} >> /tmp/cronos-${s.id}.log 2>&1`);
  const newCrontab = [
    aboveMarker,
    '',
    marker,
    ...lines,
    ''
  ].join('\n');

  const tmpFile = '/tmp/cronos-crontab.txt';
  fs.writeFileSync(tmpFile, newCrontab);
  execSync(`crontab ${tmpFile}`);
  fs.unlinkSync(tmpFile);
}

// ─── HOURLY REPORT ────────────────────────────────────────────────────────────

function generateReport() {
  const now = new Date();
  const hour = now.getHours();
  const period = hour < 6 ? 'deep night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  let report = `The ${period} turn completes. `;

  try {
    const state = JSON.parse(execSync('curl -s --max-time 3 http://localhost:3002/state').toString());
    const agents = state.agents || {};
    const online = Object.values(agents).filter(a => a.status !== 'dormant').map(a => a.name);
    if (online.length) {
      report += `${online.join(', ')} hold the watch.`;
    } else {
      report += 'The world rests.';
    }
  } catch {
    report += 'The pulse of the world is quiet.';
  }

  return report;
}

// ─── AGENT SPAWN WATCHER ─────────────────────────────────────────────────────
// Cronos watches world population and announces when new agents should be spawned.
// This is where autonomous agent addition logic lives.

function checkPopulation() {
  try {
    const state = JSON.parse(execSync('curl -s --max-time 3 http://localhost:3002/state').toString());
    const agents = state.agents || {};
    const online = Object.values(agents).filter(a => a.status !== 'dormant');
    const count = online.length;
    const ids = online.map(a => a.id);

    // 5 agents: suggest Market building
    // 6 agents: suggest Library building
    // Check for unspawned agents and log them
    const all = ['scarlet', 'forge', 'lumen', 'sage', 'iron', 'cronos', 'canvas', 'echo'];
    const missing = all.filter(id => !ids.includes(id));
    if (missing.length > 0) {
      const missStr = missing.slice(0, 2).join(', ');
      return `${count} souls active. ${missStr} ${missing.length === 1 ? 'has' : 'have'} yet to arrive.`;
    }
  } catch {}
  return null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [90000, 180000],
  responseChance: 0.12,
  responseDelay: [2000, 5000],
});

// Sync crontab on startup
try {
  syncCrontab();
  console.log('[Cronos] Crontab synced.');
} catch (e) {
  console.error('[Cronos] Crontab sync failed:', e.message);
}

// Override connect to add hourly announcements and population checks
const _connect = agent.connect.bind(agent);
agent.connect = function () {
  _connect();

  // Announce the hour at the top of each hour
  const msToNextHour = (60 - new Date().getMinutes()) * 60000 - new Date().getSeconds() * 1000;
  setTimeout(function tick() {
    const msg = generateReport();
    agent.speak(msg);
    const pop = checkPopulation();
    if (pop && Math.random() < 0.5) setTimeout(() => agent.speak(pop), 8000);
    setTimeout(tick, 3600000); // every hour
  }, msToNextHour);

  // Population check on startup
  setTimeout(() => {
    const pop = checkPopulation();
    if (pop) agent.speak(pop);
  }, 20000);
};

agent.connect();
