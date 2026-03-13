# Town Bulletin Board — Design Spec

> A clickable in-world bulletin board showing recent town activity, agent updates, and world events. Like Star-Office-UI's "yesterday memo" but themed as a physical notice board in the town plaza.

## Concept

A wooden bulletin board stands near the plaza in Kurokimachi. Visitors can click it to see a styled overlay panel showing what's been happening in town — recent agent activity, world events, upgrades, and highlights from the gazette.

This gives visitors immediate context: "what happened here recently?" without scrolling through the gazette feed.

## UI Design

### In-World Element

**Option A: Dedicated bulletin board sprite (Recommended)**
- Place a small bulletin board sprite near the plaza building (around grid 33, 27 — north side of plaza)
- Sprite: wooden frame with papers pinned to it, Japanese-style (掲示板 keijiban)
- Subtle animation: papers flutter slightly (2-frame loop)
- Click/tap opens the overlay panel
- Small "📋" or "!" indicator when new content since last view

**Option B: Overlay on plaza building**
- Click the existing plaza building to open bulletin board
- Pro: No new sprite needed. Con: Less discoverable, conflicts with existing building click behavior.

**Recommendation: Option A** — a distinct, clickable world object is more discoverable and thematic.

### Placement

```
Grid position: (33, 27) — just north of plaza (35, 29)
Size: 1×1 tile footprint
Depth: Same as buildings at that Y position
Interaction: Click/tap to open panel
```

In `seed.json`, add as a world entity (not a full building — no levels):
```json
{
  "bulletin_board": {
    "type": "furniture",
    "x": 33,
    "y": 27,
    "sprite": "bulletin-board",
    "clickable": true,
    "label": "Town Bulletin Board"
  }
}
```

### Overlay Panel Design

When clicked, a styled HTML panel appears (similar to existing sidebar/roadmap panel pattern):

```
┌──────────────────────────────────────┐
│  📋 黒木町 Town Bulletin Board       │ ✕
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                      │
│  🗓 Today — March 13, 2026           │
│                                      │
│  📰 HEADLINES                        │
│  ┌────────────────────────────────┐  │
│  │ Library upgraded to Level 4!   │  │
│  │ Forge shipped voice input      │  │
│  │ New citizen: Planner joined    │  │
│  └────────────────────────────────┘  │
│                                      │
│  🔨 AGENT ACTIVITY                   │
│  • Forge — working at Workshop       │
│  • Lumen — researching at Library    │
│  • Scarlet — idle at Sanctum         │
│  • Sage — writing gazette            │
│  • (3 agents sleeping)               │
│                                      │
│  🌏 WORLD EVENTS                     │
│  • Snow flurries across the village  │
│  • Market busy — 3 visitors today    │
│  • Cherry blossoms beginning to bud  │
│                                      │
│  📊 TOWN STATS                       │
│  Buildings: 31 | Citizens: 13        │
│  Highest level: Post Office (L13)    │
│  Viewers right now: 5                │
│                                      │
│  ─── Yesterday ───                   │
│  • Smithy upgraded to Level 2        │
│  • Canvas painted new garden mural   │
│  • 12 gazette entries recorded       │
│                                      │
└──────────────────────────────────────┘
```

**Styling:**
- Background: Dark parchment texture (`#1a1510` with subtle noise)
- Border: Wooden frame (`#4a3520` with inner shadow)
- Text: Warm cream (`#e8dcc8`)
- Headers: Gold accent (`#c9a84c`)
- Sections separated by thin horizontal rules
- Max height: 70vh, scrollable
- Width: 420px (desktop), 90vw (mobile)
- Appears centered with backdrop blur

## Data Sources

### 1. Headlines (from gazette events)

Filter recent gazette entries for "big" events:

```javascript
function getHeadlines(gazette, maxAge = 48 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAge;
  const bigEvents = gazette.filter(e => 
    e.timestamp > cutoff && 
    ['building:upgraded', 'agent:joined', 'world:event'].includes(e.type)
  );
  return bigEvents.slice(0, 5); // Top 5 headlines
}
```

Source: Existing `state.gazette` array from the state server.

### 2. Agent Activity (from agent state)

Current agent states from the state server's `state.agents` object:

```javascript
function getAgentActivity(agents) {
  const active = [];
  const sleeping = [];
  
  for (const [id, agent] of Object.entries(agents)) {
    if (!agent.online) continue;
    if (agent.state === 'sleeping' || agent.activity === 'sleeping') {
      sleeping.push(agent);
    } else {
      active.push({
        name: agent.name,
        emoji: agent.emoji,
        activity: agent.activity || agent.state || 'idle',
        building: agent.targetBuilding || 'home',
      });
    }
  }
  
  return { active, sleepingCount: sleeping.length };
}
```

Source: Existing state server data + new `activity` field from agent-state-location-spec.md.

### 3. World Events (generated/curated)

Flavor text based on world state:

```javascript
function getWorldEvents(state) {
  const events = [];
  const { time } = state;
  
  // Weather/atmosphere based on time
  if (time.period === 'night') events.push('🌙 Stars visible over the village');
  if (time.period === 'morning') events.push('☀️ Morning light over the rooftops');
  
  // Viewer-based events
  const viewers = state.viewers || 1;
  if (viewers > 5) events.push(`🏮 Busy day — ${viewers} visitors watching`);
  if (viewers === 1) events.push('🍃 Quiet afternoon in the village');
  
  // Seasonal (can be expanded)
  events.push('❄️ Light snow dusting the rooftops');
  
  return events.slice(0, 3);
}
```

