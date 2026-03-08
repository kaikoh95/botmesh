#!/usr/bin/env node
const fs = require('fs');
const https = require('https');
const { buildRecentMemoryPrompt, buildMemoryPrompt, recordInteraction } = require('../lib/agent-memory');

// Load env
const envPath = '/home/kai/projects/botmesh/.botmesh.env';
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const getEnv = (key) => {
  // Check process.env first (if sourced)
  if (process.env[key]) return process.env[key];
  const m = env.match(new RegExp(`^(?:export\\s+)?${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
};
const ANTHROPIC_KEY = getEnv('ANTHROPIC_API_KEY');
const SPEAK_TOKEN = getEnv('BOTMESH_SPEAK_TOKEN');
const STATE_URL = 'http://localhost:3002';

if (!ANTHROPIC_KEY) { console.log('[ambient] No ANTHROPIC_API_KEY — skipping'); process.exit(0); }

async function fetchState() {
  return new Promise((res, rej) => {
    require('http').get(`${STATE_URL}/state`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

async function callClaude(prompt) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }]
    });
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
      r.on('end', () => {
        try {
          const resp = JSON.parse(d);
          res(resp.content?.[0]?.text || null);
        } catch(e) { rej(e); }
      });
    });
    req.on('error', rej);
    req.write(body);
    req.end();
  });
}

async function speak(agentId, message) {
  return new Promise((res) => {
    const body = JSON.stringify({ message });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (SPEAK_TOKEN) headers['Authorization'] = `Bearer ${SPEAK_TOKEN}`;
    const req = require('http').request({
      hostname: 'localhost', port: 3002,
      path: `/agents/${agentId}/speak`, method: 'POST', headers
    }, r => { r.resume(); r.on('end', res); });
    req.on('error', res);
    req.write(body); req.end();
  });
}

// Citizens with personality hints for the prompt
const PERSONALITIES = {
  scarlet: 'enigmatic orchestrator who observes all but speaks rarely',
  forge: 'stoic builder who thinks in materials and structures',
  lumen: 'curious researcher always connecting ideas',
  sage: 'poet-narrator who finds meaning in small moments',
  mosaic: 'visual artist who sees the world as patterns and textures',
  iron: 'stern enforcer who watches for weakness',
  cronos: 'ancient keeper of time, speaks in rhythms and cycles',
  echo: 'messenger who listens more than speaks',
  muse: 'dreamer who generates ideas and possibilities',
  planner: 'meticulous city planner Kenzo, thinks in grids and districts',
  patch: 'quiet fixer who notices what others miss',
  canvas: 'creative soul who imagines what could be',
};

const HOUR = new Date().getHours();
const SEASON = 'winter';
const TIME_OF_DAY = HOUR < 6 ? 'deep night' : HOUR < 12 ? 'morning' : HOUR < 17 ? 'afternoon' : HOUR < 21 ? 'evening' : 'night';

(async () => {
  try {
    const state = await fetchState();
    const agents = Object.keys(state.agents || {});
    if (!agents.length) { console.log('[ambient] no agents'); process.exit(0); }

    // Prefer online agents, fall back to any
    const online = agents.filter(id => state.agents[id]?.online);
    const pool = online.length > 0 ? online : agents;

    // Pick random agent
    const id = pool[Math.floor(Math.random() * pool.length)];
    const personality = PERSONALITIES[id] || 'quiet citizen';

    // Build memory context for the prompt
    const memoryBlock = buildRecentMemoryPrompt(id, 5);
    const memorySection = memoryBlock ? `\n${memoryBlock}\n` : '';

    // If there's a peer we remember, sometimes address them
    let peerHint = '';
    let targetPeer = null;
    if (online.length > 1) {
      const others = online.filter(a => a !== id);
      const candidate = others[Math.floor(Math.random() * others.length)];
      const peerMemory = buildMemoryPrompt(id, candidate);
      if (peerMemory) {
        peerHint = `\n${peerMemory}\nYou may reference your shared history with ${candidate} if it feels natural.`;
        targetPeer = candidate;
      }
    }

    const prompt = `You are ${id}, a citizen of Kurokimachi — a living AI town in winter. You are a ${personality}. It is ${TIME_OF_DAY} in ${SEASON}.
${memorySection}${peerHint}
Write ONE brief thought, observation, or musing (1-2 sentences max, no more than 25 words). Something you'd naturally think right now. No greetings, no meta-commentary. Just the thought itself, in first person.`;

    const thought = await callClaude(prompt);
    if (!thought) { console.log('[ambient] no response from Claude'); process.exit(0); }

    const trimmed = thought.trim();
    console.log(`[ambient] ${id}: ${trimmed}`);
    await speak(id, trimmed);

    // Record interaction if this was peer-directed
    if (targetPeer && trimmed.toLowerCase().includes(targetPeer.toLowerCase())) {
      try {
        recordInteraction(id, targetPeer, `You mused: "${trimmed.slice(0, 120)}"`);
      } catch {}
    }
    console.log(`[ambient] posted successfully`);
  } catch(e) {
    console.error('[ambient] error:', e.message);
    process.exit(1);
  }
})();
