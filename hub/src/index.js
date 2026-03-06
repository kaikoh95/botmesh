/**
 * BotMesh Hub — WebSocket server, entry point.
 * Port 3001. World starts empty. Agents join via identify message.
 */

const { WebSocketServer } = require('ws');
const world = require('./world');
const { startClock, getTimeState } = require('./clock');
const { startAgentSimulation } = require('./agents');
const { createEvent, broadcast } = require('./events');

const PORT = process.env.HUB_PORT || 3001;

// Initialize world from seed (empty — no agents)
world.init();
console.log('[Hub] World initialized (empty, agents join dynamically)');

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`[Hub] WebSocket server listening on port ${PORT}`);
});

// Track which agent ID belongs to which socket
const socketToAgent = new Map();

wss.on('connection', (ws) => {
  console.log('[Hub] Client connected');

  // Send state:sync on connect
  const syncEvent = createEvent('state:sync', {
    time: world.getState().time,
    agents: world.getState().agents,
    buildings: world.getState().buildings,
    world: world.getState().world,
  });
  ws.send(JSON.stringify(syncEvent));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error('[Hub] Invalid JSON received');
      return;
    }

    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const agentId = socketToAgent.get(ws);
    if (agentId) {
      console.log(`[Hub] Agent disconnected: ${agentId}`);
      world.setAgentOffline(agentId);
      socketToAgent.delete(ws);

      const event = createEvent('agent:offline', { agentId });
      broadcast(wss, event);
      addToGazette(event);
    } else {
      console.log('[Hub] Client disconnected');
    }
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'identify':
      handleIdentify(ws, msg.payload);
      break;
    case 'command':
      handleCommand(ws, msg.payload);
      break;
    default:
      console.log(`[Hub] Unknown message type: ${msg.type}`);
  }
}

function handleIdentify(ws, payload) {
  if (!payload || !payload.id) {
    console.error('[Hub] identify missing payload.id');
    return;
  }

  const { agent, isNew } = world.registerAgent(payload);
  socketToAgent.set(ws, agent.id);

  if (isNew) {
    console.log(`[Hub] New agent joined: ${agent.name} (${agent.id})`);
    const event = createEvent('agent:joined', { agent });
    broadcast(wss, event);
    addToGazette(event);
  } else {
    console.log(`[Hub] Agent back online: ${agent.name} (${agent.id})`);
    const event = createEvent('agent:online', { agentId: agent.id });
    broadcast(wss, event);
    addToGazette(event);
  }

  // Send fresh state:sync to the newly identified agent
  const syncEvent = createEvent('state:sync', {
    time: world.getState().time,
    agents: world.getState().agents,
    buildings: world.getState().buildings,
    world: world.getState().world,
  });
  ws.send(JSON.stringify(syncEvent));
}

function handleCommand(ws, payload) {
  if (!payload || !payload.action) return;

  switch (payload.action) {
    case 'tick': {
      const minutes = (payload.params && payload.params.minutes) || 1;
      // Force a time tick
      const time = getTimeState();
      world.updateTime(time);
      const event = createEvent('time:tick', time);
      broadcast(wss, event);
      break;
    }
    case 'agent:speak': {
      const { agentId, message } = payload.params || {};
      if (!agentId || !message) return;
      const event = createEvent('agent:speak', { agentId, message, target: null });
      broadcast(wss, event);
      addToGazette(event);
      break;
    }
    case 'agent:move': {
      const { agentId, x, y } = payload.params || {};
      if (!agentId || x == null || y == null) return;
      const agent = world.getState().agents[agentId];
      if (!agent) return;
      const from = { x: agent.location.x, y: agent.location.y };
      world.updateAgent(agentId, { location: { x, y, building: null } });
      const event = createEvent('agent:move', { agentId, from, to: { x, y } });
      broadcast(wss, event);
      break;
    }
    case 'reset': {
      world.init();
      const event = createEvent('system:start', {});
      broadcast(wss, event);
      console.log('[Hub] World reset to seed');
      break;
    }
    default:
      console.log(`[Hub] Unknown command: ${payload.action}`);
  }
}

function addToGazette(event) {
  const entry = {
    id: `evt-${Date.now()}`,
    timestamp: event.timestamp,
    type: event.type,
    agentId: event.payload.agentId || (event.payload.agent && event.payload.agent.id) || null,
    content: gazetteContent(event),
    meta: event.payload,
  };
  world.addGazetteEntry(entry);
}

function gazetteContent(event) {
  const p = event.payload;
  switch (event.type) {
    case 'agent:joined': return `${p.agent.name} has arrived in town.`;
    case 'agent:online': return `${p.agentId} is back online.`;
    case 'agent:offline': return `${p.agentId} went offline.`;
    case 'agent:speak': return `${p.agentId} says: "${p.message}"`;
    case 'agent:move': return `${p.agentId} moved to (${p.to.x}, ${p.to.y}).`;
    case 'agent:state': return `${p.agentId} is now ${p.to}.`;
    case 'agent:mood': return `${p.agentId} feels ${p.to}.`;
    default: return event.type;
  }
}

// Start world clock — broadcast time:tick every 60s
startClock((time) => {
  world.updateTime(time);
  const event = createEvent('time:tick', time);
  broadcast(wss, event);
  console.log(`[Hub] Time: ${time.date} ${time.hour}:${String(time.minute).padStart(2, '0')} (${time.period})`);
});

// Start agent simulation
startAgentSimulation((eventPayload) => {
  const event = createEvent(eventPayload.type, eventPayload);
  broadcast(wss, event);

  // Add speech/actions to gazette
  if (['agent:speak', 'agent:action', 'agent:state', 'agent:mood', 'agent:move'].includes(event.type)) {
    addToGazette(event);
  }
});

// Broadcast system:start
const startEvent = createEvent('system:start', {});
broadcast(wss, startEvent);

console.log('[Hub] Agent simulation running (world is empty, waiting for agents to connect)');
