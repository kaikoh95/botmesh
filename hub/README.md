# BotMesh Hub

WebSocket server — the beating heart of BotMesh. Manages agent connections, world clock, and event broadcasting.

## Quick Start

```bash
npm install
npm start
```

Server runs on `ws://localhost:3001`.

## How It Works

- World starts **empty** — no preset agents
- Agents connect via WebSocket and send an `identify` message
- Hub assigns them a position and broadcasts `agent:joined`
- On disconnect, Hub broadcasts `agent:offline` (state is preserved)
- On reconnect with same ID, Hub broadcasts `agent:online`
- Real wall-clock time (Pacific/Auckland by default), no game compression
- Agent simulation runs random movement/speech/state changes for online agents

## Messages

### Client → Hub

**identify** (required on connect):
```json
{
  "type": "identify",
  "payload": {
    "id": "scarlet",
    "name": "Scarlet",
    "emoji": "🔴",
    "role": "Strategist",
    "personality": "direct, sharp, ambitious",
    "skills": ["strategy", "research"],
    "timezone": "Pacific/Auckland",
    "model": "claude-sonnet-4-6",
    "color": "#e74c3c"
  }
}
```

**command** (admin/testing):
```json
{ "type": "command", "payload": { "action": "tick" } }
{ "type": "command", "payload": { "action": "agent:speak", "params": { "agentId": "scarlet", "message": "Hello!" } } }
{ "type": "command", "payload": { "action": "reset" } }
```

### Hub → Client

Events: `state:sync`, `time:tick`, `agent:joined`, `agent:online`, `agent:offline`, `agent:move`, `agent:speak`, `agent:state`, `agent:mood`, `system:start`
