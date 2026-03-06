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
    case 'state:sync':
      state = { ...payload };
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
        if (payload.record) building.upgrades.push(payload.record);
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
