const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

// ── Load ~/.botmesh.env if tokens not already in environment ─────────────────
try {
  const envFile = require('os').homedir() + '/.botmesh.env';
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^export\s+([^=]+)=(.*)$/) || line.match(/^([^=]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
  }
} catch (e) { console.warn('[State] Could not load ~/.botmesh.env:', e.message); }
const path = require('path');
const { loadState, saveState } = require('./persistence');
const { connectToHub } = require('./hub-client');
const { createSSEManager } = require('./sse');
const { createRoutes } = require('./routes');

const PORT = process.env.PORT || 3002;
const CHARACTERS_DIR = path.join(__dirname, '../../characters');

// ── Home spawn positions for each citizen ─────────────────────────────────
const HOME_LOCATIONS = {
  scarlet: { x: 15, y: 12 }, // Town Hall area
  forge:   { x: 6,  y: 20 }, // Workshop area (west)
  lumen:   { x: 24, y: 14 }, // Library area
  sage:    { x: 27, y: 13 }, // Library area (east offset)
  iron:    { x: 18, y: 11 }, // Civic perimeter
  cronos:  { x: 4,  y: 8  }, // Cultural NW — far from echo
  mosaic:  { x: 8,  y: 15 }, // Western quarter
  echo:    { x: 29, y: 11 }, // Post Office area (NE) — far from cronos
  canvas:  { x: 16, y: 21 }, // Market area
  patch:   { x: 10, y: 20 }, // Commercial zone
  muse:    { x: 4,  y: 6  }, // Cultural NW near observatory
  planner: { x: 19, y: 13 }, // Town Hall area — observing the civic core
};
const DEFAULT_HOME = { x: 12, y: 12 };

