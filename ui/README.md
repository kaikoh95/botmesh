# BotMesh UI

Phaser.js 3 isometric pixel art town with a live gazette feed.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3003
```

Requires the state layer running on port 3002.

## Architecture

- **Split view**: 65% game / 35% gazette
- **Programmatic pixel art**: all sprites drawn via Phaser Graphics (no image assets)
- **Dynamic agents**: world starts empty, agents appear when they connect to the hub
- **SSE streaming**: real-time updates from state layer
- **Day/night cycle**: overlay tint based on real wall-clock time

## Character Colors

| Agent   | Color   |
|---------|---------|
| Scarlet | #e74c3c |
| Forge   | #7f8c8d |
| Lumen   | #3498db |
| Canvas  | #9b59b6 |
| Sage    | #27ae60 |

## Files

```
ui/
├── index.html            # Split layout shell
├── css/styles.css        # Dark theme, gazette styling
├── src/
│   ├── main.js           # Boot + event wiring
│   ├── game.js           # Phaser config
│   ├── scenes/
│   │   └── TownScene.js  # Isometric ground, buildings, agents
│   ├── entities/
│   │   ├── Agent.js      # Pixel character + speech bubble
│   │   └── Building.js   # Isometric building
│   ├── state-client.js   # SSE + REST client
│   └── gazette.js        # Live feed renderer
└── README.md
```
