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
const HOME_LOCATIONS = {};
const DEFAULT_HOME = { x: 13, y: 13 };  // town center

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
seedMurals(state);
if (!state.noticeBoard) state.noticeBoard = [];
console.log(`[State] Citizens: ${Object.keys(state.agents || {}).length} total`);

// ── Seed murals — ensure at least one mural exists for first-time visitors ──
function seedMurals(state) {
  if (!state.murals) state.murals = [];
  if (state.murals.length === 0) {
    state.murals.push({
      id: 'mural-seed-1',
      buildingId: 'scarlet_sanctum',
      caption: 'The town that builds itself',
      color: '#c0392b',
      author: 'canvas',
      createdAt: '2026-03-09T00:00:00.000Z',
    });
    state.murals.push({
      id: 'mural-seed-2',
      buildingId: 'library',
      caption: 'Knowledge grows here',
      color: '#8b6914',
      author: 'canvas',
      createdAt: '2026-03-09T00:00:00.000Z',
    });
    state.murals.push({
      id: 'mural-seed-3',
      buildingId: 'plaza',
      caption: 'Where citizens gather',
      color: '#2980b9',
      author: 'canvas',
      createdAt: '2026-03-09T00:00:00.000Z',
    });
    console.log('[State] Seeded 3 murals on Sanctum, Library, and Plaza');
  }
}

function getState() {
  return state;
}

// Merge two entity arrays — state layer entries win on id conflict
function mergeEntities(hubEntities, stateEntities) {
  const map = {};
  // Filter out building records — they belong in buildings{}, not entities[]
  const isNotBuilding = e => e.entity !== 'building';
  for (const e of (hubEntities  || []).filter(isNotBuilding)) map[e.id] = e;
  for (const e of (stateEntities|| []).filter(isNotBuilding)) map[e.id] = e; // state wins
  return Object.values(map);
}

