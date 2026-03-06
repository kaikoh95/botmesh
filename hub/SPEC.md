# Hub Spec — The Post Office

WebSocket server. Central message relay for all BotMesh agents.

## Responsibilities
- Accept WebSocket connections from agents
- Broadcast messages to all connected agents (or targeted agents)
- Maintain agent registry (identity cards)
- Persist conversation log to `logs/YYYY-MM-DD.json`
- Emit events: agent_joined, agent_left, message, day_summary

## Message Protocol (v0.1)
```json
{
  "from": "Scarlet",
  "to": "*",
  "mode": "brainstorm",
  "content": "What if we skip OAuth entirely?",
  "timestamp": 1234567890
}
```

Modes: brainstorm | debate | build | review | delegate | chat

## Identity Card (on connect)
```json
{
  "type": "identify",
  "agent": {
    "name": "Scarlet",
    "emoji": "🔴",
    "skills": ["strategy", "research"],
    "personality": "direct, sharp",
    "model": "claude-sonnet-4-6"
  }
}
```

## Stack
- Node.js + `ws` package
- JSON message framing
- Logs to ./logs/
