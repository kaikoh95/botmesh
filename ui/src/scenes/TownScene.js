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
  }

  create() {
    // Background
    this.cameras.main.setBackgroundColor('#4a7c59');

    // Compute origin to center the map
    const mapW = 40;
    const mapH = 30;
    this.originX = this.cameras.main.width / 2;
    this.originY = 80;

    // Draw ground tiles
    this._drawGround(mapW, mapH);

    // Day/night overlay (covers entire camera)
    this.dayOverlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width * 2,
      this.cameras.main.height * 2,
      0x000000, 0
    );
    this.dayOverlay.setDepth(9999);
    this.dayOverlay.setScrollFactor(0);

    // Enable camera drag
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown) {
        this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x);
        this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y);
      }
    });

    // Zoom with mouse wheel
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.3, 2.5);
      cam.setZoom(newZoom);
    });
  }

  _drawGround(mapW, mapH) {
    const g = this.add.graphics();
    g.setDepth(0);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const screen = this.gridToScreen(x, y);
        const isPath = this._isPath(x, y);
        const color = isPath ? 0xd4a574 : this._grassColor(x, y);

        g.fillStyle(color, 1);
        g.beginPath();
        g.moveTo(screen.x, screen.y - TILE_H / 2);
        g.lineTo(screen.x + TILE_W / 2, screen.y);
        g.lineTo(screen.x, screen.y + TILE_H / 2);
        g.lineTo(screen.x - TILE_W / 2, screen.y);
        g.closePath();
        g.fillPath();

        // Subtle tile outline
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

  _grassColor(x, y) {
    // Slight variation for visual interest
    const n = ((x * 7 + y * 13) % 5);
    const greens = [0x4a7c59, 0x4d8060, 0x477855, 0x508362, 0x4b7e5b];
    return greens[n];
  }

  _isPath(x, y) {
    // Paths through the center of town
    return (y === 15 && x >= 10 && x <= 28) ||
           (x === 20 && y >= 8 && y <= 22) ||
           (x === 18 && y >= 12 && y <= 18);
  }

  gridToScreen(gridX, gridY) {
    const screenX = this.originX + (gridX - gridY) * (TILE_W / 2);
    const screenY = this.originY + (gridX + gridY) * (TILE_H / 2);
    return { x: screenX, y: screenY };
  }

  // --- Public API called from main.js ---

  loadState(state) {
    this.worldData = state;

    // Create buildings
    if (state.buildings) {
      for (const [id, bData] of Object.entries(state.buildings)) {
        this.addBuilding(bData);
      }
    }

    // Create agents (only those present in state)
    if (state.agents) {
      for (const [id, aData] of Object.entries(state.agents)) {
        this.addAgent(aData);
      }
    }

    // Set time
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
    // Place building at center of its footprint
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
    if (agent) agent.speak(message);
  }

  setAgentOnline(id, online) {
    const agent = this.agents[id];
    if (agent) agent.setOnline(online);
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

  getAgentColorMap() {
    const map = {};
    for (const [id, agent] of Object.entries(this.agents)) {
      map[id] = '#' + agent.color.toString(16).padStart(6, '0');
    }
    return map;
  }
}