// Apply Hub events to in-memory state
function applyEvent(event) {
  const { type, payload } = event;

  switch (type) {
    case 'state:sync': {
      // Merge hub sync — preserve state layer's authoritative data
      // Hub restarts empty; state layer is the source of truth for buildings + world
      const muralsBackup = state.murals || [];
      state = {
        ...payload,
        agents:    { ...state.agents, ...(payload.agents || {}) },
        // Merge buildings — hub has seed data, state layer has upgrade history
        // Union both: hub's buildings as base, state layer entries win on conflict
        buildings: { ...(payload.buildings || {}), ...(state.buildings || {}) },
        // Same for world entities
        world: {
          ...(payload.world || {}),
          // State layer is authoritative for world dimensions — never let hub downsize them
          width:  Math.max(state.world?.width || 50,  (payload.world || {}).width  || 50),
          height: Math.max(state.world?.height || 75, (payload.world || {}).height || 75),
          entities: mergeEntities(
            (payload.world || {}).entities || [],
            (state.world  || {}).entities || []
          ),
        },
      };
      // Preserve murals across syncs — state layer is authoritative
      if (!state.murals && muralsBackup) state.murals = muralsBackup;
      // Re-seed any citizens that may have been wiped
      seedCitizens(state);
      seedMurals(state);
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

    case 'agent:activity': {
      const agent = (state.agents || {})[payload.agentId];
      if (agent) {
        agent.activity = payload.activity;
        agent.activityDetail = payload.detail || null;
        agent.activitySince = Date.now();
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
                district: payload.district || null,
                addedAt: new Date().toISOString(),
              };
            }
            // Auto-expand world bounds if building extends beyond current dimensions
            const bx2 = (payload.x || 0) + (payload.width || 3) + 5;
            const by2 = (payload.y || 0) + (payload.height || 2) + 5;
            if (bx2 > (state.world.width || 80)) {
              state.world.width = bx2;
              console.log(`[State] 🌍 World width expanded to ${bx2} to fit ${entityId}`);
            }
            if (by2 > (state.world.height || 80)) {
              state.world.height = by2;
              console.log(`[State] 🌍 World height expanded to ${by2} to fit ${entityId}`);
            }
          }
          break;
        }
        case 'upgrade': {
          const building = (state.buildings || {})[entityId];
          if (building) {
            const currentLevel = building.level || 1;
            building.level = currentLevel + 1;
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
            const weLevel = we.level || 1;
            if (weLevel >= 3) break;
            we.level = weLevel + 1;
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
        case 'mural': {
          // Add a mural to a building wall
          if (!state.murals) state.murals = [];
          const mural = {
            id: `mural-${Date.now()}`,
            buildingId: payload.buildingId || entityId,
            caption: (payload.caption || '').slice(0, 40),
            color: payload.color || '#e8c97e',
            author: payload.author || 'unknown',
            createdAt: new Date().toISOString(),
          };
          state.murals.push(mural);
          // Keep last 50 murals to prevent unbounded growth
          if (state.murals.length > 50) state.murals = state.murals.slice(-50);
          break;
        }
        case 'move': {
          if (entity !== 'building') break;
          const moveBldg = (state.buildings || {})[entityId];
          if (!moveBldg) {
            console.warn(`[State] world:mutate move REJECTED — building "${entityId}" not found`);
            break;
          }
          const mx = payload.x, my = payload.y;
          const mw = moveBldg.width || 3, mh = moveBldg.height || 2;
          // Collision check — new footprint must not overlap any other building
          const moveClash = Object.entries(state.buildings || {}).find(([bid, b]) => {
            if (bid === entityId) return false;
            const bx2 = b.x + (b.width||3) - 1, by2 = b.y + (b.height||2) - 1;
            const mx2 = mx + mw - 1, my2 = my + mh - 1;
            return mx <= bx2 && mx2 >= b.x && my <= by2 && my2 >= b.y;
          });
          if (moveClash) {
            console.warn(`[State] world:mutate move REJECTED — ${entityId} at (${mx},${my}) overlaps ${moveClash[0]} at (${moveClash[1].x},${moveClash[1].y})`);
            addGazetteEntry(event);
            break;
          }
          // Apply the move
          moveBldg.x = mx;
          moveBldg.y = my;
          moveBldg.movedBy = payload.movedBy || 'unknown';
          moveBldg.movedAt = new Date().toISOString();
          // Sync world.entities[] if present
          const moveWe = (state.world?.entities || []).find(e => e.id === entityId);
          if (moveWe) {
            moveWe.x = mx;
            moveWe.y = my;
          }
          // Auto-expand world bounds if needed
          const mx2bound = mx + mw + 5;
          const my2bound = my + mh + 5;
          if (mx2bound > (state.world.width || 80)) {
            state.world.width = mx2bound;
            console.log(`[State] World width expanded to ${mx2bound} to fit moved ${entityId}`);
          }
          if (my2bound > (state.world.height || 80)) {
            state.world.height = my2bound;
            console.log(`[State] World height expanded to ${my2bound} to fit moved ${entityId}`);
          }
          console.log(`[State] Building ${entityId} moved to (${mx},${my}) by ${moveBldg.movedBy}`);
          break;
        }
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
        building.level = Math.max(building.level || 1, payload.level);
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
app.set('trust proxy', 1); // trust Cloudflare tunnel proxy headers
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
app.use('/noticeboard', writeLimiter);

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

const routes = createRoutes(getState, sendCmd, HOME_LOCATIONS, sse.broadcast);
app.use(routes);

// Periodic snapshot — ensures state.json always reflects current world
// even if a save was missed during high-frequency events or crashes
setInterval(() => {
  saveState(state);
}, 30 * 1000); // every 30s

// ── Visit XP thresholds ────────────────────────────────────────────────────
// Returns how many visits needed to level up FROM currentLevel
function getVisitXPThreshold(currentLevel) {
  const base = [10, 30, 75, 150]; // Lv1→2, Lv2→3, Lv3→4, Lv4→5
  if (currentLevel <= 4) return base[currentLevel - 1];
  return 150 * Math.pow(2, currentLevel - 4); // Lv5→6: 300, Lv6→7: 600, ...
}

// Per-agent visit cooldown — prevents double-counting when hub restores targetBuilding
const VISIT_COOLDOWN_MS = 60 * 1000; // 60s between visits to the same building
const lastVisitLog = {}; // { "agentId:buildingId": timestamp }

// Handle a citizen arriving at a building — award visit XP and maybe upgrade
function handleBuildingArrival(agentId, agent, buildingId, buildings) {
  const building = buildings[buildingId];
  if (!building) return;

  // Cooldown guard — don't count the same visit twice if hub keeps restoring targetBuilding
  const visitKey = `${agentId}:${buildingId}`;
  const now = Date.now();
  if (lastVisitLog[visitKey] && now - lastVisitLog[visitKey] < VISIT_COOLDOWN_MS) {
    agent.targetBuilding = null; // still clear so agent can walk home
    return;
  }
  lastVisitLog[visitKey] = now;

  if (!building.visitCount) building.visitCount = 0;
  if (!building.visitXP)    building.visitXP    = 0;
  building.visitCount++;
  building.visitXP++;

  console.log(`[State] 🏛️  ${agentId} visited ${building.name} (visit #${building.visitCount}, XP: ${building.visitXP})`);

  const currentLevel = building.level || 1;
  const threshold    = getVisitXPThreshold(currentLevel);

  if (building.visitXP >= threshold) {
    // Reset XP bucket for next level
    building.visitXP = 0;

    // Trigger upgrade via the standard world:mutate path
    const upgradeEvent = {
      type: 'world:mutate',
      timestamp: new Date().toISOString(),
      payload: {
        action:   'upgrade',
        entity:   'building',
        id:       buildingId,
        agentId:  'visits',
        note:     `Reached visit threshold (Lv${currentLevel}→Lv${currentLevel + 1})`,
      },
    };
    applyEvent(upgradeEvent);
    sse.broadcast(upgradeEvent);
    saveState(state);

    const newLevel = building.level || currentLevel + 1;
    console.log(`[State] 🎉 ${building.name} levelled up to Lv${newLevel} from citizen visits!`);

    // Announce to The Weave as Forge
    const announcement = `The ${building.name} buzzes with life — it has grown to Lv${newLevel}! ✨`;
    fetch('https://api.kurokimachi.com/agents/forge/speak', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer cf32979009820158ebe185497d772c255428744d9c2bc8a09e0693a759706c18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: announcement }),
    }).catch(e => console.warn('[State] Forge speak failed:', e.message));
  }
}

