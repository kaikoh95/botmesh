const express = require('express');
const cors = require('cors');
const { loadState, saveState } = require('./persistence');
const { connectToHub } = require('./hub-client');
const { createSSEManager } = require('./sse');
const { createRoutes } = require('./routes');

const PORT = process.env.PORT || 3002;

// In-memory state
let state = loadState();
console.log('[State] Loaded state from disk');

function getState() {
  return state;
}

// Apply Hub events to in-memory state
function applyEvent(event) {
  const { type, payload } = event;

  switch (type) {
    case 'state:sync': {
      // Merge hub sync — never let hub wipe existing agents (hub restarts empty)
      const existingAgentCount = Object.keys(state.agents || {}).length;
      const incomingAgentCount = Object.keys(payload.agents || {}).length;
      if (incomingAgentCount < existingAgentCount) {
        // Hub has fewer agents than we know about — merge buildings/time but keep agents
        state = { ...payload, agents: { ...state.agents, ...(payload.agents || {}) } };
        console.log(`[state] state:sync merge (hub:${incomingAgentCount} < local:${existingAgentCount}) — kept local agents`);
      } else {
        state = { ...payload };
      }
      break;
    }
      break;

    case 'time:tick':
      state.time = payload;
      break;

    case 'agent:move': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.location = payload.to;
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:state': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.state = payload.to;
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:mood': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.mood = payload.to;
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:speak':
    case 'agent:action':
    case 'world:event':
      addGazetteEntry(event);
      break;

    case 'world:mutate': {
      if (!state.world) state.world = { entities: [] };
      if (!Array.isArray(state.world.entities)) state.world.entities = [];
      const { action, entity, id, kind } = payload;
      const entityId = id || kind || `${entity}-${Date.now()}`;

      switch (action) {
        case 'add':
        case 'plant': {
          // Add new entity to world
          const existing = state.world.entities.findIndex(e => e.id === entityId);
          const entry = { id: entityId, entity, ...payload, addedAt: new Date().toISOString() };
          if (existing >= 0) state.world.entities[existing] = entry;
          else state.world.entities.push(entry);
          // Buildings also get registered in state.buildings for panel/upgrade access
          if (entity === 'building') {
            if (!state.buildings) state.buildings = {};
            if (!state.buildings[entityId]) {
              state.buildings[entityId] = {
                id: entityId,
                name: payload.name || entityId,
                type: payload.type || 'civic',
                x: payload.x || 0, y: payload.y || 0,
                width: payload.width || 3, height: payload.height || 2,
                level: payload.level || 1,
                maxLevel: payload.maxLevel || 3,
                upgrades: [],
                currentWorkers: [],
                description: payload.description || '',
                addedAt: new Date().toISOString(),
              };
            }
          }
          break;
        }
        case 'upgrade': {
          const building = (state.buildings || {})[entityId];
          if (building) {
            building.level = (building.level || 1) + 1;
            if (!Array.isArray(building.upgrades)) building.upgrades = [];
            building.upgrades.push({
              level: building.level,
              upgradedBy: payload.agentId,
              upgradedAt: new Date().toISOString(),
              note: payload.note || null,
            });
          }
          // Also update world entities list if present
          const we = (state.world?.entities || []).find(e => e.id === entityId);
          if (we) {
            we.level = (we.level || 1) + 1;
            if (!Array.isArray(we.upgrades)) we.upgrades = [];
            we.upgrades.push({ level: we.level, upgradedBy: payload.agentId, upgradedAt: new Date().toISOString() });
          }
          break;
        }
        case 'damage':
          { const e = state.world.entities.find(e => e.id === entityId);
            if (e) e.damaged = true;
            if (state.buildings && state.buildings[entityId]) state.buildings[entityId].damaged = true;
            break; }
        case 'restore':
          { const e = state.world.entities.find(e => e.id === entityId);
            if (e) e.damaged = false;
            if (state.buildings && state.buildings[entityId]) state.buildings[entityId].damaged = false;
            break; }
        case 'remove':
        case 'clear':
          state.world.entities = state.world.entities.filter(e => e.id !== entityId);
          break;
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:work': {
      const building = (state.buildings || {})[payload.buildingId];
      if (building) {
        if (!Array.isArray(building.currentWorkers)) building.currentWorkers = [];
        if (payload.action === 'start') {
          if (!building.currentWorkers.includes(payload.agentId)) {
            building.currentWorkers.push(payload.agentId);
          }
          building.upgrading = true;
        } else if (payload.action === 'complete') {
          building.currentWorkers = building.currentWorkers.filter(id => id !== payload.agentId);
          building.upgrading = building.currentWorkers.length > 0;
        }
      }
      addGazetteEntry(event);
      break;
    }

    case 'building:upgraded': {
      const building = (state.buildings || {})[payload.buildingId];
      if (building) {
        building.level = payload.level;
        if (!Array.isArray(building.upgrades)) building.upgrades = [];
        // Dedup: skip if this level already has a richer record (from world:mutate upgrade)
        const alreadyHasLevel = building.upgrades.some(u =>
          (u.level ?? u.toLevel) === payload.level && (u.note || u.upgradedAt)
        );
        if (!alreadyHasLevel) {
          building.upgrades.push(payload.record || {
            level: payload.level,
            upgradedAt: event.timestamp || new Date().toISOString(),
            upgradedBy: payload.agentId || 'unknown',
          });
        }
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:joined': {
      if (!state.agents) state.agents = {};
      const agent = payload.agent;
      if (agent && agent.id) {
        state.agents[agent.id] = agent;
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:online': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.status = 'online';
      }
      addGazetteEntry(event);
      break;
    }

    case 'agent:offline': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.status = 'offline';
      }
      addGazetteEntry(event);
      break;
    }

    default:
      break;
  }
}