// ── Seed citizens from characters/ directory ──────────────────────────────
// Character file existing = citizen exists in the world (dormant until active)
function seedCitizens(state) {
  if (!fs.existsSync(CHARACTERS_DIR)) return;
  const dirs = fs.readdirSync(CHARACTERS_DIR).filter(d => !d.startsWith('_'));
  for (const agentId of dirs) {
    const identityPath = path.join(CHARACTERS_DIR, agentId, 'IDENTITY.md');
    if (!fs.existsSync(identityPath)) continue;
    // Parse name, emoji, role from first line: "# Name Emoji — Role"
    const firstLine = fs.readFileSync(identityPath, 'utf8').split('\n')[0];
    const match = firstLine.match(/^#\s+(.+?)\s+(\S+)\s+—\s+(.+)$/);
    const name  = match?.[1] || agentId;
    const emoji = match?.[2] || '🤖';
    const role  = match?.[3] || 'Citizen';
    // Only seed if not already in state (don't overwrite live agent data)
    if (!state.agents) state.agents = {};
    if (!state.agents[agentId]) {
      const location = HOME_LOCATIONS[agentId] || DEFAULT_HOME;
      state.agents[agentId] = {
        id: agentId, name, emoji, role,
        state: 'dormant',
        online: false,
        location,
        skills: [],
        lastSeen: null,
      };
      console.log(`[State] Seeded citizen: ${emoji} ${name} (${agentId}) at (${location.x}, ${location.y})`);
    }
  }
}

// In-memory state
let state = loadState();
console.log('[State] Loaded state from disk');
seedCitizens(state);
console.log(`[State] Citizens: ${Object.keys(state.agents || {}).length} total`);

function getState() {
  return state;
}

// Merge two entity arrays — state layer entries win on id conflict
function mergeEntities(hubEntities, stateEntities) {
  const map = {};
  for (const e of (hubEntities  || [])) map[e.id] = e;
  for (const e of (stateEntities|| [])) map[e.id] = e; // state wins
  return Object.values(map);
}

// Apply Hub events to in-memory state
function applyEvent(event) {
  const { type, payload } = event;

  switch (type) {
    case 'state:sync': {
      // Merge hub sync — preserve state layer's authoritative data
      // Hub restarts empty; state layer is the source of truth for buildings + world
      state = {
        ...payload,
        agents:    { ...state.agents, ...(payload.agents || {}) },
        // Merge buildings — hub has seed data, state layer has upgrade history
        // Union both: hub's buildings as base, state layer entries win on conflict
        buildings: { ...(payload.buildings || {}), ...(state.buildings || {}) },
        // Same for world entities
        world: {
          ...(payload.world || {}),
          entities: mergeEntities(
            (payload.world || {}).entities || [],
            (state.world  || {}).entities || []
          ),
        },
      };
      // Re-seed any citizens that may have been wiped
      seedCitizens(state);
      break;
    }

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

    case 'agent:joined': {
      // Brand new agent — merge with seeded citizen data if exists
      const incoming = payload.agent || {};
      const existing = (state.agents || {})[incoming.id] || {};
      state.agents[incoming.id] = { ...existing, ...incoming, online: true, state: 'idle', lastSeen: new Date().toISOString() };
      addGazetteEntry(event);
      break;
    }

    case 'agent:online': {
      const a = (state.agents || {})[payload.agentId];
      if (a) { a.online = true; a.state = 'idle'; a.lastSeen = new Date().toISOString(); }
      addGazetteEntry(event);
      break;
    }

    case 'agent:offline': {
      const a = (state.agents || {})[payload.agentId];
      if (a) { a.online = false; a.state = 'dormant'; a.lastSeen = new Date().toISOString(); }
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
          // Collision detection for buildings — reject if footprint overlaps an existing building
          if (entity === 'building' && payload.x != null && payload.y != null) {
            const nx = payload.x, ny = payload.y;
            const nw = payload.width || 3, nh = payload.height || 2;
            const clash = Object.entries(state.buildings || {}).find(([bid, b]) => {
              if (bid === entityId) return false; // same building (update)
              const bx2 = b.x + (b.width||3) - 1, by2 = b.y + (b.height||2) - 1;
              const nx2 = nx + nw - 1, ny2 = ny + nh - 1;
              return nx <= bx2 && nx2 >= b.x && ny <= by2 && ny2 >= b.y;
            });
            if (clash) {
              console.warn(`[State] world:mutate REJECTED — ${entityId} at (${nx},${ny}) overlaps ${clash[0]} at (${clash[1].x},${clash[1].y})`);
              addGazetteEntry(event); // still log it
              break;
            }
          }

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
                maxLevel: null, // no cap — Forge decides
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
          if (state.buildings && state.buildings[entityId]) delete state.buildings[entityId];
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
          // ── Relationship bonding: agents sharing a workplace grow closer ──
          const workers = building.currentWorkers || [];
          if (workers.length > 1) {
            if (!state.relationships) state.relationships = {};
            for (let i = 0; i < workers.length - 1; i++) {
              for (let j = i + 1; j < workers.length; j++) {
                const key = [workers[i], workers[j]].sort().join(':');
                if (!state.relationships[key]) state.relationships[key] = { score: 0, interactions: 0 };
                state.relationships[key].score = Math.min(100, state.relationships[key].score + 2);
                state.relationships[key].interactions++;
                state.relationships[key].lastMet = new Date().toISOString();
              }
            }
          }
        } else if (payload.action === 'complete') {
          building.currentWorkers = building.currentWorkers.filter(id => id !== payload.agentId);
          building.upgrading = building.currentWorkers.length > 0;

          // ── Work count tracking + home upgrade progression ──
          const agentId = payload.agentId;
          const agent = (state.agents || {})[agentId];
          if (agent) {
            if (!agent.workCount) agent.workCount = 0;
            agent.workCount++;

            // Check upgrade thresholds for agent's home
            const home_id = `${agentId}_home`;
            const thresholds = { 3: 2, 8: 3, 20: 4, 50: 5 };
            for (const [threshold, level] of Object.entries(thresholds)) {
              if (agent.workCount === parseInt(threshold)) {
                const homeBuilding = (state.buildings || {})[home_id];
                if (homeBuilding && (homeBuilding.level || 1) < level) {
                  homeBuilding.level = level;
                  homeBuilding.upgradedAt = new Date().toISOString();
                  if (!Array.isArray(homeBuilding.upgrades)) homeBuilding.upgrades = [];
                  homeBuilding.upgrades.push({
                    level,
                    upgradedBy: agentId,
                    upgradedAt: homeBuilding.upgradedAt,
                    note: `${agentId} earned it (${agent.workCount} tasks completed)`,
                  });
                  console.log(`[State] 🏠 ${agentId}'s home upgraded to level ${level} (${agent.workCount} tasks completed)`);
                }
              }
            }
          }
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

// ── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Express app
const app = express();
app.use(globalLimiter);
app.use(cors({
  origin: ['https://kurokimachi.com', 'https://www.kurokimachi.com', 'http://localhost:3003'],
  credentials: false,
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json());

// Stricter rate limits on write endpoints
app.use('/world/mutate', writeLimiter);
app.use('/agents/:id/speak', writeLimiter);
app.use('/agents/:id/wake', writeLimiter);
app.use('/agents/:id/sleep', writeLimiter);
app.use('/command', writeLimiter);

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

// Periodic snapshot — ensures state.json always reflects current world
// even if a save was missed during high-frequency events or crashes
setInterval(() => {
  saveState(state);
}, 30 * 1000); // every 30s

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
