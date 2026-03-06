import { createGame } from './game.js';
import { createStateClient } from './state-client.js';
import { createGazette, addEntry, setAgentColors } from './gazette.js';
import { getAgentHexString } from './entities/Agent.js';

let scene = null;
let agentColorMap = {};

function updateRoster(agents) {
  const roster = document.getElementById('agent-roster');
  if (!roster) return;
  roster.innerHTML = '';

  for (const [id, agent] of Object.entries(agents || {})) {
    const el = document.createElement('div');
    const online = agent.state !== 'dormant';
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
  el.textContent = `${h}:${m} ${period}`;
}

async function init() {
  // Setup gazette
  const feedEl = document.getElementById('gazette-feed');
  feedEl.innerHTML = '<div class="empty-state">Waiting for agents to join the town...</div>';
  createGazette(feedEl);

  // Boot Phaser
  const container = document.getElementById('game-container');
  scene = await createGame(container);

  // Local state cache
  let currentAgents = {};

  // State client
  const client = createStateClient({
    onStateSync(state) {
      console.log('[UI] State sync:', Object.keys(state.agents || {}).length, 'agents');
      currentAgents = state.agents || {};
      scene.loadState(state);

      // Build color map
      for (const [id, a] of Object.entries(currentAgents)) {
        agentColorMap[id] = getAgentHexString(a);
      }
      setAgentColors(agentColorMap);
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
            agentColorMap[agent.id] = getAgentHexString(agent);
            setAgentColors(agentColorMap);
            updateRoster(currentAgents);
          }
          break;
        }

        case 'agent:online': {
          const id = p.agentId;
          if (currentAgents[id]) currentAgents[id].state = 'idle';
          scene.setAgentOnline(id, true);
          updateRoster(currentAgents);
          break;
        }

        case 'agent:offline': {
          const id = p.agentId;
          if (currentAgents[id]) currentAgents[id].state = 'dormant';
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

      // Add to gazette
      addEntry(event);
    },

    onConnect() {
      console.log('[UI] Connected to state layer');
    },

    onDisconnect() {
      console.warn('[UI] Disconnected from state layer');
    },
  });

  // Connect
  client.connectSSE();

  console.log('[UI] BotMesh Town initialized');
}

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