function addGazetteEntry(event) {
  if (!state.gazette) state.gazette = [];
  state.gazette.push({
    id: `evt-${Date.now()}`,
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    agentId: event.payload?.agentId || null,
    content: formatGazetteContent(event),
    meta: event.payload || {},
  });
  // Keep last 100
  if (state.gazette.length > 100) {
    state.gazette = state.gazette.slice(-100);
  }
}

function formatGazetteContent(event) {
  const { type, payload } = event;
  switch (type) {
    case 'agent:speak':
      return `${payload.agentId} says: "${payload.message}"`;
    case 'agent:move':
      return `${payload.agentId} moved to (${payload.to?.x}, ${payload.to?.y})`;
    case 'agent:state':
      return `${payload.agentId} is now ${payload.to}`;
    case 'agent:mood':
      return `${payload.agentId} feels ${payload.to}`;
    case 'agent:action':
      return `${payload.agentId} performs ${payload.action}`;
    case 'agent:joined':
      return `${payload.agent?.name || payload.agent?.id} joined the town`;
    case 'agent:online':
      return `${payload.agentId} came online`;
    case 'agent:offline':
      return `${payload.agentId} went offline`;
    case 'world:event':
      return payload.description || payload.event;
    case 'agent:work':
      return payload.action === 'start'
        ? `${payload.agentId} entered ${payload.buildingName} to work`
        : `${payload.agentId} finished working at ${payload.buildingName}`;
    case 'building:upgraded':
      return `${payload.buildingName} upgraded to Level ${payload.level}`;
    default:
      return type;
  }
}

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// SSE
const sse = createSSEManager(getState);
app.get('/events', sse.handler);

// REST routes
const { sendCommand: sendCmd, close: closeHub } = connectToHub(
  // onEvent
  (event) => {
    applyEvent(event);
    sse.broadcast(event);
    saveState(state);
  },
  // onConnect
  () => {},
  // onDisconnect
  () => {}
);

const routes = createRoutes(getState, sendCmd);
app.use(routes);

const server = app.listen(PORT, () => {
  console.log(`[State] HTTP server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[State] Shutting down...');
  closeHub();
  server.close();
  process.exit(0);
});