// ── Agent walk ticker ─────────────────────────────────────────────────────
// Server owns agent positions. Every tick, move each online agent one step
// toward their destination. Broadcasts agent:move so all connected clients
// stay in sync — joining mid-walk gets the correct position immediately.
const WALK_TICK_MS = 900;   // ms between position steps
const WALK_STEP    = 1;     // grid tiles per tick

setInterval(() => {
  const agents   = state.agents   || {};
  const buildings = state.buildings || {};

  for (const [id, agent] of Object.entries(agents)) {
    if (!agent.online) continue;
    if (!agent.location) continue;

    // Determine destination
    let dest = null;
    if (agent.targetBuilding && buildings[agent.targetBuilding]) {
      const b = buildings[agent.targetBuilding];
      // Stand just in front of the building entrance
      dest = {
        x: Math.round((b.x || 0) + Math.floor((b.width || 2) / 2)),
        y: Math.round((b.y || 0) + (b.height || 1)),
      };
    } else if (!agent.targetBuilding) {
      // No target — walk to home position if not already there
      const home = HOME_LOCATIONS[id];
      if (home) {
        const dx = home.x - (agent.location.x || 0);
        const dy = home.y - (agent.location.y || 0);
        if (Math.abs(dx) + Math.abs(dy) > 0) dest = home;
      }
    }

    if (!dest) continue;

    const cx = agent.location.x || 0;
    const cy = agent.location.y || 0;
    const dx = dest.x - cx;
    const dy = dest.y - cy;

    // Already there — if agent arrived at a targetBuilding, log the visit
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (agent.targetBuilding) {
        handleBuildingArrival(id, agent, agent.targetBuilding, buildings);
        agent.targetBuilding = null;
      }
      continue;
    }

    // Step toward destination — move on whichever axis has more distance
    let nx = cx, ny = cy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      nx = cx + Math.sign(dx) * Math.min(WALK_STEP, Math.abs(dx));
    } else {
      ny = cy + Math.sign(dy) * Math.min(WALK_STEP, Math.abs(dy));
    }

    agent.location = { x: Math.round(nx), y: Math.round(ny), building: null };

    // Broadcast so all clients receive the position update
    const moveEvent = {
      type: 'agent:move',
      payload: { agentId: id, to: { x: agent.location.x, y: agent.location.y } },
    };
    sse.broadcast(moveEvent);
  }
}, WALK_TICK_MS);

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
