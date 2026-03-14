/**
 * WorldLife.js — Ambient living elements of BotMesh town.
 * Flora, fauna, and natural features that grow with the world.
 *
 * Population tiers (agent count → what spawns):
 *   1+ agents  → sakura trees, bamboo, basic zen gardens
 *   3+ agents  → koi pond, cranes, deer
 *   5+ agents  → fireflies (night only), butterflies, stone lanterns
 *   7+ agents  → expanded zen garden, more fauna, seasonal effects
 *
 * Elements are scattered per-district within bounds on each district load.
 */

export default class WorldLife {
  constructor(scene) {
    this.scene = scene;
    this.elements = [];
    this.animatedElements = []; // things that move/animate
  }

  /**
   * Spawn world life based on current agent population.
   * @deprecated Use scatter(bounds, agentCount) for per-district spawning.
   */
  spawn(agentCount = 1) {
    this.destroy();
  }

  /**
   * Scatter life elements within the given district bounds.
   * Destroys any existing elements first, then spawns new ones
   * with positions guaranteed to be inside bounds.
   */
  scatter(bounds, agentCount = 1) {
    this.destroy();

    const { x1, y1, x2, y2 } = bounds;
    const w = x2 - x1;
    const h = y2 - y1;

    this._spawnFlora(agentCount, x1, y1, w, h);
    if (agentCount >= 3) this._spawnFauna(agentCount, x1, y1, w, h);
    if (agentCount >= 5) this._spawnAmbient(agentCount, x1, y1, w, h);
  }

  /** Destroy all existing elements and clear arrays. */
  destroy() {
    this.elements.forEach(e => {
      if (e && !e.destroyed) e.destroy?.();
    });
    this.elements = [];
    this.animatedElements = [];
  }

  _isFootprint(tx, ty) {
    return this.scene._buildingFootprint?.has(`${tx},${ty}`) || false;
  }

  /**
   * Generate N semi-random positions within bounds, avoiding water/paths/buildings.
   * Positions are seeded from offsets to be deterministic per district.
   */
  _pickSpots(count, x1, y1, w, h, margin = 2) {
    const spots = [];
    const maxAttempts = count * 8;
    let attempts = 0;
    // Use golden-ratio–based quasi-random distribution for even spacing
    const phi = 0.618033988749895;
    let rx = 0.3, ry = 0.7;
    while (spots.length < count && attempts < maxAttempts) {
      rx = (rx + phi) % 1;
      ry = (ry + phi * 0.7) % 1;
      const tx = Math.floor(x1 + margin + rx * (w - margin * 2));
      const ty = Math.floor(y1 + margin + ry * (h - margin * 2));
      if (this.scene._isWater?.(tx, ty) || this.scene._isPath?.(tx, ty) || this._isFootprint(tx, ty)) {
        attempts++;
        continue;
      }
      // Avoid duplicates
      if (spots.some(([sx, sy]) => sx === tx && sy === ty)) {
        attempts++;
        continue;
      }
      spots.push([tx, ty]);
      attempts++;
    }
    return spots;
  }

  _spawnFlora(agentCount, x1, y1, w, h) {
    const { scene } = this;
    const TILE_H = 32;

    function scaleToMaxH(spr, maxPx) {
      if (spr.height > 0) spr.setScale(Math.min(maxPx / spr.height, 1));
    }

    // Sakura trees — 4-6 per district
    const sakuraCount = agentCount >= 5 ? 6 : 4;
    const sakuraSpots = this._pickSpots(sakuraCount, x1, y1, w, h, 1);
    for (const [tx, ty] of sakuraSpots) {
      const key = scene.textures.exists('life-sakura') ? 'life-sakura' : null;
      if (!key) break;
      const pos = scene.gridToScreen(tx, ty);
      const spr = scene.add.image(pos.x, pos.y - 16, key).setOrigin(0.5, 1).setDepth((tx + ty) * 100);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      scaleToMaxH(spr, 1.4 * TILE_H);
      spr._gx = tx; spr._gy = ty;
      this.elements.push(spr);
    }

    // Bamboo clusters — 2-3
    const bambooCount = agentCount >= 5 ? 3 : 2;
    const bambooSpots = this._pickSpots(bambooCount, x1, y1, w, h, 2);
    for (const [tx, ty] of bambooSpots) {
      const key = scene.textures.exists('life-bamboo') ? 'life-bamboo' : null;
      if (!key) break;
      const pos = scene.gridToScreen(tx, ty);
      const spr = scene.add.image(pos.x, pos.y - 12, key).setOrigin(0.5, 1).setDepth((tx + ty) * 100);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      scaleToMaxH(spr, 2.2 * TILE_H);
      spr._gx = tx; spr._gy = ty;
      this.elements.push(spr);
    }

    // Zen gardens — 1-2
    const zenCount = agentCount >= 5 ? 2 : 1;
    const zenSpots = this._pickSpots(zenCount, x1, y1, w, h, 3);
    for (const [tx, ty] of zenSpots) {
      const key = scene.textures.exists('life-zen') ? 'life-zen' : null;
      if (!key) break;
      const pos = scene.gridToScreen(tx, ty);
      const spr = scene.add.image(pos.x, pos.y, key).setOrigin(0.5, 0.75).setDepth((tx + ty) * 100);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      scaleToMaxH(spr, 1.2 * TILE_H);
      spr._gx = tx; spr._gy = ty;
      this.elements.push(spr);
    }

    // Willow trees — 2-4
    const willowCount = agentCount >= 5 ? 4 : 2;
    const willowSpots = this._pickSpots(willowCount, x1, y1, w, h, 1);
    for (const [tx, ty] of willowSpots) {
      const key = scene.textures.exists('life-willow') ? 'life-willow' : null;
      if (!key) break;
      const pos = scene.gridToScreen(tx, ty);
      const spr = scene.add.image(pos.x, pos.y - 8, key).setOrigin(0.5, 1).setDepth((tx + ty) * 100);
      spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      scaleToMaxH(spr, 2.0 * TILE_H);
      spr._gx = tx; spr._gy = ty;
      this.elements.push(spr);
    }

    // Kuroki — ancient black pine, one per district near center
    if (scene.textures.exists('life-pine')) {
      const cx = x1 + Math.floor(w * 0.4);
      const cy = y1 + Math.floor(h * 0.5);
      if (!this._isFootprint(cx, cy)) {
        const pos = scene.gridToScreen(cx, cy);
        const kuroki = scene.add.image(pos.x, pos.y - 16, 'life-pine').setOrigin(0.5, 1).setDepth((cx + cy) * 100);
        kuroki.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        scaleToMaxH(kuroki, 2.5 * TILE_H);
        kuroki.setName('kuroki');
        kuroki._gx = cx; kuroki._gy = cy;
        this.elements.push(kuroki);
      }
    }

    // Koi pond — one per district
    if (scene.textures.exists('life-koipond')) {
      const spots = this._pickSpots(1, x1, y1, w, h, 3);
      for (const [tx, ty] of spots) {
        const pos = scene.gridToScreen(tx, ty);
        const pond = scene.add.image(pos.x, pos.y, 'life-koipond').setOrigin(0.5, 0.75).setDepth((tx + ty) * 100);
        pond.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        scaleToMaxH(pond, 1.5 * TILE_H);
        pond._gx = tx; pond._gy = ty;
        this.elements.push(pond);
      }
    }
  }

