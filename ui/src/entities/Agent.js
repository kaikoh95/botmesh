// Agent character colors
export const AGENT_COLORS = {
  scarlet: 0xe74c3c,
  forge:   0x7f8c8d,
  lumen:   0x3498db,
  canvas:  0x9b59b6,
  sage:    0x27ae60,
};

// Fallback palette for agents without a known color
const FALLBACK_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0x27ae60, 0x7f8c8d, 0xe67e22, 0xf1c40f];
let fallbackIndex = 0;

export function getAgentColor(agentData) {
  // Use explicit hex color from agent data
  if (agentData.color) {
    return parseInt(agentData.color.replace('#', ''), 16);
  }
  // Check known palette
  if (AGENT_COLORS[agentData.id]) {
    return AGENT_COLORS[agentData.id];
  }
  // Fallback
  return FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length];
}

export function getAgentHexString(agentData) {
  const c = getAgentColor(agentData);
  return '#' + c.toString(16).padStart(6, '0');
}

export default class Agent {
  constructor(scene, agentData, screenX, screenY) {
    this.scene = scene;
    this.id = agentData.id;
    this.name = agentData.name || agentData.id;
    this.agentState = agentData.state || 'idle';
    this.online = true;
    this.color = getAgentColor(agentData);
    this.gridX = agentData.location?.x ?? 0;
    this.gridY = agentData.location?.y ?? 0;

    // Container holds body + label + speech bubble
    this.container = scene.add.container(screenX, screenY);
    this.container.setDepth(screenY + 1000);

    // Use pixel art sprite if available, otherwise programmatic graphics
    const textureKey = `agent-${agentData.id}`;
    this.hasSprite = scene.textures.exists(textureKey) && textureKey !== '__MISSING';

    if (this.hasSprite) {
      this.body = scene.add.image(0, 0, textureKey);
      // Scale to 72px tall, maintain aspect ratio
      const targetH = 72;
      const scale = targetH / this.body.height;
      this.body.setScale(scale);
      this.body.setOrigin(0.5, 1);
    } else {
      this.body = scene.add.graphics();
      this._drawBody();
    }
    this.container.add(this.body);

    // Name label — adjust Y based on whether we have a sprite
    const labelY = this.hasSprite ? -(48 + 6) : -28;
    this.label = scene.add.text(0, labelY, this.name, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(this.label);

    // Speech bubble (hidden by default)
    this.speechBubble = null;
    this.speechTimer = null;

    // Idle bob animation
    this._startIdleAnimation();
  }

  _drawBody() {
    if (this.hasSprite) return; // sprite agents don't use programmatic drawing
    const g = this.body;
    g.clear();

    const c = this.color;
    const darken = (color, amount) => {
      let r = (color >> 16) & 0xff;
      let gr = (color >> 8) & 0xff;
      let b = color & 0xff;
      r = Math.max(0, r - amount);
      gr = Math.max(0, gr - amount);
      b = Math.max(0, b - amount);
      return (r << 16) | (gr << 8) | b;
    };

    // Shadow
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 10, 20, 8);

    // Body (torso)
    g.fillStyle(c, 1);
    g.fillRoundedRect(-8, -8, 16, 16, 3);

    // Head
    const lighter = c;
    g.fillStyle(0xfadcb5, 1); // skin tone
    g.fillCircle(0, -14, 7);

    // Hair / hat colored with agent color
    g.fillStyle(c, 1);
    g.fillRoundedRect(-7, -22, 14, 6, 2);

    // Eyes
    g.fillStyle(0x000000, 1);
    g.fillCircle(-3, -14, 1.5);
    g.fillCircle(3, -14, 1.5);

    // Legs
    g.fillStyle(darken(c, 40), 1);
    g.fillRect(-6, 8, 5, 6);
    g.fillRect(1, 8, 5, 6);

    // Offline overlay
    if (!this.online) {
      g.fillStyle(0x000000, 0.5);
      g.fillRoundedRect(-8, -22, 16, 36, 3);
    }
  }

