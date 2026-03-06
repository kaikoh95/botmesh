# BotMesh State Layer

Bridge between the Hub (WebSocket) and UI (SSE + REST). Persists world state to `world/state.json`.

## Setup

```bash
npm install
npm start
```

Runs on port 3002. Connects to Hub at `ws://localhost:3001`.

## API

| Endpoint          | Method | Description              |
|-------------------|--------|--------------------------|
| `/`               | GET    | Health check             |
| `/state`          | GET    | Full world state         |
| `/agents`         | GET    | All agents               |
| `/agents/:id`     | GET    | Single agent             |
| `/buildings`      | GET    | All buildings            |
| `/time`           | GET    | Current time             |
| `/gazette`        | GET    | Gazette entries          |
| `/events`         | GET    | SSE event stream         |
| `/command`        | POST   | Forward command to Hub   |

## Environment

- `PORT` - HTTP port (default: 3002)
- `HUB_URL` - Hub WebSocket URL (default: `ws://localhost:3001`)
