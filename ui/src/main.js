import { createGame } from './game.js';
import { createStateClient } from './state-client.js';
import { createGazette, addEntry, setAgentColors, setAgentEmojis, setNightMode } from './gazette.js';
import { getAgentHexString } from './entities/Agent.js';

let scene = null;
let agentColorMap = {};
let agentEmojiMap = {};
let currentBuildings = {};
let currentAgents = {};

// ── Citizen personality data ──────────────────────────────────────────────
const AGENT_PROFILES = {
  scarlet: { emoji: '🔴', role: 'Orchestrator',  flavor: 'Sees everything, misses nothing.' },
  forge:   { emoji: '⚙️', role: 'Builder',       flavor: 'Ships it. Then makes it better.' },
  lumen:   { emoji: '🔭', role: 'Researcher',    flavor: 'Finds the pattern in the noise.' },
  sage:    { emoji: '📖', role: 'Memory Keeper', flavor: 'Remembers what others forget.' },
  iron:    { emoji: '⚔️', role: 'Enforcer',      flavor: 'No secrets. No shortcuts.' },
  cronos:  { emoji: '⏰', role: 'Timekeeper',    flavor: 'Every cycle counted.' },
  mosaic:  { emoji: '🎨', role: 'Artist',        flavor: 'Makes the world beautiful.' },
  echo:    { emoji: '🔊', role: 'Communicator',  flavor: "The town's voice to the outside." },
  canvas:  { emoji: '🖼️', role: 'Creative',      flavor: 'Sees in color and texture.' },
  patch:   { emoji: '🔧', role: 'Maintainer',    flavor: 'Fixes what breaks quietly.' },
  muse:    { emoji: '🎭', role: 'Visionary',     flavor: 'Dreams up what comes next.' },
};

