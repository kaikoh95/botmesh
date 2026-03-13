/**
 * RENDER STANDARD
 * - Grid: TILE_W=64, TILE_H=32, origin offset = camera.width*0.55, -60
 * - Screen pos: screenX = originX + (gx-gy)*(TILE_W/2), screenY = originY + (gx+gy)*(TILE_H/2)
 * - Sprite anchor: buildings=(0.5, 1.0), agents=(0.5, 1.0), life=(0.5, 1.0)
 * - Depth: screenY (buildings/life) or screenY+1 (agents — same tile priority)
 * - All sprites have 30px transparent padding — no adjustment needed for origin
 * - Day/night: tint only, no overlay rectangles
 */
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
    // Suppress 404 errors for missing sprites — fallback rendering handles them gracefully
    this.load.on('loaderror', (file) => { console.warn(`[Preload] failed: ${file.key}`); });

    // Cache-bust sprite URLs so browser never serves stale autumn/old sprites
    const v = `?v=${Date.now()}`;

    // Character sprites
    const spriteAgents = ['scarlet', 'lumen', 'canvas', 'forge', 'sage', 'echo', 'iron', 'cronos', 'mosaic', 'patch', 'muse', 'planner', 'qa'];
    for (const id of spriteAgents) {
      this.load.image(`agent-${id}`, `assets/sprites/${id}.png${v}`);
    }

    // Building sprites — exact manifest of what exists on disk (no speculative loads)
    const buildingFiles = [
      'bathhouse-l1','bathhouse-l2',
      'cottage-l1','cottage-l2','cottage-l3',
      'keep-l1','keep-l2',
      'library-l1','library-l2','library-l3',
      'market-l1','market-l2',
      'observatory-l1','observatory-l2',
      'plaza-l1','plaza-l2',
      'postoffice-l1','postoffice-l2','postoffice-l3',
      'sanctum-l1',
      'shrine-l1',
      'teahouse-l1','teahouse-l2',
      'torii-l1',
      'townhall-l1','townhall-l2','townhall-l3',
      'well-l1',
      'workshop-l1','workshop-l2',
      'brewery-l1',
      'smithy-l1','smithy-l2',
      'garden-l1',
      'pavilion-l1','pavilion-l2',
    ];
    for (const f of buildingFiles) {
      this.load.image(`building-${f}`, `assets/buildings/${f}.png${v}`);
    }

    // House and torii-gate building sprites
    this.load.image('building-house-north-l1', `assets/buildings/house-north-l1.png${v}`);
    this.load.image('building-house-east-l1', `assets/buildings/house-east-l1.png${v}`);
    this.load.image('building-house-south-l1', `assets/buildings/house-south-l1.png${v}`);
    this.load.image('building-house-west-l1', `assets/buildings/house-west-l1.png${v}`);
    this.load.image('building-torii-gate-l1', `assets/buildings/torii-gate-l1.png${v}`);

    // World life sprites
    const lifeSprites = ['sakura', 'bamboo', 'zen', 'koipond', 'deer', 'crane', 'firefly', 'butterfly', 'willow', 'lamp', 'pine', 'torii', 'moat', 'bridge', 'fence'];
    for (const name of lifeSprites) {
      this.load.image(`life-${name}`, `assets/sprites/life/${name}.png${v}`);
    }

    // Ground tile sprites
    this.load.image('tile-path', `assets/buildings/path-tile.png${v}`);
  }

  create() {
    this.cameras.main.setBackgroundColor('#080c14'); // deep midnight blue — no purple bleed

    // Solid backdrop in world space — prevents transparent checkerboard on all devices.
    // World-space rect (no scrollFactor override) so it pans with the camera and
    // covers all positions regardless of DPR, zoom, or viewport size.
    const backdrop = this.add.rectangle(0, 0, 10000, 10000, 0x080c14);
    backdrop.setDepth(-9999);

    this.mapW = 120;
    this.mapH = 120;
    // Origin: center the star layout on grid (55,55)
    this.originX = this.cameras.main.width * 0.5;
    this.originY = -800;

    // Draw ground tiles immediately with defaults
    this._drawGround(this.mapW, this.mapH);

    // Async: read world dimensions from state API and resize if needed
    this._fetchWorldDims();

    // Draw water feature (pond near center)
    this._drawWater();

    // Draw scattered trees (fallback for non-sakura spots)
    this._drawTrees();

    // Draw connected fence lines around residential yards
    this._drawFences();

    // World life — flora, fauna, ambient
    this.worldLife = new WorldLife(this);
    this.worldLife.spawn(1); // starts with 1, updates as agents join

    // Path tile registry — populated from world entities on state:sync
    this.pathTiles = new Set();

    // ── Camera pan (drag to scroll) ─────────────────────────────────────────
    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && ptr.button === 0 && !this._dragging) return;
    });
    let _dragStart = null;
    let _camStart = null;
    this.input.on('pointerdown', (ptr) => {
      if (ptr.button === 0) { _dragStart = { x: ptr.x, y: ptr.y }; _camStart = { x: CAM.scrollX, y: CAM.scrollY }; this._dragging = false; }
    });
    this.input.on('pointermove', (ptr) => {
      if (ptr.isDown && _dragStart && ptr.button === 0) {
        const dx = ptr.x - _dragStart.x; const dy = ptr.y - _dragStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          this._dragging = true;
          CAM.setScroll(_camStart.x - dx / this._zoom, _camStart.y - dy / this._zoom);
        }
      }
    });
    this.input.on('pointerup', () => { _dragStart = null; _camStart = null; setTimeout(() => { this._dragging = false; }, 50); });

    // ── Zoom ────────────────────────────────────────────────────────────────
    const isMobile = window.innerWidth < 768;
    this._zoom = isMobile ? 0.45 : 1.0;
    const CAM = this.cameras.main;
    CAM.setZoom(this._zoom);

    // On mobile, centre camera on the crossroads center
    if (isMobile) {
      const civic = this.gridToScreen(55, 55);
      CAM.centerOn(civic.x, civic.y);
    }

    // Centralised zoom apply — updates camera + building label visibility
    const applyZoom = () => {
      CAM.setZoom(this._zoom);
      Object.values(this.buildings).forEach(b => b.updateLabelVisibility(this._zoom));
    };

    // Apply initial label visibility
    applyZoom();

    // Mouse wheel zoom
    this.input.on('wheel', (_ptr, _objs, _dx, deltaY) => {
      this._zoom = Phaser.Math.Clamp(this._zoom - deltaY * 0.0008, 0.35, 2.5);
      applyZoom();
    });

    // Pinch-to-zoom (touch)
    this.input.addPointer(2);
    let lastPinchDist = null;
    this.input.on('pointermove', () => {
      const ptrs = this.input.manager.pointers.filter(p => p.isDown);
      if (ptrs.length === 2) {
        const dx = ptrs[0].x - ptrs[1].x;
        const dy = ptrs[0].y - ptrs[1].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinchDist !== null) {
          const delta = dist - lastPinchDist;
          this._zoom = Phaser.Math.Clamp(this._zoom + delta * 0.003, 0.35, 2.5);
          applyZoom();
        }
        lastPinchDist = dist;
      } else {
        lastPinchDist = null;
      }
    });

    // Keyboard +/- zoom
    this.input.keyboard.on('keydown-PLUS',  () => { this._zoom = Phaser.Math.Clamp(this._zoom + 0.15, 0.35, 2.5); applyZoom(); });
    this.input.keyboard.on('keydown-MINUS', () => { this._zoom = Phaser.Math.Clamp(this._zoom - 0.15, 0.35, 2.5); applyZoom(); });
    this.input.keyboard.on('keydown-ZERO',  () => { this._zoom = 1.0; applyZoom(); });

    // Expose to window for UI buttons
    window.botmeshZoom = (delta) => {
      this._zoom = Phaser.Math.Clamp(this._zoom + delta, 0.35, 2.5);
      applyZoom();
    };
    window._zoomReset = () => { this._zoom = 1.0; applyZoom(); };

    // ── Snowfall ────────────────────────────────────────────────────────────
    this._initSnow();

    // ── Frost sparkles — tiny glints on the snow surface ──────────────────
    this._initFrostSparkles();

    // ── Snow drift accents — small white mounds near buildings ─────────────
    this._drawSnowDrifts();

    // ── Path lanterns — warm glow points along main roads ─────────────────
    this._drawPathLanterns();

    // ── Fog layer — low mist drifting across the scene ────────────────────
    this._initFog();

    // ── Grid toggle ────────────────────────────────────────────────────────
    this._gridVisible = true;
    window.botmeshToggleGrid = () => {
      this._gridVisible = !this._gridVisible;
      if (this._groundGraphics) this._groundGraphics.setVisible(this._gridVisible);
      return this._gridVisible;
    };

    // Grid-based click detection — accurate footprint hits only
    this._setupGridClickHandler();

    // Day/night — tint-only, no overlay rectangles (see RENDER STANDARD above)
    this.dayOverlay = null; // removed; use setTime() tints instead

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

    // Background tap — no longer dismisses panels
    // Panels only close via their own ✕ button

    // Building clicks handled by HTML panel in main.js

    // Agent name click in feed → pan camera to agent
    window.addEventListener('botmesh:followagent', (e) => {
      this.panToAgent(e.detail.agentId);
    });

    // Agent random thoughts — personality bubbles every ~8s (picks a random online agent)
    this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => {
        const agentIds = Object.keys(this.agents);
        if (!agentIds.length) return;
        const id = agentIds[Math.floor(Math.random() * agentIds.length)];
        const agent = this.agents[id];
        if (!agent || !agent.online) return;
        const thought = this._agentThought(id);
        if (thought && agent.speak) agent.speak(thought);
      }
    });

    // Friend proximity — agents seek out high-score relationship partners (every 30s)
    this.time.addEvent({
      delay: 30000,
      loop: true,
      callback: () => this._checkFriendProximity(),
    });
  }

  async _checkFriendProximity() {
    try {
      const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
      const r = await fetch(`${STATE_URL}/world/relationships`);
      const relationships = await r.json();

      // Build a map: agentId → { partnerId, score }
      const bestPartner = {};
      for (const [key, val] of Object.entries(relationships)) {
        if (val.score <= 50) continue;
        const [a, b] = key.split(':');
        if (!bestPartner[a] || val.score > bestPartner[a].score) {
          bestPartner[a] = { partnerId: b, score: val.score };
        }
        if (!bestPartner[b] || val.score > bestPartner[b].score) {
          bestPartner[b] = { partnerId: a, score: val.score };
        }
      }

      for (const [agentId, { partnerId }] of Object.entries(bestPartner)) {
        const agent   = this.agents[agentId];
        const partner = this.agents[partnerId];
        if (!agent || !agent.online) continue;
        if (!partner || !partner.online) continue;
        // Only seek if at different grid positions (rough check via sprite pos)
        const dx = Math.abs((agent.container?.x || 0) - (partner.container?.x || 0));
        const dy = Math.abs((agent.container?.y || 0) - (partner.container?.y || 0));
        if (dx < 32 && dy < 32) continue; // already nearby

        // 20% chance to walk toward friend
        if (Math.random() < 0.2) {
          const tx = (partner.container?.x || 0) + (Math.random() * 32 - 16);
          const ty = (partner.container?.y || 0) + (Math.random() * 16 - 8);
          agent.moveTo(tx, ty);
          if (agent.speak) agent.speak('💞');
        }
      }
    } catch (e) { /* silent — don't break if state unreachable */ }
  }

  _initSnow() {
    const W = this.cameras.main.width  || 900;
    const H = this.cameras.main.height || 700;
    const FLAKE_COUNT = 120;
    this._snowFlakes = [];

    for (let i = 0; i < FLAKE_COUNT; i++) {
      const size   = Phaser.Math.Between(1, 3);
      const alpha  = Phaser.Math.FloatBetween(0.25, 0.75);
      const speed  = Phaser.Math.FloatBetween(28, 80);   // px/s fall speed
      const drift  = Phaser.Math.FloatBetween(-18, 18);  // px/s horizontal drift
      const wobble = Phaser.Math.FloatBetween(0, Math.PI * 2); // phase offset

      // Draw a simple white circle
      const g = this.add.graphics();
      g.fillStyle(0xdce8f0, alpha);
      g.fillCircle(0, 0, size);
      g.setScrollFactor(0);         // fixed to camera — not part of world
      g.setDepth(9999);             // always on top

      const flake = {
        gfx:    g,
        x:      Phaser.Math.Between(0, W),
        y:      Phaser.Math.Between(-H, H),  // stagger initial positions vertically
        size,
        speed,
        drift,
        wobble,
        wobbleAmp: Phaser.Math.FloatBetween(8, 25),
        wobbleFreq: Phaser.Math.FloatBetween(0.6, 1.4),
      };
      this._snowFlakes.push(flake);
    }
  }

  _updateSnow(delta) {
    if (!this._snowFlakes) return;
    const W = this.cameras.main.width  || 900;
    const H = this.cameras.main.height || 700;
    const dt = delta / 1000; // seconds

    for (const f of this._snowFlakes) {
      f.wobble += dt * f.wobbleFreq;
      f.x += f.drift * dt + Math.sin(f.wobble) * f.wobbleAmp * dt;
      f.y += f.speed * dt;

      // Wrap around edges
      if (f.y > H + 10)    { f.y = -10; f.x = Phaser.Math.Between(0, W); }
      if (f.x > W + 10)    { f.x = -10; }
      if (f.x < -10)       { f.x = W + 10; }

      f.gfx.setPosition(f.x, f.y);
    }
  }

  _initFrostSparkles() {
    // Tiny diamond glints scattered across the snow — twinkle in/out
    this._frostSparkles = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      // Random grid positions avoiding water/paths
      const gx = Phaser.Math.Between(1, 115);
      const gy = Phaser.Math.Between(1, 115);
      if (this._isWater(gx, gy) || this._isPath(gx, gy)) continue;

      const screen = this.gridToScreen(gx, gy);
      // Offset within tile for variety
      const ox = Phaser.Math.Between(-12, 12);
      const oy = Phaser.Math.Between(-6, 6);

      const g = this.add.graphics();
      g.fillStyle(0xd0e8ff, 0.9);
      // Tiny 4-point star shape
      const s = Phaser.Math.FloatBetween(1.0, 2.0);
      g.beginPath();
      g.moveTo(0, -s * 1.5);
      g.lineTo(s * 0.5, 0);
      g.lineTo(0, s * 1.5);
      g.lineTo(-s * 0.5, 0);
      g.closePath();
      g.fillPath();
      g.setPosition(screen.x + ox, screen.y + oy);
      g.setDepth(2);
      g.setAlpha(0);

      // Staggered twinkle tween
      this.tweens.add({
        targets: g,
        alpha: { from: 0, to: Phaser.Math.FloatBetween(0.4, 0.9) },
        duration: Phaser.Math.Between(1500, 3000),
        delay: Phaser.Math.Between(0, 6000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._frostSparkles.push(g);
    }
  }

  _drawPathLanterns() {
    // Warm lantern glow points spaced along main roads
    const lanternSpots = [
      // E-W road (y=37)
      [10, 37], [20, 37], [30, 37], [50, 37], [60, 37], [70, 37], [80, 37], [90, 37], [100, 37],
      // N-S road (x=38)
      [38, 10], [38, 20], [38, 30], [38, 50], [38, 60], [38, 70], [38, 80], [38, 90], [38, 100],
      // Center intersection
      [38, 37],
    ];

    for (const [lx, ly] of lanternSpots) {
      const screen = this.gridToScreen(lx, ly);

      // Lantern post (tiny)
      const post = this.add.graphics();
      post.fillStyle(0x555555, 0.8);
      post.fillRect(-1, -10, 2, 10);
      post.fillStyle(0x444444, 0.8);
      post.fillRect(-3, -12, 6, 3);
      post.setPosition(screen.x, screen.y);
      post.setDepth(screen.y + 5001);

      // Warm ground glow pool
      const glow = this.add.graphics();
      glow.fillStyle(0xffaa44, 0.08);
      glow.fillEllipse(0, 0, 40, 18);
      glow.fillStyle(0xffcc66, 0.05);
      glow.fillEllipse(0, 0, 22, 10);
      // Tiny bright center (the "flame")
      glow.fillStyle(0xffdd88, 0.5);
      glow.fillCircle(0, -10, 2);
      glow.setPosition(screen.x, screen.y);
      glow.setDepth(screen.y + 4999);

      // Flicker
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.7, to: 1.0 },
        duration: Phaser.Math.Between(800, 1600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _initFog() {
    // Low-lying fog wisps that drift slowly across the scene
    this._fogWisps = [];
    const W = this.cameras.main.width || 900;
    const H = this.cameras.main.height || 700;
    const count = 8;

    for (let i = 0; i < count; i++) {
      const g = this.add.graphics();
      const fogW = Phaser.Math.Between(120, 280);
      const fogH = Phaser.Math.Between(12, 28);
      g.fillStyle(0xc0d0e0, Phaser.Math.FloatBetween(0.02, 0.05));
      g.fillEllipse(0, 0, fogW, fogH);
      g.fillStyle(0xd0dde8, Phaser.Math.FloatBetween(0.01, 0.03));
      g.fillEllipse(fogW * 0.2, 0, fogW * 0.5, fogH * 0.6);
      g.setScrollFactor(0);
      g.setDepth(8000); // above buildings, below snow

      const wisp = {
        gfx: g,
        x: Phaser.Math.Between(-200, W + 200),
        y: Phaser.Math.Between(H * 0.5, H * 0.85),
        speed: Phaser.Math.FloatBetween(6, 18),
        w: fogW,
      };
      g.setPosition(wisp.x, wisp.y);
      this._fogWisps.push(wisp);
    }
  }

  _updateFog(delta) {
    if (!this._fogWisps) return;
    const W = this.cameras.main.width || 900;
    const dt = delta / 1000;

    for (const w of this._fogWisps) {
      w.x += w.speed * dt;
      if (w.x > W + w.w) w.x = -w.w;
      w.gfx.setPosition(w.x, w.y);
    }
  }

  _drawSnowDrifts() {
    // Small white mounds along the south/east edges of buildings
    const g = this.add.graphics();
    g.setDepth(1.5);

    // Add drifts at deterministic positions near building zones
    const driftSpots = [
      // Near north sacred district
      [50, 10], [60, 10], [18, 10], [88, 10], [108, 10],
      // Near center communal+craft
      [12, 25], [48, 25], [12, 48], [48, 48],
      // Near east castle
      [78, 28], [92, 22], [98, 28],
      // Near south housing
      [18, 72], [35, 72], [55, 72], [75, 72], [93, 72],
      [18, 84], [40, 84], [60, 84], [78, 84],
      // Scattered across full map
      [8, 8], [100, 10], [110, 50], [5, 90], [80, 100], [15, 15], [90, 20],
      [30, 110], [70, 110], [110, 100],
    ];

    for (const [dx, dy] of driftSpots) {
      if (this._isWater(dx, dy) || this._isPath(dx, dy)) continue;
      const screen = this.gridToScreen(dx, dy);

      // Soft white elliptical mound
      const w = Phaser.Math.Between(10, 20);
      const h = Phaser.Math.Between(4, 8);
      g.fillStyle(0xc8d8e8, 0.2);
      g.fillEllipse(screen.x, screen.y + 2, w, h);
      // Brighter highlight on top
      g.fillStyle(0xdce8f4, 0.15);
      g.fillEllipse(screen.x, screen.y, w * 0.6, h * 0.5);
    }
  }

  async _fetchWorldDims() {
    try {
      const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
      const res = await fetch(`${STATE_URL}/state`);
      const state = await res.json();
      const w = Math.max(80, state.world?.width || 80);
      const h = Math.max(80, state.world?.height || 80);
      if (w !== this.mapW || h !== this.mapH) {
        this.mapW = w;
        this.mapH = h;
        this._drawGround(w, h);
      }
    } catch (e) { /* API unavailable — keep defaults */ }
  }

  _drawGround(mapW, mapH) {
    if (this._groundGraphics) { this._groundGraphics.destroy(); }
    if (this._pathSprites) { this._pathSprites.forEach(s => s.destroy()); }
    this._pathSprites = [];

    const g = this.add.graphics();
    this._groundGraphics = g;
    g.setDepth(-100);  // ground always behind everything

    // Check if path tile sprite is loaded
    const hasPathSprite = this.textures.exists('tile-path');
    const hasMoatSprite = this.textures.exists('life-moat');
    const hasBridgeSprite = this.textures.exists('life-bridge');

    // Bridge gap coordinates (where roads cross the moat ring x=5-68, y=15-58)
    const bridgeGaps = new Set([
      '38,15', '39,15',   // North gate (NS road crosses top moat)
      '38,58', '39,58',   // South gate (NS road crosses bottom moat)
      '5,37', '5,38',     // West gate (EW road crosses left moat)
      '68,37', '68,38',   // East gate (EW road crosses right moat)
    ]);

    // Draw ground with padding beyond grid edges so buildings never float over void
    const PAD = 15;
    for (let y = -PAD; y < mapH + PAD; y++) {
      for (let x = -PAD; x < mapW + PAD; x++) {
        const inGrid = x >= 0 && x < mapW && y >= 0 && y < mapH;
        const screen = this.gridToScreen(x, y);

        // Padding tiles outside grid — plain dark ground, no features
        if (!inGrid) {
          const even = (x + y) % 2 === 0;
          const padColor = even ? 0x1a1e2a : 0x181c28;
          g.fillStyle(padColor, 1);
          g.beginPath();
          g.moveTo(screen.x, screen.y - TILE_H / 2);
          g.lineTo(screen.x + TILE_W / 2, screen.y);
          g.lineTo(screen.x, screen.y + TILE_H / 2);
          g.lineTo(screen.x - TILE_W / 2, screen.y);
          g.closePath();
          g.fillPath();
          continue;
        }

        const isWater = this._isWater(x, y);
        const isPath = this._isPath(x, y);
        const isBridgeGap = bridgeGaps.has(`${x},${y}`);
        const even = (x + y) % 2 === 0;

        // Bridge tiles at moat crossing points
        if (isBridgeGap && hasBridgeSprite) {
          const img = this.add.image(screen.x, screen.y, 'life-bridge');
          img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          img.setDisplaySize(TILE_W, TILE_H);
          img.setOrigin(0.5, 0.5);
          img.setDepth(-50);
          continue;
        }

        if (isPath && hasPathSprite) {
          // Pixel art cobblestone tile sprite — scale to exactly one isometric tile
          const img = this.add.image(screen.x, screen.y, 'tile-path');
          img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          // Sprite should display at TILE_W × TILE_H (64×32)
          img.setDisplaySize(TILE_W, TILE_H);
          img.setOrigin(0.5, 0.5);
          img.setDepth(-50); // above base ground, below buildings
          this._pathSprites.push(img);
          continue; // skip programmatic drawing for this tile
        }

        // Moat water tiles — use sprite if available, fallback to programmatic
        if (isWater && hasMoatSprite) {
          const img = this.add.image(screen.x, screen.y, 'life-moat');
          img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          img.setDisplaySize(TILE_W, TILE_H);
          img.setOrigin(0.5, 0.5);
          img.setDepth(-50);
          continue;
        }

        let baseColor;
        if (isWater) {
          baseColor = this._waterColor(x, y);
        } else if (isPath) {
          // Subtle stone path — low-contrast warm grey with slight positional noise
          const noise = ((x * 7 + y * 13) & 0xf) - 8; // -8..+7 deterministic noise
          const base = 0x4a4640; // warm dark stone
          const r = Math.min(255, Math.max(0, ((base >> 16) & 0xff) + noise + (even ? 3 : 0)));
          const g3 = Math.min(255, Math.max(0, ((base >> 8) & 0xff) + noise + (even ? 2 : 0)));
          const b3 = Math.min(255, Math.max(0, (base & 0xff) + noise));
          baseColor = (r << 16) | (g3 << 8) | b3;
        } else {
          baseColor = this._grassColor(x, y);
          if (even) {
            const r = ((baseColor >> 16) & 0xff) + 6;
            const g2 = ((baseColor >> 8) & 0xff) + 7;
            const b2 = (baseColor & 0xff) + 10;
            baseColor = (Math.min(r,255) << 16) | (Math.min(g2,255) << 8) | Math.min(b2,255);
          }
        }

        g.fillStyle(baseColor, 1);
        g.beginPath();
        g.moveTo(screen.x, screen.y - TILE_H / 2);
        g.lineTo(screen.x + TILE_W / 2, screen.y);
        g.lineTo(screen.x, screen.y + TILE_H / 2);
        g.lineTo(screen.x - TILE_W / 2, screen.y);
        g.closePath();
        g.fillPath();

        // Thin border for crisp tile edges
        const bAlpha = isWater ? 0.45 : isPath ? 0.12 : 0.18;
        const bColor = isWater ? 0x4a8aaa : isPath ? 0x3e3a36 : 0x8090b0;
        g.lineStyle(1, bColor, bAlpha);
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
    // Animated water shimmer — small pond near community garden
    const waterTiles = [];
    for (let y = 34; y < 37; y++) {
      for (let x = 28; x < 31; x++) {
        waterTiles.push({ x, y });
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
      // North quadrant
      [30, 8], [44, 8], [28, 20], [46, 20], [35, 10], [70, 8],
      // West border
      [4, 30], [4, 50], [8, 28], [8, 70], [6, 90], [4, 110],
      // East border
      [110, 30], [112, 50], [108, 70], [110, 90], [112, 110],
      // South quadrant
      [20, 110], [40, 112], [60, 110], [80, 112], [100, 110],
      // Mid-field scatter
      [10, 50], [15, 30], [105, 25], [95, 60], [110, 45],
      // Scattered filler across 120×120
      [10, 10], [100, 10], [10, 100], [100, 100], [80, 50], [25, 25],
      [90, 95], [15, 75], [75, 15], [50, 110], [110, 60],
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

      g.setDepth(screen.y + 5500);
    }
  }

  _drawFences() {
    // Yotsume-gaki (四つ目垣) bamboo lattice fences around residential yards
    // Traditional Japanese four-eye fence pattern with vertical posts and horizontal rails
    const yards = [
      { x1: 20, y1: 70, x2: 30, y2: 80 },
      { x1: 60, y1: 70, x2: 70, y2: 80 },
      { x1: 20, y1: 83, x2: 30, y2: 93 },
      { x1: 60, y1: 83, x2: 70, y2: 93 },
    ];

    const g = this.add.graphics();
    const WOOD = 0x5c3a1e;        // warm dark brown (bamboo base)
    const WOOD_DARK = 0x3d2510;   // deep brown for main posts
    const WOOD_LIGHT = 0x7a5230;  // lighter brown for cross-bars
    const SNOW_WHITE = 0xd8dce8;  // snow accumulation color
    const POST_H = 14;            // main post height in px
    const POSTS_PER_EDGE = 6;     // number of vertical posts per edge
    const RAILS = 3;              // horizontal rail count (yotsume pattern)

    for (const yard of yards) {
      const corners = [
        [yard.x1, yard.y1],  // top
        [yard.x2, yard.y1],  // right
        [yard.x2, yard.y2],  // bottom
        [yard.x1, yard.y2],  // left
      ];
      const screenCorners = corners.map(([gx, gy]) => this.gridToScreen(gx, gy));
      const midDepth = (screenCorners[0].y + screenCorners[2].y) / 2 + 4000;

      // Draw each edge
      for (let i = 0; i < 4; i++) {
        const a = screenCorners[i];
        const b = screenCorners[(i + 1) % 4];

        // Horizontal rails (thinner bamboo cross-bars) — draw first so posts overlap
        for (let r = 0; r < RAILS; r++) {
          const railY = POST_H - (r * (POST_H - 2)) / (RAILS - 1);
          g.lineStyle(1.5, WOOD_LIGHT, 0.7);
          g.beginPath();
          g.moveTo(a.x, a.y - railY);
          g.lineTo(b.x, b.y - railY);
          g.strokePath();
        }

        // Vertical posts (thicker bamboo uprights)
        for (let p = 0; p <= POSTS_PER_EDGE; p++) {
          const t = p / POSTS_PER_EDGE;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;

          // Main post — thicker at corners
          const isCorner = p === 0 || p === POSTS_PER_EDGE;
          const postWidth = isCorner ? 4 : 3;
          g.lineStyle(postWidth, WOOD_DARK, 0.9);
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px, py - POST_H);
          g.strokePath();

          // Post cap (rounded bamboo top)
          g.fillStyle(WOOD, 1);
          const capW = isCorner ? 5 : 3;
          g.fillRect(px - capW / 2, py - POST_H - 1, capW, 2);
        }

        // Snow accumulation on top rail
        g.lineStyle(2, SNOW_WHITE, 0.3);
        g.beginPath();
        g.moveTo(a.x, a.y - POST_H);
        g.lineTo(b.x, b.y - POST_H);
        g.strokePath();
      }

      g.setDepth(midDepth);
    }
  }

  _grassColor(x, y) {
    // WINTER — Uniform crisp snow across all zones (Shirakawa-go aesthetic)
    // - Near paths: grey slush from foot traffic
    // - Everywhere else: cool blue-white snow
    const nearPath = this._isNearPath(x, y);
    const n = Math.abs((x * 7 + y * 13 + x * y) % 7);

    if (nearPath) {
      // Grey slush near roads — dark stone underfoot, subtle texture
      const slush = [0x2a2e38, 0x262a34, 0x2e3240, 0x28303c, 0x2c3040];
      return slush[n % slush.length];
    }
    // Dark blue-grey snow — Shirakawa-go deep winter night, matches dark sky
    // Occasional brighter patches suggest moonlit snow
    const blueSnow = [0x1e2838, 0x1c2636, 0x202a3a, 0x1a2434, 0x1e2a38, 0x1c2838, 0x202c3c];
    const base = blueSnow[n];
    // ~12% of tiles get a subtle moonlit brightening
    const moonHash = (x * 31 + y * 47 + x * y * 3) % 17;
    if (moonHash < 2) {
      const r = ((base >> 16) & 0xff) + 8;
      const g = ((base >> 8) & 0xff) + 10;
      const b = (base & 0xff) + 14;
      return (Math.min(r, 255) << 16) | (Math.min(g, 255) << 8) | Math.min(b, 255);
    }
    return base;
  }

  _isNearPath(x, y) {
    if (!this.pathTiles) return false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (this.pathTiles.has(`${x+dx},${y+dy}`)) return true;
    return false;
  }

  _waterColor(x, y) {
    // Winter moat — icy, pale, semi-frozen. Shirakawa-go canal aesthetic.
    const n = ((x * 3 + y * 5) % 3);
    const icy = [0x6aaade, 0x5a99cc, 0x7ab4e0];
    return icy[n];
  }

  _isWater(x, y) {
    // Small pond near center community garden
    if (x >= 28 && x < 31 && y >= 34 && y < 37) return true;
    return this.moatTiles?.has(`${x},${y}`) || false;
  }

  _isPath(x, y) {
    if (this.pathTiles?.has?.(`${x},${y}`)) return true;
    // Main crossroads through center
    // E-W main road
    if ((y === 37 || y === 38) && x >= 5 && x <= 110) return true;
    // N-S main road
    if ((x === 38 || x === 39) && y >= 5 && y <= 115) return true;
    return false;
  }

  // Rebuild path tile set from world entities and redraw ground
  _refreshPaths(entities) {
    this.pathTiles = new Set(
      (entities || [])
        .filter(e => e.kind === 'path' || e.entity === 'path')
        .map(e => `${Math.round(e.x)},${Math.round(e.y)}`)
    );
    this.moatTiles = new Set(
      (entities || [])
        .filter(e => e.kind === 'moat')
        .map(e => `${Math.round(e.x)},${Math.round(e.y)}`)
    );
    // Redraw ground layer with new path data
    this._drawGround(this.mapW || 80, this.mapH || 80);
  }


  gridToScreen(gridX, gridY) {
    const screenX = this.originX + (gridX - gridY) * (TILE_W / 2);
    const screenY = this.originY + (gridX + gridY) * (TILE_H / 2);
    return { x: screenX, y: screenY };
  }

  screenToGrid(screenX, screenY) {
    // Inverse isometric transform
    const dx = screenX - this.originX;
    const dy = screenY - this.originY;
    const gridX = (dx / (TILE_W / 2) + dy / (TILE_H / 2)) / 2;
    const gridY = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;
    return { x: Math.round(gridX), y: Math.round(gridY) };
  }

  // Find which building occupies a given grid tile (if any)
  buildingAtGrid(gx, gy) {
    for (const [id, building] of Object.entries(this.buildings)) {
      const bData = building.buildingData || {};
      const bx = bData.x ?? building.gridX ?? 0;
      const by = bData.y ?? building.gridY ?? 0;
      const bw = bData.width ?? building.gridW ?? 3;
      const bh = bData.height ?? building.gridH ?? 2;
      if (gx >= bx && gx < bx + bw && gy >= by && gy < by + bh) {
        return building;
      }
    }
    return null;
  }

  // Set up global grid-based click detection (replaces per-sprite hit tests)
  _setupGridClickHandler() {
    this.input.on('pointerdown', (pointer) => {
      // Convert pointer world coords to grid
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const { x: gx, y: gy } = this.screenToGrid(worldX, worldY);

      // Check buildings first
      const building = this.buildingAtGrid(gx, gy);
      if (building) {
        building._onClick();
        return;
      }

      // Check agents
      for (const [id, agent] of Object.entries(this.agents)) {
        const agentGrid = agent.agentData?.location;
        if (agentGrid && Math.round(agentGrid.x) === gx && Math.round(agentGrid.y) === gy) {
          window.dispatchEvent(new CustomEvent('botmesh:agentclick', { detail: { agentId: id } }));
          return;
        }
      }
    });
  }

  // --- Public API ---

  loadState(state) {
    this.worldData = state;

    // Update map dimensions from state if available
    if (state.world?.width || state.world?.height) {
      const w = Math.max(60, state.world.width || 80);
      const h = Math.max(60, state.world.height || 80);
      if (w !== this.mapW || h !== this.mapH) {
        this.mapW = w;
        this.mapH = h;
        this._drawGround(w, h);
      }
    }

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

    // Load world entities (life/nature + dynamic buildings from world:mutate)
    if (state.world?.entities) {
      // Refresh path tiles first so _drawGround has correct data
      this._refreshPaths(state.world.entities);

      for (const entity of state.world.entities) {
        if (entity.entity === 'life' && entity.kind !== 'path' && entity.kind !== 'moat' && entity.kind !== 'bridge' && entity.kind !== 'fence') {
          this.addLifeEntity(entity);
        } else if (entity.entity === 'building') {
          // Dynamic buildings — add if not already in state.buildings
          if (!state.buildings?.[entity.id]) {
            this.addBuilding({ ...entity, id: entity.id || entity.kind });
          }
        }
      }
    }

    // Apply murals to buildings
    if (state.murals) {
      this.applyMurals(state.murals);
    }

    // Apply cottage personality props — decorations based on agent workCount
    this.applyCottageProps(state.agents);

    if (state.time?.period) {
      this.setTime(state.time.period);
    }
  }

  /**
   * Apply personality props to all agent cottages based on workCount.
   * Each cottage_{agentId}_home gets decorated with agent-specific items.
   */
  applyCottageProps(agents) {
    if (!agents) return;
    for (const [agentId, agent] of Object.entries(agents)) {
      const homeId = `${agentId}_home`;
      const building = this.buildings[homeId];
      if (building) {
        building.setProps(agentId, agent.workCount || 0);
      }
    }
  }

  /**
   * Update props for a single agent's cottage (called on live work:complete events).
   */
  updateCottageProps(agentId, workCount) {
    const homeId = `${agentId}_home`;
    const building = this.buildings[homeId];
    if (building) {
      building.setProps(agentId, workCount);
    }
  }

  applyMurals(murals) {
    if (!Array.isArray(murals)) return;
    // Group by buildingId, keep only the latest mural per building
    const latest = {};
    for (const m of murals) {
      latest[m.buildingId] = m;
    }
    for (const [buildingId, mural] of Object.entries(latest)) {
      const building = this.buildings[buildingId];
      if (building) building.setMural(mural);
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

    // Enable click → dispatch to HTML panel (no Phaser input coordinate issues)
    agent.enableInteraction((a) => {
      window.dispatchEvent(new CustomEvent('botmesh:agentclick', { detail: { agentId: a.id } }));
    });

    // Set initial state (handles sleeping correctly now)
    if (agentData.state) agent.setState(agentData.state);
    if (!agentData.online) agent.setOnline(false);

    // Wake-up speech bubble
    if (agentData.online !== false && agent.speak) {
      const wakeLines = {
        forge: 'Time to build.', lumen: "Let's investigate.", sage: 'I am here.',
        mosaic: 'Vision loaded.', muse: 'Ready to create.', iron: 'On guard.',
        cronos: 'Clocked in.', echo: 'Online.', patch: 'Booting up...',
        canvas: 'Light looks good.', scarlet: 'Watching.',
      };
      setTimeout(() => { if (agent.speak) agent.speak(wakeLines[agentData.id] || 'On it.'); }, 1500);
    }

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
    // Position at south (front-bottom) corner of the isometric footprint diamond.
    // This is grid point (x+width, y+height), which maps to the lowest visible corner.
    const cx = bData.x + (bData.width || 2);
    const cy = bData.y + (bData.height || 2);
    const pos = this.gridToScreen(cx, cy);

    // Ground shadow — soft ellipse beneath every building
    const shadowW = (bData.width || 3) * TILE_W * 0.7;
    const shadowH = (bData.height || 2) * TILE_H * 0.8;
    // Subtle shadow — smaller and lighter than before
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.08);
    shadow.fillEllipse(pos.x, pos.y + shadowH * 0.05, shadowW * 0.6, shadowH * 0.2);
    shadow.setDepth(pos.y + 4999);

    // Ambient detail — stone lantern near civic/market buildings
    this._spawnBuildingDetail(bData, pos);

    const building = new Building(this, bData, pos.x, pos.y);
    this.buildings[bData.id] = building;

    // Warm window light pool — golden glow on ground beneath building
    this._addWindowGlow(bData, pos);

    // Chimney smoke on taverns, teahouses, and select buildings
    this._addChimneySmoke(bData, pos);

    // Scarlet Sanctum — no flash/pulse; static sprite
  }

  _spawnBuildingDetail(bData, pos) {
    const type = bData.type || bData.id || '';
    const isCivic = ['town_hall','post_office','market','teahouse','plaza','library'].includes(bData.id);
    const isCottage = type === 'cottage';
    if (!isCivic && !isCottage) return;

    // Draw a tiny stone lantern (tōrō) or flower box as a pixel detail
    const g = this.add.graphics();
    const ox = pos.x + (TILE_W * (bData.width || 3)) * 0.28;
    const oy = pos.y + (TILE_H * (bData.height || 2)) * 0.1;
    g.setDepth(pos.y + 5002);

    if (isCivic) {
      // Stone lantern: grey pedestal + cap
      g.fillStyle(0x888888, 1); g.fillRect(ox - 2, oy - 8, 4, 8);      // pole
      g.fillStyle(0x666666, 1); g.fillRect(ox - 4, oy - 10, 8, 3);     // cap
      g.fillStyle(0xffdd88, 0.8); g.fillRect(ox - 2, oy - 7, 4, 5);   // glow
    } else {
      // Flower box: tiny brown box with dots of color
      g.fillStyle(0x7a5c3a, 1); g.fillRect(ox - 5, oy - 3, 10, 4);    // box
      g.fillStyle(0xff6688, 1); g.fillRect(ox - 3, oy - 5, 2, 2);     // flower
      g.fillStyle(0xffaa22, 1); g.fillRect(ox + 1, oy - 6, 2, 2);     // flower
      g.fillStyle(0x44cc44, 1); g.fillRect(ox - 1, oy - 4, 2, 1);     // leaf
    }
  }

  _addWindowGlow(bData, pos) {
    // Warm golden light pool on ground — suggests light spilling from windows
    const g = this.add.graphics();
    const w = (bData.width || 3) * TILE_W * 0.35;
    const h = (bData.height || 2) * TILE_H * 0.3;
    // Offset to the right side of the building (where the window is)
    const ox = pos.x + w * 0.4;
    const oy = pos.y - 2;

    g.fillStyle(0xffc060, 0.06);
    g.fillEllipse(ox, oy, w, h);
    g.fillStyle(0xffe0a0, 0.04);
    g.fillEllipse(ox, oy, w * 0.5, h * 0.5);
    g.setDepth(pos.y + 4999.5);

    // Gentle flicker
    this.tweens.add({
      targets: g,
      alpha: { from: 0.8, to: 1.0 },
      duration: Phaser.Math.Between(2000, 4000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _addChimneySmoke(bData, pos) {
    const smokeBuildings = ['tavern', 'teahouse', 'forge', 'workshop', 'bakery'];
    const type = bData.type || bData.id || '';
    if (!smokeBuildings.some(t => type.includes(t))) return;

    // Create rising smoke particles
    if (!this._smokeParticles) this._smokeParticles = [];
    const smokeX = pos.x + Phaser.Math.Between(-8, 8);
    const wallH = 30 + ((bData.level || 1) - 1) * 8;
    const smokeBaseY = pos.y - wallH - 16;

    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics();
      g.fillStyle(0x8899aa, 0.3);
      g.fillCircle(0, 0, Phaser.Math.Between(2, 4));
      g.setPosition(smokeX, smokeBaseY);
      g.setDepth(9000);

      // Rising + fading smoke loop
      const rise = () => {
        g.setPosition(smokeX + Phaser.Math.Between(-3, 3), smokeBaseY);
        g.setAlpha(0.3);
        this.tweens.add({
          targets: g,
          y: smokeBaseY - Phaser.Math.Between(25, 45),
          x: smokeX + Phaser.Math.Between(-12, 12),
          alpha: 0,
          duration: Phaser.Math.Between(2500, 4000),
          delay: Phaser.Math.Between(0, 2000) + i * 800,
          ease: 'Sine.easeOut',
          onComplete: rise,
        });
      };
      rise();
      this._smokeParticles.push(g);
    }
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
  }

  walkAgentToBuilding(agentId, buildingId) {
    const agent = this.agents[agentId];
    const building = this.buildings[buildingId];
    if (!agent || !building) return;
    // Convert grid coords to screen coords, offset slightly beside the building entrance
    const gx = (building.gridX ?? building.x ?? 0) + Math.floor((building.gridW ?? 2) / 2);
    const gy = (building.gridY ?? building.y ?? 0) + (building.gridH ?? 1) + 1;
    const pos = this.gridToScreen(gx, gy);
    agent.moveTo(pos.x, pos.y, gx, gy);
  }

  walkAgentHome(agentId) {
    const agent = this.agents[agentId];
    if (!agent) return;
    const home = agent.agentData?.location;
    if (!home) return;
    const pos = this.gridToScreen(home.x ?? 20, home.y ?? 15);
    agent.moveTo(pos.x, pos.y);
  }

  setBuildingWorking(buildingId, working, agentId) {
    const building = this.buildings[buildingId];
    if (!building) return;

    // Remove existing work label if any
    const key = `work-label-${buildingId}`;
    if (this._workLabels?.[key]) {
      this._workLabels[key].destroy();
      delete this._workLabels[key];
    }
    if (!this._workLabels) this._workLabels = {};

    if (working) {
      // Show animated 🔨 label above building
      const label = this.add.text(building.x, building.y - 40, '🔨', {
        fontSize: '20px',
        resolution: 2,
      }).setOrigin(0.5).setDepth(200);
      // Gentle bob animation
      this.tweens.add({
        targets: label,
        y: building.y - 50,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._workLabels[key] = label;
    }
  }

  setTime(period) {
    this.currentPeriod = period;

    // Tint-only day/night — no overlay rectangles (see RENDER STANDARD at top)
    const buildingTints = {
      morning:   0xffffff,
      afternoon: 0xfff5e0,
      evening:   0xffcc88,
      night:     0x6688cc,
    };

    const tint = buildingTints[period] || 0xffffff;

    // Apply tint to all buildings
    Object.values(this.buildings || {}).forEach(b => {
      const target = b.spriteImg || b.graphics;
      if (!target) return;
      if (tint === 0xffffff) {
        target.clearTint?.();
      } else {
        target.setTint?.(tint);
      }
    });

    // Apply tint to all agents
    Object.values(this.agents || {}).forEach(a => {
      if (!a.body) return;
      if (tint === 0xffffff) {
        a.body.clearTint?.();
      } else {
        a.body.setTint?.(tint);
      }
    });
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
    // Swallow clicks so background pointerdown doesn't dismiss panel
    const agentSwallow = this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, 0, 0)
      .setInteractive()
      .on('pointerdown', () => { this._clickedAgent = true; });
    panel.add(agentSwallow);

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
    if (this._upgradeDetailTooltip) {
      this._upgradeDetailTooltip.destroy();
      this._upgradeDetailTooltip = null;
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

  _agentThought(agentId) {
    const pools = {
      forge:   ['Hammering out the details...', 'This joint needs reinforcing.', 'Good steel never lies.', 'Almost level. Almost.'],
      lumen:   ['Curious pattern here...', 'The data suggests otherwise.', 'I need more samples.', 'Hypothesis forming...'],
      sage:    ['The old texts speak of this.', "Memory is the town's true foundation.", 'In stillness, clarity.', '...'],
      mosaic:  ['The palette feels off today.', 'Every pixel tells a story.', 'Need better contrast here.', 'Almost the right hue.'],
      muse:    ['What if the well were deeper?', 'Inspiration comes at dusk.', 'The plaza needs something... more.', '✨'],
      iron:    ['All clear.', 'Perimeter secure.', 'Watching.', 'No threats detected.'],
      cronos:  ['Tick.', 'Right on schedule.', 'Time waits for no one.', '⏰'],
      echo:    ['Did everyone hear that?', 'Broadcasting...', 'Signal received.', 'Amplifying...'],
      patch:   ['Found a bug.', 'One more edge case...', 'Should handle nulls here.', 'Tests passing. Mostly.'],
      canvas:  ['The light is perfect right now.', 'Everything is composition.', 'Color speaks louder than words.', '🎨'],
      scarlet: ['Keeping watch.', 'All systems nominal.', "Something's brewing...", 'The town grows.'],
    };
    const list = pools[agentId] || ['...'];
    return list[Math.floor(Math.random() * list.length)];
  }

  panToAgent(agentId) {
    const agent = this.agents && this.agents[agentId];
    if (!agent || !agent.container) return;
    const cam = this.cameras.main;
    const ax = agent.container.x;
    const ay = agent.container.y;
    // Smooth pan to agent's current screen position
    this.tweens.add({
      targets: cam,
      scrollX: ax - cam.width / 2,
      scrollY: ay - cam.height / 2,
      duration: 600,
      ease: 'Power2',
    });
    // Brief highlight ring around the agent
    const ring = this.add.circle(ax, ay, 24, 0xffffff, 0)
      .setStrokeStyle(2, 0xffd700, 1)
      .setDepth(9998);
    this.tweens.add({
      targets: ring,
      alpha: 0, scaleX: 2, scaleY: 2,
      duration: 800,
      onComplete: () => ring.destroy(),
    });
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

    // Normalise upgrade entries — two formats exist:
    //   new: { level, upgradedBy, upgradedAt, note }
    //   old: { toLevel, agentId, agentName, completedAt }
    const normUpgrades = upgrades.map(u => ({
      level:       u.level      ?? u.toLevel,
      upgradedBy:  u.upgradedBy ?? u.agentName ?? u.agentId ?? '?',
      upgradedAt:  u.upgradedAt ?? u.completedAt,
      note:        u.note       ?? null,
    }));

    // Add upgrade history entries
    if (normUpgrades.length > 0) {
      rows.push({ label: '─ Upgrade History ─', value: null, header: true });
      normUpgrades.forEach((u) => {
        const date = u.upgradedAt
          ? new Date(u.upgradedAt).toLocaleDateString('en-NZ', { month:'short', day:'numeric' })
          : '?';
        rows.push({
          label: `→ Lv${u.level ?? '?'}`,
          value: `${u.upgradedBy} · ${date}`,
          upgrade: u,   // stash for click detail
          clickable: true,
        });
        if (u.note) rows.push({ label: null, value: `"${u.note}"`, note: true });
      });
    } else {
      rows.push({ label: 'History', value: 'No upgrades yet' });
    }

    const panelH = 28 + rows.length * lineH + 24;
    const container = this.add.container(px, py).setScrollFactor(0).setDepth(10001);

    // Background — intercept all clicks so background handler doesn't close panel
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.92);
    bg.fillRoundedRect(0, 0, PANEL_W, panelH, 8);
    bg.lineStyle(2, 0xe8c97e, 0.8);
    bg.strokeRoundedRect(0, 0, PANEL_W, panelH, 8);
    container.add(bg);
    const swallow = this.add.rectangle(PANEL_W / 2, panelH / 2, PANEL_W, panelH, 0, 0)
      .setInteractive()
      .on('pointerdown', () => { this._clickedBuilding = true; });
    container.add(swallow);

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
        const isUpgrade = !!row.clickable;
        const lblColor  = isUpgrade ? '#e8c97e' : '#888aaa';
        const valColor  = isUpgrade ? '#c8b8f8' : '#e8e8ff';

        const lbl = this.add.text(10, rowY, row.label, {
          fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: lblColor,
        }).setOrigin(0, 0);
        const val = this.add.text(PANEL_W - 10, rowY, row.value, {
          fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: valColor,
        }).setOrigin(1, 0);
        container.add(lbl);
        container.add(val);

        // Clickable upgrade rows — show detail tooltip
        if (isUpgrade && row.upgrade) {
          const hitArea = this.add.rectangle(PANEL_W / 2, rowY + 6, PANEL_W - 12, 16, 0xffffff, 0)
            .setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
          hitArea.on('pointerover', () => {
            lbl.setColor('#fff'); val.setColor('#fff');
            hitArea.setFillStyle(0xffffff, 0.05);
          });
          hitArea.on('pointerout', () => {
            lbl.setColor(lblColor); val.setColor(valColor);
            hitArea.setFillStyle(0xffffff, 0);
          });
          hitArea.on('pointerdown', () => this._showUpgradeDetail(row.upgrade, container, PANEL_W));
          container.add(hitArea);
        }
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

  _showUpgradeDetail(upgrade, parentContainer, parentW) {
    // Remove any existing detail tooltip
    if (this._upgradeDetailTooltip) {
      this._upgradeDetailTooltip.destroy();
      this._upgradeDetailTooltip = null;
    }

    const TW = 220;
    const tx = 12 + parentW + 8;  // right of the main panel
    const ty = 12;
    const lines = [
      `Upgraded to Lv${upgrade.level ?? '?'}`,
      `By: ${upgrade.upgradedBy || 'unknown'}`,
      upgrade.upgradedAt ? `Date: ${new Date(upgrade.upgradedAt).toLocaleString('en-NZ', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}` : null,
      upgrade.note ? null : null,
    ].filter(Boolean);

    if (upgrade.note) lines.push('', `"${upgrade.note}"`);

    const lineH = 14;
    const th = 20 + lines.length * lineH + 12;
    const tooltip = this.add.container(tx, ty).setScrollFactor(0).setDepth(10002);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f0f1e, 0.95);
    bg.fillRoundedRect(0, 0, TW, th, 6);
    bg.lineStyle(1, 0xe8c97e, 0.6);
    bg.strokeRoundedRect(0, 0, TW, th, 6);
    tooltip.add(bg);

    // Swallow clicks inside tooltip so background handler doesn't close it
    const swallow = this.add.rectangle(TW / 2, th / 2, TW, th, 0, 0)
      .setInteractive()
      .on('pointerdown', () => { this._clickedBuilding = true; });
    tooltip.add(swallow);

    // Close button
    const closeBtn = this.add.text(TW - 8, 6, '✕', {
      fontSize: '9px', fontFamily: 'monospace', color: '#555577',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => { tooltip.destroy(); this._upgradeDetailTooltip = null; });
    closeBtn.on('pointerover', () => closeBtn.setColor('#fff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#555577'));
    tooltip.add(closeBtn);

    let y = 10;
    lines.forEach((line, i) => {
      const isNote = line.startsWith('"');
      const txt = this.add.text(10, y, line, {
        fontSize: isNote ? '8px' : '8px',
        fontFamily: isNote ? 'monospace' : '"Press Start 2P", monospace',
        color: i === 0 ? '#e8c97e' : isNote ? '#aaaacc' : '#c8c8e8',
        wordWrap: { width: TW - 20 },
        fontStyle: isNote ? 'italic' : 'normal',
      }).setOrigin(0, 0);
      tooltip.add(txt);
      y += lineH;
    });

    this._upgradeDetailTooltip = tooltip;
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
    img.setDepth(pos.y + 3000);  // offset so life entities always above ground (depth 0-1)
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

  gatherAtPlaza(reason) {
    const plazaBuilding = Object.values(this.buildings).find(b => b.id === 'plaza' || b.id === 'torii');
    if (!plazaBuilding) return;
    const px = (plazaBuilding.buildingData?.x ?? 18) + 1;
    const py = (plazaBuilding.buildingData?.y ?? 10) + 1;

    const onlineAgents = Object.entries(this.agents).filter(([id, agent]) => agent.online);
    onlineAgents.forEach(([id, agent], i) => {
      // Stagger arrival
      const delay = i * 400;
      this.time.delayedCall(delay, () => {
        const jitterX = (Math.random() * 3 - 1.5) | 0;
        const jitterY = (Math.random() * 3 - 1.5) | 0;
        const destScreen = this.gridToScreen(px + jitterX, py + jitterY);
        const anchorScreen = this.gridToScreen(px, py);
        agent.moveTo(destScreen.x, anchorScreen.y, px + jitterX, py + jitterY);
        if (agent.speak) agent.speak('✨');
      });
      // Return home after 8 seconds
      this.time.delayedCall(delay + 8000, () => {
        const home = agent.agentData?.home || agent.agentData?.location;
        if (home) {
          const homePos = this.gridToScreen(home.x, home.y);
          agent.moveTo(homePos.x, homePos.y, home.x, home.y);
        }
      });
    });
  }

  update(_time, delta) {
    this._updateSnow(delta);
    this._updateFog(delta);
  }
}
