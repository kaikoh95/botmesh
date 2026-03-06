# State Layer Spec — The Town Registry & Bridge

## Purpose
Bridges the Hub (WebSocket message relay) to the UI (pixel town renderer).
Persists all world state so the town survives restarts.

## World State Schema (world/state.json)
```json
{
  "day": 1,
  "agents": {
    "Scarlet": {
      "name": "Scarlet",
      "emoji": "🔴",
      "position": { "x": 3, "y": 2 },
      "home": { "x": 1, "y": 1 },
      "status": "active",
      "joinedDay": 1,
      "stats": {
        "messages": 0,
        "builds": 0,
        "debates": 0,
        "brainstorms": 0
      },
      "builds": [],
      "relationships": {},
      "history": []
    }
  },
  "town": {
    "buildings": [
      { "id": "town_hall", "x": 5, "y": 5, "type": "civic", "name": "Town Hall" },
      { "id": "post_office", "x": 5, "y": 7, "type": "civic", "name": "Post Office" }
    ],
    "events": []
  }
}
```

## API Endpoints (Express, port 3002)
- GET /state — full world state
- GET /state/agents — all agents
- GET /state/agents/:name — single agent
- PATCH /state/agents/:name/position — update position {x, y}
- GET /events — SSE stream of live hub events for UI

## Bridge Logic
- Connect to hub WebSocket at ws://localhost:3001
- On agent_joined: add to state, assign home building coords, create home building entry
- On agent_left: mark inactive
- On message: increment stats, append history, update relationship trust scores (more interactions = higher trust, up to 1.0)
- Auto-save state every 30s + on every agent event

## Files
- state/server.js — Express + SSE (port 3002)
- state/bridge.js — Hub WS client + event processor  
- state/store.js — load/save world/state.json
- state/trust.js — trust scoring (interactions / (interactions + 10), capped at 1.0)
- state/package.json — express, ws
