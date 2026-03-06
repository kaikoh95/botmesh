import { createGame } from './game.js';
import { createStateClient } from './state-client.js';
import { createGazette, addEntry, setAgentColors, setAgentEmojis, setNightMode } from './gazette.js';
import { getAgentHexString } from './entities/Agent.js';

let scene = null;
let agentColorMap = {};
let agentEmojiMap = {};

function updateRoster(agents) {
  const roster = document.getElementById('agent-roster');
  if (!roster) return;
  roster.innerHTML = '';

  const entries = Object.entries(agents || {});
  const onlineCount = entries.filter(([, a]) => a.online !== false && a.state !== 'dormant').length;

  // Agent count badge
  const badge = document.createElement('div');
  badge.className = 'roster-count';
  badge.textContent = `${onlineCount}/${entries.length} online`;
  roster.appendChild(badge);

  for (const [id, agent] of entries) {
    const el = document.createElement('div');
    const online = agent.online !== false && agent.state !== 'dormant';
    el.className = 'roster-agent' + (online ? '' : ' offline');
    const color = agentColorMap[id] || agent.color || '#aaa';
    el.innerHTML = `<span class="roster-dot" style="background:${color}"></span>${agent.emoji || ''} ${agent.name || id}`;
    roster.appendChild(el);
  }
}

function updateClock(time) {
  const el = document.getElementById('world-clock');
  if (!el || !time) return;
  const h = String(time.hour ?? 0).padStart(2, '0');
  const m = String(time.minute ?? 0).padStart(2, '0');
  const period = time.period || '';
  const periodIcon = { morning: '\u2600\uFE0F', afternoon: '\u{1F324}\uFE0F', evening: '\u{1F305}', night: '\u{1F319}' }[period] || '';
  el.textContent = `${periodIcon} ${h}:${m} ${period}`;

  // Night mode for gazette
  setNightMode(period === 'night');
}

async function init() {
  const feedEl = document.getElementById('gazette-feed');
  feedEl.innerHTML = '<div class="empty-state">Waiting for agents to join the town...</div>';
  createGazette(feedEl);

  const container = document.getElementById('game-container');
  scene = await createGame(container);

  let currentAgents = {};

  function syncColors(agents) {
    for (const [id, a] of Object.entries(agents)) {
      agentColorMap[id] = getAgentHexString(a);
      agentEmojiMap[id] = a.emoji || '';
    }
    setAgentColors(agentColorMap);
    setAgentEmojis(agentEmojiMap);
  }

  const client = createStateClient({
    onStateSync(state) {
      console.log('[UI] State sync:', Object.keys(state.agents || {}).length, 'agents');
      currentAgents = state.agents || {};
      scene.loadState(state);
      syncColors(currentAgents);
      updateRoster(currentAgents);
      updateClock(state.time);
    },

    onEvent(event) {
      const p = event.payload || {};

      switch (event.type) {
        case 'agent:joined': {
          const agent = p.agent;
          if (agent) {
            currentAgents[agent.id] = agent;
            scene.addAgent(agent);
            syncColors(currentAgents);
            updateRoster(currentAgents);
          }
          break;
        }

        case 'agent:online': {
          const id = p.agentId;
          if (currentAgents[id]) {
            currentAgents[id].online = true;
            currentAgents[id].state = 'idle';
          }
          scene.setAgentOnline(id, true);
          updateRoster(currentAgents);
          break;
        }

        case 'agent:offline': {
          const id = p.agentId;
          if (currentAgents[id]) {
            currentAgents[id].online = false;
            currentAgents[id].state = 'dormant';
          }
          scene.setAgentOnline(id, false);
          updateRoster(currentAgents);
          break;
        }

        case 'agent:move': {
          scene.moveAgent(p.agentId, p.to.x, p.to.y);
          if (currentAgents[p.agentId]) {
            currentAgents[p.agentId].location = p.to;
          }
          break;
        }

        case 'agent:speak': {
          scene.agentSpeak(p.agentId, p.message);
          break;
        }

        case 'agent:state': {
          scene.updateAgentState(p.agentId, p.to);
          if (currentAgents[p.agentId]) {
            currentAgents[p.agentId].state = p.to;
          }
          updateRoster(currentAgents);
          break;
        }

        case 'agent:mood': {
          if (currentAgents[p.agentId]) {
            currentAgents[p.agentId].mood = p.to;
          }
          break;
        }

        case 'time:tick': {
          if (p.period) scene.setTime(p.period);
          updateClock(p);
          break;
        }
      }

      addEntry(event);
    },

    onConnect() {
      console.log('[UI] Connected to state layer');
    },

    onDisconnect() {
      console.warn('[UI] Disconnected from state layer');
    },
  });

  // Fetch initial state directly
  try {
    const state = await client.fetchState();
    console.log('[UI] Initial state loaded:', Object.keys(state.agents || {}).length, 'agents');
    if (state) {
      currentAgents = state.agents || {};
      scene.loadState(state);
      syncColors(currentAgents);
      updateRoster(currentAgents);
      updateClock(state.time);
    }
  } catch (e) {
    console.warn('[UI] Could not fetch initial state:', e.message);
  }

  client.connectSSE();
  console.log('[UI] BotMesh Town initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
