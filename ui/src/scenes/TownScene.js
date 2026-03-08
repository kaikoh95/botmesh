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
    this.load.on('loaderror', () => {});

    // Character sprites
    const spriteAgents = ['scarlet', 'lumen', 'canvas', 'forge', 'sage', 'echo', 'iron', 'cronos', 'mosaic', 'patch', 'muse', 'planner', 'qa'];
    for (const id of spriteAgents) {
      this.load.image(`agent-${id}`, `assets/sprites/${id}.png`);
    }

    // Building sprites — exact manifest of what exists on disk (no speculative loads)
    const buildingFiles = [
      'bathhouse-l1','bathhouse-l2',
      'cottage-l1','cottage-l2','cottage-l3',
      'keep-l1','keep-l2',
      'library-l1','library-l2',
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
      'smithy-l1',
      'garden-l1',
    ];
    for (const f of buildingFiles) {
      this.load.image(`building-${f}`, `assets/buildings/${f}.png`);
    }

    // World life sprites
    const lifeSprites = ['sakura', 'bamboo', 'zen', 'koipond', 'deer', 'crane', 'firefly', 'butterfly', 'willow', 'lamp', 'pine'];
    for (const name of lifeSprites) {
      this.load.image(`life-${name}`, `assets/sprites/life/${name}.png`);
    }

    // Ground tile sprites
    this.load.image('tile-path', 'assets/buildings/path-tile.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#080c14'); // deep midnight blue — no purple bleed

    this.mapW = 42;
    this.mapH = 50; // extend south so camera never shows bare background
    const mapW = this.mapW;
    const mapH = this.mapH;
    // Origin: shift right + up so more of the northern map is visible
    this.originX = this.cameras.main.width * 0.55;
    this.originY = -60;

    // Draw ground tiles
    this._drawGround(mapW, mapH);

    // Draw water feature (bottom-left corner)
    this._drawWater();

    // Draw scattered trees (fallback for non-sakura spots)
    this._drawTrees();

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
    this._zoom = 1.0;
    const CAM = this.cameras.main;
    CAM.setZoom(this._zoom);

    // Mouse wheel zoom
    this.input.on('wheel', (_ptr, _objs, _dx, deltaY) => {
      this._zoom = Phaser.Math.Clamp(this._zoom - deltaY * 0.0008, 0.35, 2.5);
      CAM.setZoom(this._zoom);
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
          CAM.setZoom(this._zoom);
        }
        lastPinchDist = dist;
      } else {
        lastPinchDist = null;
      }
    });

    // Keyboard +/- zoom
    this.input.keyboard.on('keydown-PLUS',  () => { this._zoom = Phaser.Math.Clamp(this._zoom + 0.15, 0.35, 2.5); CAM.setZoom(this._zoom); });
    this.input.keyboard.on('keydown-MINUS', () => { this._zoom = Phaser.Math.Clamp(this._zoom - 0.15, 0.35, 2.5); CAM.setZoom(this._zoom); });
    this.input.keyboard.on('keydown-ZERO',  () => { this._zoom = 1.0; CAM.setZoom(1.0); });

    // Expose to window for UI buttons
    window.botmeshZoom = (delta) => {
      this._zoom = Phaser.Math.Clamp(this._zoom + delta, 0.35, 2.5);
      CAM.setZoom(this._zoom);
    };
    window._zoomReset = () => { this._zoom = 1.0; CAM.setZoom(1.0); };

    // ── Snowfall ────────────────────────────────────────────────────────────
    this._initSnow();

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

  _drawGround(mapW, mapH) {
    if (this._groundGraphics) { this._groundGraphics.destroy(); }
    if (this._pathSprites) { this._pathSprites.forEach(s => s.destroy()); }
    this._pathSprites = [];

    const g = this.add.graphics();
    this._groundGraphics = g;
    g.setDepth(0);

    // Check if path tile sprite is loaded
    const hasPathSprite = this.textures.exists('tile-path');

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const screen = this.gridToScreen(x, y);
        const isWater = this._isWater(x, y);
        const isPath = this._isPath(x, y);
        const even = (x + y) % 2 === 0;

        if (isPath && hasPathSprite) {
          // Pixel art cobblestone tile sprite — scale to exactly one isometric tile
          const img = this.add.image(screen.x, screen.y, 'tile-path');
          img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
          // Sprite should display at TILE_W × TILE_H (64×32)
          img.setDisplaySize(TILE_W, TILE_H);
          img.setOrigin(0.5, 0.5);
          img.setDepth(0.5); // above base ground, below buildings
          this._pathSprites.push(img);
          continue; // skip programmatic drawing for this tile
        }

        let baseColor;
        if (isWater) {
          baseColor = this._waterColor(x, y);
        } else if (isPath) {
          // Fallback if sprite not loaded yet
          baseColor = even ? 0x6a6878 : 0x5c5a6a;
        } else {
          baseColor = this._grassColor(x, y);
          if (even) {
            const r = ((baseColor >> 16) & 0xff) + 22;
            const g2 = ((baseColor >> 8) & 0xff) + 24;
            const b2 = (baseColor & 0xff) + 32;
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
        const bAlpha = isWater ? 0.45 : isPath ? 0.4 : 0.18;
        const bColor = isWater ? 0x4a8aaa : isPath ? 0x3a3848 : 0x8090b0;
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
    // WINTER — Zone-aware snow coloring (Shirakawa-go / onsen town aesthetic):
    // - Near paths: grey slush from foot traffic — snow melted, dark stone showing
    // - Residential zone: warm ivory snow — lived-in, faint yellow from lamp glow
    // - Open civic/cultural area: clean crisp blue-white snow
    const nearPath = this._isNearPath(x, y);
    const inResidential = y >= 22;
    const n = Math.abs((x * 7 + y * 13 + x * y) % 7);

    if (nearPath) {
      // Grey slush near roads — foot traffic melts snow, reveals dark stone
      const slush = [0x7a8090, 0x6e7480, 0x828898, 0x747a8a, 0x788090];
      return slush[n % slush.length];
    }
    if (inResidential) {
      // Residential: warm ivory snow — lamp glow, footprints, life
      const ivorySnow = [0x9a9488, 0xa09a8e, 0x98908a, 0x9c9690, 0x968e84, 0xa0988c, 0x928e84];
      return ivorySnow[n];
    }
    // Civic/cultural: crisp blue-white snow, clean and undisturbed
    const blueSnow = [0x8294aa, 0x7e90a6, 0x8098ac, 0x7a8ea4, 0x7e92a8, 0x7a8ea0, 0x8296ac];
    return blueSnow[n];
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
    const icy = [0x8ab4cc, 0x7aaabb, 0x90bcd4];
    return icy[n];
  }

  _isWater(x, y) {
    return this.moatTiles?.has(`${x},${y}`) || false;
  }

  _isPath(x, y) {
    return this.pathTiles?.has?.(`${x},${y}`) || false;
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
    this._drawGround(this.mapW || 40, this.mapH || 50);
    // Draw yards on dedicated layer above ground
    this._drawYards(this._lastBuildings || {});
  }

  _drawYards(buildings) {
    if (!buildings) return;
    // Own dedicated graphics layer — depth 1 sits above ground (depth 0)
    if (this._yardsGraphics) { this._yardsGraphics.destroy(); this._yardsGraphics = null; }
    const g = this.add.graphics();
    g.setDepth(1);
    this._yardsGraphics = g;

    for (const [id, b] of Object.entries(buildings)) {
      if (b.type !== 'cottage' && !id.includes('_home')) continue;

      const bx = b.x ?? 0;
      const by = b.y ?? 0;
      const bw = b.w ?? 2;
      const bh = b.h ?? 2;
      const lvl = b.level ?? 1;

      // Yard extends 1+ tiles around the building in each direction
      const yardPad = 1 + Math.floor(lvl / 2); // bigger house = bigger yard

      for (let dy = -yardPad; dy < bh + yardPad; dy++) {
        for (let dx = -yardPad; dx < bw + yardPad; dx++) {
          const tx = bx + dx;
          const ty = by + dy;
          if (this._isPath(tx, ty)) continue; // don't overwrite roads

          const screen = this.gridToScreen(tx, ty);
          const isBuilding = dx >= 0 && dx < bw && dy >= 0 && dy < bh;
          if (isBuilding) continue; // skip the building footprint itself

          // Yard color — winter: snow-covered garden with warm ivory tones near the home
          const isEven = (tx + ty) % 2 === 0;
          const yardBase = lvl >= 3 ? 0xe8e0d0 : lvl >= 2 ? 0xe0d8c8 : 0xd8d0c0;
          const yardColor = isEven ? yardBase + 0x080808 : yardBase;

          g.fillStyle(yardColor, 1.0);
          g.beginPath();
          g.moveTo(screen.x, screen.y - 16);
          g.lineTo(screen.x + 32, screen.y);
          g.lineTo(screen.x, screen.y + 16);
          g.lineTo(screen.x - 32, screen.y);
          g.closePath();
          g.fillPath();

          // Subtle border
          g.lineStyle(1, 0x7a6040, 0.25);
          g.beginPath();
          g.moveTo(screen.x, screen.y - 16);
          g.lineTo(screen.x + 32, screen.y);
          g.lineTo(screen.x, screen.y + 16);
          g.lineTo(screen.x - 32, screen.y);
          g.closePath();
          g.strokePath();
        }
      }
    }
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
        if (entity.entity === 'life' && entity.kind !== 'path') {
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

    if (state.time?.period) {
      this.setTime(state.time.period);
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
    shadow.setDepth(pos.y - 1);

    // Ambient detail — stone lantern near civic/market buildings
    this._spawnBuildingDetail(bData, pos);

    const building = new Building(this, bData, pos.x, pos.y);
    this.buildings[bData.id] = building;

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
    g.setDepth(pos.y + 2);

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
    if (!agent) return;
    const cam = this.cameras.main;
    // Smooth pan to agent's current screen position
    this.tweens.add({
      targets: cam,
      scrollX: agent.x - cam.width / 2,
      scrollY: agent.y - cam.height / 2,
      duration: 600,
      ease: 'Power2',
    });
    // Brief highlight ring around the agent
    const ring = this.add.circle(agent.x, agent.y, 24, 0xffffff, 0)
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
  }
}
