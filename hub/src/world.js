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

function init() {
  state = loadSeed();
  // Ensure agents is always an object (seed has it empty)
  if (!state.agents) state.agents = {};
  if (!state.gazette) state.gazette = [];
  if (!state.time) state.time = {};
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
  // Fallback: random position
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
    // Existing agent — restore, mark online
    state.agents[id].online = true;
    state.agents[id].state = 'idle';
    return { agent: state.agents[id], isNew: false };
  }

  // New agent — create from identify payload
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

module.exports = {
  init,
  getState,
  updateTime,
  updateAgent,
  addGazetteEntry,
  registerAgent,
  setAgentOffline,
  getOnlineAgents,
};
