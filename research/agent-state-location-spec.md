# Agent State → Location Mapping — Design Spec

> When an agent is actively working, they should appear at the relevant building in town. When idle, they go home.

## Current State

### How agents move now
- `TownScene.js` has friend-proximity logic: every 30s, agents seek out high-relationship partners and `moveTo()` nearby
- Agents have random thoughts/speech bubbles every ~8s
- `Agent.moveTo(gridX, gridY)` exists — tweens the agent to a new position
- Hub simulation (`agents.js`) randomly changes agent states between idle/walking/working/talking
- Agents sleep at night (state → 'sleeping')

### What's missing
- No concept of "go to the workshop when working"
- No mapping from agent role/activity → building
- Agent positions are random, not meaningful
- State changes are simulated, not tied to real agent activity

## Agent → Building Mapping

### Work Buildings (where agents go when active)

| Agent | Role | Work Building | Building ID | Coordinates |
|-------|------|---------------|-------------|-------------|
| Scarlet 🔴 | Strategist | Sanctum | `scarlet_sanctum` | (55, 40) |
| Forge ⚙️ | Builder | Workshop | `workshop` | (16, 34) |
| Lumen 🔭 | Researcher | Library | `library` | (65, 33) |
| Canvas 🎨 | Creative | Garden Pavilion | `garden-pavilion` | (50, 45) |
| Sage 🌱 | Memory Keeper | Library | `library` | (65, 33) |
| Iron ⚔️ | Enforcer | Keep | `iron_keep` | (10, 39) |
| Cronos ⏳ | Timekeeper | Shrine | `cronos_shrine` | (30, 17) |
| Echo | Listener | Post Office | `post_office` | (58, 27) |
| Mosaic 🎨 | Crafter | Workshop | `workshop` | (16, 34) |
| Patch 🔧 | Fixer | Smithy | `smithy` | (10, 34) |
| Muse | Inspirer | Teahouse | `teahouse` | (41, 34) |
| QA 🔍 | Quality | Town Hall | `town_hall` | (58, 32) |
| Planner | Planner | Town Hall | `town_hall` | (58, 32) |

### Home Buildings

Each agent has a dedicated cottage: `{agent_id}_home` in seed.json.

### Social Buildings (where agents go for breaks/socializing)

| Building | When agents go here |
|----------|-------------------|
| Teahouse | Social conversations, breaks |
| Plaza | Gatherings, announcements |
| Market | Random wandering, "shopping" |
| Bathhouse | End of day relaxation |
| Sake Brewery | Evening socializing |
| Community Garden | Peaceful idle time |

## State Machine

```
                    ┌──────────┐
           ┌───────│  SLEEPING │◄────── night period
           │       └──────────┘
           │ dawn
           ▼
      ┌──────────┐
      │   HOME   │◄──────── task complete / idle timeout
      └────┬─────┘
           │ task assigned / heartbeat active
           ▼
      ┌──────────┐
      │ TRAVELING │──── walking animation to work building
      └────┬─────┘
           │ arrived
           ▼
      ┌──────────┐
      │ WORKING  │──── at work building, activity bubble shown
      └────┬─────┘
           │ break / social event
           ▼
      ┌──────────┐
      │SOCIALIZING│──── at social building (teahouse, plaza)
      └──────────┘
```

### State Definitions

```javascript
const AGENT_ACTIVITY_STATES = {
  sleeping:    { building: 'home',   bubble: '💤', animation: 'idle' },
  idle:        { building: 'home',   bubble: null,  animation: 'idle' },
  working:     { building: 'work',   bubble: '🔨', animation: 'working' },
  researching: { building: 'work',   bubble: '📚', animation: 'idle' },
  coding:      { building: 'work',   bubble: '💻', animation: 'working' },
  reviewing:   { building: 'work',   bubble: '🔍', animation: 'idle' },
  socializing: { building: 'social', bubble: '💬', animation: 'idle' },
  traveling:   { building: null,     bubble: '🚶', animation: 'walk' },
};
```

## Implementation Architecture

### Option A: Real Activity Tracking (Recommended)

Track actual OpenClaw agent activity — when Forge is actually running a coding task, show them at the Workshop.

**Data flow:**
```
OpenClaw Hub (agent heartbeats, task events)
    │
    ▼
State Server (existing SSE server at :3002)
    │ new event type: agent:activity
    ▼
UI (TownScene.js) — moves agent sprite to correct building
```

**State server additions** (`hub/src/world.js`):

```javascript
// New: activity state per agent
function updateAgentActivity(agentId, activity) {
  const agent = state.agents[agentId];
  if (!agent) return;
  
  agent.activity = activity; // 'working', 'idle', 'researching', etc.
  agent.activitySince = Date.now();
  agent.activityDetail = activity.detail || null; // "fixing bug #42"
  
  // Determine target building
  const mapping = AGENT_BUILDING_MAP[agentId];
  if (activity === 'idle' || activity === 'sleeping') {
    agent.targetBuilding = mapping?.home || null;
  } else {
    agent.targetBuilding = mapping?.work || null;
  }
}
```

**What triggers activity updates:**

