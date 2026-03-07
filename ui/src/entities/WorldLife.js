/**
 * WorldLife.js — Ambient living elements of BotMesh town.
 * Flora, fauna, and natural features that grow with the world.
 *
 * Population tiers (agent count → what spawns):
 *   1+ agents  → sakura trees, bamboo, basic zen gardens
 *   3+ agents  → koi pond, cranes, deer
 *   5+ agents  → fireflies (night only), butterflies, stone lanterns
 *   7+ agents  → expanded zen garden, more fauna, seasonal effects
 */

export default class WorldLife {
  constructor(scene) {
    this.scene = scene;
    this.elements = [];
    this.animatedElements = []; // things that move/animate
  }

  /**
   * Spawn world life based on current agent population.
   * Call on scene create and whenever agent count changes.
   */
  spawn(agentCount = 1) {
    // Clear existing
    this.elements.forEach(e => e.destroy && e.destroy());
    this.elements = [];
    this.animatedElements = [];

    this._spawnFlora(agentCount);
    if (agentCount >= 3) this._spawnFauna(agentCount);
    if (agentCount >= 5) this._spawnAmbient(agentCount);
  }

  _spawnFlora(agentCount) {
    const { scene } = this;
    const TILE_H = 32;

    // Scale sprite to a max display height in pixels (avoids oversized nature sprites)
    function scaleToMaxH(spr, maxPx) {
      if (spr.height > 0) spr.setScale(Math.min(maxPx / spr.height, 1));
    }

    // Sakura trees — replace basic programmatic trees
    const sakuraSpots = [
      [2, 3], [7, 2], [1, 12], [6, 22],
      [33, 3], [38, 2], [37, 18], [34, 22],
    ];
    for (const [tx, ty] of sakuraSpots) {
      if (scene._isWater?.(tx, ty) || scene._isPath?.(tx, ty)) continue;
      const pos = scene.gridToScreen(tx, ty);
      const key = scene.textures.exists('life-sakura') ? 'life-sakura' : null;
      if (key) {
        const spr = scene.add.image(pos.x, pos.y - 16, key).setOrigin(0.5, 1).setDepth(pos.y - 5);
        spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        scaleToMaxH(spr, 3 * TILE_H);
        this.elements.push(spr);
      }
    }

    // Bamboo clusters
    const bambooSpots = [
      [4, 7], [36, 7], [12, 2], [28, 7],
    ];
    for (const [tx, ty] of bambooSpots) {
      if (scene._isWater?.(tx, ty) || scene._isPath?.(tx, ty)) continue;
      const pos = scene.gridToScreen(tx, ty);
      const key = scene.textures.exists('life-bamboo') ? 'life-bamboo' : null;
      if (key) {
        const spr = scene.add.image(pos.x, pos.y - 12, key).setOrigin(0.5, 1).setDepth(pos.y - 4);
        spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        scaleToMaxH(spr, 5 * TILE_H);
        this.elements.push(spr);
      }
    }

    // Zen gardens — 1 or 2 depending on population
    const zenCount = agentCount >= 5 ? 2 : 1;
    const zenSpots = [[8, 19], [32, 14]].slice(0, zenCount);
    for (const [tx, ty] of zenSpots) {
      if (scene._isWater?.(tx, ty) || scene._isPath?.(tx, ty)) continue;
      const pos = scene.gridToScreen(tx, ty);
      const key = scene.textures.exists('life-zen') ? 'life-zen' : null;
      if (key) {
        const spr = scene.add.image(pos.x, pos.y, key).setOrigin(0.5, 0.75).setDepth(pos.y - 2);
        spr.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        scaleToMaxH(spr, 2 * TILE_H);
        this.elements.push(spr);
      }
    }

    // Koi pond (always present if texture exists)
    if (scene.textures.exists('life-koipond')) {
      const pos = scene.gridToScreen(14, 24);
      const pond = scene.add.image(pos.x, pos.y, 'life-koipond').setOrigin(0.5, 0.75).setDepth(pos.y - 1);
      pond.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      scaleToMaxH(pond, 2 * TILE_H);
      this.elements.push(pond);
    }
  }

  _spawnFauna(agentCount) {
    const { scene } = this;

    // Crane — elegant, near water/garden
    if (scene.textures.exists('life-crane')) {
      const craneSpots = [[16, 4], [25, 3]];
      const count = agentCount >= 5 ? 2 : 1;
      for (const [tx, ty] of craneSpots.slice(0, count)) {
        const pos = scene.gridToScreen(tx, ty);
        const crane = scene.add.image(pos.x, pos.y, 'life-crane').setOrigin(0.5, 1).setDepth(pos.y);
        crane.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        crane.setScale(0.12);
        this.elements.push(crane);
        // Gentle bob animation
        scene.tweens.add({ targets: crane, y: crane.y - 2, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    // Deer — wanders near trees
    if (scene.textures.exists('life-deer')) {
      const pos = scene.gridToScreen(27, 22);
      const deer = scene.add.image(pos.x, pos.y, 'life-deer').setOrigin(0.5, 1).setDepth(pos.y);
      deer.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      deer.setScale(0.12);
      this.elements.push(deer);
      this.animatedElements.push({ sprite: deer, type: 'wander', baseX: pos.x, baseY: pos.y });
    }

    // Butterflies — drift around sakura
    if (scene.textures.exists('life-butterfly')) {
      for (let i = 0; i < Math.min(agentCount, 3); i++) {
        const spots = [[3, 4], [7, 3], [35, 5]];
        const [tx, ty] = spots[i];
        const pos = scene.gridToScreen(tx, ty);
        const bf = scene.add.image(pos.x, pos.y - 20, 'life-butterfly').setOrigin(0.5, 0.5).setDepth(pos.y + 10);
        bf.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        bf.setScale(0.08);
        this.elements.push(bf);
        // Drift in a small circle
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

  _spawnAmbient(agentCount) {
    const { scene } = this;

    // Fireflies — only at night (checked by time-of-day)
    // WorldLife re-evaluates this on day/night transition
    this._updateFireflies(agentCount);
  }

  _updateFireflies(agentCount) {
    const { scene } = this;
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6;

    if (!isNight || !scene.textures.exists('life-firefly')) return;

    const count = Math.min(agentCount * 2, 10);
    const worldW = 40, worldH = 30;
    for (let i = 0; i < count; i++) {
      const tx = Phaser.Math.Between(2, worldW - 2);
      const ty = Phaser.Math.Between(2, worldH - 2);
      if (scene._isPath?.(tx, ty)) continue;
      const pos = scene.gridToScreen(tx, ty);
      const ff = scene.add.image(pos.x, pos.y - 10, 'life-firefly')
        .setOrigin(0.5, 0.5)
        .setDepth(pos.y + 20)
        .setAlpha(0);
      ff.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      ff.setScale(0.15);
      this.elements.push(ff);
      // Twinkle in/out
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
    // Deer wanders slowly
    for (const el of this.animatedElements) {
      if (el.type === 'wander' && time % 8000 < delta) {
        const dx = Phaser.Math.Between(-20, 20);
        const dy = Phaser.Math.Between(-10, 10);
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
