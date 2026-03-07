/**
 * spawn-session.js — queues a task for Scarlet to pick up via heartbeat
 *
 * The orchestrator (Node.js) can't call sessions_spawn directly — that's
 * Scarlet's tool. Instead, we write to a pending queue file.
 * Scarlet's heartbeat reads it, spawns the Claude session, marks done.
 */

const fs   = require('fs');
const path = require('path');

const QUEUE_FILE = '/tmp/botmesh-session-queue.json';

function spawnSession(agentId, brief, opts = {}) {
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch {}

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
  return entry.id;
}

module.exports = { spawnSession, QUEUE_FILE };
