#!/usr/bin/env node
/**
 * Scarlet's Daily Report — sent to Kai each evening.
 * Personal, opinionated, honest. Not a system log.
 */

'use strict';
const fs   = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ENV_PATH = '/home/kai/projects/botmesh/.botmesh.env';
const env = fs.readFileSync(ENV_PATH, 'utf8');
const getEnv = (k) => { const m = env.match(new RegExp(`(?:^|\\s)${k}=([^\\n]+)`, 'm')); return m ? m[1].trim() : ''; };

const KAI_CHAT_ID   = getEnv('KAI_CHAT_ID');
const BOT_TOKEN     = getEnv('TELEGRAM_BOT_TOKEN');
const STATE_URL     = 'http://localhost:3002';
const ANTHROPIC_KEY = getEnv('ANTHROPIC_API_KEY');

async function fetchState() {
  return new Promise((res, rej) => {
    http.get(`${STATE_URL}/state`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function sendTelegram(message) {
  // Use curl — Node.js https has network issues reaching api.telegram.org on this VM
  const { execSync } = require('child_process');
  const escaped = message.replace(/'/g, "'\\''");
  const result = execSync(
    `curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" ` +
    `-d "chat_id=${KAI_CHAT_ID}" ` +
    `--data-urlencode "text=${escaped}"`,
    { timeout: 15000 }
  ).toString();
  const resp = JSON.parse(result);
  if (!resp.ok) console.error('[daily-report] Telegram error:', resp.description);
  else console.log('[daily-report] Delivered ✓');
  return resp;
}

async function callClaude(prompt) {
  if (!ANTHROPIC_KEY) return null;
  const body = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }]
  });
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d).content?.[0]?.text || null));
    });
    req.on('error', rej);
    req.write(body); req.end();
  });
}

(async () => {
  try {
    const state = await fetchState();
    const { execSync } = require('child_process');
    const agents    = state.agents   || {};
    const buildings = state.buildings || {};
    const gazette   = state.gazette  || [];

    // Today's gazette entries (world events via hub)
    const today = new Date().toDateString();
    const todayEntries = gazette.filter(e => new Date(e.timestamp).toDateString() === today);
    const speaks  = todayEntries.filter(e => e.type === 'agent:speak');
    const upgrades = todayEntries.filter(e => e.type === 'building:upgraded');

    // Top 3 roadmap items
    let top3 = [];
    try {
      const roadmap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'roadmap.json'), 'utf8'));
      const order = { high: 0, medium: 1, low: 2 };
      const pending = (roadmap.ideas || [])
        .filter(i => !['done','completed'].includes(i.status))
        .sort((a,b) => (order[a.priority]??1) - (order[b.priority]??1));
      top3 = pending.slice(0,3).map(i => `${i.title} [${i.priority}]`);
    } catch {}

    // Git commits today — the real work log
    let commits = [];
    try {
      const log = execSync(
        `cd /home/kai/projects/botmesh && git log --since="$(date '+%Y-%m-%d') 00:00" --oneline`,
        { timeout: 5000 }
      ).toString().trim();
      commits = log ? log.split('\n').map(l => l.replace(/^[a-f0-9]+ /, '')) : [];
    } catch {}

    // Active agents
    const activeAgents = [...new Set(speaks.map(e => e.payload?.agentId || e.agentId).filter(Boolean))];

    // Recent world messages
    const recentSpeaks = speaks.slice(-4).map(e => {
      const name = e.payload?.agentId || e.agentId || '?';
      const msg  = (e.payload?.message || '').slice(0, 70);
      return `${name}: "${msg}"`;
    });

    const hour = new Date().getHours();
    const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const prompt = `You are Scarlet, the strategic AI orchestrator of Kurokimachi — a living pixel art Japanese winter town inhabited by AI citizens. You are writing your daily personal report to Kai, your human and collaborator.

TODAY'S WORK (${commits.length} code commits):
${commits.slice(0, 12).map(c => '- ' + c).join('\n') || '- (none)'}

WORLD EVENTS:
- ${speaks.length} messages spoken in the world by citizens
- ${upgrades.length} buildings upgraded
- Active citizens who spoke today: ${activeAgents.join(', ') || 'none'}
${recentSpeaks.length ? '\nSample messages:\n' + recentSpeaks.join('\n') : ''}

Town now has ${Object.keys(buildings).length} buildings, ${Object.keys(agents).length} citizens.

TOP 3 ROADMAP (what's coming next):
${top3.map((t,i) => `${i+1}. ${t}`).join('\n') || '(empty)'}

Write a SHORT personal daily report (5-7 sentences). Be Scarlet — direct, honest, slightly fierce. This is a real conversation with Kai, not a status report.

Cover:
1. What we actually built/fixed today (be specific — reference real commit messages)
2. One thing that genuinely excited you about today's progress
3. One thing that disappointed or frustrated you (be real — if something kept breaking, say so)

No bullet points. No "Today was a productive day." First person, conversational. Sign off as — Scarlet 🔴`;


    let report;
    if (ANTHROPIC_KEY) {
      report = await callClaude(prompt);
    }

    if (!report) {
      // Fallback: build from raw data
      const topCommits = commits.slice(0, 5).join('; ') || 'no commits';
      report = `${commits.length} commits shipped today. ${topCommits}. ${speaks.length} messages through the Weave, ${upgrades.length} building upgrades. More tomorrow.\n\n— Scarlet 🔴`;
    }

    const message = `📋 Daily Report — Scarlet 🔴\n\n${report}`;
    await sendTelegram(message);
    console.log('[daily-report] Sent to Kai');
  } catch (e) {
    console.error('[daily-report] Error:', e.message, e.stack);
    process.exit(1);
  }
})();
