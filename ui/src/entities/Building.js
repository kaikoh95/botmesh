// Map building id → sprite texture base name
const BUILDING_TEXTURE_MAP = {
  town_hall:   'townhall',
  post_office: 'postoffice',
};

const BUILDING_COLORS = {
  civic:     0xc9a96e,
  library:   0x8b6914,
  workshop:  0x7f8c8d,
  tavern:    0xc0392b,
  house:     0xa0522d,
};

function darken(c, amt) {
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return (Math.max(0, r - amt) << 16) | (Math.max(0, g - amt) << 8) | Math.max(0, b - amt);
}

function lighten(c, amt) {
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return (Math.min(255, r + amt) << 16) | (Math.min(255, g + amt) << 8) | Math.min(255, b + amt);
}

export default class Building {
  constructor(scene, buildingData, screenX, screenY) {
    this.scene = scene;
    this.id = buildingData.id;
    this.type = buildingData.type;
    this.name = buildingData.name;
    this.gridX = buildingData.x;
    this.gridY = buildingData.y;
    this.gridW = buildingData.width || 3;
    this.gridH = buildingData.height || 2;
    this.level = buildingData.level || 1;
    this.maxLevel = buildingData.maxLevel || 3;
    this.baseColor = BUILDING_COLORS[buildingData.type] || 0xa0522d;
    this.screenX = screenX;
    this.screenY = screenY;

    this.container = scene.add.container(screenX, screenY);
    this.container.setDepth(screenY);

    // Sprite support — try to use pixel art building sprites
    const texBase = BUILDING_TEXTURE_MAP[this.id];
    this.texBase = texBase || null;
    this.spriteImg = null;

    this.graphics = scene.add.graphics();
    this.container.add(this.graphics);

    // Name + level label
    this.label = scene.add.text(0, 0, '', {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#e8d5a3',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(this.label);

    // Upgrade sign (hidden by default)
    this.upgradeSign = null;
    this.upgradeSignTween = null;
    this.glow = false;
    this.glowTween = null;
    this.outlineTween = null;
    this.outlineGraphics = null;

    this._draw();
  }

  _getWallH() {
    return 30 + (this.level - 1) * 8;
  }

  _getRoofColor() {
    if (this.level === 3) return 0xd4a017; // gold
    if (this.level === 2) return lighten(this.baseColor, 20);
    return this.baseColor;
  }

  _draw() {
    // Use pixel art sprite if available
    if (this.texBase) {
      const texKey = `building-${this.texBase}-l${this.level}`;
      if (this.scene.textures.exists(texKey)) {
        // Remove old sprite if level changed
        if (this.spriteImg) { this.spriteImg.destroy(); this.spriteImg = null; }
        this.graphics.clear();

        const img = this.scene.add.image(0, 0, texKey);
        // Pixel art: nearest-neighbor filter for crisp rendering
        img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        // Scale to fill the building's isometric footprint width
        const TILE_W = 64;
        const targetW = this.gridW * TILE_W;
        const rawScale = targetW / img.width;
        const scale = Math.round(rawScale * 4) / 4 || rawScale;
        img.setScale(scale);
        const spriteH = img.height * scale;
        // Anchor at 50% x, 85% y — places the isometric ground base correctly
        img.setOrigin(0.5, 0.85);
        // Shift up slightly so base sits on the ground plane
        img.setY(-(spriteH * 0.15));
        this.container.addAt(img, 0); // add behind label
        this.spriteImg = img;

        // Update label above sprite
        this.label.setPosition(0, -(spriteH * 0.85 + 8));
        this.label.setText(`${this.name} Lv${this.level}`);
        return; // skip programmatic draw
      }
    }

    // Fallback: programmatic drawing
    if (this.spriteImg) { this.spriteImg.destroy(); this.spriteImg = null; }
    const g = this.graphics;
    g.clear();

    const color = this.baseColor;
    const tileW = 64;
    const tileH = 32;
    const w = this.gridW * tileW / 2;
    const h = this.gridH * tileH / 2;
    const wallH = this._getWallH();
    const roofColor = this._getRoofColor();

    // Building shadow
    g.fillStyle(0x000000, 0.15);
    g.fillRect(-w / 2 + 4, -wallH + 4, w, h + wallH);

    // Left wall
    g.fillStyle(darken(color, 40), 1);
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(-w / 2, -wallH);
    g.lineTo(0, -wallH - h / 2);
    g.lineTo(0, -h / 2);
    g.closePath();
    g.fillPath();

    // Right wall
    g.fillStyle(darken(color, 20), 1);
    g.beginPath();
    g.moveTo(0, -h / 2);
    g.lineTo(0, -wallH - h / 2);
    g.lineTo(w / 2, -wallH);
    g.lineTo(w / 2, 0);
    g.closePath();
    g.fillPath();

    // Roof (isometric diamond)
    g.fillStyle(roofColor, 1);
    g.beginPath();
    g.moveTo(0, -wallH - h);
    g.lineTo(w / 2, -wallH - h / 2);
    g.lineTo(0, -wallH);
    g.lineTo(-w / 2, -wallH - h / 2);
    g.closePath();
    g.fillPath();

    // Roof outline
    g.lineStyle(1, darken(roofColor, 60), 0.5);
    g.beginPath();
    g.moveTo(0, -wallH - h);
    g.lineTo(w / 2, -wallH - h / 2);
    g.lineTo(0, -wallH);
    g.lineTo(-w / 2, -wallH - h / 2);
    g.closePath();
    g.strokePath();

    // Door
    g.fillStyle(darken(color, 60), 1);
    g.fillRect(-4, -12, 8, 12);

    // Window (right wall)
    g.fillStyle(0xfff8a0, 0.6);
    g.fillRect(w / 4 - 4, -wallH + 6, 8, 8);

    // Level 2+: flag on roof
    if (this.level >= 2) {
      const flagX = w / 4;
      const flagY = -wallH - h / 2 - 4;
      // Pole
      g.lineStyle(2, 0x6b4226, 1);
      g.beginPath();
      g.moveTo(flagX, flagY);
      g.lineTo(flagX, flagY - 16);
      g.closePath();
      g.strokePath();
      // Flag
      g.fillStyle(this.level === 3 ? 0xffd700 : 0xe74c3c, 1);
      g.fillRect(flagX, flagY - 16, 8, 6);
    }

    // Level 3: star on top
    if (this.level >= 3) {
      this._drawStar(g, 0, -wallH - h - 6, 6, 0xffd700);
      // Setup glowing outline if not already
      this._setupGlowOutline(w, h, wallH, roofColor);
    } else {
      this._removeGlowOutline();
    }

    // Update label position
    this.label.setPosition(0, -wallH - h - (this.level >= 3 ? 16 : 8));
    this.label.setText(`${this.name} Lv${this.level}`);
  }

  _drawStar(g, cx, cy, size, color) {
    g.fillStyle(color, 1);
    const points = 5;
    const outer = size;
    const inner = size * 0.4;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 2 * 3) + (i * Math.PI / points);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
  }

  _setupGlowOutline(w, h, wallH, roofColor) {
    if (this.outlineGraphics) return; // already set up
    const og = this.scene.add.graphics();
    og.lineStyle(2, lighten(roofColor, 60), 0.4);
    // Outline the roof
    og.beginPath();
    og.moveTo(0, -wallH - h);
    og.lineTo(w / 2, -wallH - h / 2);
    og.lineTo(0, -wallH);
    og.lineTo(-w / 2, -wallH - h / 2);
    og.closePath();
    og.strokePath();
    // Outline the walls
    og.beginPath();
    og.moveTo(-w / 2, 0);
    og.lineTo(-w / 2, -wallH);
    og.lineTo(0, -wallH - h / 2);
    og.lineTo(w / 2, -wallH);
    og.lineTo(w / 2, 0);
    og.strokePath();

    this.container.add(og);
    this.outlineGraphics = og;

    this.outlineTween = this.scene.tweens.add({
      targets: og,
      alpha: { from: 0.3, to: 0.8 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _removeGlowOutline() {
    if (this.outlineTween) {
      this.outlineTween.remove();
      this.outlineTween = null;
    }
    if (this.outlineGraphics) {
      this.outlineGraphics.destroy();
      this.outlineGraphics = null;
    }
  }

  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    // Reset depth so new level sprite re-anchors correctly
    if (this.spriteImg) { this.spriteImg.destroy(); this.spriteImg = null; }
    this._draw();

    // Brief flash on upgrade
    const target = this.spriteImg || this.graphics;
    this.scene.tweens.add({
      targets: target,
      alpha: { from: 0.4, to: 1 },
      duration: 150,
      yoyo: true,
      repeat: 2,
    });
  }

  showUpgradeSign(workers) {
    if (this.upgradeSign) return; // already showing

    const tileW = 64;
    const h = this.gridH * 32 / 2;
    const wallH = this._getWallH();

    const sign = this.scene.add.container(0, -wallH - h - (this.level >= 3 ? 28 : 20));

    // Sign background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x2c3e50, 0.9);
    bg.fillRoundedRect(-30, -10, 60, 20, 4);
    bg.lineStyle(1, 0xe67e22, 0.8);
    bg.strokeRoundedRect(-30, -10, 60, 20, 4);
    sign.add(bg);

    // Sign text
    const txt = this.scene.add.text(0, 0, '\u2B06 Upgrading', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#e67e22',
    }).setOrigin(0.5);
    sign.add(txt);

    // Make sign interactive
    sign.setInteractive(new Phaser.Geom.Rectangle(-30, -10, 60, 20), Phaser.Geom.Rectangle.Contains);
    sign.on('pointerdown', () => {
      // Dispatch custom event for building panel
      window.dispatchEvent(new CustomEvent('botmesh:buildingclick', {
        detail: { buildingId: this.id, workers }
      }));
    });

    this.container.add(sign);
    this.upgradeSign = sign;

    // Bob animation
    this.upgradeSignTween = this.scene.tweens.add({
      targets: sign,
      y: sign.y - 4,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  hideUpgradeSign() {
    if (this.upgradeSignTween) {
      this.upgradeSignTween.remove();
      this.upgradeSignTween = null;
    }
    if (this.upgradeSign) {
      this.upgradeSign.destroy();
      this.upgradeSign = null;
    }
  }

  setGlow(on) {
    if (this.glow === on) return;
    this.glow = on;
    if (on) {
      this.glowTween = this.scene.tweens.add({
        targets: this.graphics,
        alpha: { from: 1, to: 0.8 },
        duration: 600,
        yoyo: true,
        repeat: -1,
      });
    } else if (this.glowTween) {
      this.glowTween.remove();
      this.glowTween = null;
      this.graphics.setAlpha(1);
    }
  }

  // ─── DAMAGE / RESTORE ───────────────────────────────────────────────────────

  setDamaged(on) {
    if (this._damaged === on) return;
    this._damaged = on;

    if (on) {
      // Red tint + shake + cracked overlay
      if (this.spriteImg) this.spriteImg.setTint(0xff4444);
      if (this.graphics) this.graphics.setAlpha(0.7);

      // Shake animation
      this._damageTween = this.scene.tweens.add({
        targets: this.container,
        x: { from: this.screenX - 2, to: this.screenX + 2 },
        duration: 80,
        yoyo: true,
        repeat: 5,
        onComplete: () => {
          // Settle into a slight droop
          this.container.setPosition(this.screenX, this.screenY + 3);
        }
      });

      // Crack overlay text
      this._dmgLabel = this.scene.add.text(0, -20, '💥 OFFLINE', {
        fontSize: '7px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#ff4444',
        stroke: '#000',
        strokeThickness: 2,
      }).setOrigin(0.5);
      this.container.add(this._dmgLabel);

      // Pulse the damage label
      this._dmgTween = this.scene.tweens.add({
        targets: this._dmgLabel,
        alpha: { from: 1, to: 0.3 },
        duration: 800,
        yoyo: true,
        repeat: -1,
      });
    } else {
      // Restore
      if (this.spriteImg) this.spriteImg.clearTint();
      if (this.graphics) this.graphics.setAlpha(1);
      this.container.setPosition(this.screenX, this.screenY);

      if (this._damageTween) { this._damageTween.remove(); this._damageTween = null; }
      if (this._dmgTween)    { this._dmgTween.remove();    this._dmgTween = null; }
      if (this._dmgLabel)    { this._dmgLabel.destroy();   this._dmgLabel = null; }

      // Brief green flash on restore
      if (this.spriteImg) {
        this.spriteImg.setTint(0x44ff44);
        this.scene.time.delayedCall(800, () => {
          if (this.spriteImg) this.spriteImg.clearTint();
        });
      }
    }
  }

  destroy() {
    this.hideUpgradeSign();
    this._removeGlowOutline();
    if (this.glowTween) this.glowTween.remove();
    if (this._damageTween) this._damageTween.remove();
    if (this._dmgTween) this._dmgTween.remove();
    if (this._dmgLabel) this._dmgLabel.destroy();
    if (this.spriteImg) this.spriteImg.destroy();
    this.container.destroy();
  }
}