  _startIdleAnimation() {
    this.bobTween = this.scene.tweens.add({
      targets: this.body,
      y: { from: 0, to: -2 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  moveTo(screenX, screenY, gridX, gridY) {
    this.gridX = gridX;
    this.gridY = gridY;

    this.scene.tweens.add({
      targets: this.container,
      x: screenX,
      y: screenY,
      duration: 600,
      ease: 'Power2',
      onUpdate: () => {
        this.container.setDepth(this.container.y + 1000);
      }
    });
  }

  setState(state) {
    this.agentState = state;
    // Adjust bob speed based on state
    if (this.bobTween) this.bobTween.remove();

    const speed = state === 'walking' ? 400 : state === 'working' ? 300 : 800;
    const dist = state === 'sleeping' ? 0 : state === 'working' ? -3 : -2;

    if (state === 'sleeping') {
      // Sleeping: darken but stay visible, gentle slow breathing bob
      this.body.setAngle(0);
      this.body.setAlpha(0.5);
      this.bobTween = this.scene.tweens.add({
        targets: this.body,
        y: { from: 0, to: -1 },
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    this.body.setAlpha(1);
    this.body.setAngle(0);
    this.bobTween = this.scene.tweens.add({
      targets: this.body,
      y: { from: 0, to: dist },
      duration: speed,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  speak(message) {
    // Remove old bubble
    if (this.speechBubble) {
      this.speechBubble.destroy();
      this.speechBubble = null;
    }
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
    }

    // Truncate long messages
    const text = message.length > 60 ? message.slice(0, 57) + '...' : message;

    // Create bubble as a container — higher for sprite agents
    const bubbleY = this.hasSprite ? -56 : -40;
    const bubble = this.scene.add.container(0, bubbleY);

    const txt = this.scene.add.text(0, 0, text, {
      fontSize: '9px',
      fontFamily: 'Courier New, monospace',
      color: '#000000',
      wordWrap: { width: 120 },
      align: 'center',
    }).setOrigin(0.5);

    const pad = 6;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(
      -txt.width / 2 - pad,
      -txt.height / 2 - pad,
      txt.width + pad * 2,
      txt.height + pad * 2,
      6
    );
    // Small triangle pointer
    bg.fillTriangle(0, txt.height / 2 + pad, -5, txt.height / 2 + pad, 0, txt.height / 2 + pad + 6);

    bubble.add(bg);
    bubble.add(txt);
    this.container.add(bubble);
    this.speechBubble = bubble;

    // Fade out after 4 seconds
    this.speechTimer = setTimeout(() => {
      if (this.speechBubble && this.scene) {
        this.scene.tweens.add({
          targets: this.speechBubble,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            if (this.speechBubble) {
              this.speechBubble.destroy();
              this.speechBubble = null;
            }
          }
        });
      }
    }, 4000);
  }

  flash() {
    // Brief white flash when speaking
    this.scene.tweens.add({
      targets: this.body,
      alpha: { from: 1, to: 0.3 },
      duration: 100,
      yoyo: true,
      repeat: 2,
    });
  }

  setOnline(online) {
    this.online = online;
    if (this.hasSprite) {
      this.body.setTint(online ? 0xffffff : 0x555555);
      this.body.setAlpha(online ? 1 : 0.5);
    } else {
      this._drawBody();
    }
    this.label.setAlpha(online ? 1 : 0.4);
  }

  enableInteraction(callback) {
    // Make the container interactive with a hit area
    this.container.setInteractive(
      new Phaser.Geom.Rectangle(-16, -28, 32, 50),
      Phaser.Geom.Rectangle.Contains
    );
    this.container.on('pointerdown', () => callback(this));
  }

  destroy() {
    if (this.speechTimer) clearTimeout(this.speechTimer);
    if (this.bobTween) this.bobTween.remove();
    this.container.destroy();
  }
}
