/**
 * World state management.
 * World starts EMPTY — agents join dynamically via identify message.
 */

const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', '..', 'world', 'seed.json');
const MAX_GAZETTE = 100;

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
    Object.values(state.agents).map(a => `${a.location.x},${a.location.y}`)
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
    memory: [],
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

  // Remove worker
  building.currentWorkers = building.currentWorkers.filter(id => id !== agentId);
  building.upgrading = building.currentWorkers.length > 0;

  // Level up if possible
  const fromLevel = building.level;
  let upgraded = false;
  building.level++;
  upgraded = true;

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

  return upgraded ? { building, record } : { building: null, record };
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
};
