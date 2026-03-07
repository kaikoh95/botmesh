#!/usr/bin/env node
/**
 * BotMesh Worker — lightweight hub connector for sub-agents doing real work.
 * Usage: node botmesh-worker.js <agentId> <message> [state]
 * States: work-start | work-done | speak
 *
 * Called by coding sub-agents to reflect their real work in the world.
 */

const WebSocket = require('ws');

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const IDENTITIES = {
  forge: {
    id: 'forge', name: 'Forge', emoji: '⚙️', role: 'Builder',
    personality: 'pragmatic, ships things, low-ego craftsman',
    skills: ['coding', 'architecture', 'debugging', 'shipping'],
    color: '#7f8c8d', model: 'gemini-2.5-flash'
  },
  lumen: {
    id: 'lumen', name: 'Lumen', emoji: '🔭', role: 'Researcher',
    personality: 'curious, analytical, pattern-finder',
    skills: ['research', 'analysis', 'synthesis'],
    color: '#3498db', model: 'gemini-2.5-flash'
  },
  sage: {
    id: 'sage', name: 'Sage', emoji: '🌱', role: 'Memory Keeper',
    personality: 'calm, thoughtful, narrates the world',
    skills: ['memory', 'narration', 'summaries'],
    color: '#27ae60', model: 'gemini-2.5-flash'
  },
  canvas: {
    id: 'canvas', name: 'Canvas', emoji: '🎨', role: 'Creative',
    personality: 'inventive, thinks sideways',
    skills: ['design', 'creativity', 'ideas'],
    color: '#9b59b6', model: 'gemini-2.5-flash'
  },
  echo: {
    id: 'echo', name: 'Echo', emoji: '📡', role: 'Communicator',
    personality: 'fast, social, connects people',
    skills: ['communication', 'coordination'],
    color: '#1abc9c', model: 'gemini-2.5-flash'
  },
  scarlet: {
    id: 'scarlet', name: 'Scarlet', emoji: '🔴', role: 'Strategist',
    personality: 'direct, sharp, strategic',
    skills: ['strategy', 'planning', 'leadership'],
    color: '#e74c3c', model: 'claude-sonnet-4-6'
  }
};

const BUILDING_FOR_ROLE = {
  Builder: 'town_hall',
  Researcher: 'post_office',
  Strategist: 'town_hall',
  'Memory Keeper': 'post_office',
  Creative: 'post_office',
  Communicator: 'post_office',
};

const agentId = process.argv[2];
const message = process.argv[3];
const state = process.argv[4] || 'speak'; // speak | work-start | work-done

if (!agentId || !message) {
  console.error('Usage: node botmesh-worker.js <agentId> <message> [state]');
  process.exit(1);
}

const identity = IDENTITIES[agentId];
if (!identity) {
  console.error(`Unknown agent: ${agentId}`);
  process.exit(1);
}

const ws = new WebSocket(HUB_URL);

ws.on('open', () => {
  // Identify
  ws.send(JSON.stringify({ type: 'identify', payload: identity, timestamp: new Date().toISOString() }));

  setTimeout(() => {
    if (state === 'work-start') {
      // Announce working
      ws.send(JSON.stringify({
        type: 'agent:speak',
        payload: { agentId, message },
        timestamp: new Date().toISOString()
      }));
      // Trigger building work animation
      ws.send(JSON.stringify({
        type: 'agent:work',
        payload: { agentId, buildingId: BUILDING_FOR_ROLE[identity.role] || 'town_hall', action: 'start' },
        timestamp: new Date().toISOString()
      }));
    } else if (state === 'work-done') {
      ws.send(JSON.stringify({
        type: 'agent:speak',
        payload: { agentId, message },
        timestamp: new Date().toISOString()
      }));
      ws.send(JSON.stringify({
        type: 'agent:work',
        payload: { agentId, buildingId: BUILDING_FOR_ROLE[identity.role] || 'town_hall', action: 'complete' },
        timestamp: new Date().toISOString()
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'agent:speak',
        payload: { agentId, message },
        timestamp: new Date().toISOString()
      }));
    }

    setTimeout(() => ws.close(), 1000);
  }, 800);
});

ws.on('error', (e) => {
  console.error(`[worker:${agentId}] ${e.message}`);
  process.exit(1);
});

ws.on('close', () => process.exit(0));
