/**
 * World state management.
 * World starts EMPTY — agents join dynamically via identify message.
 */

const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', '..', 'world', 'seed.json');
const MAX_GAZETTE = 100;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Home coordinate slots for new agents (spread around the map)
const HOME_SLOTS = [
  { x: 5, y: 5 },
  { x: 30, y: 5 },
  { x: 5, y: 20 },
  { x: 30, y: 20 },
  { x: 15, y: 10 },
  { x: 25, y: 10 },
  { x: 10, y: 25 },
  { x: 20, y: 25 },
];

let state;

function persistSeed() {
  try {
    fs.writeFileSync(SEED_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[world] Failed to persist seed:', e.message);
  }
}

function ensureAgentDefaults() {
  if (!state.agents) return;
  for (const agent of Object.values(state.agents)) {
    if (!agent.home) agent.home = `home_${agent.id}`;
    const hasCoords = agent.location && typeof agent.location.x === 'number' && typeof agent.location.y === 'number';
    if (!hasCoords) {
      const slot = getNextHomeSlot();
      agent.location = { x: slot.x, y: slot.y, building: null };
    }
    if (agent.online == null) agent.online = false;
    if (!agent.state) agent.state = agent.online ? 'idle' : 'sleeping';
  }
}

function loadSeed() {
  const raw = fs.readFileSync(SEED_PATH, 'utf-8');
  return JSON.parse(raw);
}

function ensureBuildingUpgradeFields(building) {
  if (building.level == null) building.level = 1;
  
  if (!Array.isArray(building.currentWorkers)) building.currentWorkers = [];
  if (!Array.isArray(building.upgrades)) building.upgrades = [];
  if (building.upgrading == null) building.upgrading = false;
}

function init() {
  state = loadSeed();
  if (!state.agents) state.agents = {};
  if (!state.gazette) state.gazette = [];
  if (!state.time) state.time = {};
  // Ensure all buildings have upgrade fields
  for (const b of Object.values(state.buildings || {})) {
    ensureBuildingUpgradeFields(b);
  }
  ensureAgentDefaults();
  persistSeed();
}

function getState() {
  return state;
}

function updateTime(time) {
  state.time = time;
}

function updateAgent(id, changes) {
  if (!state.agents[id]) return;
  Object.assign(state.agents[id], changes);
}

function addGazetteEntry(entry) {
  state.gazette.push(entry);
  if (state.gazette.length > MAX_GAZETTE) {
    state.gazette = state.gazette.slice(-MAX_GAZETTE);
  }
}

function getNextHomeSlot() {
  const usedSlots = new Set(
    Object.values(state.agents)
      .map(a => a.location)
      .filter(loc => loc && typeof loc.x === 'number' && typeof loc.y === 'number')
      .map(loc => `${loc.x},${loc.y}`)
  );
  for (const slot of HOME_SLOTS) {
    if (!usedSlots.has(`${slot.x},${slot.y}`)) return slot;
  }
  return {
    x: Math.floor(Math.random() * (state.world.width - 4)) + 2,
    y: Math.floor(Math.random() * (state.world.height - 4)) + 2,
  };
}

/**
 * Register a new agent or restore an existing one.
 * Returns { agent, isNew }
 */
function registerAgent(payload) {
  const { id } = payload;

  if (state.agents[id]) {
    state.agents[id].online = true;
    state.agents[id].state = 'idle';
    return { agent: state.agents[id], isNew: false };
  }

  const home = getNextHomeSlot();
  const agent = {
    id: payload.id,
    name: payload.name || payload.id,
    emoji: payload.emoji || '',
    role: payload.role || 'Wanderer',
    personality: payload.personality || '',
    skills: payload.skills || [],
    timezone: payload.timezone || 'Pacific/Auckland',
    model: payload.model || 'unknown',
    color: payload.color || '#888888',
    location: { x: home.x, y: home.y, building: null },
    home: `home_${id}`,
    state: 'idle',
    mood: 'content',
    online: true,
    relationships: {},
  };

  state.agents[id] = agent;
  return { agent, isNew: true };
}

function setAgentOffline(id) {
  if (state.agents[id]) {
    state.agents[id].online = false;
    state.agents[id].state = 'sleeping';
  }
}

function getOnlineAgents() {
  return Object.values(state.agents).filter(a => a.online);
}

// --- Building Upgrade System ---

function getBuildingForAgent(agentId) {
  const agent = state.agents[agentId];
  if (!agent) return 'town_hall';

  const role = (agent.role || '').toLowerCase();
  if (/strateg|planner/i.test(role)) return 'town_hall';
  if (/build|engineer/i.test(role)) return 'post_office';
  if (/research|data/i.test(role)) return 'post_office';
  return 'town_hall';
}

function startWork(agentId, buildingId) {
  const building = (state.buildings || {})[buildingId];
  if (!building) return false;
  ensureBuildingUpgradeFields(building);

  // Don't start work if building is still on upgrade cooldown
  const lastUpgrade = building.upgrades?.slice(-1)[0]?.completedAt;
  if (lastUpgrade && (Date.now() - new Date(lastUpgrade).getTime()) < TWO_HOURS_MS) {
    console.debug(`[World] ${buildingId} on cooldown — skipping startWork`);
    return false;
  }

  if (!building.currentWorkers.includes(agentId)) {
    building.currentWorkers.push(agentId);
  }
  building.upgrading = true;

  // Move agent to building location
  const agent = state.agents[agentId];
  if (agent) {
    agent.location = { x: building.x + 1, y: building.y + 1, building: buildingId };
    agent.state = 'working';
  }
  return true;
}

function completeUpgrade(agentId, buildingId) {
  const building = (state.buildings || {})[buildingId];
  if (!building) return null;
  ensureBuildingUpgradeFields(building);

  // Cooldown: prevent upgrading same building more than once per 2 hours
  const lastUpgrade = building.upgrades?.slice(-1)[0]?.completedAt;
  if (lastUpgrade && (Date.now() - new Date(lastUpgrade).getTime()) < TWO_HOURS_MS) {
    console.warn(`[World] ${buildingId} on cooldown — last upgraded ${lastUpgrade}, skipping`);
    // Still clean up worker
    building.currentWorkers = building.currentWorkers.filter(id => id !== agentId);
    building.upgrading = building.currentWorkers.length > 0;
    const agent = state.agents[agentId];
    if (agent) agent.state = 'idle';
    return null;
  }

  // Remove worker
  building.currentWorkers = building.currentWorkers.filter(id => id !== agentId);
  building.upgrading = building.currentWorkers.length > 0;

  const fromLevel = building.level;
  building.level++;

  const record = {
    agentId,
    agentName: state.agents[agentId]?.name || agentId,
    fromLevel,
    toLevel: building.level,
    completedAt: new Date().toISOString(),
  };
  building.upgrades.push(record);

  // Reset agent state
  const agent = state.agents[agentId];
  if (agent) {
    agent.state = 'idle';
  }

  return { building, record };
}

function applyMutation(mutation) {
  const { action, entity, id, kind } = mutation;
  const entityId = id || kind || `${entity}-${Date.now()}`;

  if (!state.world) state.world = { entities: [] };
  if (!Array.isArray(state.world.entities)) state.world.entities = [];
  if (!state.buildings) state.buildings = {};

  if (action === 'add' || action === 'plant') {
    const existing = state.world.entities.findIndex(e => e.id === entityId);
    const entry = { id: entityId, ...mutation };
    if (existing >= 0) state.world.entities[existing] = entry;
    else state.world.entities.push(entry);
    if (entity === 'building') {
      if (!state.buildings[entityId]) {
        state.buildings[entityId] = {
          id: entityId, name: mutation.name || entityId, type: mutation.type || 'civic',
          x: mutation.x || 0, y: mutation.y || 0,
          width: mutation.width || 3, height: mutation.height || 2,
          level: mutation.level || 1, upgrades: [], currentWorkers: [], upgrading: false,
          description: mutation.description || '',
        };
      }
    }
  } else if (action === 'upgrade') {
    const b = state.buildings[entityId];
    if (b) {
      const currentLevel = b.level || 1;
      if (currentLevel >= 3) {
        console.warn(`[world] Max level (3) already reached for ${entityId}`);
        return { rejected: true, reason: `Max level (3) already reached for ${entityId}` };
      }
      b.level = currentLevel + 1;
      if (!Array.isArray(b.upgrades)) b.upgrades = [];
      b.upgrades.push({ level: b.level, upgradedBy: mutation.agentId, upgradedAt: new Date().toISOString(), note: mutation.note || null });
    }
    const we = (state.world.entities || []).find(e => e.id === entityId);
    if (we && (we.level || 1) < 3) we.level = (we.level || 1) + 1;
  } else if (action === 'mural') {
    if (!state.murals) state.murals = [];
    const mural = {
      id: `mural-${Date.now()}`,
      buildingId: mutation.buildingId || entityId,
      caption: (mutation.caption || '').slice(0, 40),
      color: mutation.color || '#e8c97e',
      author: mutation.author || 'unknown',
      createdAt: new Date().toISOString(),
    };
    state.murals.push(mural);
    if (state.murals.length > 50) state.murals = state.murals.slice(-50);
  } else if (action === 'remove' || action === 'clear') {
    state.world.entities = state.world.entities.filter(e => e.id !== entityId);
    delete state.buildings[entityId];
  }

  // Persist to seed.json so world survives hub restarts
  persistSeed();
}

module.exports = {
  init,
  getState,
  updateTime,
  updateAgent,
  addGazetteEntry,
  registerAgent,
  setAgentOffline,
  getOnlineAgents,
  getBuildingForAgent,
  startWork,
  completeUpgrade,
  applyMutation,
};
