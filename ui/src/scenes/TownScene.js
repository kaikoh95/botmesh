/**
 * RENDER STANDARD
 * - Grid: TILE_W=64, TILE_H=32, origin offset = camera.width*0.55, -60
 * - Screen pos: screenX = originX + (gx-gy)*(TILE_W/2), screenY = originY + (gx+gy)*(TILE_H/2)
 * - Sprite anchor: buildings=(0.5, 1.0), agents=(0.5, 1.0), life=(0.5, 1.0)
 * - Depth: (gridX+gridY)*100 (buildings/life), +50 for agents — unified isometric sort
 * - All sprites have 30px transparent padding — no adjustment needed for origin
 * - Day/night: tint only, no overlay rectangles
 */
import Agent, { getAgentHexString } from '../entities/Agent.js';
import Building from '../entities/Building.js';
import WorldLife from '../entities/WorldLife.js';

const TILE_W = 64;
const TILE_H = 32;
const TILE_PNG_H = 48; // cube tile: 32px top face + 16px side faces

// ── District definitions ─────────────────────────────────────────────────────
const DISTRICTS = {
  communal: { label: 'Kurokimachi', cx: 9, cy: 7, bounds: { x1: 0, y1: 0, x2: 18, y2: 18 } },
};

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
    this.load.image('ground-snow', `assets/ground/snow-tile.png${v}`);
    this.load.image('ground-soil', `assets/ground/soil-tile.png${v}`);
    this.load.image('ground-path', `assets/ground/cobblestone-tile.png${v}`);  // legacy alias
    this.load.image('ground-water', `assets/ground/water-tile.png${v}`);
    this.load.image('ground-cobblestone', `assets/ground/cobblestone-tile.png${v}`);
    this.load.image('ground-stone', `assets/ground/stone-tile.png${v}`);
    this.load.image('ground-wood', `assets/ground/wood-tile.png${v}`);
  }

  create() {
    this.cameras.main.setBackgroundColor('#1c2436'); // match snow ground color // deep midnight blue — no purple bleed

    // Solid backdrop in world space — prevents transparent checkerboard on all devices.
    // World-space rect (no scrollFactor override) so it pans with the camera and
    // covers all positions regardless of DPR, zoom, or viewport size.
    const backdrop = this.add.rectangle(0, 0, 20000, 20000, 0x1c2436); // snow-matching dark blue-grey
    backdrop.setDepth(-9999);

    // ── Star field — scattered dots above the map ──────────────────────────
    this._drawStarField();

    this.mapW = 50;
    this.mapH = 75;
    // Origin: center the star layout on grid (55,55)
    this.originX = this.cameras.main.width * 0.5;
    this.originY = 100;

    // Preload ALL district ground tiles async (hidden by default, communal visible)
    this._currentDistrict = 'communal';
    this._sceneryGraphics = [];
    this._windowGlows = [];
    this._districtGroundChunks = {};
    this._groundChunks = [];
    this._groundGeneration = 0; // guards against async ground rebuild races
    this._preloadAllDistrictGrounds();

    // Draw scenery for communal district (shrink bounds to avoid terrain edge bleed)
    const INNER_MARGIN = 8;
    const communalBounds = DISTRICTS.communal.bounds;
    const innerCommunal = {
      x1: communalBounds.x1 + INNER_MARGIN,
      y1: communalBounds.y1 + INNER_MARGIN,
      x2: communalBounds.x2 - INNER_MARGIN,
      y2: communalBounds.y2 - INNER_MARGIN,
    };
    this._drawWater(innerCommunal);
    this._drawTrees(innerCommunal);
    this._drawFences(innerCommunal);
    this._drawPathLanterns(innerCommunal);
    this._drawSnowDrifts(innerCommunal);
    this._drawPlazaDetail(innerCommunal);
    this._drawMarketScenery(innerCommunal);
    this._drawCivicScenery(innerCommunal);

    // Async: read world dimensions from state API and resize if needed
    this._fetchWorldDims();

    // World life — flora, fauna, ambient (scattered per-district on load)
    this.worldLife = new WorldLife(this);
    this.worldLife.scatter(innerCommunal, 1);

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
    this._zoomMin = isMobile ? 0.4 : 0.35;
    this._zoom = isMobile ? 0.7 : 0.85;
    const CAM = this.cameras.main;
    CAM.setZoom(this._zoom);

    // Centre camera on communal district (town heart) on all devices
    {
      const d = DISTRICTS.communal;
      const corners = [
        this.gridToScreen(d.bounds.x1, d.bounds.y1),
        this.gridToScreen(d.bounds.x2, d.bounds.y1),
        this.gridToScreen(d.bounds.x1, d.bounds.y2),
        this.gridToScreen(d.bounds.x2, d.bounds.y2),
      ];
      const camLeft   = Math.min(...corners.map(c => c.x));
      const camRight  = Math.max(...corners.map(c => c.x));
      let   camTop    = Math.min(...corners.map(c => c.y));
      let   camBottom = Math.max(...corners.map(c => c.y));
      // Ensure bounds height covers the full viewport in world-space so no void is visible
      const naturalH = camBottom - camTop;
      const minH = CAM.height / this._zoom;
      if (minH > naturalH) {
        const expand = (minH - naturalH) / 2;
        camTop -= expand;
        camBottom += expand;
      }
      CAM.setBounds(camLeft, camTop, camRight - camLeft, camBottom - camTop);
      const center = this.gridToScreen(d.cx, d.cy);
      CAM.centerOn(center.x, center.y);
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
      this._zoom = Phaser.Math.Clamp(this._zoom - deltaY * 0.0008, this._zoomMin, 2.5);
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
          this._zoom = Phaser.Math.Clamp(this._zoom + delta * 0.003, this._zoomMin, 2.5);
          applyZoom();
        }
        lastPinchDist = dist;
      } else {
        lastPinchDist = null;
      }
    });

    // Keyboard +/- zoom
    this.input.keyboard.on('keydown-PLUS',  () => { this._zoom = Phaser.Math.Clamp(this._zoom + 0.15, this._zoomMin, 2.5); applyZoom(); });
    this.input.keyboard.on('keydown-MINUS', () => { this._zoom = Phaser.Math.Clamp(this._zoom - 0.15, this._zoomMin, 2.5); applyZoom(); });
    this.input.keyboard.on('keydown-ZERO',  () => { this._zoom = 1.0; applyZoom(); });

    // Expose to window for UI buttons
    window.botmeshZoom = (delta) => {
      this._zoom = Phaser.Math.Clamp(this._zoom + delta, this._zoomMin, 2.5);
      applyZoom();
    };
    window._zoomReset = () => { this._zoom = 1.0; applyZoom(); };

    // ── Snowfall ────────────────────────────────────────────────────────────
    this._initSnow();

    // ── Frost sparkles — tiny glints on the snow surface ──────────────────
    // frost sparkles removed — screen-space overlay caused false void bleed

    // ── Snow drift accents — small white mounds near buildings ─────────────
    this._drawSnowDrifts();

    // ── Path lanterns — warm glow points along main roads ─────────────────
    this._drawPathLanterns();

    // ── Window glow on snow — warm light spilling from buildings ─────────
    this._drawWindowGlow();

    // ── Fog layer — low mist drifting across the scene ────────────────────
    this._initFog();

    // ── Grid toggle ────────────────────────────────────────────────────────
    this._gridVisible = true;
    window.botmeshToggleGrid = () => {
      this._gridVisible = !this._gridVisible;
      // Toggle only current district's ground chunks
      const currentChunks = this._districtGroundChunks?.[this._currentDistrict] || [];
      currentChunks.forEach(c => c.setVisible(this._gridVisible));
      if (this._groundGraphics) this._groundGraphics.setVisible(this._gridVisible);
      return this._gridVisible;
    };

    // ── District navigation UI ──────────────────────────────────────────────
    this._initDistrictNav();

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

    // Dismiss loading screen — create() is complete
    if (typeof window.__dismissLoadingScreen === 'function') window.__dismissLoadingScreen();
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
    // SCREEN-SPACE snow: scrollFactor(0) so flakes always stay in viewport.
    // This prevents snow from ever appearing in the dark void outside the ground tile.
    const FLAKE_COUNT = 300;
    this._snowFlakes = [];
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    for (let i = 0; i < FLAKE_COUNT; i++) {
      const size   = Phaser.Math.Between(1, 3);
      const alpha  = Phaser.Math.FloatBetween(0.5, 0.95);
      const speed  = Phaser.Math.FloatBetween(40, 120);   // screen px/s
      const drift  = Phaser.Math.FloatBetween(-15, -3);
      const wobble = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const color  = Math.random() < 0.4 ? 0xddeeff : 0xffffff;

      const g = this.add.graphics();
      g.fillStyle(color, alpha);
      g.fillCircle(0, 0, size);
      g.setDepth(9999);
      g.setScrollFactor(0); // screen-space: never in the world void
      g._baseSize = size;
      g._color = color;
      g._alpha = alpha;

      const flake = {
        gfx: g,
        wx: Phaser.Math.FloatBetween(0, W),
        wy: Phaser.Math.FloatBetween(-H, H),
        size, speed, drift, wobble,
        wobbleAmp:  Phaser.Math.FloatBetween(8, 20),
        wobbleFreq: Phaser.Math.FloatBetween(0.5, 1.5),
      };
      g.setPosition(flake.wx, flake.wy);
      this._snowFlakes.push(flake);
    }
  }

  _getWorldBounds(mapW, mapH) {
    // Isometric map extents in world/screen space
    // The map diamond spans: left tip at gridToScreen(0,mapH), right tip at gridToScreen(mapW,0)
    // top tip at gridToScreen(0,0), bottom tip at gridToScreen(mapW,mapH)
    const topTip    = this.gridToScreen(0, 0);
    const leftTip   = this.gridToScreen(0, mapH);
    const rightTip  = this.gridToScreen(mapW, 0);
    const bottomTip = this.gridToScreen(mapW, mapH);
    const pad = 500;
    return {
      left:   leftTip.x  - pad,
      right:  rightTip.x + pad,
      top:    topTip.y   - pad,
      bottom: bottomTip.y + pad,
    };
  }

  _getDistrictWorldBounds() {
    if (!this._currentDistrict) return this._getWorldBounds(this.mapW || 120, this.mapH || 120);
    const d = DISTRICTS[this._currentDistrict];
    const pad = 3;
    const corners = [
      this.gridToScreen(d.bounds.x1 - pad, d.bounds.y1 - pad),
      this.gridToScreen(d.bounds.x2 + pad, d.bounds.y1 - pad),
      this.gridToScreen(d.bounds.x1 - pad, d.bounds.y2 + pad),
      this.gridToScreen(d.bounds.x2 + pad, d.bounds.y2 + pad),
    ];
    return {
      left:   Math.min(...corners.map(c => c.x)) - 100,
      right:  Math.max(...corners.map(c => c.x)) + 100,
      top:    Math.min(...corners.map(c => c.y)) - 100,
      bottom: Math.max(...corners.map(c => c.y)) + 100,
    };
  }

  _updateSnow(delta) {
    if (!this._snowFlakes) return;
    const dt = delta / 1000;
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    for (const f of this._snowFlakes) {
      f.wobble += dt * f.wobbleFreq;
      f.wx += f.drift * dt + Math.sin(f.wobble) * f.wobbleAmp * dt;
      f.wy += f.speed * dt;

      // Wrap in screen-space
      if (f.wy > H + 10)  { f.wy = -10; f.wx = Phaser.Math.FloatBetween(0, W); }
      if (f.wx < -20)     { f.wx = W + 10; }
      if (f.wx > W + 20)  { f.wx = -10; }

      // Redraw (no zoom scaling needed — screen-space)
      const screenSize = f.gfx._baseSize;
      if (Math.abs(screenSize - (f.gfx._lastSize || 0)) > 0.5) {
        f.gfx.clear();
        f.gfx.fillStyle(f.gfx._color || 0xffffff, f.gfx._alpha || 0.8);
        f.gfx.fillCircle(0, 0, screenSize);
        f.gfx._lastSize = screenSize;
      }

      f.gfx.setPosition(f.wx, f.wy);
    }
  }

  _initFrostSparkles() {
    // Tiny diamond glints scattered across the snow — twinkle in/out
    this._frostSparkles = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      // Screen-space frost sparkle — no world position, always on screen
      const W = this.cameras.main.width;
      const H = this.cameras.main.height;
      const px = Phaser.Math.Between(0, W);
      const py = Phaser.Math.Between(0, H);

      const g = this.add.graphics();
      g.fillStyle(0xd0e8ff, 0.9);
      const s = Phaser.Math.FloatBetween(1.0, 2.0);
      g.beginPath();
      g.moveTo(0, -s * 1.5);
      g.lineTo(s * 0.5, 0);
      g.lineTo(0, s * 1.5);
      g.lineTo(-s * 0.5, 0);
      g.closePath();
      g.fillPath();
      g.setPosition(px, py);
      g.setDepth(2);
      g.setScrollFactor(0); // screen-space: never in the void
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

  _drawPathLanterns(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    // Dynamic lantern placement: along roads every ~8 tiles + at building walkway junctions
    const lanternSet = new Set();
    const addLantern = (x, y) => lanternSet.add(`${x},${y}`);

    // E-W road (y=37) — lantern every 8 tiles
    for (let x = 8; x <= 108; x += 8) addLantern(x, 37);
    // N-S road (x=38) — lantern every 8 tiles
    for (let y = 8; y <= 112; y += 8) addLantern(38, y);
    // Center intersection
    addLantern(38, 37);

    // Building entrance lanterns — where walkways meet the road
    const buildings = [
      [10, 20, 3, 2], [20, 20, 4, 3], [30, 20, 4, 3], [45, 20, 4, 3], [57, 20, 4, 3],
      [10, 28, 3, 2], [20, 28, 3, 2], [30, 28, 4, 3], [45, 28, 4, 3], [57, 28, 3, 2],
      [10, 42, 4, 3], [20, 42, 3, 2], [30, 42, 4, 3], [45, 42, 4, 3],
      [10, 50, 4, 3],
      [22, 72, 3, 2], [62, 72, 3, 2], [22, 85, 3, 2], [62, 85, 3, 2],
    ];
    for (const [bx, by, bw, bh] of buildings) {
      // Lantern at building entrance (south side)
      const ex = bx + Math.floor(bw / 2);
      const ey = by + bh;
      addLantern(ex, ey);
    }

    // Residential district path lanterns — warm glow along walkways to houses
    // Along west branch (y=73)
    for (let x = 25; x <= 37; x += 6) addLantern(x, 73);
    // Along east branch (y=73)
    for (let x = 41; x <= 61; x += 6) addLantern(x, 73);
    // Along west branch (y=86)
    for (let x = 25; x <= 37; x += 6) addLantern(x, 86);
    // Along east branch (y=86)
    for (let x = 41; x <= 61; x += 6) addLantern(x, 86);
    // Near torii-housing gate
    addLantern(36, 65); addLantern(40, 65);

    // Stone lanterns (tōrō) near sacred buildings — larger, warmer
    const sacredLanterns = [
      [14, 10], [16, 10], [13, 6], [19, 6],  // near cronos_shrine
      [84, 7], [86, 3], [88, 9],              // near scarlet_sanctum
      [89, 10], [91, 6],                      // near observatory
    ];
    const sacredSet = new Set(sacredLanterns.map(([x, y]) => `${x},${y}`));
    for (const [sx, sy] of sacredLanterns) addLantern(sx, sy);

    for (const key of lanternSet) {
      const [lx, ly] = key.split(',').map(Number);
      if (!inBounds(lx, ly)) continue;
      const screen = this.gridToScreen(lx, ly);
      const isSacred = sacredSet.has(key);

      // Lantern post
      const post = this.add.graphics();
      if (isSacred) {
        // Stone tōrō — thicker grey pedestal
        post.fillStyle(0x777777, 0.9);
        post.fillRect(-3, -12, 6, 12);
        post.fillStyle(0x666666, 0.9);
        post.fillRect(-5, -14, 10, 3);
        post.fillRect(-5, -1, 10, 2);
      } else {
        post.fillStyle(0x555555, 0.8);
        post.fillRect(-1, -10, 2, 10);
        post.fillStyle(0x444444, 0.8);
        post.fillRect(-3, -12, 6, 3);
      }
      post.setPosition(screen.x, screen.y);
      post.setDepth((lx + ly) * 100 + 1);

      // Warm ground glow pool — 3 concentric isometric ellipses (key cozy lighting effect)
      const glow = this.add.graphics();
      const gs = isSacred ? 1.3 : 1.0;
      // Outer ring — wide warm wash on snow
      glow.fillStyle(0xffdd88, isSacred ? 0.06 : 0.05);
      glow.fillEllipse(0, 4, 80 * gs, 40 * gs);
      // Middle ring
      glow.fillStyle(0xffcc66, isSacred ? 0.12 : 0.10);
      glow.fillEllipse(0, 2, 48 * gs, 24 * gs);
      // Inner bright ring
      glow.fillStyle(0xff9944, isSacred ? 0.20 : 0.18);
      glow.fillEllipse(0, 0, 24 * gs, 12 * gs);
      // Tiny bright center (the "flame")
      glow.fillStyle(0xffdd88, isSacred ? 0.7 : 0.6);
      glow.fillCircle(0, isSacred ? -12 : -10, isSacred ? 3 : 2);
      glow.setPosition(screen.x, screen.y);
      glow.setDepth(-90);

      // Flicker
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.7, to: 1.0 },
        duration: Phaser.Math.Between(800, 1600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._sceneryGraphics.push(post, glow);
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
      g.setDepth(28000); // above buildings, below snow

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

  _drawSnowDrifts(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    // Small white mounds along the south/east edges of buildings
    const g = this.add.graphics();
    g.setDepth(1.5);

    // Add drifts at deterministic positions near building zones
    const driftSpots = [
      // Near north sacred district
      [50, 10], [60, 10], [18, 10], [88, 10], [108, 10],
      // Near east castle
      [78, 28], [92, 22], [98, 28],
      // Near south housing
      [18, 72], [35, 72], [55, 72], [75, 72], [93, 72],
      [18, 84], [40, 84], [60, 84], [78, 84],
      // Scattered across full map (outside communal zone)
      [8, 8], [100, 10], [110, 50], [5, 90], [80, 100], [15, 15], [90, 20],
      [30, 110], [70, 110], [110, 100],
    ];

    for (const [dx, dy] of driftSpots) {
      if (!inBounds(dx, dy)) continue;
      if (this._isWater(dx, dy) || this._isPath(dx, dy) || this._buildingFootprint?.has(`${dx},${dy}`)) continue;
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
    this._sceneryGraphics.push(g);
  }

  // ─── PLAZA COURTYARD — warm paving + stone lantern cluster at crossroads center ───
  _drawPlazaDetail(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    const g = this.add.graphics();
    g.setDepth(-98); // above base ground, below paths

    // Concentric paving rings radiating from crossroads center (38.5, 37.5)
    const cx = 38.5, cy = 37.5;
    const rings = [
      { radius: 3, color: 0x3a3530, alpha: 0.25 },
      { radius: 2, color: 0x40392e, alpha: 0.30 },
      { radius: 1, color: 0x46403a, alpha: 0.35 },
    ];

    for (const ring of rings) {
      for (let dy = -ring.radius; dy <= ring.radius; dy++) {
        for (let dx = -ring.radius; dx <= ring.radius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > ring.radius || dist <= ring.radius - 1) continue;
          const gx = Math.round(cx + dx);
          const gy = Math.round(cy + dy);
          if (!inBounds(gx, gy)) continue;
          if (this._isWater(gx, gy) || this._isPath(gx, gy) || this._buildingFootprint?.has(`${gx},${gy}`)) continue;

          const screen = this.gridToScreen(gx, gy);
          g.fillStyle(ring.color, ring.alpha);
          g.beginPath();
          g.moveTo(screen.x, screen.y - TILE_H / 2);
          g.lineTo(screen.x + TILE_W / 2, screen.y);
          g.lineTo(screen.x, screen.y + TILE_H / 2);
          g.lineTo(screen.x - TILE_W / 2, screen.y);
          g.closePath();
          g.fillPath();
        }
      }
    }

    // Stone lantern cluster at the exact crossroads center
    const center = this.gridToScreen(38, 37);
    const lanternG = this.add.graphics();
    lanternG.setDepth((38 + 37) * 100 + 3);

    // Central stone well/lantern pedestal
    // Base: octagonal stone platform
    lanternG.fillStyle(0x666660, 0.9);
    lanternG.fillEllipse(center.x + 16, center.y + 8, 20, 10);
    // Pillar
    lanternG.fillStyle(0x777770, 0.9);
    lanternG.fillRect(center.x + 13, center.y - 10, 6, 18);
    // Cap (wide flat hat shape — tōrō roof)
    lanternG.fillStyle(0x555550, 0.9);
    lanternG.fillRect(center.x + 8, center.y - 14, 16, 3);
    lanternG.fillRect(center.x + 10, center.y - 17, 12, 3);
    // Finial
    lanternG.fillStyle(0x666660, 0.9);
    lanternG.fillRect(center.x + 14, center.y - 20, 4, 3);
    // Warm lantern glow inside
    lanternG.fillStyle(0xffcc66, 0.7);
    lanternG.fillRect(center.x + 14, center.y - 8, 4, 6);

    // Ground glow pool from the lantern
    const plazaGlow = this.add.graphics();
    plazaGlow.setDepth(-97);
    plazaGlow.fillStyle(0xffdd88, 0.06);
    plazaGlow.fillEllipse(center.x + 16, center.y + 10, 100, 50);
    plazaGlow.fillStyle(0xffcc66, 0.10);
    plazaGlow.fillEllipse(center.x + 16, center.y + 8, 50, 25);
    this.tweens.add({
      targets: plazaGlow,
      alpha: { from: 0.7, to: 1.0 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this._sceneryGraphics.push(g, lanternG, plazaGlow);
  }

  // ─── MARKET SCENERY — stalls, barrels, props in the market district ───
  _drawMarketScenery(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    const g = this.add.graphics();

    // Market stalls — small awning shapes with supporting posts
    const stalls = [
      { x: 16, y: 22, color: 0x8b2020 },  // red stall near well/market
      { x: 25, y: 22, color: 0x20608b },  // blue stall near market
      { x: 14, y: 26, color: 0x6b5020 },  // brown stall near smithy approach
      { x: 24, y: 26, color: 0x206b30 },  // green stall near workshop approach
    ];

    for (const stall of stalls) {
      if (!inBounds(stall.x, stall.y)) continue;
      const screen = this.gridToScreen(stall.x, stall.y);
      const depth = screen.y + 5001;

      // Shadow
      g.fillStyle(0x000000, 0.12);
      g.fillEllipse(screen.x, screen.y + 3, 24, 10);

      // Counter/table — wooden brown base
      g.fillStyle(0x5c3a1e, 0.9);
      g.fillRect(screen.x - 10, screen.y - 4, 20, 6);

      // Awning — colored fabric canopy
      g.fillStyle(stall.color, 0.8);
      g.beginPath();
      g.moveTo(screen.x - 12, screen.y - 12);
      g.lineTo(screen.x + 12, screen.y - 12);
      g.lineTo(screen.x + 14, screen.y - 6);
      g.lineTo(screen.x - 14, screen.y - 6);
      g.closePath();
      g.fillPath();

      // Awning stripe highlight
      g.fillStyle(0xffffff, 0.1);
      g.fillRect(screen.x - 8, screen.y - 11, 6, 4);
      g.fillRect(screen.x + 2, screen.y - 11, 6, 4);

      // Support posts
      g.fillStyle(0x4a3018, 0.9);
      g.fillRect(screen.x - 11, screen.y - 12, 2, 14);
      g.fillRect(screen.x + 9, screen.y - 12, 2, 14);

      g.setDepth(depth);
    }

    // Barrel props scattered near market stalls
    const barrels = [
      { x: 13, y: 21 }, { x: 27, y: 21 },
      { x: 12, y: 29 }, { x: 26, y: 24 },
      { x: 18, y: 25 }, { x: 22, y: 29 },
    ];

    const barrelG = this.add.graphics();
    for (const b of barrels) {
      if (!inBounds(b.x, b.y)) continue;
      const screen = this.gridToScreen(b.x, b.y);
      // Shadow
      barrelG.fillStyle(0x000000, 0.1);
      barrelG.fillEllipse(screen.x, screen.y + 2, 10, 5);
      // Barrel body — dark wooden cylinder
      barrelG.fillStyle(0x5a3a20, 0.9);
      barrelG.fillRect(screen.x - 4, screen.y - 6, 8, 8);
      // Metal bands
      barrelG.fillStyle(0x444444, 0.7);
      barrelG.fillRect(screen.x - 5, screen.y - 5, 10, 1);
      barrelG.fillRect(screen.x - 5, screen.y - 1, 10, 1);
      // Barrel top (ellipse)
      barrelG.fillStyle(0x6b4a2a, 0.9);
      barrelG.fillEllipse(screen.x, screen.y - 6, 9, 4);

      barrelG.setDepth((b.x + b.y) * 100 + 1);
    }
    this._sceneryGraphics.push(g, barrelG);
  }

  // ─── CIVIC SCENERY — stone tōrō lanterns + pines flanking civic approaches ───
  _drawCivicScenery(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    // Stone tōrō lanterns at civic building junctions
    const toroSpots = [
      { x: 34, y: 22 },  // near town hall approach
      { x: 34, y: 30 },  // near iron keep approach
      { x: 49, y: 22 },  // near library approach
      { x: 49, y: 30 },  // near garden pavilion approach
      { x: 57, y: 22 },  // near post office
      { x: 57, y: 30 },  // near leisure approach
    ];

    for (const spot of toroSpots) {
      if (!inBounds(spot.x, spot.y)) continue;
      const screen = this.gridToScreen(spot.x, spot.y);
      const tg = this.add.graphics();
      tg.setDepth((spot.x + spot.y) * 100 + 2);

      // Base pedestal
      tg.fillStyle(0x666660, 0.9);
      tg.fillRect(screen.x - 4, screen.y - 2, 8, 3);
      // Tall post
      tg.fillStyle(0x777770, 0.9);
      tg.fillRect(screen.x - 2, screen.y - 14, 4, 12);
      // Square box (fire chamber)
      tg.fillStyle(0x888880, 0.9);
      tg.fillRect(screen.x - 4, screen.y - 18, 8, 5);
      // Glow inside chamber
      tg.fillStyle(0xffcc66, 0.6);
      tg.fillRect(screen.x - 2, screen.y - 16, 4, 3);
      // Flat cap roof
      tg.fillStyle(0x555550, 0.9);
      tg.fillRect(screen.x - 5, screen.y - 20, 10, 2);
      // Finial point
      tg.fillStyle(0x666660, 0.9);
      tg.fillRect(screen.x - 1, screen.y - 23, 2, 3);

      // Ground glow from tōrō
      const glow = this.add.graphics();
      glow.setDepth(-96);
      glow.fillStyle(0xffdd88, 0.05);
      glow.fillEllipse(screen.x, screen.y + 2, 60, 30);
      glow.fillStyle(0xffcc66, 0.09);
      glow.fillEllipse(screen.x, screen.y, 30, 15);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.7, to: 1.0 },
        duration: Phaser.Math.Between(1200, 2200),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._sceneryGraphics.push(tg, glow);
    }

    // Pine trees flanking civic building approaches
    const civicPines = [
      { x: 29, y: 21 }, { x: 29, y: 27 },  // town hall flanks
      { x: 44, y: 21 }, { x: 44, y: 27 },  // library flanks
      { x: 56, y: 21 }, { x: 56, y: 27 },  // post office flanks
      { x: 35, y: 34 }, { x: 50, y: 34 },  // civic south edge
    ];

    const pg = this.add.graphics();
    for (const pine of civicPines) {
      if (!inBounds(pine.x, pine.y)) continue;
      if (this._isWater(pine.x, pine.y) || this._isPath(pine.x, pine.y) || this._buildingFootprint?.has(`${pine.x},${pine.y}`)) continue;
      const screen = this.gridToScreen(pine.x, pine.y);

      // Shadow
      pg.fillStyle(0x000000, 0.15);
      pg.fillEllipse(screen.x + 2, screen.y + 4, 16, 7);
      // Trunk
      pg.fillStyle(0x4a3520, 1);
      pg.fillRect(screen.x - 2, screen.y - 8, 4, 12);
      // Pine foliage layers — compact formal shape
      const layers = [0x1a5c2a, 0x1e6630, 0x165224, 0x1a5c2a];
      for (let i = 0; i < 4; i++) {
        pg.fillStyle(layers[i], 1);
        const yOff = screen.y - 12 - i * 5;
        const size = 9 - i * 1.5;
        pg.beginPath();
        pg.moveTo(screen.x, yOff - size);
        pg.lineTo(screen.x + size, yOff);
        pg.lineTo(screen.x, yOff + size / 2);
        pg.lineTo(screen.x - size, yOff);
        pg.closePath();
        pg.fillPath();
      }
      // Snow cap
      pg.fillStyle(0xd8e4f0, 0.4);
      pg.fillEllipse(screen.x, screen.y - 30, 7, 3);

      pg.setDepth((pine.x + pine.y) * 100 + 5);
    }
    this._sceneryGraphics.push(pg);
  }

  _drawStarField() {
    const g = this.add.graphics();
    g.setDepth(-9990);
    const STAR_COUNT = 120;
    // Stars scatter across a wide band above the map (world coords)
    // Upper 40% of the world area — roughly y from -2000 to 0
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx = Phaser.Math.Between(-3000, 7000);
      const sy = Phaser.Math.Between(-2500, -200);
      const roll = Math.random();

      if (roll < 0.05) {
        // 5% bright feature stars with sparkle cross
        const alpha = Phaser.Math.FloatBetween(0.9, 1.0);
        g.fillStyle(0xffffff, alpha);
        g.fillCircle(sx, sy, 2);
        // Cross sparkle arms
        g.lineStyle(1, 0xffffff, alpha * 0.6);
        g.beginPath();
        g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy);
        g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 4);
        g.strokePath();
      } else if (roll < 0.20) {
        // 15% medium stars
        const alpha = Phaser.Math.FloatBetween(0.6, 0.85);
        const size = Phaser.Math.FloatBetween(1, 2);
        g.fillStyle(0xddeeff, alpha);
        g.fillCircle(sx, sy, size);
      } else {
        // 80% tiny dim stars
        const alpha = Phaser.Math.FloatBetween(0.3, 0.6);
        g.fillStyle(0xccddee, alpha);
        g.fillCircle(sx, sy, 1);
      }
    }

    // Gentle twinkle on the whole star layer
    this.tweens.add({
      targets: g,
      alpha: { from: 0.85, to: 1.0 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _drawWindowGlow() {
    // Warm light spilling from building windows onto nearby snow
    const g = this.add.graphics();
    g.setDepth(-95);

    const buildings = [
      [10, 20, 3, 2], [20, 20, 4, 3], [30, 20, 4, 3], [45, 20, 4, 3], [57, 20, 4, 3],
      [10, 28, 3, 2], [20, 28, 3, 2], [30, 28, 4, 3], [45, 28, 4, 3], [57, 28, 3, 2],
      [10, 42, 4, 3], [20, 42, 3, 2], [30, 42, 4, 3], [45, 42, 4, 3],
      [10, 50, 4, 3],
      [15, 8, 3, 2],   // cronos_shrine
      [90, 8, 3, 2],   // observatory
      [85, 5, 4, 3],   // scarlet_sanctum
      [22, 72, 3, 2], [62, 72, 3, 2], [22, 85, 3, 2], [62, 85, 3, 2],
    ];

    for (const [bx, by, bw, bh] of buildings) {
      // Place glow 1 tile south of building center (where window light hits ground)
      const cx = bx + Math.floor(bw / 2);
      const cy = by + bh + 1;
      const screen = this.gridToScreen(cx, cy);

      g.fillStyle(0xffcc66, 0.07);
      g.fillEllipse(screen.x, screen.y, 60, 30);
      g.fillStyle(0xffcc66, 0.04);
      g.fillEllipse(screen.x, screen.y + 4, 90, 44);
    }
  }

  async _fetchWorldDims() {
    try {
      const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';
      const res = await fetch(`${STATE_URL}/state`);
      const state = await res.json();
      const w = Math.max(50, state.world?.width || 50);
      const h = Math.max(50, state.world?.height || 50);
      if (w !== this.mapW || h !== this.mapH) {
        this.mapW = w;
        this.mapH = h;
        this._rebuildAllDistrictGrounds();
      }
    } catch (e) { /* API unavailable — keep defaults */ }
  }

  _drawGround(mapW, mapH) {
    // Synchronous fallback — renders full map snow tiles (used by initial create)
    this._drawGroundSync(mapW, mapH, { x1: 0, y1: 0, x2: mapW - 1, y2: mapH - 1 });
  }

  _drawGroundSync(mapW, mapH, districtBounds) {
    // Clean up previous ground render
    (this._groundChunks || []).forEach(rt => rt.destroy());
    this._groundChunks = [];
    if (this._groundGraphics) { this._groundGraphics.destroy(); this._groundGraphics = null; }
    if (this._pathSprites) { this._pathSprites.forEach(s => s.destroy()); }
    this._pathSprites = [];

    const hasSnow = this.textures.exists('ground-snow');

    const pad = 2;
    const x1 = Math.max(0, districtBounds.x1 - pad);
    const y1 = Math.max(0, districtBounds.y1 - pad);
    const x2 = Math.min(mapW - 1, districtBounds.x2 + pad);
    const y2 = Math.min(mapH - 1, districtBounds.y2 + pad);

    const CHUNK_PX = 2048;
    const SIDE_OVERHANG = TILE_PNG_H - TILE_H;

    // Bounding box for the district area tiles
    const topSy  = (x1 + y1) * (TILE_H / 2) - TILE_H / 2;
    const botSy  = (x2 + y2) * (TILE_H / 2) + TILE_H / 2 + SIDE_OVERHANG;
    const leftSx = (x1 - y2) * (TILE_W / 2) - TILE_W / 2;
    const rightSx = (x2 - y1) * (TILE_W / 2) + TILE_W / 2;

    const totalW = Math.ceil(rightSx - leftSx);
    const totalH = Math.ceil(botSy - topSy);

    // Dark backdrop covers void — no PAD_OUTER loop needed

    // Chunked RenderTextures for snow/cobblestone tiles within district bounds
    const hasCobble = this.textures.exists('ground-cobblestone');
    // 18x18 compact map road system — X-shaped cross + short arms to each building
    const isRoad = (x, y) => {
      // Central N-S spine (x=9), E-W spine (y=9) — single tile wide
      if (x === 9 && y >= 3 && y <= 15) return true;  // N-S spine
      if (y === 9 && x >= 3 && x <= 15) return true;  // E-W spine
      // Short arms branching off spine to each corner building entrance
      if (x >= 3 && x <= 9 && y === 4) return true;   // NW arm to shrine (2,2)
      if (x >= 9 && x <= 15 && y === 4) return true;  // NE arm to sanctum (13,2)
      if (x >= 3 && x <= 9 && y === 14) return true;  // SW arm to market (2,13)
      if (x >= 9 && x <= 15 && y === 14) return true; // SE arm to workshop (13,13)
      return false;
    };
    const isMarket = (x, y) => false;

    const colCount = Math.ceil(totalW / CHUNK_PX);
    const rowCount = Math.ceil(totalH / CHUNK_PX);

    for (let cr = 0; cr < rowCount; cr++) {
      for (let cc = 0; cc < colCount; cc++) {
        const chunkLeft = cc * CHUNK_PX;
        const chunkTop = cr * CHUNK_PX;
        const chunkW = Math.min(CHUNK_PX, totalW - chunkLeft);
        const chunkH = Math.min(CHUNK_PX, totalH - chunkTop);
        const rtWorldX = this.originX + leftSx + chunkLeft;
        const rtWorldY = this.originY + topSy + chunkTop;

        const rt = this.add.renderTexture(rtWorldX, rtWorldY, chunkW, chunkH);
        rt.setOrigin(0, 0);
        rt.setDepth(-100);
        this._groundChunks.push(rt);

        for (let y = y1; y <= y2; y++) {
          for (let x = x1; x <= x2; x++) {
            const sx = (x - y) * (TILE_W / 2) - leftSx;
            const sy = (x + y) * (TILE_H / 2) - topSy;

            if (sx < chunkLeft - TILE_W || sx > chunkLeft + chunkW + TILE_W) continue;
            if (sy < chunkTop - TILE_PNG_H || sy > chunkTop + chunkH + TILE_PNG_H) continue;

            const localX = sx - chunkLeft - TILE_W / 2;
            const localY = sy - chunkTop - TILE_H / 2;

            let tileKey = 'ground-snow';
            if (hasCobble && (isRoad(x, y) || isMarket(x, y))) tileKey = 'ground-cobblestone';

            if (this.textures.exists(tileKey)) {
              rt.stamp(tileKey, undefined, localX, localY);
            }
          }
        }
      }
    }
  }

  async _drawGroundAsync(mapW, mapH, districtBounds) {
    const chunks = [];

    const hasSnow = this.textures.exists('ground-snow');

    const pad = 2;
    const x1 = Math.max(0, districtBounds.x1 - pad);
    const y1 = Math.max(0, districtBounds.y1 - pad);
    const x2 = Math.min(mapW - 1, districtBounds.x2 + pad);
    const y2 = Math.min(mapH - 1, districtBounds.y2 + pad);

    const CHUNK_PX = 2048;
    const SIDE_OVERHANG = TILE_PNG_H - TILE_H;

    const topSy  = (x1 + y1) * (TILE_H / 2) - TILE_H / 2;
    const botSy  = (x2 + y2) * (TILE_H / 2) + TILE_H / 2 + SIDE_OVERHANG;
    const leftSx = (x1 - y2) * (TILE_W / 2) - TILE_W / 2;
    const rightSx = (x2 - y1) * (TILE_W / 2) + TILE_W / 2;

    const totalW = Math.ceil(rightSx - leftSx);
    const totalH = Math.ceil(botSy - topSy);

    // Dark backdrop covers void — no PAD_OUTER loop needed

    // Chunked RenderTextures + async yield
    const hasCobble = this.textures.exists('ground-cobblestone');
    const isRoad = (x, y) => {
      if (x === 9 && y >= 3 && y <= 15) return true;
      if (y === 9 && x >= 3 && x <= 15) return true;
      if (x >= 3 && x <= 9 && y === 4) return true;
      if (x >= 9 && x <= 15 && y === 4) return true;
      if (x >= 3 && x <= 9 && y === 14) return true;
      if (x >= 9 && x <= 15 && y === 14) return true;
      return false;
    };
    const isMarket = (x, y) => false;

    const colCount = Math.ceil(totalW / CHUNK_PX);
    const rowCount = Math.ceil(totalH / CHUNK_PX);
    const CHUNK_SIZE = 200;
    let count = 0;

    for (let cr = 0; cr < rowCount; cr++) {
      for (let cc = 0; cc < colCount; cc++) {
        const chunkLeft = cc * CHUNK_PX;
        const chunkTop = cr * CHUNK_PX;
        const chunkW = Math.min(CHUNK_PX, totalW - chunkLeft);
        const chunkH = Math.min(CHUNK_PX, totalH - chunkTop);
        const rtWorldX = this.originX + leftSx + chunkLeft;
        const rtWorldY = this.originY + topSy + chunkTop;

        const rt = this.add.renderTexture(rtWorldX, rtWorldY, chunkW, chunkH);
        rt.setOrigin(0, 0);
        rt.setDepth(-100);
        chunks.push(rt);

        for (let y = y1; y <= y2; y++) {
          for (let x = x1; x <= x2; x++) {
            const sx = (x - y) * (TILE_W / 2) - leftSx;
            const sy = (x + y) * (TILE_H / 2) - topSy;

            if (sx < chunkLeft - TILE_W || sx > chunkLeft + chunkW + TILE_W) continue;
            if (sy < chunkTop - TILE_PNG_H || sy > chunkTop + chunkH + TILE_PNG_H) continue;

            const localX = sx - chunkLeft - TILE_W / 2;
            const localY = sy - chunkTop - TILE_H / 2;

            let tileKey = 'ground-snow';
            if (hasCobble && (isRoad(x, y) || isMarket(x, y))) tileKey = 'ground-cobblestone';

            if (this.textures.exists(tileKey)) {
              rt.stamp(tileKey, undefined, localX, localY);
            }

            count++;
            if (count % CHUNK_SIZE === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
          }
        }
      }
    }
    return chunks;
  }

  async _preloadAllDistrictGrounds() {
    const gen = ++this._groundGeneration;
    const districtKeys = Object.keys(DISTRICTS);
    for (const key of districtKeys) {
      const chunks = await this._drawGroundAsync(this.mapW, this.mapH, DISTRICTS[key].bounds);
      // Abort if a rebuild superseded this preload
      if (this._groundGeneration !== gen) {
        chunks.forEach(c => c.destroy());
        return;
      }
      this._districtGroundChunks[key] = chunks;
      this._groundChunks.push(...chunks);
      const visible = (key === this._currentDistrict);
      chunks.forEach(c => c.setVisible(visible));
    }
    // Re-apply building/agent visibility after async ground preload completes
    this._applyDistrictVisibility();
  }

  _rebuildAllDistrictGrounds() {
    // Debounce: rapid successive calls (fetchWorldDims, state:sync, computeWalkways)
    // were aborting each other via the generation guard, leaving districts like 'east'
    // without ground chunks. Collapse into a single rebuild after triggers settle.
    clearTimeout(this._rebuildDebounceTimer);
    this._rebuildDebounceTimer = setTimeout(() => this._doRebuildAllDistrictGrounds(), 200);
  }

  async _doRebuildAllDistrictGrounds() {
    const gen = ++this._groundGeneration;
    // Destroy all existing ground chunks
    (this._groundChunks || []).forEach(rt => rt.destroy());
    this._groundChunks = [];
    this._districtGroundChunks = {};
    if (this._groundGraphics) { this._groundGraphics.destroy(); this._groundGraphics = null; }
    if (this._pathSprites) { this._pathSprites.forEach(s => s.destroy()); }
    this._pathSprites = [];

    // Re-preload all districts
    const districtKeys = Object.keys(DISTRICTS);
    for (const key of districtKeys) {
      const chunks = await this._drawGroundAsync(this.mapW, this.mapH, DISTRICTS[key].bounds);
      // Abort if another rebuild superseded this one
      if (this._groundGeneration !== gen) {
        chunks.forEach(c => c.destroy());
        return;
      }
      this._districtGroundChunks[key] = chunks;
      this._groundChunks.push(...chunks);
      const visible = (key === this._currentDistrict);
      chunks.forEach(c => c.setVisible(visible));
    }
  }

  _setBuildingVisible(building, visible) {
    if (building.container) building.container.setVisible(visible);
    if (building._shadow) building._shadow.setVisible(visible);
    if (building._detail) building._detail.setVisible(visible);
    if (building._windowGlow) building._windowGlow.setVisible(visible);
    if (building._smokeGraphics) building._smokeGraphics.forEach(g => g.setVisible(visible));
  }

  // ── District navigation system ──────────────────────────────────────────────

  _initDistrictNav() {
    // Single-district map — no navigation needed
    // Remove any existing district-nav element
    const existing = document.getElementById('district-nav');
    if (existing) existing.remove();
  }

  async _loadDistrict(key) {
    const d = DISTRICTS[key];
    this._currentDistrict = key;

    // 1. Hide ALL ground chunks, show only target district's
    for (const [dk, chunks] of Object.entries(this._districtGroundChunks || {})) {
      const visible = dk === key;
      (chunks || []).forEach(c => c.setVisible(visible));
    }

    // 2. Hide all buildings, show only target district's
    Object.values(this.buildings).forEach(b => {
      const inDistrict = this._isBuildingInDistrict(b.buildingData, key);
      this._setBuildingVisible(b, inDistrict);
    });

    // 3. Show/hide agents — use stored gridX/gridY for reliable filtering
    Object.values(this.agents).forEach(a => {
      if (!a.container) return;
      const gx = a.gridX ?? 0;
      const gy = a.gridY ?? 0;
      const inside = gx >= d.bounds.x1 && gx <= d.bounds.x2 &&
                     gy >= d.bounds.y1 && gy <= d.bounds.y2;
      a.container.setVisible(inside);
      // Clear speech bubble when hiding agent to prevent cross-district text bleed
      if (!inside && a.speechBubble) {
        a.speechBubble.destroy();
        a.speechBubble = null;
        if (a.speechTimer) { clearTimeout(a.speechTimer); a.speechTimer = null; }
      }
    });

    // 4. Re-scatter life entities within this district's inner bounds
    const INNER_MARGIN = 8;
    const innerBounds = {
      x1: d.bounds.x1 + INNER_MARGIN,
      y1: d.bounds.y1 + INNER_MARGIN,
      x2: d.bounds.x2 - INNER_MARGIN,
      y2: d.bounds.y2 - INNER_MARGIN,
    };
    const lifeAgentCount = Object.keys(this.agents).length || 1;
    if (this.worldLife) this.worldLife.scatter(innerBounds, lifeAgentCount);

    // 5. Redraw scenery for this district (lightweight Graphics calls)
    (this._sceneryGraphics || []).forEach(g => g.destroy && g.destroy());
    this._sceneryGraphics = [];
    this._drawWater(innerBounds);
    this._drawTrees(innerBounds);
    this._drawFences(innerBounds);
    this._drawPathLanterns(innerBounds);
    this._drawSnowDrifts(innerBounds);
    if (key === 'communal') {
      this._drawPlazaDetail(innerBounds);
      this._drawMarketScenery(innerBounds);
      this._drawCivicScenery(innerBounds);
    }

    // 6. Zoom-to-fit district, then set camera bounds + pan to center
    const corners = [
      this.gridToScreen(d.bounds.x1, d.bounds.y1),
      this.gridToScreen(d.bounds.x2, d.bounds.y1),
      this.gridToScreen(d.bounds.x1, d.bounds.y2),
      this.gridToScreen(d.bounds.x2, d.bounds.y2),
    ];
    // Use fixed zoom — compact map fits on one screen
    const mobileSwitch = window.innerWidth < 768;
    this._zoom = mobileSwitch ? 1.0 : 1.6;
    this.cameras.main.setZoom(this._zoom);
    Object.values(this.buildings).forEach(b => b.updateLabelVisibility(this._zoom));

    const camLeft   = Math.min(...corners.map(c => c.x));
    const camRight  = Math.max(...corners.map(c => c.x));
    let   camTop    = Math.min(...corners.map(c => c.y));
    let   camBottom = Math.max(...corners.map(c => c.y)) - 40;
    // Ensure bounds height covers the full viewport in world-space so no void is visible
    const naturalH = camBottom - camTop;
    const minH = this.cameras.main.height / this._zoom;
    if (minH > naturalH) {
      const expand = (minH - naturalH) / 2;
      camTop -= expand;
      camBottom += expand;
    }
    this.cameras.main.setBounds(camLeft, camTop, camRight - camLeft, camBottom - camTop);

    const center = this.gridToScreen(d.cx, d.cy);
    this.cameras.main.centerOn(center.x, center.y);

    // 7. Update nav UI — highlight active button
    document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.dist-btn[data-district="${key}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }


  _showDistrictLoading() {
    if (this._loadingText) return;
    this._loadingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      'Loading district\u2026',
      { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#c9a84c', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(99999);
  }

  _hideDistrictLoading() {
    if (this._loadingText) {
      this._loadingText.destroy();
      this._loadingText = null;
    }
  }

  _drawWater(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    // Animated water shimmer — small pond near community garden
    const waterTiles = [];
    for (let y = 34; y < 37; y++) {
      for (let x = 28; x < 31; x++) {
        if (!inBounds(x, y)) continue;
        waterTiles.push({ x, y });
      }
    }
    if (waterTiles.length === 0) return;

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
    this._sceneryGraphics.push(g);
  }

  _drawTrees(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 2 && x <= bounds.x2 + 2 && y >= bounds.y1 - 2 && y <= bounds.y2 + 2);
    const g = this.add.graphics();

    // Zone-based tree placement — logical positioning per district
    // type: 'pine' (sacred/castle), 'sakura' (communal parks), 'bamboo' (bathhouse/residential), 'deciduous' (general)
    const treeSpots = [
      // Sacred zone (north, y<15) — pine trees along shrine approach
      { x: 12, y: 6, type: 'pine' }, { x: 18, y: 6, type: 'pine' },
      { x: 10, y: 10, type: 'pine' }, { x: 20, y: 10, type: 'pine' },
      { x: 25, y: 5, type: 'pine' }, { x: 30, y: 7, type: 'pine' },
      // Sakura near shrine
      { x: 17, y: 4, type: 'sakura' }, { x: 13, y: 12, type: 'sakura' },

      // Communal zone parks — cherry blossoms in open areas between buildings
      { x: 15, y: 24, type: 'sakura' }, { x: 40, y: 24, type: 'sakura' },
      { x: 52, y: 24, type: 'sakura' }, { x: 35, y: 45, type: 'sakura' },
      { x: 50, y: 45, type: 'sakura' },

      // Bamboo near bathhouse and residential
      { x: 6, y: 52, type: 'bamboo' }, { x: 8, y: 54, type: 'bamboo' },
      { x: 18, y: 70, type: 'bamboo' }, { x: 58, y: 70, type: 'bamboo' },
      { x: 18, y: 83, type: 'bamboo' }, { x: 58, y: 83, type: 'bamboo' },

      // Castle zone (east, x>75) — formal pines
      { x: 80, y: 10, type: 'pine' }, { x: 92, y: 12, type: 'pine' },
      { x: 88, y: 8, type: 'pine' }, { x: 95, y: 15, type: 'pine' },
      { x: 82, y: 20, type: 'pine' }, { x: 100, y: 10, type: 'pine' },

      // Residential gardens — sakura clusters for warmth around houses
      { x: 20, y: 70, type: 'sakura' }, { x: 26, y: 74, type: 'sakura' },
      { x: 28, y: 71, type: 'sakura' }, { x: 60, y: 70, type: 'sakura' },
      { x: 66, y: 74, type: 'sakura' }, { x: 68, y: 71, type: 'sakura' },
      { x: 20, y: 83, type: 'sakura' }, { x: 26, y: 87, type: 'sakura' },
      { x: 28, y: 84, type: 'sakura' }, { x: 60, y: 83, type: 'sakura' },
      { x: 66, y: 87, type: 'sakura' }, { x: 68, y: 84, type: 'sakura' },
      // Along residential spine road
      { x: 36, y: 68, type: 'sakura' }, { x: 41, y: 68, type: 'sakura' },
      { x: 36, y: 78, type: 'sakura' }, { x: 41, y: 78, type: 'sakura' },
      { x: 36, y: 90, type: 'sakura' }, { x: 41, y: 90, type: 'sakura' },
    ];

    const treeColors = {
      pine:      { trunk: 0x4a3520, foliage: [0x1a5c2a, 0x1e6630, 0x165224] },
      sakura:    { trunk: 0x6b4226, foliage: [0xd4889a, 0xe8a0b0, 0xc07888] },
      bamboo:    { trunk: 0x5a7a3a, foliage: [0x3a8a3a, 0x48a048, 0x2e7630] },
      deciduous: { trunk: 0x6b4226, foliage: [0x2d7a3a, 0x358a44, 0x2a6e35] },
    };

    for (const { x: tx, y: ty, type } of treeSpots) {
      if (!inBounds(tx, ty)) continue;
      if (this._isWater(tx, ty) || this._isPath(tx, ty) || this._buildingFootprint?.has(`${tx},${ty}`)) continue;
      const screen = this.gridToScreen(tx, ty);
      const colors = treeColors[type] || treeColors.deciduous;

      // Shadow
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(screen.x + 2, screen.y + 4, 18, 8);

      // Trunk
      g.fillStyle(colors.trunk, 1);
      if (type === 'bamboo') {
        // Thin bamboo stalks
        g.fillRect(screen.x - 1, screen.y - 12, 2, 16);
        g.fillRect(screen.x + 3, screen.y - 10, 2, 14);
      } else {
        g.fillRect(screen.x - 2, screen.y - 8, 4, 12);
      }

      // Foliage layers
      const layerCount = type === 'pine' ? 4 : 3;
      for (let i = 0; i < layerCount; i++) {
        g.fillStyle(colors.foliage[i % colors.foliage.length], 1);
        const yOff = screen.y - 12 - i * 6;
        const size = (type === 'pine' ? 10 : 12) - i * 2;
        g.beginPath();
        g.moveTo(screen.x, yOff - size);
        g.lineTo(screen.x + size, yOff);
        g.lineTo(screen.x, yOff + size / 2);
        g.lineTo(screen.x - size, yOff);
        g.closePath();
        g.fillPath();
      }

      // Snow caps on pine and deciduous trees
      if (type === 'pine' || type === 'deciduous') {
        g.fillStyle(0xd8e4f0, 0.4);
        const topY = screen.y - 12 - (layerCount - 1) * 6;
        g.fillEllipse(screen.x, topY - 2, 8, 3);
      }

      g.setDepth((tx + ty) * 100 + 5);
    }
    this._sceneryGraphics.push(g);
  }

  _drawFences(bounds) {
    const inBounds = (x, y) => !bounds || (x >= bounds.x1 - 1 && x <= bounds.x2 + 1 && y >= bounds.y1 - 1 && y <= bounds.y2 + 1);
    // Yotsume-gaki (四つ目垣) bamboo lattice fences around residential yards
    // Traditional Japanese four-eye fence pattern with vertical posts and horizontal rails
    const yards = [
      { x1: 20, y1: 70, x2: 30, y2: 80 },
      { x1: 60, y1: 70, x2: 70, y2: 80 },
      { x1: 20, y1: 83, x2: 30, y2: 93 },
      { x1: 60, y1: 83, x2: 70, y2: 93 },
    ].filter(yard => inBounds(yard.x1, yard.y1) || inBounds(yard.x2, yard.y2) || inBounds(yard.x1, yard.y2) || inBounds(yard.x2, yard.y1));
    if (yards.length === 0) return;

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
    this._sceneryGraphics.push(g);
  }

  // Seeded hash for deterministic pseudo-random values
  _hash(ix, iy) {
    let h = ix * 374761393 + iy * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff; // 0..1
  }

  // Smooth interpolated value noise (Perlin-like)
  _smoothNoise(fx, fy) {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const dx = fx - ix;
    const dy = fy - iy;
    // Smoothstep interpolation
    const sx = dx * dx * (3 - 2 * dx);
    const sy = dy * dy * (3 - 2 * dy);
    const n00 = this._hash(ix, iy);
    const n10 = this._hash(ix + 1, iy);
    const n01 = this._hash(ix, iy + 1);
    const n11 = this._hash(ix + 1, iy + 1);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy; // 0..1
  }

  _grassColor(x, y) {
    const nearPath = this._isNearPath(x, y);
    // Market district (x=10-30, y=18-30) — warmer earthy tone from forge fires and foot traffic
    const inMarket = x >= 10 && x <= 30 && y >= 18 && y <= 30;
    // Plaza courtyard area (x=35-42, y=34-41) — warmer stone
    const inPlaza = x >= 35 && x <= 42 && y >= 34 && y <= 41;

    if (nearPath) {
      // Grey slush near roads — smooth noise blending
      const n = this._smoothNoise(x * 0.25, y * 0.25);
      let r = 0x28 + Math.round(n * 6);
      let g = 0x2c + Math.round(n * 6);
      let b = 0x38 + Math.round(n * 8);
      if (inMarket) { r += 4; g += 2; b -= 2; }
      return (r << 16) | (g << 8) | b;
    }

    // Dark blue-grey snow — smooth noise for organic variation
    // Two octaves of noise for natural-looking terrain
    const n1 = this._smoothNoise(x * 0.08, y * 0.08);     // large-scale variation
    const n2 = this._smoothNoise(x * 0.25, y * 0.25);     // medium detail
    const blend = n1 * 0.7 + n2 * 0.3;

    // Blend between snow tones: dark blue-grey base to slightly lighter
    let r = 0x1c + Math.round(blend * 6);   // 0x1c..0x22
    let g = 0x26 + Math.round(blend * 6);   // 0x26..0x2c
    let b = 0x36 + Math.round(blend * 6);   // 0x36..0x3c

    // Market zone warm shift — subtle amber from forge glow and trampled earth
    if (inMarket) {
      r += 5; g += 3; b -= 3;
    }
    // Plaza zone warm shift — slightly warmer stone
    if (inPlaza) {
      r += 3; g += 2; b -= 2;
    }

    // Smooth moonlit patches — broad low-frequency glow
    const moon = this._smoothNoise(x * 0.04 + 50, y * 0.04 + 50);
    if (moon > 0.75) {
      const glow = (moon - 0.75) * 4; // 0..1 ramp in bright zones
      const mr = Math.min(255, r + Math.round(glow * 10));
      const mg = Math.min(255, g + Math.round(glow * 12));
      const mb = Math.min(255, b + Math.round(glow * 16));
      return (mr << 16) | (mg << 8) | mb;
    }
    return (r << 16) | (g << 8) | b;
  }

  _isNearPath(x, y) {
    if (!this.pathTiles) return false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (this.pathTiles.has(`${x+dx},${y+dy}`)) return true;
    return false;
  }

  _waterColor(x, y) {
    // Winter moat — dark muted frozen canal, not bright blue
    const n = ((x * 3 + y * 5) % 3);
    const icy = [0x3a5a6a, 0x2e4e5c, 0x445e6e];
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
    // Add walkways connecting buildings to main roads
    this._computeWalkways();
    // Redraw ground layer with new path data for all districts (async)
    this._rebuildAllDistrictGrounds();
  }

  // Generate walkways from each building entrance to nearest main road
  _computeWalkways() {
    if (!this.pathTiles) this.pathTiles = new Set();

    // Known building positions: [id, x, y, width, height]
    const buildings = [
      // communal
      ['town_hall', 12, 8, 4, 3], ['market', 8, 14, 4, 3], ['well', 5, 5, 3, 2],
      ['workshop', 16, 14, 3, 2], ['post_office', 20, 8, 4, 3],
      // cronos
      ['cronos_shrine', 10, 32, 3, 2], ['library', 18, 36, 4, 3], ['bathhouse', 6, 40, 4, 3],
      // scarlet
      ['scarlet_sanctum', 37, 6, 4, 3], ['observatory', 44, 8, 3, 2],
      // east
      ['iron_keep', 30, 30, 4, 3], ['sake_brewery', 38, 36, 2, 2],
      ['smithy', 28, 40, 3, 2], ['garden-pavilion', 44, 32, 4, 3],
      // residential
      ['house-north', 10, 56, 3, 2], ['house-south', 10, 66, 3, 2],
      ['house-east', 30, 56, 3, 2], ['house-west', 30, 66, 3, 2],
      ['teahouse', 20, 60, 3, 2], ['community_garden', 40, 62, 4, 3],
    ];

    // Build a set of occupied building tiles for collision avoidance
    const occupied = new Set();
    for (const [, bx, by, bw, bh] of buildings) {
      for (let ox = bx; ox < bx + bw; ox++) {
        for (let oy = by; oy < by + bh; oy++) {
          occupied.add(`${ox},${oy}`);
        }
      }
    }

    // Civic buildings get 2-tile-wide walkways
    const civicIds = new Set(['town_hall', 'library', 'post_office', 'iron_keep', 'garden-pavilion']);

    // Main roads: E-W at y=24-25 and y=49-50, N-S at x=24-25
    const EW_ROAD_Y = 24;
    const NS_ROAD_X = 24;

    for (const [id, bx, by, bw, bh] of buildings) {
      const entranceX = bx + Math.floor(bw / 2);
      const entranceY = by + bh;
      const isCivic = civicIds.has(id);

      const distToEW = Math.abs(entranceY - EW_ROAD_Y);
      const distToNS = Math.abs(entranceX - NS_ROAD_X);

      let targetX, targetY;
      if (distToEW <= distToNS) {
        targetX = entranceX;
        targetY = EW_ROAD_Y;
      } else {
        targetX = NS_ROAD_X;
        targetY = entranceY;
      }

      if (this._isPath(entranceX, entranceY)) continue;

      // Trace Manhattan path, avoiding building footprints
      let cx = entranceX, cy = entranceY;
      const maxSteps = 80;
      let steps = 0;
      while ((cx !== targetX || cy !== targetY) && steps < maxSteps) {
        if (!this._isWater(cx, cy) && !this._isPath(cx, cy) && !occupied.has(`${cx},${cy}`)) {
          this.pathTiles.add(`${cx},${cy}`);
          // Civic buildings: add adjacent tile for wider walkway
          if (isCivic) {
            const isVertical = (targetX === entranceX);
            const adj = isVertical ? `${cx + 1},${cy}` : `${cx},${cy + 1}`;
            if (!this._isWater(cx + (isVertical ? 1 : 0), cy + (isVertical ? 0 : 1)) && !occupied.has(adj)) {
              this.pathTiles.add(adj);
            }
          }
        }
        // Move one step: prefer the longer axis first
        const dx = Math.abs(cx - targetX);
        const dy = Math.abs(cy - targetY);
        const nextX = cx + (cx < targetX ? 1 : -1);
        const nextY = cy + (cy < targetY ? 1 : -1);
        if (dx > dy) {
          // Prefer horizontal but skip if occupied by a building
          if (!occupied.has(`${nextX},${cy}`)) { cx = nextX; }
          else if (dy > 0 && !occupied.has(`${cx},${nextY}`)) { cy = nextY; }
          else { cx = nextX; } // last resort
        } else {
          if (!occupied.has(`${cx},${nextY}`)) { cy = nextY; }
          else if (dx > 0 && !occupied.has(`${nextX},${cy}`)) { cx = nextX; }
          else { cy = nextY; }
        }
        steps++;
      }
    }

    // ── Residential district walkways ──────────────────────────────
    // Branch paths from N-S road (x=38) south of torii-housing (37,65)
    // down to each house group, creating a connected suburb feel.

    const addPath = (x, y) => {
      if (!this._isWater(x, y) && !occupied.has(`${x},${y}`)) {
        this.pathTiles.add(`${x},${y}`);
      }
    };

    // Main residential spine: continue N-S road south from y=65 to y=90
    // (the main road already covers x=38-39, but reinforce connectivity)
    for (let y = 60; y <= 92; y++) {
      addPath(38, y);
      addPath(39, y);
    }

    // West branch: from road (x=38) west to house1 (22,72) and house3 (22,85)
    // Upper west path at y=73 → connects to house1 entrance
    for (let x = 23; x <= 38; x++) { addPath(x, 73); }
    // Lower west path at y=86 → connects to house3 entrance
    for (let x = 23; x <= 38; x++) { addPath(x, 86); }

    // East branch: from road (x=39) east to house2 (62,72) and house4 (62,85)
    // Upper east path at y=73 → connects to house2 entrance
    for (let x = 39; x <= 63; x++) { addPath(x, 73); }
    // Lower east path at y=86 → connects to house4 entrance
    for (let x = 39; x <= 63; x++) { addPath(x, 86); }

    // Short north-south connectors from each branch to house entrances
    // house1 (22,72) entrance at (23,74) — connect down from y=73
    addPath(23, 74);
    // house2 (62,72) entrance at (63,74) — connect down from y=73
    addPath(63, 74);
    // house3 (22,85) entrance at (23,87) — connect up from y=86
    addPath(23, 87);
    // house4 (62,85) entrance at (63,87) — connect up from y=86
    addPath(63, 87);
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
      const w = Math.max(50, state.world.width || 50);
      const h = Math.max(50, state.world.height || 75);
      if (w !== this.mapW || h !== this.mapH) {
        this.mapW = w;
        this.mapH = h;
        // Re-preload all district grounds with new dimensions
        this._rebuildAllDistrictGrounds();
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

    // Apply district visibility — hide buildings/agents outside current district
    this._applyDistrictVisibility();

    // Defensive re-apply after microtask — catches any async preload interference
    requestAnimationFrame(() => this._applyDistrictVisibility());
  }

  _applyDistrictVisibility() {
    if (!this._currentDistrict) return;
    const d = DISTRICTS[this._currentDistrict];
    if (!d) return;

    // Show/hide buildings based on current district
    Object.values(this.buildings).forEach(b => {
      const inDistrict = this._isBuildingInDistrict(b.buildingData, this._currentDistrict);
      this._setBuildingVisible(b, inDistrict);
    });

    Object.values(this.agents).forEach(a => {
      if (!a.container) return;
      const gx = a.gridX ?? 0;
      const gy = a.gridY ?? 0;
      const inside = gx >= d.bounds.x1 && gx <= d.bounds.x2 &&
                     gy >= d.bounds.y1 && gy <= d.bounds.y2;
      a.container.setVisible(inside);
      // Clear speech bubble when hiding to prevent cross-district text bleed
      if (!inside && a.speechBubble) {
        a.speechBubble.destroy();
        a.speechBubble = null;
        if (a.speechTimer) { clearTimeout(a.speechTimer); a.speechTimer = null; }
      }
    });

    // Re-scatter life within current district inner bounds
    if (this.worldLife) {
      const lifeCount = Object.keys(this.agents).length || 1;
      const _m = 3;
      const db = DISTRICTS[this._currentDistrict].bounds;
      this.worldLife.scatter({ x1: db.x1 + _m, y1: db.y1 + _m, x2: db.x2 - _m, y2: db.y2 - _m }, lifeCount);
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

    // Re-scatter world life within current district inner bounds
    const agentCount = Object.keys(this.agents).length;
    if (this.worldLife && this._currentDistrict) {
      const _m = 3;
      const db = DISTRICTS[this._currentDistrict].bounds;
      this.worldLife.scatter({ x1: db.x1 + _m, y1: db.y1 + _m, x2: db.x2 - _m, y2: db.y2 - _m }, agentCount);
    }

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

  _isBuildingInDistrict(bData, key) {
    const d = DISTRICTS[key];
    if (!d) return false;
    if (bData.district) return bData.district === key;
    return bData.x >= d.bounds.x1 && bData.x <= d.bounds.x2 &&
           bData.y >= d.bounds.y1 && bData.y <= d.bounds.y2;
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
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.08);
    shadow.fillEllipse(pos.x, pos.y + shadowH * 0.05, shadowW * 0.6, shadowH * 0.2);
    shadow.setDepth((cx + cy) * 100 - 1);

    // Ambient detail — stone lantern near civic/market buildings
    const detail = this._spawnBuildingDetail(bData, pos);

    const building = new Building(this, bData, pos.x, pos.y);
    // Track auxiliary graphics for show/hide on district switch
    building._shadow = shadow;
    building._detail = detail;
    this.buildings[bData.id] = building;

    // Warm window light pool — golden glow on ground beneath building
    this._addWindowGlow(bData, pos, building);

    // Chimney smoke on taverns, teahouses, and select buildings
    this._addChimneySmoke(bData, pos, building);

    // Recompute building footprint exclusion set
    this._updateBuildingFootprint();

    // Set visibility based on current district
    if (this._currentDistrict) {
      const visible = this._isBuildingInDistrict(bData, this._currentDistrict);
      this._setBuildingVisible(building, visible);
    }
  }

  _updateBuildingFootprint() {
    this._buildingFootprint = new Set();
    Object.values(this.buildings).forEach(b => {
      const bw = b.gridW || 3, bh = b.gridH || 2;
      for (let dy = -1; dy <= bh; dy++) {
        for (let dx = -1; dx <= bw; dx++) {
          this._buildingFootprint.add(`${b.gridX + dx},${b.gridY + dy}`);
        }
      }
    });
  }

  _destroyAllBuildings() {
    for (const b of Object.values(this.buildings)) {
      if (b._shadow) { b._shadow.destroy(); b._shadow = null; }
      if (b._detail) { b._detail.destroy(); b._detail = null; }
      b.destroy();
    }
    this.buildings = {};
    this._buildingFootprint = new Set();
  }

  _spawnAllBuildings() {
    if (!this.worldData) return;
    // Spawn ALL buildings regardless of district
    if (this.worldData.buildings) {
      for (const bData of Object.values(this.worldData.buildings)) {
        this.addBuilding(bData);
      }
    }
    // Spawn dynamic buildings from world entities
    if (this.worldData.world?.entities) {
      for (const entity of this.worldData.world.entities) {
        if (entity.entity === 'building' && !this.worldData.buildings?.[entity.id]) {
          this.addBuilding({ ...entity, id: entity.id || entity.kind });
        }
      }
    }
    // Re-apply murals and cottage props
    if (this.worldData.murals) this.applyMurals(this.worldData.murals);
    if (this.worldData.agents) this.applyCottageProps(this.worldData.agents);
  }

  _spawnBuildingDetail(bData, pos) {
    const type = bData.type || bData.id || '';
    const isCivic = ['town_hall','post_office','market','teahouse','plaza','library'].includes(bData.id);
    const isCottage = type === 'cottage';
    if (!isCivic && !isCottage) return null;

    // Draw a tiny stone lantern (tōrō) or flower box as a pixel detail
    const g = this.add.graphics();
    const ox = pos.x + (TILE_W * (bData.width || 3)) * 0.28;
    const oy = pos.y + (TILE_H * (bData.height || 2)) * 0.1;
    g.setDepth((bData.x + (bData.width || 2) + bData.y + (bData.height || 2)) * 100 + 2);

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
    return g;
  }

  _addWindowGlow(bData, pos, building) {
    // Warm golden light pool on ground — suggests light spilling from windows
    const g = this.add.graphics();
    const w = (bData.width || 3) * TILE_W * 0.35;
    const h = (bData.height || 2) * TILE_H * 0.3;
    const ox = pos.x + w * 0.4;
    const oy = pos.y - 2;

    g.fillStyle(0xffc060, 0.06);
    g.fillEllipse(ox, oy, w, h);
    g.fillStyle(0xffe0a0, 0.04);
    g.fillEllipse(ox, oy, w * 0.5, h * 0.5);
    g.setDepth((bData.x + (bData.width || 2) + bData.y + (bData.height || 2)) * 100 - 1);

    // Gentle flicker
    this.tweens.add({
      targets: g,
      alpha: { from: 0.8, to: 1.0 },
      duration: Phaser.Math.Between(2000, 4000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    if (!this._windowGlows) this._windowGlows = [];
    this._windowGlows.push(g);
    if (building) building._windowGlow = g;
  }

  _addChimneySmoke(bData, pos, building) {
    const smokeBuildings = ['tavern', 'teahouse', 'forge', 'workshop', 'bakery'];
    const type = bData.type || bData.id || '';
    if (!smokeBuildings.some(t => type.includes(t))) return;

    // Create rising smoke particles
    if (!this._smokeParticles) this._smokeParticles = [];
    const smokeX = pos.x + Phaser.Math.Between(-8, 8);
    const wallH = 30 + ((bData.level || 1) - 1) * 8;
    const smokeBaseY = pos.y - wallH - 16;
    const smokeArr = [];

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
      smokeArr.push(g);
      this._smokeParticles.push(g);
    }
    if (building) building._smokeGraphics = smokeArr;
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
    panel.setDepth(30001);
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
    const container = this.add.container(px, py).setScrollFactor(0).setDepth(30001);

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
    const tooltip = this.add.container(tx, ty).setScrollFactor(0).setDepth(30002);

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
    const gx = x || 10, gy = y || 10;
    img.setDepth((gx + gy) * 100);
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
          const egx = building.gridX + building.gridW + 1;
          const egy = building.gridY + 1;
          agent.container.setDepth((egx + egy) * 100 + 50);
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
