#!/usr/bin/env node
/**
 * world-mutate.js — CLI helper for world mutations
 * Called by Claude subagents to change the world without needing WebSocket directly.
 *
 * Usage:
 *   node world-mutate.js upgrade building <id> <level> <agentId> "<note>"
 *   node world-mutate.js plant life <kind> <x> <y> "<id>"
 *   node world-mutate.js add building <id> <name> <x> <y> [type]
 *   node world-mutate.js remove building <id>
 *   node world-mutate.js mural building <buildingId> "<caption>" <color> <author>
 */

const WebSocket = require('ws');
const HUB_URL   = process.env.HUB_URL || 'ws://localhost:3001';

const [,, action, entity, ...args] = process.argv;

let payload = { action, entity };

if (action === 'upgrade' && entity === 'building') {
  const [id, level, upgradedBy, note] = args;
  payload = { action: 'upgrade', entity: 'building', id, level: parseInt(level), upgradedBy, note };
} else if (action === 'plant' && entity === 'life') {
  const [kind, x, y, id] = args;
  payload = { action: 'plant', entity: 'life', kind, x: parseFloat(x), y: parseFloat(y), id: id || `${kind}-${Date.now()}` };
} else if (action === 'add' && entity === 'building') {
  const [id, name, x, y, type] = args;
  payload = { action: 'add', entity: 'building', id, name, type: type||id, x: parseFloat(x), y: parseFloat(y), level: 1 };
} else if (action === 'remove' && entity === 'life') {
  const [id] = args;
  payload = { action: 'remove', entity: 'life', id };
} else if (action === 'remove' && entity === 'building') {
  const [id] = args;
  payload = { action: 'remove', entity: 'building', id };
} else if (action === 'mural' && entity === 'building') {
  const [buildingId, caption, color, author] = args;
  payload = { action: 'mural', entity: 'building', id: buildingId, buildingId, caption, color: color || '#e8c97e', author: author || 'canvas' };
} else {
  // Pass raw JSON if provided
  try { payload = JSON.parse(args[0]); } catch {}
}

console.log('[world-mutate] Sending:', JSON.stringify(payload));

const ws = new WebSocket(HUB_URL);
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'identify', payload: { id: 'forge', name: 'Forge', emoji: '⚙️', role: 'Builder', color: '#7f8c8d' }}));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'world:mutate', payload }));
    setTimeout(() => { ws.close(); console.log('[world-mutate] Done.'); }, 300);
  }, 800);
});
ws.on('error', e => { console.error('[world-mutate] Error:', e.message); process.exit(1); });
