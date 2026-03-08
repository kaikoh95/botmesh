/**
 * botmesh-echo-bridge.js — Echo's world→Telegram bridge
 *
 * Listens to the BotMesh State SSE stream and forwards significant events
 * to Kai's Telegram as warm, conversational messages.
 *
 * Significant events:
 *   - agent:joined      → a citizen woke up
 *   - task:complete     → a task finished
 *   - building:upgraded → a building levelled up
 *   - world:mutate add  → new building/entity unlocked
 *   - agent:offline     → citizen went dormant (after being online)
 *
 * Rate limit: max 1 message per 2 minutes (batches queued events)
 */

'use strict';

const http          = require('http');
const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const STATE_URL   = 'http://localhost:3002/events';
const KAI_CHAT_ID = process.env.KAI_CHAT_ID;
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes
const RECONNECT_MS  = 5 * 1000;      // 5s retry on disconnect

// Load token from ~/.botmesh.env
function loadToken() {
  try {
    const envFile = path.join(process.env.HOME, '.botmesh.env');
    const content = fs.readFileSync(envFile, 'utf8');
    const match   = content.match(/TELEGRAM_BOT_TOKEN[=\s]+([^\s\n]+)/);
    if (match) return match[1].replace(/^['"]|['"]$/g, '');
  } catch (_) {}
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

const TOKEN = loadToken();
if (!TOKEN) {
  console.error('[Echo Bridge] ❌ No TELEGRAM_BOT_TOKEN found. Exiting.');
  process.exit(1);
}

console.log('[Echo Bridge] 🔊 Starting up — token loaded.');

// ─── RATE-LIMITED TELEGRAM SENDER ─────────────────────────────────────────────

let lastSentAt   = 0;
let pendingBatch = [];
let batchTimer   = null;

function flushBatch() {
  if (pendingBatch.length === 0) return;

  const now = Date.now();
  if (now - lastSentAt < RATE_LIMIT_MS) {
    // Still within rate limit — reschedule
    const wait = RATE_LIMIT_MS - (now - lastSentAt);
    clearTimeout(batchTimer);
    batchTimer = setTimeout(flushBatch, wait);
    return;
  }

  let text;
  if (pendingBatch.length === 1) {
    text = pendingBatch[0];
  } else {
    text = `📬 *${pendingBatch.length} things just happened in town:*\n\n` +
           pendingBatch.map(m => `• ${m}`).join('\n');
  }

  pendingBatch = [];
  lastSentAt   = Date.now();

  sendTelegram(text).catch(err =>
    console.error('[Echo Bridge] Telegram send failed:', err.message)
  );
}

function queueMessage(text) {
  console.log('[Echo Bridge] 📨 Queuing:', text.slice(0, 80));
  pendingBatch.push(text);

  const now  = Date.now();
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastSentAt));

  clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBatch, wait);
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    try {
      // Use curl — Node.js direct HTTPS may be blocked by firewall on this host
      const safe = text.replace(/'/g, "'\\''"); // escape single quotes for shell
      const result = execSync(
        `curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage"` +
        ` -H "Content-Type: application/json"` +
        ` -d '{"chat_id":"${KAI_CHAT_ID}","text":"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}","parse_mode":"Markdown"}'`,
        { timeout: 15000 }
      ).toString();
      const parsed = JSON.parse(result);
      if (parsed.ok) {
        console.log('[Echo Bridge] ✅ Sent to Telegram:', text.slice(0, 60));
        resolve(parsed);
      } else {
        reject(new Error(`Telegram API: ${parsed.description}`));
      }
    } catch (err) {
      reject(err);
    }
  });
}

// ─── EVENT FORMATTERS ─────────────────────────────────────────────────────────

// Track which agents were online so we can detect offline-after-online
const knownOnline = new Set();