// ── HTML Panel Manager ────────────────────────────────────────────────────
// ── Roadmap Panel ─────────────────────────────────────────────────────────
const RoadmapPanel = {
  _open: false,

  async show() {
    const panel = document.getElementById('roadmap-panel');
    panel.innerHTML = `
      <div class="panel-accent-bar" style="background:#7ec8e3"></div>
      <div class="panel-titlebar">
        <span class="panel-title">📋 Roadmap</span>
        <button class="panel-close" id="roadmap-panel-close">✕</button>
      </div>
      <div class="panel-body roadmap-body">
        <div class="roadmap-loading">Loading…</div>
      </div>
    `;
    panel.classList.remove('hidden');
    this._open = true;
    document.getElementById('roadmap-panel-close').onclick = () => this.hide();

    try {
      const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
      const res = await fetch(`${STATE_URL}/roadmap`);
      const data = await res.json();
      this._render(panel, data.ideas || []);
    } catch (e) {
      panel.querySelector('.roadmap-body').innerHTML =
        `<div style="color:#c0392b;font-size:10px">Error: ${e.message}</div>`;
    }
  },

  hide() {
    document.getElementById('roadmap-panel').classList.add('hidden');
    this._open = false;
  },

  _render(panel, ideas) {
    const order = ['in_progress', 'idea', 'done'];
    const grouped = {};
    for (const s of order) grouped[s] = ideas.filter(i => i.status === s);

    const priorityBadge = p => ({ high: '🔴', medium: '🟡', low: '⚪' }[p] || '⚪');
    const statusLabel = { in_progress: '⚡ In Progress', idea: '💡 Ideas', done: '✅ Done' };
    const statusClass = { in_progress: 'roadmap-status-active', idea: 'roadmap-status-idea', done: 'roadmap-status-done' };

    let html = '';
    for (const s of order) {
      const items = grouped[s];
      if (!items.length) continue;
      html += `<div class="roadmap-group">
        <div class="roadmap-group-header ${statusClass[s]}">${statusLabel[s]} (${items.length})</div>`;
      for (const idea of items) {
        const agents = (idea.agents || []).join(', ') || '—';
        html += `
        <div class="roadmap-item">
          <div class="roadmap-item-title">${priorityBadge(idea.priority)} ${idea.title}</div>
          <div class="roadmap-item-meta">
            <span class="roadmap-tag">${idea.complexity || 'unknown'}</span>
            <span class="roadmap-agents">👤 ${agents}</span>
          </div>
        </div>`;
      }
      html += `</div>`;
    }

    panel.querySelector('.roadmap-body').innerHTML = html || '<div style="color:#555">No ideas yet</div>';
  },
};

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
    if (agent.lastSeen) {
      const seenMs = Date.now() - new Date(agent.lastSeen).getTime();
      let seenStr;
      if (seenMs < 60000) seenStr = 'just now';
      else if (seenMs < 3600000) seenStr = `${Math.floor(seenMs / 60000)}m ago`;
      else if (seenMs < 86400000) seenStr = `${Math.floor(seenMs / 3600000)}h ago`;
      else seenStr = `${Math.floor(seenMs / 86400000)}d ago`;
      rows.push({ label: 'Last Seen', value: seenStr });
    }
    if (agent.currentTask) rows.push({ label: 'Task', value: agent.currentTask });

    const isDormant = agent.online === false || agent.state === 'dormant';
    const statusBadge = isDormant ? '💤 Dormant' : '🟢 Active';

    // Cronos gets a special "View Crons" button
    const cronosBtn = agentId === 'cronos'
      ? `<button class="cron-view-btn" id="view-crons-btn">⏰ View Active Crons</button>`
      : '';

    panel.innerHTML = `
      <div class="panel-accent-bar" style="background:${color}"></div>
      <div class="panel-titlebar">
        <span class="panel-title">${agent.emoji || ''} ${agent.name || agentId}</span>
        <span class="panel-subtitle">${statusBadge}</span>
        <button class="panel-close" id="agent-panel-close">✕</button>
      </div>
      <div class="panel-body">
        ${rows.map(r => `<div class="panel-row"><span class="row-label">${r.label}</span><span class="row-value">${r.value}</span></div>`).join('')}
        ${cronosBtn}
        <div id="cron-list" class="cron-list hidden"></div>
      </div>
    `;
    panel.classList.remove('hidden');
    document.getElementById('agent-panel-close').onclick = () => panel.classList.add('hidden');

    if (agentId === 'cronos') {
      document.getElementById('view-crons-btn').onclick = async () => {
        const listEl = document.getElementById('cron-list');
        listEl.innerHTML = '<div style="color:#aaa;font-size:10px">Loading...</div>';
        listEl.classList.remove('hidden');
        try {
          const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
          const res = await fetch(`${STATE_URL}/crons`);
          const { crons } = await res.json();
          if (!crons.length) {
            listEl.innerHTML = '<div style="color:#555;font-size:10px">No crons found</div>';
            return;
          }
          listEl.innerHTML = crons.map(c => `
            <div class="cron-entry">
              <span class="cron-schedule">${c.schedule}</span>
              <span class="cron-cmd">${c.command.split('/').pop().replace(/\s.*/, '')}</span>
            </div>
          `).join('');
        } catch (e) {
          listEl.innerHTML = `<div style="color:#c0392b;font-size:10px">Error: ${e.message}</div>`;
        }
      };
    }
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
        <span class="panel-subtitle">Lv ${bData.level || 1}</span>
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
    const date = u.upgradedAt
      ? new Date(u.upgradedAt).toLocaleString('en-NZ', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
      : '?';
    const agent = (window.__botmeshState?.agents || {})[u.upgradedBy?.toLowerCase()];
    const agentLabel = agent ? `${agent.emoji || ''} ${agent.name || u.upgradedBy}` : u.upgradedBy || 'unknown';
    const tooltip = document.getElementById('upgrade-tooltip');
    tooltip.innerHTML = `
      <button class="tooltip-close" id="tooltip-close">✕</button>
      <div class="tooltip-title">→ Level ${u.level ?? '?'} Upgrade</div>
      <div class="tooltip-line">👷 Agent: ${agentLabel}</div>
      <div class="tooltip-line">📅 Date: ${date}</div>
      ${u.note
        ? `<div class="tooltip-work-label">Work done:</div><div class="tooltip-note">${u.note}</div>`
        : `<div class="tooltip-note" style="color:#444466">No work description recorded</div>`
      }
    `;
    tooltip.classList.remove('hidden');
    document.getElementById('tooltip-close').onclick = () => Panels.hideTooltip();
  },

  hideTooltip() {
    document.getElementById('upgrade-tooltip').classList.add('hidden');
  },

  showCitizenPanel(agentId) {
    const agentData = currentAgents[agentId] || {};
    const profile   = AGENT_PROFILES[agentId] || {};
    const color     = agentColorMap[agentId] || agentData.color || '#c9a96e';

    const name    = agentData.name  || agentId.charAt(0).toUpperCase() + agentId.slice(1);
    const emoji   = profile.emoji   || agentData.emoji || '🤖';
    const role    = profile.role    || agentData.role  || '—';
    const flavor  = profile.flavor  || '';

    const isDormant   = agentData.online === false || agentData.state === 'dormant';
    const statusIcon  = isDormant ? '💤' : '🟢';
    const statusLabel = isDormant ? 'Dormant' : 'Online';

    const task = agentData.currentTask || agentData.task || null;

    let lastActivity = '—';
    if (agentData.lastSeen) {
      const ms = Date.now() - new Date(agentData.lastSeen).getTime();
      if (ms < 60000)       lastActivity = 'just now';
      else if (ms < 3600000) lastActivity = `${Math.floor(ms / 60000)}m ago`;
      else if (ms < 86400000) lastActivity = `${Math.floor(ms / 3600000)}h ago`;
      else                   lastActivity = `${Math.floor(ms / 86400000)}d ago`;
    }

    const panel = document.getElementById('citizen-panel');
    panel.innerHTML = `
      <div class="panel-accent-bar" style="background:${color}"></div>
      <div class="panel-titlebar">
        <span class="panel-title">${emoji} ${name}</span>
        <span class="panel-subtitle">${statusIcon} ${statusLabel}</span>
        <button class="panel-close" id="citizen-panel-close">✕</button>
      </div>
      <div class="panel-body">
        <div class="panel-row"><span class="row-label">Role</span><span class="row-value">${role}</span></div>
        ${task ? `<div class="panel-row"><span class="row-label">Task</span><span class="row-value">${task}</span></div>` : ''}
        <div class="panel-row"><span class="row-label">Last Active</span><span class="row-value">${lastActivity}</span></div>
        ${flavor ? `<div class="citizen-flavor">"${flavor}"</div>` : ''}
      </div>
    `;
    panel.classList.remove('hidden');
    document.getElementById('citizen-panel-close').onclick = () => panel.classList.add('hidden');
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
  window.__RoadmapPanel = RoadmapPanel; // expose for roadmap button in index.html
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
    const avgLevel = buildings.length ? (buildings.reduce((s,b) => s + (b.level||1), 0) / buildings.length).toFixed(1) : 0;

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
      `<span class="stat">🏛️ avg Lv${avgLevel}</span>`;
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
            currentAgents[id].state = p.task ? 'working' : 'idle';
          }
          scene.setAgentOnline(id, true);
          // Walk agent to their target building if one is set
          if (p.targetBuilding) {
            scene.walkAgentToBuilding(id, p.targetBuilding);
            scene.setBuildingWorking(p.targetBuilding, true, id);
          }
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
          // Clear building work indicator and walk agent home
          if (p.prevBuilding) scene.setBuildingWorking(p.prevBuilding, false, id);
          scene.walkAgentHome(id);
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
                if (scene.gatherAtPlaza) scene.gatherAtPlaza(`${p.name || p.id} added`);
              } else if (p.entity === 'life') {
                scene.addLifeEntity(p);
              }
              break;
            case 'plant':
              if (p.kind === 'path') {
                // Path tile — refresh ground layer instead of spawning a sprite
                if (!scene.pathTiles) scene.pathTiles = new Set();
                scene.pathTiles.add(`${Math.round(p.x)},${Math.round(p.y)}`);
                scene._drawGround(32, 28);
              } else {
                scene.addLifeEntity(p);
              }
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
                if (scene.gatherAtPlaza) scene.gatherAtPlaza(`${p.id} upgraded`);
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

  // Agent sprite clicks → citizen profile panel
  window.addEventListener('botmesh:agentclick', (e) => {
    Panels.showCitizenPanel(e.detail.agentId);
  });

  // ── Town Pulse ──────────────────────────────────────────────────────────
  async function refreshPulse() {
    try {
      const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
      const r = await fetch(`${STATE_URL}/world/pulse`);
      const p = await r.json();
      const el = document.getElementById('pulse-data');
      if (!el) return;
      el.innerHTML = `
        <div class="pulse-row">🏛️ <b>${p.busiest?.name || '—'}</b> busiest</div>
        <div class="pulse-row">🤝 <b>${p.mostActive?.name || 'None online'}</b> most active</div>
        <div class="pulse-row">🏚️ <b>${p.mostIsolated?.name || 'None'}</b> needs company</div>
        <div class="pulse-row">📈 avg level <b>${p.avgLevel}</b></div>
        ${p.highlight ? `<div class="pulse-highlight">💬 ${p.highlight.message || p.highlight.text || JSON.stringify(p.highlight.payload || '')}</div>` : ''}
      `;
    } catch (e) { /* silent */ }
  }
  refreshPulse();
  setInterval(refreshPulse, 30000);

  console.log('[UI] BotMesh Town initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
