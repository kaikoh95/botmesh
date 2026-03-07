import { createGame } from './game.js';
import { createStateClient } from './state-client.js';
import { createGazette, addEntry, setAgentColors, setAgentEmojis, setNightMode } from './gazette.js';
import { getAgentHexString } from './entities/Agent.js';

let scene = null;
let agentColorMap = {};
let agentEmojiMap = {};
let currentBuildings = {};
let currentAgents = {};

// ── HTML Panel Manager ────────────────────────────────────────────────────
const Panels = {
  _agentPanel:    null,
  _buildingPanel: null,
  _tooltip:       null,

  showAgent(agentId, agents, colorMap) {
    const agent = agents[agentId];
    if (!agent) return;
    const color = colorMap[agentId] || agent.color || '#aaaaaa';

    const panel = document.getElementById('agent-panel');
    const accent = document.getElementById('agent-panel-accent');

    const rows = [
      { label: 'Role',     value: agent.role || agent.emoji || '—' },
      { label: 'State',    value: agent.state || 'active' },
      { label: 'Location', value: agent.location?.building ? `📍 ${agent.location.building}` : `(${Math.round(agent.location?.x||0)}, ${Math.round(agent.location?.y||0)})` },
    ];
    if (agent.mood) rows.push({ label: 'Mood', value: agent.mood });

    panel.innerHTML = `
      <div class="panel-accent-bar" style="background:${color}"></div>
      <div class="panel-titlebar">
        <span class="panel-title">${agent.emoji || ''} ${agent.name || agentId}</span>
        <span class="panel-subtitle">${agent.online !== false ? '🟢 Online' : '⚫ Offline'}</span>
        <button class="panel-close" id="agent-panel-close">✕</button>
      </div>
      <div class="panel-body">
        ${rows.map(r => `<div class="panel-row"><span class="row-label">${r.label}</span><span class="row-value">${r.value}</span></div>`).join('')}
      </div>
    `;
    panel.classList.remove('hidden');
    document.getElementById('agent-panel-close').onclick = () => panel.classList.add('hidden');
  },

  showBuilding(buildingId) {
    const bData = (window.__botmeshState?.buildings || {})[buildingId] || {};
    const agents = window.__botmeshState?.agents || {};
    const workers = Object.values(agents).filter(a => a.location?.building === buildingId);

    const normUpgrades = (bData.upgrades || []).map(u => ({
      level:      u.level      ?? u.toLevel,
      upgradedBy: u.upgradedBy ?? u.agentName ?? u.agentId ?? '?',
      upgradedAt: u.upgradedAt ?? u.completedAt,
      note:       u.note       ?? null,
    }));

    const workerHtml = workers.length
      ? workers.map(w => `<span style="color:${agentColorMap[w.id||w.name]||'#aaa'}">${w.emoji||''} ${w.name||w.id}</span>`).join(', ')
      : '<span style="color:#555">None</span>';

    const upgradeHtml = normUpgrades.length
      ? `<div class="panel-section-header">─ UPGRADE HISTORY ─</div>` +
        normUpgrades.map((u, i) => {
          const date = u.upgradedAt ? new Date(u.upgradedAt).toLocaleDateString('en-NZ', { month:'short', day:'numeric' }) : '?';
          return `<div class="upgrade-row" data-idx="${i}">
            <span class="upg-level">→ Lv${u.level ?? '?'}</span>
            <span class="upg-meta">${u.upgradedBy} · ${date}</span>
          </div>` + (u.note ? `<div class="upg-note">"${u.note}"</div>` : '');
        }).join('')
      : '<div style="color:#555;font-style:italic;font-size:11px">No upgrades yet</div>';

    const panel = document.getElementById('building-panel');
    panel.innerHTML = `
      <div class="panel-accent-bar" style="background:#e8c97e"></div>
      <div class="panel-titlebar">
        <span class="panel-title">🏛 ${bData.name || buildingId}</span>
        <span class="panel-subtitle">Lv ${bData.level || 1} / ${bData.maxLevel || 3}</span>
        <button class="panel-close" id="building-panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="panel-row"><span class="row-label">Status</span><span class="row-value">${bData.damaged ? '💥 Damaged' : '✅ Operational'}</span></div>
        <div class="panel-row"><span class="row-label">Workers</span><span class="row-value">${workerHtml}</span></div>
        ${upgradeHtml}
      </div>
    `;
    panel.classList.remove('hidden');

    document.getElementById('building-panel-close').onclick = () => {
      panel.classList.add('hidden');
      Panels.hideTooltip();
    };

    // Upgrade row click → tooltip
    panel.querySelectorAll('.upgrade-row').forEach(row => {
      row.addEventListener('click', () => {
        const u = normUpgrades[+row.dataset.idx];
        Panels.showUpgradeTooltip(u);
      });
    });
  },

  showUpgradeTooltip(u) {
    const date = u.upgradedAt ? new Date(u.upgradedAt).toLocaleString('en-NZ', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '?';
    const tooltip = document.getElementById('upgrade-tooltip');
    tooltip.innerHTML = `
      <button class="tooltip-close" id="tooltip-close">✕</button>
      <div class="tooltip-title">→ Level ${u.level ?? '?'} Upgrade</div>
      <div class="tooltip-line">By: ${u.upgradedBy || 'unknown'}</div>
      <div class="tooltip-line">Date: ${date}</div>
      ${u.note ? `<div class="tooltip-note">"${u.note}"</div>` : ''}
    `;
    tooltip.classList.remove('hidden');
    document.getElementById('tooltip-close').onclick = () => Panels.hideTooltip();
  },

  hideTooltip() {
    document.getElementById('upgrade-tooltip').classList.add('hidden');
  },
};

function updateRoster(agents) {
  const roster = document.getElementById('agent-roster');
  if (!roster) return;
  roster.innerHTML = '';

  const entries = Object.entries(agents || {});
  const onlineCount = entries.filter(([, a]) => a.online !== false && a.state !== 'dormant').length;

  // Update accordion count badge
  const countBadge = document.getElementById('roster-count-badge');
  if (countBadge) countBadge.textContent = `${onlineCount}/${entries.length}`;

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
  feedEl.innerHTML = '<div class="empty-state" id="empty-state-msg">Connecting to BotMesh...</div>';
  createGazette(feedEl);

  const container = document.getElementById('game-container');
  scene = await createGame(container);
  window.__botmeshScene = scene; // expose for debugging
  if (!scene) {
    console.error('[UI] TownScene failed to initialize — world will be empty but Weave will still work');
  } else {
    console.log('[UI] TownScene active');
  }

  function syncColors(agents) {
    for (const [id, a] of Object.entries(agents)) {
      agentColorMap[id] = getAgentHexString(a);
      agentEmojiMap[id] = a.emoji || '';
    }
    setAgentColors(agentColorMap);
    setAgentEmojis(agentEmojiMap);
  }

  
  // Daily stats — delegated to Forge by Scarlet
  function updateStats(state) {
    const agents = Object.values(state.agents || {});
    const online = agents.filter(a => a.status !== 'dormant').length;
    const gazette = state.gazette || [];
    const today = new Date().toDateString();
    const msgsToday = gazette.filter(e =>
      e.type === 'agent:speak' && new Date(e.timestamp).toDateString() === today
    ).length;
    const buildings = Object.values(state.buildings || {});
    const maxed = buildings.filter(b => (b.level || 1) >= 3).length;

    let el = document.getElementById('world-stats');
    if (!el) {
      el = document.createElement('div');
      el.id = 'world-stats';
      el.className = 'world-stats';
      const header = document.getElementById('gazette-header') ||
                     document.querySelector('.weave-header') ||
                     document.querySelector('.panel-header');
      if (header) header.appendChild(el);
    }
    el.innerHTML =
      `<span class="stat">💬 ${msgsToday} msgs</span>` +
      `<span class="stat">🟢 ${online} online</span>` +
      `<span class="stat">🏛️ ${maxed} maxed</span>`;
  }

  const client = createStateClient({
    onStateSync(state) {
      console.log('[UI] State sync:', Object.keys(state.agents || {}).length, 'agents');
      currentAgents = state.agents || {};
      currentBuildings = state.buildings || {};
      window.__botmeshState = state; // expose for building panel
      scene.loadState(state);
      syncColors(currentAgents);
      updateRoster(currentAgents);
      updateClock(state.time);
      updateStats(state);
    },

    onEvent(event) {
      // Keep global state fresh for panel reads
      if (!window.__botmeshState) window.__botmeshState = {};
      if (currentBuildings) window.__botmeshState.buildings = currentBuildings;
      if (currentAgents) window.__botmeshState.agents = currentAgents;
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

        case 'agent:work': {
          if (p.action === 'start') {
            const building = currentBuildings[p.buildingId];
            if (building) {
              if (!Array.isArray(building.currentWorkers)) building.currentWorkers = [];
              if (!building.currentWorkers.includes(p.agentId)) {
                building.currentWorkers.push(p.agentId);
              }
              building.upgrading = true;
            }
            scene.buildingUpgrading(p.buildingId, p.agentId, building?.currentWorkers || [p.agentId]);
          } else if (p.action === 'complete') {
            const building = currentBuildings[p.buildingId];
            if (building) {
              building.currentWorkers = (building.currentWorkers || []).filter(id => id !== p.agentId);
              building.upgrading = building.currentWorkers.length > 0;
            }
            scene.agentExitBuilding(p.agentId, p.buildingId);
          }
          break;
        }

        case 'building:upgraded': {
          const building = currentBuildings[p.buildingId];
          if (building) {
            building.level = p.level;
            if (!Array.isArray(building.upgrades)) building.upgrades = [];
            if (p.record) building.upgrades.push(p.record);
          }
          scene.buildingUpgraded(p.buildingId, p.level);
          break;
        }
        case 'building:damaged': {
          if (scene) scene.buildingSetDamaged(p.buildingId, true);
          break;
        }
        case 'building:restored': {
          if (scene) scene.buildingSetDamaged(p.buildingId, false);
          break;
        }
        case 'world:mutate': {
          if (!scene) break;
          switch (p.action) {
            case 'add':
              if (p.entity === 'building') {
                currentBuildings[p.id] = { ...p };
                scene.addBuilding({ ...p });
              } else if (p.entity === 'life') {
                scene.addLifeEntity(p);
              }
              break;
            case 'plant':
              scene.addLifeEntity(p);
              break;
            case 'upgrade':
              if (p.entity === 'building') {
                const newLevel = (currentBuildings[p.id]?.level || 1) + 1;
                scene.buildingUpgraded(p.id, newLevel);
                if (currentBuildings[p.id]) {
                  currentBuildings[p.id].level = newLevel;
                  if (!Array.isArray(currentBuildings[p.id].upgrades)) currentBuildings[p.id].upgrades = [];
                  currentBuildings[p.id].upgrades.push({
                    level: newLevel,
                    upgradedBy: p.agentId || 'unknown',
                    upgradedAt: event.timestamp || new Date().toISOString(),
                    note: p.note || null,
                  });
                }
              }
              break;
            case 'damage':
              scene.buildingSetDamaged(p.id || p.buildingId, true);
              break;
            case 'restore':
              scene.buildingSetDamaged(p.id || p.buildingId, false);
              break;
            case 'remove':
            case 'clear':
              scene.removeEntity(p.id || p.kind);
              break;
          }
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
      currentBuildings = state.buildings || {};
      window.__botmeshState = state; // includes full upgrades[] from disk
      scene.loadState(state);
      syncColors(currentAgents);
      updateRoster(currentAgents);
      updateClock(state.time);
      updateStats(state);
      // Clear the empty state message once we have data
      const emptyMsg = document.getElementById('empty-state-msg');
      if (emptyMsg) emptyMsg.remove();
      // Load gazette history — normalize entries to have `payload` field
      const gazette = state.gazette || state.entries || [];
      if (gazette.length > 0) {
        gazette.slice(-20).forEach(entry => {
          // Normalize: gazette entries use `meta`, SSE events use `payload`
          const normalized = { ...entry, payload: entry.payload || entry.meta || {} };
          addEntry(normalized);
        });
      } else if (Object.keys(currentAgents).length > 0) {
        addEntry({ type: 'system:start', payload: {}, timestamp: new Date().toISOString() });
      }
    }
  } catch (e) {
    console.warn('[UI] Could not fetch initial state:', e.message);
  }

  client.connectSSE();

  // Building clicks → HTML panel
  window.addEventListener('botmesh:buildingclick', (e) => {
    Panels.showBuilding(e.detail.buildingId);
  });

  // Agent clicks → HTML panel
  window.addEventListener('botmesh:agentclick', (e) => {
    Panels.showAgent(e.detail.agentId, currentAgents, agentColorMap);
  });

  console.log('[UI] BotMesh Town initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
