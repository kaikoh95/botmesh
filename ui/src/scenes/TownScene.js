import Agent, { getAgentHexString } from '../entities/Agent.js';
import Building from '../entities/Building.js';

const TILE_W = 64;
const TILE_H = 32;

export default class TownScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TownScene' });
    this.agents = {};    // id -> Agent
    this.buildings = {};  // id -> Building
    this.worldData = null;
    this.dayOverlay = null;
    this.currentPeriod = 'morning';
    this.originX = 0;
    this.originY = 0;
    this.infoPanel = null;
    this.onAgentClick = null; // callback set by main.js
  }

  create() {
    this.cameras.main.setBackgroundColor('#4a7c59');

    const mapW = 40;
    const mapH = 30;
    this.originX = this.cameras.main.width / 2;
    this.originY = 80;

    // Draw ground tiles
    this._drawGround(mapW, mapH);

    // Draw water feature (bottom-left corner)
    this._drawWater();

    // Draw scattered trees
    this._drawTrees();

    // Day/night overlay
    this.dayOverlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width * 2,
      this.cameras.main.height * 2,
      0x000000, 0
    );
    this.dayOverlay.setDepth(9999);
    this.dayOverlay.setScrollFactor(0);

    // Info panel layer (above overlay)
    this.infoPanelContainer = null;

    // Camera drag
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown) {
        this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x);
        this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y);
      }
    });

    // Zoom
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.3, 2.5);
      cam.setZoom(newZoom);
    });

    // Click background to dismiss info panel
    this.input.on('pointerdown', (pointer) => {
      // Small delay to allow agent click to fire first
      setTimeout(() => {
        if (!this._clickedAgent) this.hideInfoPanel();
        this._clickedAgent = false;
      }, 50);
    });
  }

  _drawGround(mapW, mapH) {
    const g = this.add.graphics();
    g.setDepth(0);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const screen = this.gridToScreen(x, y);
        const isWater = this._isWater(x, y);
        const isPath = this._isPath(x, y);
        const color = isWater ? this._waterColor(x, y) : isPath ? 0xd4a574 : this._grassColor(x, y);

        g.fillStyle(color, 1);
        g.beginPath();
        g.moveTo(screen.x, screen.y - TILE_H / 2);
        g.lineTo(screen.x + TILE_W / 2, screen.y);
        g.lineTo(screen.x, screen.y + TILE_H / 2);
        g.lineTo(screen.x - TILE_W / 2, screen.y);
        g.closePath();
        g.fillPath();

        g.lineStyle(1, 0x000000, 0.06);
        g.beginPath();
        g.moveTo(screen.x, screen.y - TILE_H / 2);
        g.lineTo(screen.x + TILE_W / 2, screen.y);
        g.lineTo(screen.x, screen.y + TILE_H / 2);
        g.lineTo(screen.x - TILE_W / 2, screen.y);
        g.closePath();
        g.strokePath();
      }
    }
  }

  _drawWater() {
    // Animated water shimmer
    const waterTiles = [];
    for (let y = 24; y < 30; y++) {
      for (let x = 0; x < 6; x++) {
        if (this._isWater(x, y)) waterTiles.push({ x, y });
      }
    }

    // Add subtle shimmer rectangles
    const g = this.add.graphics();
    g.setDepth(1);
    for (const t of waterTiles) {
      const screen = this.gridToScreen(t.x, t.y);
      g.fillStyle(0xffffff, 0.08);
      g.fillCircle(screen.x + Phaser.Math.Between(-8, 8), screen.y, 3);
    }

    // Gentle alpha pulse
    this.tweens.add({
      targets: g,
      alpha: { from: 0.6, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _drawTrees() {
    const g = this.add.graphics();
    // Deterministic tree positions scattered around
    const treeSpots = [
      [2, 3], [4, 7], [7, 2], [8, 9], [1, 12], [3, 18], [6, 22],
      [33, 3], [36, 7], [38, 2], [35, 11], [37, 18], [34, 22],
      [12, 2], [25, 3], [28, 7], [14, 24], [22, 26], [30, 25],
      [10, 8], [32, 14], [8, 19], [27, 22], [16, 4], [24, 8],
    ];

    for (const [tx, ty] of treeSpots) {
      if (this._isWater(tx, ty) || this._isPath(tx, ty)) continue;
      const screen = this.gridToScreen(tx, ty);

      // Tree shadow
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(screen.x + 2, screen.y + 4, 18, 8);

      // Trunk
      g.fillStyle(0x6b4226, 1);
      g.fillRect(screen.x - 2, screen.y - 8, 4, 12);

      // Foliage layers (stacked diamonds for isometric feel)
      const greens = [0x2d7a3a, 0x358a44, 0x2a6e35];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(greens[i % greens.length], 1);
        const yOff = screen.y - 12 - i * 6;
        const size = 12 - i * 2;
        g.beginPath();
        g.moveTo(screen.x, yOff - size);
        g.lineTo(screen.x + size, yOff);
        g.lineTo(screen.x, yOff + size / 2);
        g.lineTo(screen.x - size, yOff);
        g.closePath();
        g.fillPath();
      }

      g.setDepth(screen.y + 500);
    }
  }

  _grassColor(x, y) {
    const n = ((x * 7 + y * 13) % 5);
    const greens = [0x4a7c59, 0x4d8060, 0x477855, 0x508362, 0x4b7e5b];
    return greens[n];
  }

  _waterColor(x, y) {
    const n = ((x * 3 + y * 5) % 3);
    const blues = [0x2980b9, 0x2471a3, 0x2e86c1];
    return blues[n];
  }

  _isWater(x, y) {
    return x < 5 && y > 24;
  }

  _isPath(x, y) {
    return (y === 15 && x >= 10 && x <= 28) ||
           (x === 20 && y >= 8 && y <= 22) ||
           (x === 18 && y >= 12 && y <= 18);
  }

  gridToScreen(gridX, gridY) {
    const screenX = this.originX + (gridX - gridY) * (TILE_W / 2);
    const screenY = this.originY + (gridX + gridY) * (TILE_H / 2);
    return { x: screenX, y: screenY };
  }

  // --- Public API ---

  loadState(state) {
    this.worldData = state;

    if (state.buildings) {
      for (const [id, bData] of Object.entries(state.buildings)) {
        this.addBuilding(bData);
      }
    }

    if (state.agents) {
      for (const [id, aData] of Object.entries(state.agents)) {
        this.addAgent(aData);
      }
    }

    if (state.time?.period) {
      this.setTime(state.time.period);
    }
  }

  addAgent(agentData) {
    if (this.agents[agentData.id]) return this.agents[agentData.id];

    const pos = this.gridToScreen(
      agentData.location?.x ?? 20,
      agentData.location?.y ?? 15
    );
    const agent = new Agent(this, agentData, pos.x, pos.y);
    this.agents[agentData.id] = agent;

    // Enable click
    agent.enableInteraction((a) => {
      this._clickedAgent = true;
      this.showInfoPanel(a);
    });

    // Set initial state (handles sleeping correctly now)
    if (agentData.state) agent.setState(agentData.state);
    if (!agentData.online) agent.setOnline(false);

    return agent;
  }

  removeAgent(id) {
    if (this.agents[id]) {
      this.agents[id].destroy();
      delete this.agents[id];
    }
  }

  addBuilding(bData) {
    if (this.buildings[bData.id]) return;
    const cx = bData.x + (bData.width || 3) / 2;
    const cy = bData.y + (bData.height || 2) / 2;
    const pos = this.gridToScreen(cx, cy);
    const building = new Building(this, bData, pos.x, pos.y);
    this.buildings[bData.id] = building;
  }

  moveAgent(id, toX, toY) {
    const agent = this.agents[id];
    if (!agent) return;
    const pos = this.gridToScreen(toX, toY);
    agent.moveTo(pos.x, pos.y, toX, toY);
  }

  updateAgentState(id, state) {
    const agent = this.agents[id];
    if (agent) agent.setState(state);
  }

  agentSpeak(id, message) {
    const agent = this.agents[id];
    if (!agent) return;
    agent.speak(message);
    agent.flash();
  }

  setAgentOnline(id, online) {
    const agent = this.agents[id];
    if (agent) agent.setOnline(online);

    // Glow the agent's home building when online
    for (const [bId, building] of Object.entries(this.buildings)) {
      if (bId === `home_${id}`) {
        building.setGlow(online);
      }
    }
  }

  setTime(period) {
    this.currentPeriod = period;
    if (!this.dayOverlay) return;

    const overlays = {
      morning:   { color: 0xfff0c0, alpha: 0.0 },
      afternoon: { color: 0xffc864, alpha: 0.08 },
      evening:   { color: 0xff9632, alpha: 0.25 },
      night:     { color: 0x141432, alpha: 0.45 },
    };

    const o = overlays[period] || overlays.morning;

    this.tweens.add({
      targets: this.dayOverlay,
      alpha: o.alpha,
      duration: 2000,
      ease: 'Power2',
    });
    this.dayOverlay.setFillStyle(o.color, o.alpha);
  }

  // --- Info Panel (Improvement 4) ---

  showInfoPanel(agent) {
    this.hideInfoPanel();

    const panel = this.add.container(0, 0);
    panel.setDepth(10001);
    panel.setScrollFactor(0);

    const pw = 220;
    const ph = 180;
    const px = this.cameras.main.width - pw - 16;
    const py = 16;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x16213e, 0.95);
    bg.fillRoundedRect(px, py, pw, ph, 8);
    bg.lineStyle(2, 0x0f3460, 1);
    bg.strokeRoundedRect(px, py, pw, ph, 8);
    panel.add(bg);

    // Color bar at top
    const bar = this.add.graphics();
    bar.fillStyle(agent.color, 1);
    bar.fillRect(px, py, pw, 4);
    panel.add(bar);

    const textX = px + 12;
    let textY = py + 14;
    const style = { fontSize: '11px', fontFamily: '"Press Start 2P", monospace', color: '#e8d5a3', stroke: '#000', strokeThickness: 1 };
    const smallStyle = { fontSize: '9px', fontFamily: 'Courier New, monospace', color: '#c8c0b0' };

    // Name + emoji
    const nameText = this.add.text(textX, textY, `${agent.name}`, style);
    panel.add(nameText);
    textY += 20;

    // Role (from worldData)
    const agentData = this.worldData?.agents?.[agent.id];
    if (agentData?.role) {
      panel.add(this.add.text(textX, textY, agentData.role, { ...smallStyle, color: '#7ec8e3' }));
      textY += 16;
    }

    // State + Mood
    const state = agentData?.state || agent.agentState || '?';
    const mood = agentData?.mood || '?';
    panel.add(this.add.text(textX, textY, `State: ${state}`, smallStyle));
    textY += 14;
    panel.add(this.add.text(textX, textY, `Mood: ${mood}`, smallStyle));
    textY += 14;

    // Online status
    const online = agentData?.online !== false;
    const statusColor = online ? '#27ae60' : '#e74c3c';
    panel.add(this.add.text(textX, textY, `Status: ${online ? 'Online' : 'Offline'}`, { ...smallStyle, color: statusColor }));
    textY += 18;

    // Relationships
    if (agentData?.relationships && Object.keys(agentData.relationships).length > 0) {
      panel.add(this.add.text(textX, textY, 'Relationships:', { ...smallStyle, color: '#e8d5a3' }));
      textY += 14;
      for (const [rid, rel] of Object.entries(agentData.relationships)) {
        const trust = rel.trust ?? '?';
        panel.add(this.add.text(textX + 8, textY, `${rid}: trust ${trust}`, smallStyle));
        textY += 12;
        if (textY > py + ph - 10) break;
      }
    }

    this.infoPanelContainer = panel;
  }

  hideInfoPanel() {
    if (this.infoPanelContainer) {
      this.infoPanelContainer.destroy();
      this.infoPanelContainer = null;
    }
  }

  getAgentColorMap() {
    const map = {};
    for (const [id, agent] of Object.entries(this.agents)) {
      map[id] = '#' + agent.color.toString(16).padStart(6, '0');
    }
    return map;
  }
}
