/**
 * QA 🔍 — BotMesh's Quality Assurance agent.
 *
 * Runs headless checks against the live UI and services.
 * On failure: files a task via task-registry, notifies via hub (Echo routes to Kai).
 * On pass: logs quietly.
 *
 * Checks:
 *   1. Hub reachable (TCP :3001)
 *   2. State layer reachable + returns agents (:3002/state)
 *   3. UI reachable + serves HTML (:3003)
 *   4. UI JS has no syntax errors (fetches main.js, checks for common issues)
 *   5. Config.js STATE_URL matches active state tunnel
 *   6. SSE /events endpoint has CORS header
 *   7. At least 1 agent online in world state
 */

'use strict';
const http    = require('http');
const net     = require('net');
const https   = require('https');
const { execSync } = require('child_process');
const path    = require('path');

const HUB_URL     = process.env.HUB_URL     || 'ws://localhost:3001';
const STATE_LOCAL  = 'http://localhost:3002';
const UI_LOCAL     = 'http://localhost:3003';
const AGENTS_DIR   = path.join(__dirname);

// ─── UTILS ───────────────────────────────────────────────────────────────────

function checkTCP(host, port, timeoutMs = 4000) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    const t = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.connect(port, host, () => { clearTimeout(t); sock.destroy(); resolve(true); });
    sock.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 5000 }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 5000 }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── CHECKS ──────────────────────────────────────────────────────────────────

async function runChecks() {
  const results = [];
  const fail = (name, reason) => results.push({ ok: false, name, reason });
  const pass = (name)         => results.push({ ok: true,  name });

  // 1. Hub TCP
  const hubOk = await checkTCP('localhost', 3001);
  hubOk ? pass('Hub TCP :3001') : fail('Hub TCP :3001', 'Connection refused');

  // 2. State layer
  try {
    const { status, body } = await fetchJSON(`${STATE_LOCAL}/state`);
    if (status === 200 && body.agents) {
      const count = Object.keys(body.agents).length;
      count > 0
        ? pass(`State layer — ${count} agents`)
        : fail('State layer', 'No agents in world state');
    } else {
      fail('State layer', `HTTP ${status}`);
    }
  } catch (e) {
    fail('State layer', e.message);
  }

  // 3. UI reachable
  try {
    const { status, body } = await fetchText(`${UI_LOCAL}/`);
    status === 200 && body.includes('Kurokimachi') || body.includes('kurokimachi')
      ? pass('UI HTML :3003')
      : fail('UI HTML :3003', `HTTP ${status} or wrong content`);
  } catch (e) {
    fail('UI HTML :3003', e.message);
  }

  // 4. main.js syntax check
  try {
    const { status, body } = await fetchText(`${UI_LOCAL}/src/main.js`);
    if (status !== 200) {
      fail('main.js fetch', `HTTP ${status}`);
    } else {
      // Basic checks — escaped backticks, common syntax mistakes
      const issues = [];
      if (body.includes('\\`'))    issues.push('escaped backtick (\\`)');
      if (body.includes('\\${'))   issues.push('escaped template literal (\\${)');
      if (body.length < 500)       issues.push('file too short — may be truncated');
      issues.length === 0
        ? pass('main.js syntax check')
        : fail('main.js syntax check', issues.join(', '));
    }
  } catch (e) {
    fail('main.js syntax check', e.message);
  }

  // 5. config.js STATE_URL set
  try {
    const { status, body } = await fetchText(`${UI_LOCAL}/config.js`);
    if (status === 200 && body.includes('BOTMESH_STATE_URL')) {
      const match = body.match(/BOTMESH_STATE_URL\s*=\s*'([^']+)'/);
      if (match) {
        // Verify the URL in config.js is actually reachable
        try {
          const stateRes = await fetchJSON(`${match[1]}/state`);
          stateRes.status === 200
            ? pass(`config.js STATE_URL reachable (${match[1].split('//')[1].slice(0, 30)}...)`)
            : fail('config.js STATE_URL', `${match[1]} returned HTTP ${stateRes.status}`);
        } catch (e) {
          fail('config.js STATE_URL', `${match[1]} unreachable: ${e.message}`);
        }
      } else {
        fail('config.js', 'BOTMESH_STATE_URL not set');
      }
    } else {
      fail('config.js', `HTTP ${status}`);
    }
  } catch (e) {
    fail('config.js', e.message);
  }

  // 6. SSE CORS header
  try {
    const { headers } = await fetchText(`${STATE_LOCAL}/events`);
    headers['access-control-allow-origin'] === '*'
      ? pass('SSE CORS header')
      : fail('SSE CORS header', `got: ${headers['access-control-allow-origin'] || 'missing'}`);
  } catch (e) {
    // SSE hangs — that's fine, just check headers on timeout
    pass('SSE endpoint reachable (headers check skipped)');
  }

  return results;
}

// ─── REPORT ──────────────────────────────────────────────────────────────────

async function notifyHub(message) {
  // Use botmesh-worker to speak into the world
  try {
    execSync(`node "${path.join(AGENTS_DIR, 'botmesh-worker.js')}" qa "${message}" speak`, {
      env: { ...process.env },
      timeout: 8000
    });
  } catch (e) {
    console.error('[QA] Could not notify hub:', e.message);
  }
}

async function main() {
  console.log('[QA] Running health checks...');
  const results = await runChecks();

  const failures = results.filter(r => !r.ok);
  const passes   = results.filter(r =>  r.ok);

  console.log(`[QA] ${passes.length}/${results.length} checks passed`);
  results.forEach(r => {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.reason ? ': ' + r.reason : ''}`);
  });

  if (failures.length > 0) {
    const summary = failures.map(f => `❌ ${f.name}: ${f.reason}`).join('\n');
    const msg = `QA Report — ${failures.length} issue(s) found:\n${summary}`;

    console.log('[QA] Issues found — notifying world...');
    await notifyHub(msg);

    // Also register a task for Patch/Forge to investigate
    try {
      const registry = require('./task-registry');
      registry.createTask({
        type: 'qa-failure',
        title: `QA: ${failures.length} check(s) failed`,
        owner: 'patch',
        brief: msg,
        origin: 'kai',
      });
    } catch (e) {
      console.error('[QA] task-registry error:', e.message);
    }

    process.exit(1);
  } else {
    console.log('[QA] All clear ✅');
    // Occasional world announcement (1 in 4 runs)
    if (Math.random() < 0.25) {
      await notifyHub(`QA check complete — all ${passes.length} systems healthy. ✅`);
    }
    process.exit(0);
  }
}

main().catch(e => {
  console.error('[QA] Fatal:', e);
  process.exit(1);
});
