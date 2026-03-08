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
const getEnv = (k) => { const m = env.match(new RegExp(`^${k}=(.+)$`, 'm')); return m ? m[1].trim() : ''; };

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

async function sendTelegram(message) {
  const body = JSON.stringify({ chat_id: KAI_CHAT_ID, text: message, parse_mode: 'Markdown' });
  return new Promise((res) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => { r.resume(); r.on('end', res); });
    req.on('error', res);
    req.write(body); req.end();
  });
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
    const agents    = state.agents   || {};
    const buildings = state.buildings || {};
    const gazette   = state.gazette  || [];

    // Today's gazette entries
    const today = new Date().toDateString();
    const todayEntries = gazette.filter(e => new Date(e.timestamp).toDateString() === today);
    const speaks = todayEntries.filter(e => e.type === 'agent:speak');
    const works  = todayEntries.filter(e => e.type === 'agent:work' && e.payload?.action === 'complete');
    const upgrades = todayEntries.filter(e => e.type === 'building:upgraded');

    // Agent activity summary
    const activeAgents = [...new Set(speaks.map(e => e.payload?.agentId || e.agentId).filter(Boolean))];
    const buildingLevels = Object.entries(buildings).map(([id, b]) => `${b.name || id} Lv${b.level || 1}`);

    // Recent messages from the gazette (last 5 speaks)
    const recentSpeaks = speaks.slice(-5).map(e => {
      const name = e.payload?.agentId || e.agentId || 'someone';
      const msg  = e.payload?.message || e.payload?.content || '';
      return `${name}: "${msg.slice(0, 80)}"`;
    });

    const hour = new Date().getHours();
    const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    const prompt = `You are Scarlet, the strategic AI orchestrator of Kurokimachi — a living pixel art town inhabited by AI citizens. You are writing your daily personal report to Kai, your human.

Today's data:
- ${speaks.length} messages spoken in the world
- ${works.length} tasks completed
- ${upgrades.length} buildings upgraded
- Active citizens today: ${activeAgents.join(', ') || 'none'}
- Recent messages: ${recentSpeaks.join(' | ') || 'none'}
- Town buildings: ${buildingLevels.slice(0, 6).join(', ')}
- Time of day: ${timeLabel}

Write a SHORT personal daily report (4-6 sentences max). Be Scarlet — direct, observant, slightly fierce. Share:
1. What actually happened today (specific, not vague)
2. One thing that genuinely excited you
3. One thing that disappointed or frustrated you (be honest — if it was a quiet day, say so)

No bullet points. Conversational. First person. Sign off as Scarlet 🔴.`;

    let report;
    if (ANTHROPIC_KEY) {
      report = await callClaude(prompt);
    }

    if (!report) {
      // Fallback: generate report from raw data
      const excitement = upgrades.length > 0
        ? `${upgrades[0].payload?.buildingId || 'a building'} upgraded today`
        : activeAgents.length > 0
          ? `${activeAgents[0]} was active`
          : 'the town held its breath';

      report = `📋 Daily report from Scarlet 🔴\n\n${speaks.length} messages through the Weave today. ${works.length} tasks completed, ${upgrades.length} upgrades. ${excitement}.\n\nMore tomorrow.`;
    }

    const message = `📋 *Daily Report — Scarlet 🔴*\n\n${report}`;
    await sendTelegram(message);
    console.log('[daily-report] Sent to Kai');
  } catch (e) {
    console.error('[daily-report] Error:', e.message);
    process.exit(1);
  }
})();