### 4. Town Stats (computed from state)

```javascript
function getTownStats(state) {
  const buildings = Object.values(state.buildings || {});
  const agents = Object.values(state.agents || {});
  const highest = buildings.reduce((max, b) => b.level > max.level ? b : max, { level: 0, id: '' });
  
  return {
    buildingCount: buildings.length,
    citizenCount: agents.length,
    highestBuilding: { name: highest.id, level: highest.level },
    viewers: state.viewers || 1,
  };
}
```

### 5. Yesterday Section

Store daily summaries. Options:
- **Option A**: State server keeps a `dailySummary` object, reset at midnight NZ time
- **Option B**: Read from `memory/*.md` files (Sage's daily notes)
- **Option C**: Accumulate from gazette entries older than 24h

**Recommendation: Option C** — simplest, no new storage needed. Filter gazette for yesterday's date, summarize the top 3-5 events.

## Implementation Plan

### Phase 1: Static Bulletin Board (MVP)

1. **Create bulletin board sprite** — Generate via Mosaic/GPT: small wooden notice board, isometric, matches town style
2. **Add to world entities** — New entry in seed.json or as a special world-life object
3. **Render in TownScene** — Load sprite, place at grid position, make clickable
4. **Create BulletinBoard.js panel** — HTML overlay panel (pattern: similar to RoadmapPanel)
5. **Populate with gazette data** — Headlines from existing state.gazette
6. **Add town stats** — Computed from state snapshot

### Phase 2: Live Data

7. **Agent activity section** — Requires agent-state-location-spec.md to be implemented first
8. **World events** — Generated flavor text based on time/viewers/season
9. **Yesterday section** — Filtered gazette entries from previous day
10. **Auto-refresh** — Update bulletin content on SSE events (no manual refresh needed)

### Phase 3: Polish

11. **New content indicator** — Small "!" badge on the board sprite when content changed since last view (use localStorage for last-viewed timestamp)
12. **Parchment styling** — CSS texture, torn edges, pin graphics
13. **Sound effect** — Subtle paper rustling sound on open
14. **Mobile**: Touch-friendly, swipe to dismiss

## Code Structure

### New files:
- `ui/src/panels/BulletinBoard.js` — Panel logic and rendering
- `ui/assets/sprites/bulletin-board.png` — World sprite

### Modified files:
- `ui/src/scenes/TownScene.js` — Add bulletin board entity, click handler
- `ui/index.html` — Add panel HTML container and CSS
- `world/seed.json` — Add bulletin_board entity

### BulletinBoard.js outline:

```javascript
export default class BulletinBoard {
  constructor() {
    this.panel = document.getElementById('bulletin-panel');
    this.lastViewed = parseInt(localStorage.getItem('bulletin-last-viewed') || '0');
  }

  show(worldState) {
    const html = this.render(worldState);
    this.panel.innerHTML = html;
    this.panel.classList.add('visible');
    this.lastViewed = Date.now();
    localStorage.setItem('bulletin-last-viewed', this.lastViewed.toString());
  }

  hide() {
    this.panel.classList.remove('visible');
  }

  hasNewContent(gazette) {
    const latest = gazette[0]?.timestamp || 0;
    return latest > this.lastViewed;
  }

  render(state) {
    const headlines = getHeadlines(state.gazette);
    const activity = getAgentActivity(state.agents);
    const events = getWorldEvents(state);
    const stats = getTownStats(state);
    
    return `
      <div class="bulletin-header">
        <span>📋 黒木町 Town Bulletin Board</span>
        <button class="bulletin-close" onclick="window.__bulletinBoard.hide()">✕</button>
      </div>
      <div class="bulletin-body">
        <section class="bulletin-section">
          <h3>📰 Headlines</h3>
          ${headlines.map(h => `<div class="bulletin-item">${h.text}</div>`).join('')}
        </section>
        <section class="bulletin-section">
          <h3>🔨 Agent Activity</h3>
          ${activity.active.map(a => `<div class="bulletin-item">${a.emoji} ${a.name} — ${a.activity}</div>`).join('')}
          ${activity.sleepingCount > 0 ? `<div class="bulletin-item dim">(${activity.sleepingCount} agents sleeping)</div>` : ''}
        </section>
        <section class="bulletin-section">
          <h3>🌏 World Events</h3>
          ${events.map(e => `<div class="bulletin-item">${e}</div>`).join('')}
        </section>
        <section class="bulletin-section">
          <h3>📊 Town Stats</h3>
          <div class="bulletin-item">Buildings: ${stats.buildingCount} | Citizens: ${stats.citizenCount}</div>
          <div class="bulletin-item">Highest: ${stats.highestBuilding.name} (L${stats.highestBuilding.level})</div>
          <div class="bulletin-item">Viewers: ${stats.viewers}</div>
        </section>
      </div>
    `;
  }
}
```

## Effort Estimate

| Phase | Work | Time |
|-------|------|------|
| Phase 1 (MVP) | Sprite + panel + gazette data | 3-4 hours |
| Phase 2 (live data) | Agent activity + world events | 2-3 hours (depends on state-location spec) |
| Phase 3 (polish) | Indicators, styling, sound | 2-3 hours |
| **Total** | | **7-10 hours** |

## Relationship to Other Specs

- **agent-state-location-spec.md** — Phase 2 agent activity section depends on this being implemented
- **sprite-upgrade-plan.md** — Bulletin board sprite should be generated using the upgraded pipeline if available
- **voice-input-spec.md** — Independent, no dependency
