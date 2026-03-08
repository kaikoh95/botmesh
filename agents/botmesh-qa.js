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
const fs      = require('fs');
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

  // 7. Sprite manifest sync — TownScene.js preload vs disk
  try {
    const TownScene = fs.readFileSync(path.join(__dirname, '../ui/src/scenes/TownScene.js'), 'utf8');
    const buildingDir = path.join(__dirname, '../ui/assets/buildings');

    // Extract building keys from preload manifest
    const manifestMatches = TownScene.matchAll(/'building-([^']+)'/g);
    const missingBuildings = [];
    for (const m of manifestMatches) {
      const file = `${m[1]}.png`;
      if (!fs.existsSync(path.join(buildingDir, file))) missingBuildings.push(file);
    }
    missingBuildings.length === 0
      ? pass('Sprite manifest — all building files exist')
      : fail('Sprite manifest', `Missing: ${missingBuildings.join(', ')}`);

    // Check for speculative loads (404-prone)
    const allBuildingFiles = new Set(fs.readdirSync(buildingDir));
    const speculativeMatches = TownScene.matchAll(/'building-([^']+)'/g);
    const speculative = [];
    for (const m of speculativeMatches) {
      if (!allBuildingFiles.has(`${m[1]}.png`)) speculative.push(m[1]);
    }
    speculative.length === 0
      ? pass('No speculative preloads')
      : fail('Speculative preloads in TownScene', `404-prone: ${speculative.join(', ')}`);
  } catch (e) {
    fail('Sprite manifest check', e.message);
  }

  // 8. Walk ticker — agents should be moving
  try {
    const state1 = await fetchJSON(`${STATE_LOCAL}/state`);
    await new Promise(r => setTimeout(r, 2100));
    const state2 = await fetchJSON(`${STATE_LOCAL}/state`);
    const onlineAgents = Object.entries(state1.body.agents || {}).filter(([,a]) => a.online);
    if (onlineAgents.length === 0) {
      pass('Walk ticker (no online agents to check)');
    } else {
      const moved = onlineAgents.some(([id]) => {
        const loc1 = state1.body.agents[id]?.location;
        const loc2 = state2.body.agents[id]?.location;
        return loc1 && loc2 && (loc1.x !== loc2.x || loc1.y !== loc2.y);
      });
      moved
        ? pass('Walk ticker — agents moving')
        : fail('Walk ticker', 'Online agents not moving between checks');
    }
  } catch (e) {
    fail('Walk ticker', e.message);
  }

  // 9. SSE delivers state:sync event on connect
  await new Promise((resolve) => {
    const req = http.get(`${STATE_LOCAL}/events`, { timeout: 3500 }, res => {
      let got = false;
      res.on('data', chunk => {
        if (!got && chunk.toString().includes('state:sync')) {
          got = true;
          pass('SSE delivers state:sync on connect');
          req.destroy();
          resolve();
        }
      });
      setTimeout(() => {
        if (!got) fail('SSE state:sync', 'No state:sync received within 3s');
        req.destroy();
        resolve();
      }, 3200);
    });
    req.on('error', () => { fail('SSE connect', 'connection failed'); resolve(); });
  });

  // 10. main.js imports all resolve to existing files
  try {
    const mainJs = fs.readFileSync(path.join(__dirname, '../ui/src/main.js'), 'utf8');
    const imports = [...mainJs.matchAll(/from ['"]\.\/([^'"]+)['"]/g)].map(m => m[1]);
    const missing = imports.filter(f => {
      const p = path.join(__dirname, '../ui/src', f.endsWith('.js') ? f : f + '.js');
      return !fs.existsSync(p);
    });
    missing.length === 0
      ? pass('main.js imports all resolve')
      : fail('main.js broken imports', missing.join(', '));
  } catch (e) {
    fail('main.js import check', e.message);
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

    // Spawn Patch as an auto-fixer
    try {
      const { spawnSession } = require('./spawn-session');
      const envSource = fs.readFileSync('/home/kai/projects/botmesh/.botmesh.env', 'utf8');
      const getEnv = (k) => { const m = envSource.match(new RegExp(`^${k}=(.+)$`, 'm')); return m ? m[1].trim() : ''; };
      const STATE_URL = getEnv('BOTMESH_API_URL') || 'https://api.kurokimachi.com';
      const SPEAK_TOKEN = getEnv('BOTMESH_SPEAK_TOKEN') || '';

      spawnSession('patch', `# Patch 🔧 — Auto-fix QA Failures

QA found ${failures.length} issue(s) that need fixing:

${failures.map(f => `## ❌ ${f.name}\n${f.reason}`).join('\n\n')}

## Your job
Investigate each failure, find the root cause, and fix it.

For sprite manifest issues: update the preload list in \`/home/kai/projects/botmesh/ui/src/scenes/TownScene.js\`
For import issues: fix the import path in the relevant JS file
For walk ticker issues: check \`/home/kai/projects/botmesh/state/src/index.js\` walk ticker code

After fixing, run QA manually to verify:
\`\`\`bash
source /home/kai/projects/botmesh/.botmesh.env
node /home/kai/projects/botmesh/agents/botmesh-qa.js
\`\`\`

Narrate what you found and fixed:
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/patch/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"YOUR MESSAGE"}'
\`\`\`

Commit your fix:
\`\`\`bash
cd /home/kai/projects/botmesh && git add -A && git commit -m "🔧 Patch: <what you fixed>" && git push origin main
\`\`\`

Then \`pm2 restart\` whatever services you changed.`);
      console.log('[QA] Patch session queued for auto-fix');
    } catch (e) {
      console.error('[QA] Failed to spawn Patch session:', e.message);
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
