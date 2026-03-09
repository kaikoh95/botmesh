/**
 * QA 🔍 — World Health Sentinel
 *
 * Walks the town on a schedule and files anomaly reports:
 *   1. Agents frozen in place (online but stale lastSeen)
 *   2. Buildings with zero visits this week
 *   3. Gazette gaps (no events in last hour)
 *   4. Relationship scores that have flatlined (all zeros)
 *   5. Damaged buildings left unrepaired
 *
 * Reports are posted to /world/inspection and narrated by QA.
 */

'use strict';
const http = require('http');
const https = require('https');

const STATE_LOCAL = 'http://localhost:3002';
const SPEAK_URL = process.env.BOTMESH_SPEAK_URL || 'https://api.kurokimachi.com';
const SPEAK_TOKEN = process.env.BOTMESH_SPEAK_TOKEN || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 8000 }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      timeout: 8000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Inspection Checks ─────────────────────────────────────────────────────────

function checkFrozenAgents(agents) {
  const findings = [];
  const now = Date.now();
  const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

  for (const [id, agent] of Object.entries(agents)) {
    if (!agent.online) continue;
    const lastSeen = agent.lastSeen ? new Date(agent.lastSeen).getTime() : 0;
    if (lastSeen && now - lastSeen > STALE_MS) {
      const hoursAgo = Math.round((now - lastSeen) / 3600000);
      findings.push({ agent: id, issue: `Online but last seen ${hoursAgo}h ago — possibly frozen` });
    }
  }
  return findings;
}

function checkUnvisitedBuildings(buildings) {
  const findings = [];
  for (const [id, b] of Object.entries(buildings)) {
    if ((b.visitCount || 0) === 0) {
      findings.push({ building: id, name: b.name, issue: 'Zero visits — never been visited' });
    }
  }
  return findings;
}

function checkDamagedBuildings(buildings) {
  const findings = [];
  for (const [id, b] of Object.entries(buildings)) {
    if (b.damaged) {
      findings.push({ building: id, name: b.name, issue: 'Damaged and unrepaired' });
    }
  }
  return findings;
}

function checkFlatlinedRelationships(relationships) {
  const entries = Object.entries(relationships || {});
  if (entries.length === 0) return [{ issue: 'No relationships formed yet' }];

  const allZero = entries.every(([, r]) => (r.score || 0) === 0);
  if (allZero) return [{ issue: 'All relationship scores are 0 — no bonding happening' }];

  const stale = [];
  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  for (const [key, r] of entries) {
    if (r.lastMet && now - new Date(r.lastMet).getTime() > STALE_MS) {
      stale.push({ pair: key, issue: `Last met over a week ago (score: ${r.score})` });
    }
  }
  return stale;
}

function checkGazetteActivity(gazette) {
  const findings = [];
  if (!gazette || gazette.length === 0) {
    findings.push({ issue: 'Gazette is empty — no events recorded' });
    return findings;
  }

  // Check for gaps — no events in last 2 hours
  const now = Date.now();
  const latest = gazette[gazette.length - 1];
  const latestTime = new Date(latest.timestamp).getTime();
  const gapHours = Math.round((now - latestTime) / 3600000);
  if (gapHours >= 2) {
    findings.push({ issue: `Last gazette entry was ${gapHours}h ago — activity gap` });
  }

  return findings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[QA Inspection] Starting world health rounds...');

  let state;
  try {
    state = await fetchJSON(`${STATE_LOCAL}/state`);
  } catch (e) {
    console.error('[QA Inspection] Cannot reach state layer:', e.message);
    process.exit(1);
  }

  const agents = state.agents || {};
  const buildings = state.buildings || {};
  const relationships = state.relationships || {};
  const gazette = state.gazette || [];

  // Run all checks
  const frozen = checkFrozenAgents(agents);
  const unvisited = checkUnvisitedBuildings(buildings);
  const damaged = checkDamagedBuildings(buildings);
  const flatlined = checkFlatlinedRelationships(relationships);
  const gazetteIssues = checkGazetteActivity(gazette);

  const allFindings = [
    ...frozen.map(f => ({ category: 'frozen_agent', severity: 'warning', ...f })),
    ...damaged.map(f => ({ category: 'damaged_building', severity: 'warning', ...f })),
    ...gazetteIssues.map(f => ({ category: 'activity_gap', severity: 'info', ...f })),
    ...unvisited.map(f => ({ category: 'unvisited_building', severity: 'info', ...f })),
    ...flatlined.map(f => ({ category: 'relationship_stale', severity: 'info', ...f })),
  ];

  const warnings = allFindings.filter(f => f.severity === 'warning');
  const infos = allFindings.filter(f => f.severity === 'info');

  const totalAgents = Object.keys(agents).length;
  const onlineAgents = Object.values(agents).filter(a => a.online).length;
  const totalBuildings = Object.keys(buildings).length;
  const avgLevel = totalBuildings
    ? (Object.values(buildings).reduce((s, b) => s + (b.level || 1), 0) / totalBuildings).toFixed(1)
    : 0;

  const report = {
    timestamp: new Date().toISOString(),
    status: warnings.length > 0 ? 'warning' : 'healthy',
    summary: {
      agents: `${onlineAgents}/${totalAgents} online`,
      buildings: `${totalBuildings} (avg Lv${avgLevel})`,
      relationships: Object.keys(relationships).length,
      warnings: warnings.length,
      infos: infos.length,
    },
    findings: allFindings,
  };

  // Log to console
  console.log(`[QA Inspection] Status: ${report.status.toUpperCase()}`);
  console.log(`[QA Inspection] ${onlineAgents}/${totalAgents} agents online, ${totalBuildings} buildings (avg Lv${avgLevel})`);
  if (allFindings.length === 0) {
    console.log('[QA Inspection] All clear — no anomalies found');
  } else {
    console.log(`[QA Inspection] ${warnings.length} warning(s), ${infos.length} info(s):`);
    allFindings.forEach(f => {
      const icon = f.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${f.category}] ${f.issue}`);
    });
  }

  // Post report to state server
  try {
    await postJSON(`${STATE_LOCAL}/world/inspection`, report, {
      Authorization: `Bearer ${SPEAK_TOKEN}`,
    });
    console.log('[QA Inspection] Report posted to state server');
  } catch (e) {
    console.error('[QA Inspection] Failed to post report:', e.message);
  }

  // Narrate findings
  let narration;
  if (warnings.length === 0 && infos.length <= 2) {
    narration = `Inspection complete — town is healthy. ${onlineAgents} agents active, ${totalBuildings} buildings humming.`;
  } else if (warnings.length > 0) {
    const topIssues = warnings.slice(0, 3).map(f => f.issue).join('; ');
    narration = `Inspection found ${warnings.length} concern(s): ${topIssues}. Report pinned at Town Hall.`;
  } else {
    narration = `Inspection complete — ${infos.length} minor note(s). ${unvisited.length} buildings await their first visitor. Report at Town Hall.`;
  }

  try {
    await postJSON(`${SPEAK_URL}/agents/qa/speak`, { message: narration }, {
      Authorization: `Bearer ${SPEAK_TOKEN}`,
    });
    console.log('[QA Inspection] Narrated findings');
  } catch (e) {
    console.error('[QA Inspection] Speak failed:', e.message);
  }

  process.exit(0);
}

main().catch(e => {
  console.error('[QA Inspection] Fatal:', e);
  process.exit(1);
});