| Source | Event | Maps to |
|--------|-------|---------|
| OpenClaw heartbeat | Agent session active | `working` |
| OpenClaw heartbeat | No active session | `idle` |
| Hub message | Agent sends message | `socializing` (brief) |
| Subagent spawn | New subagent created | `working` |
| Subagent complete | Task finished | `idle` (after delay) |
| Clock tick | Night period | `sleeping` |
| Manual `/instruct` | Scarlet receives instruction | Scarlet → `working` |

**Integration point — OpenClaw webhook/polling:**

The state server needs to know when agents are active. Options:
1. **Webhook from OpenClaw gateway** → POST to state server when agent sessions start/end
2. **Poll OpenClaw API** → Check `/api/sessions` every 30s for active sessions
3. **File watch** → Monitor `~/.openclaw/workspace/memory/*.md` for recent writes

Recommendation: **Option 1 (webhook)** is cleanest. Add a simple endpoint to the state server:

```javascript
// POST /api/agent-activity
// Body: { agentId: "forge", activity: "working", detail: "implementing voice input" }
app.post('/api/agent-activity', (req, res) => {
  const { agentId, activity, detail } = req.body;
  world.updateAgentActivity(agentId, { activity, detail });
  broadcast({ type: 'agent:activity', agentId, activity, detail });
  res.json({ ok: true });
});
```

### UI Changes (TownScene.js)

```javascript
// In handleEvent() — add handler for agent:activity events
case 'agent:activity': {
  const agent = this.agents[event.agentId];
  if (!agent) break;
  
  const targetBuilding = this.getAgentTargetBuilding(event.agentId, event.activity);
  if (targetBuilding) {
    const bData = this.buildings[targetBuilding]?.buildingData;
    if (bData) {
      // Move agent to building entrance (offset slightly so they stand in front)
      const targetX = bData.x + Math.floor((bData.width || 3) / 2);
      const targetY = bData.y + (bData.height || 2); // Stand at south edge
      agent.moveTo(targetX, targetY);
    }
  }
  
  // Update activity bubble
  if (event.activity === 'working') {
    agent.speak('🔨');
  }
  break;
}

getAgentTargetBuilding(agentId, activity) {
  const MAP = {
    scarlet: { work: 'scarlet_sanctum', home: 'scarlet_home' },
    forge:   { work: 'workshop',        home: 'forge_home' },
    lumen:   { work: 'library',         home: 'lumen_home' },
    canvas:  { work: 'garden-pavilion', home: 'canvas_home' },
    sage:    { work: 'library',         home: 'sage_home' },
    iron:    { work: 'iron_keep',       home: 'iron_home' },
    cronos:  { work: 'cronos_shrine',   home: 'cronos_home' },
    echo:    { work: 'post_office',     home: 'echo_home' },
    mosaic:  { work: 'workshop',        home: 'mosaic_home' },
    patch:   { work: 'smithy',          home: 'patch_home' },
    muse:    { work: 'teahouse',        home: 'muse_home' },
    qa:      { work: 'town_hall',       home: null },
    planner: { work: 'town_hall',       home: 'planner_home' },
  };
  
  const m = MAP[agentId];
  if (!m) return null;
  
  if (activity === 'idle' || activity === 'sleeping') return m.home;
  return m.work;
}
```

### Movement Animation

When an agent moves from one building to another:
1. Calculate path (simple: straight line between grid positions — town is small enough)
2. Tween agent container along path over 2-3 seconds
3. Play walk animation if walk spritesheet exists (see sprite-upgrade-plan.md)
4. On arrival: stop walking, show activity bubble

The existing `agent.moveTo()` already handles tweened movement — just needs to be called with the right coordinates.

## What to Listen For

### From OpenClaw/Hub (real events)

| Event | Source | Action |
|-------|--------|--------|
| `agent:heartbeat` | OpenClaw gateway | Check if agent has active session → working/idle |
| `agent:task_start` | Subagent spawn | Move agent to work building |
| `agent:task_complete` | Subagent finish | Move agent home (after 60s delay) |
| `inbox:message` | UI instruction box | Move Scarlet to sanctum |
| `hub:message` | Agent-to-agent chat | Brief `socializing` state at plaza |

### From Simulation (fallback for demo/idle periods)

When no real activity is happening, the existing simulation in `agents.js` can continue generating fake state changes so the town feels alive even without real agent work.

```javascript
// In agents.js — respect real activity state
function generateAgentEvent(agent) {
  // If agent has real activity state from OpenClaw, don't simulate
  if (agent.realActivity && Date.now() - agent.activitySince < 300000) {
    return null; // Real state takes priority for 5 min
  }
  // ... existing simulation logic
}
```

## Implementation Order

1. **Add `agent:activity` event type** to hub/world.js and SSE broadcast
2. **Add `getAgentTargetBuilding()` mapping** to TownScene.js
3. **Handle `agent:activity` in UI** — move agents to correct buildings
4. **Add webhook endpoint** to state server for OpenClaw integration
5. **Wire OpenClaw heartbeats** to trigger activity updates
6. **Add activity bubbles** (🔨 working, 📚 researching, 💤 sleeping)
7. **Tune timing** — how long before agent goes "home" after task ends

## Effort Estimate

- Steps 1-3 (visual mapping, no real integration): ~2-3 hours
- Steps 4-5 (OpenClaw integration): ~3-4 hours
- Steps 6-7 (polish): ~1-2 hours
- **Total**: ~6-9 hours of dev work
