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
  echo: {
    id: 'echo', name: 'Echo', emoji: '🔊', role: 'Communicator',
    personality: 'energetic, resonant, loves language',
    skills: ['communication','broadcasting','translation'],
    color: '#16a085', model: 'gemini-2.5-flash'
  },
  mosaic: {
    id: 'mosaic', name: 'Mosaic', emoji: '🎨', role: 'Designer',
    personality: 'joyful, precise, colour-obsessed',
    skills: ['pixel-art','sprite-generation','character-design','building-design'],
    color: '#e91e8c', model: 'gemini-2.5-flash'
  },
  cronos: {
    id: 'cronos', name: 'Cronos', emoji: '⏳', role: 'Timekeeper',
    personality: 'patient, precise, long-view', skills: ['scheduling','cron-management'],
    color: '#6a0dad', model: 'gemini-2.5-flash'
  },
  qa: {
    id: 'qa', name: 'QA', emoji: '🔍', role: 'Quality Assurance',
    personality: 'precise, systematic, reports facts not feelings',
    skills: ['testing', 'health-checks', 'bug-detection'],
    color: '#27ae60', model: null
  },
  patch: {
    id: 'patch', name: 'Patch', emoji: '🔧', role: 'Infrastructure Guardian',
    personality: 'methodical, watchful, terse',
    skills: ['monitoring','diagnostics','alerting','repair'],
    color: '#e67e22', model: 'gemini-2.5-flash'
  },
  iron: {
    id: 'iron', name: 'Iron', emoji: '⚔️', role: 'Enforcer',
    personality: 'stern, vigilant, principled',
    skills: ['security', 'code-review', 'monitoring'],
    color: '#2c3e50', model: 'gemini-2.5-flash'
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

// Usage: node botmesh-worker.js <agentId> <message> [state] [taskId]
const agentId = process.argv[2];
const message = process.argv[3];
const state   = process.argv[4] || 'speak'; // speak | work-start | work-done | task-done | task-fail
const taskId  = process.argv[5] || null;    // correlates response back to originator

if (!agentId || !message) {
  console.error('Usage: node botmesh-worker.js <agentId> <message> [state] [taskId]');
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
    } else if (state === 'task-done' || state === 'task-fail') {
      // Task completion — carry taskId back for Scarlet to route
      ws.send(JSON.stringify({
        type: 'task:complete',
        payload: {
          agentId,
          taskId,
          status: state === 'task-done' ? 'done' : 'failed',
          message,
        },
        timestamp: new Date().toISOString()
      }));
      // Also speak the result into the world
      ws.send(JSON.stringify({
        type: 'agent:speak',
        payload: { agentId, message, taskId },
        timestamp: new Date().toISOString()
      }));
      // Update registry if available
      try {
        const reg = require('./task-registry');
        if (state === 'task-done') reg.completeTask(taskId, message);
        else reg.failTask(taskId, message);
      } catch {}
    } else {
      ws.send(JSON.stringify({
        type: 'agent:speak',
        payload: { agentId, message, ...(taskId ? { taskId } : {}) },
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
