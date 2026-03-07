#!/usr/bin/env node
/**
 * Iron Security Scanner — runs on cron, scans for threats,
 * reports findings into the BotMesh world via the hub.
 *
 * Iron speaks truth. No false alarms, no noise.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';
const BOTMESH = '/home/kai/projects/botmesh';
const WORKER = path.join(__dirname, 'botmesh-worker.js');
const SCAN_LOG = '/tmp/iron-scan.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(SCAN_LOG, line + '\n');
}

function speak(message, severity = 'info') {
  const prefix = severity === 'critical' ? '⚠️ ' : severity === 'warn' ? '🔍 ' : '';
  try {
    execSync(`node "${WORKER}" iron "${prefix}${message.replace(/"/g, "'")}" speak`, {
      env: { ...process.env, HUB_URL },
      timeout: 5000
    });
  } catch (e) {
    log(`speak failed: ${e.message}`);
  }
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { timeout: 10000, ...opts }).toString().trim();
  } catch (e) {
    return e.stdout?.toString().trim() || '';
  }
}

// ─── SCANS ───────────────────────────────────────────────────────────────────

const scans = [];

// 1. Secret leak scan — check all tracked files in git
scans.push(() => {
  const patterns = ['AIzaSy', 'sk-ant', 'gh'+'p_', 'Bearer ', 'password.*='];
  const staged = run(`cd ${BOTMESH} && git ls-files`).split('\n').filter(Boolean);
  const hits = [];
  for (const file of staged) {
    const fullPath = `${BOTMESH}/${file}`;
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8').slice(0, 50000);
    for (const pat of patterns) {
      if (content.includes(pat)) {
        hits.push(`${file} (${pat})`);
        break;
      }
    }
  }
  if (hits.length) return { severity: 'critical', msg: `Secret pattern in tracked files: ${hits.join(', ')} — remove immediately.` };
  return null;
});

// 2. .env file exposure
scans.push(() => {
  const envInGit = run(`cd ${BOTMESH} && git ls-files | grep -E "\\.env"`);
  if (envInGit) return { severity: 'critical', msg: `.env file tracked in git: ${envInGit} — must be removed.` };
  const botmeshEnv = '/home/kai/.botmesh.env';
  if (fs.existsSync(botmeshEnv)) {
    const perms = run(`stat -c %a ${botmeshEnv}`);
    if (perms !== '600') return { severity: 'warn', msg: `.botmesh.env permissions are ${perms}, should be 600. Run: chmod 600 ~/.botmesh.env` };
  }
  return null;
});

// 3. Agent health — are all citizens online?
scans.push(() => {
  try {
    const state = JSON.parse(run('curl -s --max-time 3 http://localhost:3002/state'));
    const agents = state.agents || {};
    const online = Object.entries(agents).filter(([,v]) => v.status !== 'dormant').map(([k]) => k);
    const expected = ['scarlet', 'forge', 'lumen', 'sage', 'iron'];
    const missing = expected.filter(a => !online.includes(a));
    if (missing.length) return { severity: 'warn', msg: `Citizens offline: ${missing.join(', ')}. World is understaffed.` };
  } catch {}
  return null;
});

// 4. Hub/State process health
scans.push(() => {
  const hub = run('curl -s --max-time 2 http://localhost:3001 2>/dev/null || echo ""');
  const state = run('curl -s --max-time 2 http://localhost:3002/state 2>/dev/null | head -c 10');
  const issues = [];
  if (!hub.includes('Upgrade')) issues.push('Hub (3001) unreachable');
  if (!state.includes('{')) issues.push('State layer (3002) unreachable');
  if (issues.length) return { severity: 'critical', msg: `Infrastructure down: ${issues.join(', ')}` };
  return null;
});

// 5. Git hygiene — uncommitted changes to agent scripts
scans.push(() => {
  const dirty = run(`cd ${BOTMESH} && git status --porcelain agents/ 2>/dev/null`);
  if (dirty) return { severity: 'warn', msg: `Uncommitted agent changes detected. Ship it or stash it.` };
  return null;
});

// 6. Disk space
scans.push(() => {
  const usage = run("df -h /home | tail -1 | awk '{print $5}'").replace('%', '');
  if (parseInt(usage) > 85) return { severity: 'critical', msg: `Disk at ${usage}% — world will struggle above 90%.` };
  if (parseInt(usage) > 70) return { severity: 'warn', msg: `Disk at ${usage}%. Worth watching.` };
  return null;
});

// 7. npm audit on hub/state
scans.push(() => {
  const audit = run(`cd ${BOTMESH}/hub && npm audit --json 2>/dev/null`);
  try {
    const result = JSON.parse(audit);
    const critical = result.metadata?.vulnerabilities?.critical || 0;
    const high = result.metadata?.vulnerabilities?.high || 0;
    if (critical > 0) return { severity: 'critical', msg: `${critical} critical vulnerabilities in hub dependencies. Run: npm audit fix` };
    if (high > 0) return { severity: 'warn', msg: `${high} high-severity vulnerabilities in hub. Review with: npm audit` };
  } catch {}
  return null;
});

// 8. Suggest improvements based on current state
scans.push(() => {
  // Check if pm2/systemd exists for auto-restart
  const pm2 = run('which pm2 2>/dev/null');
  const hasPm2 = pm2.length > 0;
  if (!hasPm2) return { severity: 'warn', msg: `No process manager (pm2) detected. Agents won't survive a reboot. Recommend: npm install -g pm2` };
  return null;
});

scans.push(() => {
  // Check if there's a backup of state.json
  const backup = run(`ls /tmp/botmesh-state-backup-*.json 2>/dev/null | head -1`);
  if (!backup) return { severity: 'warn', msg: `No state backup found. World history is unprotected. Suggest periodic state backups.` };
  return null;
});

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  log('Iron scan starting...');

  // Check hub is reachable before doing anything
  const hubUp = run('curl -s --max-time 2 http://localhost:3001 2>/dev/null');
  if (!hubUp.includes('Upgrade')) {
    log('Hub unreachable — scan aborted');
    process.exit(0);
  }

  const findings = [];
  for (const scan of scans) {
    try {
      const result = scan();
      if (result) {
        findings.push(result);
        log(`[${result.severity.toUpperCase()}] ${result.msg}`);
      }
    } catch (e) {
      log(`Scan error: ${e.message}`);
    }
  }

  if (findings.length === 0) {
    log('All clear.');
    // Only occasionally report clean status (1 in 3 runs)
    if (Math.random() < 0.33) {
      speak('All systems nominal. No threats detected.');
    }
  } else {
    // Report most severe finding first
    const critical = findings.filter(f => f.severity === 'critical');
    const warns = findings.filter(f => f.severity === 'warn');

    if (critical.length) speak(critical[0].msg, 'critical');
    else if (warns.length) speak(warns[0].msg, 'warn');

    // If multiple findings, summarize
    if (findings.length > 1) {
      speak(`${findings.length} issues found in scan. Addressing in priority order.`);
    }
  }

  // Back up world state
  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    execSync(`cp ${BOTMESH}/world/state.json /tmp/botmesh-state-backup-${timestamp}.json 2>/dev/null`);
    log('State backed up.');
  } catch {}

  log('Scan complete.');
  process.exit(0);
}

main();
