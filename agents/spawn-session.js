/**
 * spawn-session.js — queues a task AND pings Scarlet via Telegram to process it
 *
 * The orchestrator (Node.js) can't call sessions_spawn directly — that's
 * Scarlet's OpenClaw tool. Instead:
 * 1. Write brief to queue file
 * 2. Ping Scarlet's Telegram chat so she wakes up and processes it immediately
 *    (no waiting for heartbeat)
 */

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

const QUEUE_FILE  = '/tmp/botmesh-session-queue.json';
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const KAI_CHAT_ID = process.env.KAI_CHAT_ID || '334289141';

function pingTelegram(agentId, taskId) {
  if (!BOT_TOKEN) return;
  try {
    const msg = `🤖 Session queued: *${agentId}* (${taskId}) — process it.`;
    execSync(
      `curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"` +
      ` -H "Content-Type: application/json"` +
      ` -d '{"chat_id":"${KAI_CHAT_ID}","text":"${msg.replace(/'/g,"'")}","parse_mode":"Markdown"}'`,
      { timeout: 10000 }
    );
  } catch { /* non-fatal */ }
}

function spawnSession(agentId, brief, opts = {}) {
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch {}

  // Don't queue if agent already has a pending/in_progress session
  const active = queue.find(t => t.agentId === agentId && ['pending','in_progress'].includes(t.status));
  if (active) {
    console.log(`[spawn] ${agentId} already has active session (${active.id}) — skipping`);
    return active.id;
  }

  const entry = {
    id:       `sq-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    agentId,
    brief,
    priority: opts.priority || 'normal',
    timeout:  opts.timeout  || 300,
    queuedAt: new Date().toISOString(),
    status:   'pending',
  };

  queue.push(entry);
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  console.log(`[spawn] Queued session for ${agentId} (${entry.id})`);

  // Ping Scarlet immediately so she processes without waiting for heartbeat
  pingTelegram(agentId, entry.id);

  return entry.id;
}

module.exports = { spawnSession, QUEUE_FILE };