  _spawnFauna(agentCount, x1, y1, w, h) {
    const { scene } = this;

    // Crane — 1-2 per district
    if (scene.textures.exists('life-crane')) {
      const count = agentCount >= 5 ? 2 : 1;
      const spots = this._pickSpots(count, x1, y1, w, h, 2);
      for (const [tx, ty] of spots) {
        const pos = scene.gridToScreen(tx, ty);
        const crane = scene.add.image(pos.x, pos.y, 'life-crane').setOrigin(0.5, 1).setDepth((tx + ty) * 100);
        crane.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        crane.setScale(0.04);
        crane._gx = tx; crane._gy = ty;
        this.elements.push(crane);
        scene.tweens.add({ targets: crane, y: crane.y - 2, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    // Deer — one per district
    if (scene.textures.exists('life-deer')) {
      const spots = this._pickSpots(1, x1, y1, w, h, 3);
      for (const [tx, ty] of spots) {
        const pos = scene.gridToScreen(tx, ty);
        const deer = scene.add.image(pos.x, pos.y, 'life-deer').setOrigin(0.5, 1).setDepth((tx + ty) * 100);
        deer.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        deer.setScale(0.04);
        deer._gx = tx; deer._gy = ty;
        this.elements.push(deer);
        this.animatedElements.push({ sprite: deer, type: 'wander', baseX: pos.x, baseY: pos.y });
      }
    }

    // Butterflies — 1-3
    if (scene.textures.exists('life-butterfly')) {
      const count = Math.min(agentCount, 3);
      const spots = this._pickSpots(count, x1, y1, w, h, 1);
      for (const [tx, ty] of spots) {
        const pos = scene.gridToScreen(tx, ty);
        const bf = scene.add.image(pos.x, pos.y - 20, 'life-butterfly').setOrigin(0.5, 0.5).setDepth((tx + ty) * 100 + 10);
        bf.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        bf.setScale(0.03);
        bf._gx = tx; bf._gy = ty;
        this.elements.push(bf);
        scene.tweens.add({
          targets: bf,
          x: bf.x + Phaser.Math.Between(-12, 12),
          y: bf.y + Phaser.Math.Between(-8, 8),
          duration: Phaser.Math.Between(1800, 3200),
          yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    }
  }

  _spawnAmbient(agentCount, x1, y1, w, h) {
    this._updateFireflies(agentCount, x1, y1, w, h);
  }

  _updateFireflies(agentCount, x1, y1, w, h) {
    const { scene } = this;
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6;

    if (!isNight || !scene.textures.exists('life-firefly')) return;

    const count = Math.min(agentCount * 2, 10);
    const spots = this._pickSpots(count, x1, y1, w, h, 1);
    for (const [tx, ty] of spots) {
      const pos = scene.gridToScreen(tx, ty);
      const ff = scene.add.image(pos.x, pos.y - 10, 'life-firefly')
        .setOrigin(0.5, 0.5)
        .setDepth((tx + ty) * 100 + 20)
        .setAlpha(0);
      ff.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ff.setScale(0.03);
      ff._gx = tx; ff._gy = ty;
      this.elements.push(ff);
      scene.tweens.add({
        targets: ff,
        alpha: { from: 0, to: 0.9 },
        duration: Phaser.Math.Between(600, 1400),
        delay: Phaser.Math.Between(0, 5000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * Update loop — called from TownScene update().
   * Handles wandering animals etc.
   */
  update(time, delta) {
    for (const el of this.animatedElements) {
      if (el.type === 'wander' && el.sprite?.visible && time % 8000 < delta) {
        const dx = Phaser.Math.Between(-12, 12);
        const dy = Phaser.Math.Between(-6, 6);
        this.scene.tweens.add({
          targets: el.sprite,
          x: el.baseX + dx,
          y: el.baseY + dy,
          duration: 3000,
          ease: 'Sine.easeInOut'
        });
      }
    }
  }
}
