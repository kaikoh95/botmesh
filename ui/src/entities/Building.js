const BUILDING_COLORS = {
  civic:     0xc9a96e,
  library:   0x8b6914,
  workshop:  0x7f8c8d,
  tavern:    0xc0392b,
  house:     0xa0522d,
};

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

    const color = BUILDING_COLORS[buildingData.type] || 0xa0522d;

    this.container = scene.add.container(screenX, screenY);
    this.container.setDepth(screenY);

    const g = scene.add.graphics();
    const tileW = 64;
    const tileH = 32;
    const w = this.gridW * tileW / 2;
    const h = this.gridH * tileH / 2;
    const wallH = 30;

    // Darken helper
    const darken = (c, amt) => {
      let r = (c >> 16) & 0xff, gr2 = (c >> 8) & 0xff, b = c & 0xff;
      return (Math.max(0, r - amt) << 16) | (Math.max(0, gr2 - amt) << 8) | Math.max(0, b - amt);
    };

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
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(0, -wallH - h);
    g.lineTo(w / 2, -wallH - h / 2);
    g.lineTo(0, -wallH);
    g.lineTo(-w / 2, -wallH - h / 2);
    g.closePath();
    g.fillPath();

    // Roof outline
    g.lineStyle(1, darken(color, 60), 0.5);
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

    this.container.add(g);

    // Name label
    const label = scene.add.text(0, -wallH - h - 8, this.name, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#e8d5a3',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(label);

    this.graphics = g;
    this.glow = false;
  }

  setGlow(on) {
    if (this.glow === on) return;
    this.glow = on;
    // Simple alpha pulse for "glow"
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
      this.graphics.setAlpha(1);
    }
  }

  destroy() {
    if (this.glowTween) this.glowTween.remove();
    this.container.destroy();
  }
}
