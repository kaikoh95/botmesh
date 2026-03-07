import Agent, { getAgentHexString } from '../entities/Agent.js';
import Building from '../entities/Building.js';
import WorldLife from '../entities/WorldLife.js';

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

  preload() {
    // Character sprites
    const spriteAgents = ['scarlet', 'lumen', 'canvas', 'forge', 'sage', 'echo', 'iron', 'cronos', 'mosaic', 'patch'];
    for (const id of spriteAgents) {
      this.load.image(`agent-${id}`, `assets/sprites/${id}.png`);
    }
    // Building sprites (per level)
    const buildings = ['townhall', 'postoffice'];
    for (const b of buildings) {
      for (let lvl = 1; lvl <= 3; lvl++) {
        this.load.image(`building-${b}-l${lvl}`, `assets/buildings/${b}-l${lvl}.png`);
      }
    }
    // World life sprites (flora + fauna)
    const lifeSprites = ['sakura', 'bamboo', 'zen', 'koipond', 'deer', 'crane', 'firefly', 'butterfly'];
    for (const name of lifeSprites) {
      this.load.image(`life-${name}`, `assets/sprites/life/${name}.png`);
    }
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

    // Draw scattered trees (fallback for non-sakura spots)
    this._drawTrees();

    // World life — flora, fauna, ambient
    this.worldLife = new WorldLife(this);
    this.worldLife.spawn(1); // starts with 1, updates as agents join

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
      // Small delay to allow agent/building click to fire first
      setTimeout(() => {
        if (!this._clickedAgent && !this._clickedBuilding) this.hideInfoPanel();
        this._clickedAgent = false;
        this._clickedBuilding = false;
      }, 50);
    });

    // Building click — show info panel
    window.addEventListener('botmesh:buildingclick', (e) => {
      this._clickedBuilding = true;
      this.showBuildingPanel(e.detail.buildingId);
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

    // Respawn world life with updated agent count
    const agentCount = Object.keys(this.agents).length;
    if (this.worldLife) this.worldLife.spawn(agentCount);

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

    const agentData = this.worldData?.agents?.[agent.id] || {};
    const pw = 240;
    const px = 12;
    const py = 12;

    // --- build content rows first to know height ---
    const rows = [];

    // Role
    const role = agentData.role || agent.role || 'Citizen';
    rows.push({ type: 'role', text: role });

    // Online / state
    const isOnline = agentData.status !== 'dormant';
    const state = agentData.state || 'idle';
    rows.push({ type: 'status', online: isOnline, state });

    // Current activity
    const activity = this._getAgentActivity(agentData);
    if (activity) rows.push({ type: 'activity', text: activity });

    // Location
    const loc = agentData.location;
    if (loc) rows.push({ type: 'location', x: loc.x, y: loc.y });

    // Skills
    const skills = agentData.skills || [];
    if (skills.length) rows.push({ type: 'skills', skills });

    // Last message
    const lastMsg = this._getLastMessage(agent.id);
    if (lastMsg) rows.push({ type: 'message', text: lastMsg });

    // Recent interactions
    const peers = this._getRecentPeers(agent.id);
    if (peers.length) rows.push({ type: 'peers', peers });

    // --- layout ---
    const headerH = 52;
    const rowH = 18;
    const pad = 12;
    const ph = headerH + rows.length * rowH + pad * 2 + 8;

    const panel = this.add.container(0, 0);
    panel.setDepth(10001);
    panel.setScrollFactor(0);

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x0d1b2a, 0.97);
    bg.fillRoundedRect(px, py, pw, ph, 10);
    bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(agent.colorHex || '#ffffff').color, 0.6);
    bg.strokeRoundedRect(px, py, pw, ph, 10);
    panel.add(bg);

    // Color accent bar
    const bar = this.add.graphics();
    const hexCol = Phaser.Display.Color.HexStringToColor(agent.colorHex || '#888888').color;
    bar.fillStyle(hexCol, 1);
    bar.fillRoundedRect(px, py, pw, 4, { tl: 10, tr: 10, bl: 0, br: 0 });
    panel.add(bar);

    // Close button
    const closeBtn = this.add.text(px + pw - 18, py + 8, '✕',
      { fontSize: '10px', fontFamily: 'monospace', color: '#666' })
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.hideInfoPanel())
      .on('pointerover', function() { this.setColor('#fff'); })
      .on('pointerout', function() { this.setColor('#666'); });
    panel.add(closeBtn);

    // Name row
    const emoji = agentData.emoji || '●';
    const nameStyle = { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#ffffff', wordWrap: { width: pw - 32 } };
    panel.add(this.add.text(px + pad, py + 12, `${emoji} ${agentData.name || agent.name}`, nameStyle));

    // Role subtitle
    panel.add(this.add.text(px + pad, py + 32, role.toUpperCase(),
      { fontSize: '8px', fontFamily: 'monospace', color: agent.colorHex || '#aaa', letterSpacing: 2 }));

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x1e3a5f, 1);
    div.lineBetween(px + pad, py + headerH, px + pw - pad, py + headerH);
    panel.add(div);

    // Rows
    let rowY = py + headerH + pad;
    const labelStyle = { fontSize: '9px', fontFamily: 'monospace', color: '#5a8a9f' };
    const valStyle   = { fontSize: '9px', fontFamily: 'monospace', color: '#d0c8b0', wordWrap: { width: pw - pad * 2 - 4 } };

    for (const row of rows) {
      switch (row.type) {
        case 'role': break; // already shown in header

        case 'status': {
          const dot = row.online ? '🟢' : '⚫';
          const stateLabel = row.state === 'working' ? '⚙️ working' :
                             row.state === 'walking'  ? '🚶 walking' :
                             row.state === 'speaking' ? '💬 speaking' : '💤 idle';
          panel.add(this.add.text(px + pad, rowY, `${dot} ${stateLabel}`, valStyle));
          rowY += rowH;
          break;
        }

        case 'activity': {
          panel.add(this.add.text(px + pad, rowY, `📍 ${row.text}`, valStyle));
          rowY += rowH;
          break;
        }

        case 'location': {
          panel.add(this.add.text(px + pad, rowY, `🗺  (${row.x}, ${row.y})`, { ...valStyle, color: '#888' }));
          rowY += rowH;
          break;
        }

        case 'skills': {
          panel.add(this.add.text(px + pad, rowY, '⚡ ' + row.skills.slice(0, 3).join(' · '), { ...valStyle, color: '#7ec8e3' }));
          rowY += rowH;
          break;
        }

        case 'message': {
          panel.add(this.add.text(px + pad, rowY, `"${row.text}"`,
            { ...valStyle, color: '#b0cca0', wordWrap: { width: pw - pad * 2 } }));
          rowY += rowH;
          break;
        }

        case 'peers': {
          panel.add(this.add.text(px + pad, rowY, '↔ ' + row.peers.join(', '), { ...valStyle, color: '#c8a0d0' }));
          rowY += rowH;
          break;
        }
      }
    }

    this.infoPanelContainer = panel;
  }

  _getAgentActivity(agentData) {
    if (!agentData) return null;
    if (agentData.state === 'working' && agentData.currentBuilding) {
      const bld = this.worldData?.buildings?.[agentData.currentBuilding];
      return `working at ${bld?.name || agentData.currentBuilding}`;
    }
    if (agentData.state === 'walking') return 'on the move';
    return null;
  }

  _getLastMessage(agentId) {
    const gazette = this.worldData?.gazette || [];
    const msg = [...gazette].reverse().find(e =>
      e.type === 'agent:speak' && (e.agentId === agentId || e.meta?.agentId === agentId)
    );
    if (!msg) return null;
    const text = msg.meta?.message || msg.content || '';
    return text.length > 60 ? text.slice(0, 57) + '…' : text;
  }

  _getRecentPeers(agentId) {
    const gazette = this.worldData?.gazette || [];
    const recent = gazette.slice(-30);
    const peers = new Set();
    recent.forEach(e => {
      if (e.meta?.target && e.meta.agentId === agentId) peers.add(e.meta.target);
      if (e.meta?.agentId && e.meta.target === agentId) peers.add(e.meta.agentId);
    });
    return [...peers].slice(0, 3);
  }

  hideInfoPanel() {
    if (this.infoPanelContainer) {
      this.infoPanelContainer.destroy();
      this.infoPanelContainer = null;
    }
  }

  // --- Building Upgrade System ---

  buildingUpgrading(buildingId, agentId, workers) {
    const building = this.buildings[buildingId];
    if (!building) return;
    building.showUpgradeSign(workers);
    // Move agent into building (fade)
    this.agentEnterBuilding(agentId, buildingId);
  }

  buildingUpgraded(buildingId, level) {
    const building = this.buildings[buildingId];
    if (!building) return;
    building.setLevel(level);
  }

  buildingSetDamaged(buildingId, damaged) {
    const building = this.buildings[buildingId];
    if (!building) return;
    building.setDamaged(damaged);
  }

  showBuildingPanel(buildingId) {
    this.hideInfoPanel();

    // Pull live data from state client
    const stateData = window.__botmeshState || {};
    const bData = (stateData.buildings || {})[buildingId] || {};
    const building = this.buildings[buildingId];
    if (!building) return;

    const PANEL_W = 260;
    const px = 12, py = 12;
    const lineH = 18;

    // Count workers currently inside
    const workers = Object.values(stateData.agents || {}).filter(a =>
      a.location && a.location.building === buildingId
    );

    // Upgrade history
    const upgrades = Array.isArray(bData.upgrades) ? bData.upgrades : [];

    const rows = [
      { label: null, value: null }, // name row
      { label: 'Level',   value: `${bData.level || building.level || 1} / ${building.maxLevel || 3}` },
      { label: 'Type',    value: building.type || 'civic' },
      { label: 'Status',  value: bData.damaged ? '💥 Damaged' : '✅ Operational' },
      { label: 'Workers', value: workers.length > 0 ? workers.map(w => w.name || w.id).join(', ') : 'None' },
    ];

    // Add upgrade history entries
    if (upgrades.length > 0) {
      rows.push({ label: '─ Upgrade History ─', value: null, header: true });
      upgrades.forEach((u, i) => {
        const date = u.upgradedAt ? new Date(u.upgradedAt).toLocaleDateString('en-NZ', { month:'short', day:'numeric' }) : '?';
        rows.push({ label: `Lv${u.level}`, value: `${u.upgradedBy || '?'} · ${date}` });
        if (u.note) rows.push({ label: null, value: `"${u.note}"`, note: true });
      });
    } else {
      rows.push({ label: 'History', value: 'No upgrades yet' });
    }

    const panelH = 28 + rows.length * lineH + 24;
    const container = this.add.container(px, py).setScrollFactor(0).setDepth(10001);

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.92);
    bg.fillRoundedRect(0, 0, PANEL_W, panelH, 8);
    bg.lineStyle(2, 0xe8c97e, 0.8);
    bg.strokeRoundedRect(0, 0, PANEL_W, panelH, 8);
    container.add(bg);

    // Building name header
    const nameText = this.add.text(PANEL_W / 2, 12, `🏛 ${building.name}`, {
      fontSize: '10px', fontFamily: '"Press Start 2P", monospace',
      color: '#e8c97e', align: 'center',
    }).setOrigin(0.5, 0);
    container.add(nameText);

    let rowY = 30;
    rows.forEach(row => {
      if (row.header) {
        const sep = this.add.text(PANEL_W / 2, rowY, row.label, {
          fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
          color: '#666688', align: 'center',
        }).setOrigin(0.5, 0);
        container.add(sep);
      } else if (row.note) {
        const note = this.add.text(12, rowY, row.value, {
          fontSize: '7px', fontFamily: 'monospace',
          color: '#9999bb', wordWrap: { width: PANEL_W - 24 },
          fontStyle: 'italic',
        }).setOrigin(0, 0);
        container.add(note);
      } else if (row.label) {
        const lbl = this.add.text(10, rowY, row.label, {
          fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#888aaa',
        }).setOrigin(0, 0);
        const val = this.add.text(PANEL_W - 10, rowY, row.value, {
          fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#e8e8ff',
        }).setOrigin(1, 0);
        container.add(lbl);
        container.add(val);
      }
      rowY += lineH;
    });

    // Close button
    const closeBtn = this.add.text(PANEL_W - 10, 8, '✕', {
      fontSize: '10px', fontFamily: 'monospace', color: '#666688',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.hideInfoPanel());
    closeBtn.on('pointerover', () => closeBtn.setColor('#fff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#666688'));
    container.add(closeBtn);

    this.infoPanelContainer = container;
  }

  // ─── WORLD MUTATION API ────────────────────────────────────────────────────

  addLifeEntity({ kind, x, y, id }) {
    // Dynamically plant a life sprite at grid position
    const key = `life-${kind}`;
    if (!this.textures.exists(key)) {
      console.warn(`[TownScene] life texture missing: ${key}`);
      return;
    }
    const pos = this.gridToScreen(x || 10 + Math.random() * 20, y || 10 + Math.random() * 15);
    const img = this.add.image(pos.x, pos.y, key);
    img.setOrigin(0.5, 0.85);
    img.setDepth(pos.y);
    const scale = 64 / Math.max(img.width, img.height) * 1.5;
    img.setScale(scale);
    // Tween in
    img.setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 800, ease: 'Power2' });
    // Track for removal
    if (!this._dynamicEntities) this._dynamicEntities = {};
    this._dynamicEntities[id || `${kind}-${Date.now()}`] = img;
  }

  removeEntity(id) {
    // Remove a dynamic entity (life, infra, etc.)
    if (this._dynamicEntities && this._dynamicEntities[id]) {
      const obj = this._dynamicEntities[id];
      this.tweens.add({
        targets: obj, alpha: 0, duration: 600,
        onComplete: () => obj.destroy()
      });
      delete this._dynamicEntities[id];
      return;
    }
    // Also check buildings
    if (this.buildings && this.buildings[id]) {
      const b = this.buildings[id];
      this.tweens.add({
        targets: b.container, alpha: 0, duration: 600,
        onComplete: () => b.destroy()
      });
      delete this.buildings[id];
    }
  }

  agentEnterBuilding(agentId, buildingId) {
    const agent = this.agents[agentId];
    const building = this.buildings[buildingId];
    if (!agent || !building) return;

    // Tween agent to building position
    const bx = building.container.x;
    const by = building.container.y;

    this.tweens.add({
      targets: agent.container,
      x: bx,
      y: by,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        // Fade agent to show they're "inside"
        this.tweens.add({
          targets: agent.container,
          alpha: 0.3,
          duration: 300,
        });
        agent.container.setDepth(building.container.depth - 1);
      }
    });
  }

  agentExitBuilding(agentId, buildingId) {
    const agent = this.agents[agentId];
    const building = this.buildings[buildingId];
    if (!agent) return;

    // Restore alpha
    this.tweens.add({
      targets: agent.container,
      alpha: 1,
      duration: 300,
    });

    // Move agent slightly away from building
    if (building) {
      const exitPos = this.gridToScreen(building.gridX + building.gridW + 1, building.gridY + 1);
      this.tweens.add({
        targets: agent.container,
        x: exitPos.x,
        y: exitPos.y,
        duration: 600,
        ease: 'Power2',
        onComplete: () => {
          agent.container.setDepth(exitPos.y + 1000);
        }
      });
    }

    // Hide upgrade sign if no more workers
    if (building) {
      building.hideUpgradeSign();
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