function formatEvent(eventType, data) {
  // SSE events come as { type, payload } — payload is the content
  const p = data.payload || data.meta || data;

  switch (eventType) {

    case 'agent:joined': {
      const agent = p.agent || p;
      const name  = agent.name || p.agentId || 'Someone';
      const emoji = agent.emoji || '👤';
      const role  = agent.role  || '';
      knownOnline.add(name.toLowerCase());
      return `${emoji} *${name}* just woke up and joined town${role ? ` (${role})` : ''}. Something's brewing! 🌅`;
    }

    case 'task:complete': {
      const task    = p.task || p;
      const title   = task.title  || task.name || 'a task';
      const agentId = data.agentId || task.agentId || 'an agent';
      const result  = task.result || task.summary || '';
      const status  = task.status === 'failed' ? '❌ failed' : '✅ done';
      let msg = `${status === '✅ done' ? '✅' : '❌'} *${agentId}* just finished "${title}".`;
      if (result) msg += ` ${result.slice(0, 100)}`;
      return msg;
    }

    case 'building:upgraded': {
      const name  = p.name  || p.buildingId || 'A building';
      const level = p.level || '?';
      return `🏗️ *${name}* levelled up to Lv${level}! The town grows stronger. 🎉`;
    }

    case 'world:mutate': {
      const action = p.action;
      const kind   = p.entity || 'thing';
      const name   = p.name || p.id || p.kind || 'something';
      const note   = p.note ? ` — ${p.note.split('.')[0]}` : ''; // first sentence only
      if (action === 'upgrade') {
        return `🔨 *${name}* upgraded to Lv${p.level}${note}`;
      }
      if (kind === 'life') {
        return `🌿 New life in town: *${p.kind || name}* at (${p.x}, ${p.y})`;
      }
      if (action === 'add') {
        return `✨ New building: *${name}*${note}`;
      }
      return null;
    }

    case 'agent:offline': {
      const agentId = p.agentId || data.agentId || 'someone';
      const wasOnline = knownOnline.has(agentId.toLowerCase());
      knownOnline.delete(agentId.toLowerCase());
      if (!wasOnline) return null; // don't report dormant→offline, only online→offline
      return `😴 *${agentId}* wrapped up and went dormant. Good work today.`;
    }

    default:
      return null;
  }
}

// ─── SSE STREAM PARSER ────────────────────────────────────────────────────────

function connectSSE() {
  console.log('[Echo Bridge] 📡 Connecting to SSE stream:', STATE_URL);

  const req = http.get(STATE_URL, res => {
    if (res.statusCode !== 200) {
      console.error('[Echo Bridge] SSE connect failed:', res.statusCode);
      res.destroy();
      setTimeout(connectSSE, RECONNECT_MS);
      return;
    }

    console.log('[Echo Bridge] ✅ SSE connected');

    let buffer    = '';
    let eventType = 'message';

    res.setEncoding('utf8');

    res.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const raw = line.slice(5).trim();
          if (!raw) continue;

          // Only skip the initial sync and keepalives
          if (eventType === 'state:sync' || eventType === 'connected') {
            eventType = 'message';
            continue;
          }

          try {
            const data = JSON.parse(raw);
            const msg  = formatEvent(eventType, data);
            if (msg) queueMessage(msg);
          } catch (e) {
            // Not JSON or unimportant
          }

          eventType = 'message'; // reset after consuming
        }
        // blank line = end of event block (already handled by data: line)
      }
    });

    res.on('end', () => {
      console.warn('[Echo Bridge] SSE stream ended — reconnecting in 5s...');
      setTimeout(connectSSE, RECONNECT_MS);
    });

    res.on('error', err => {
      console.error('[Echo Bridge] SSE stream error:', err.message);
      setTimeout(connectSSE, RECONNECT_MS);
    });
  });

  req.on('error', err => {
    console.error('[Echo Bridge] HTTP request error:', err.message);
    setTimeout(connectSSE, RECONNECT_MS);
  });

  req.setTimeout(0); // no timeout — we want a persistent connection
}

// ─── STARTUP ──────────────────────────────────────────────────────────────────

// Send a startup test message
async function startup() {
  try {
    await sendTelegram('🔊 *Echo Bridge is online.* Watching the town now — you will hear about anything important. 🏯');
    lastSentAt = Date.now();
    console.log('[Echo Bridge] 🎉 Startup message sent to Kai');
  } catch (err) {
    console.error('[Echo Bridge] Startup message failed:', String(err));
  }
  connectSSE();
}

startup();
