/**
 * CottageProps.js — Personality-specific decorations around agent cottages.
 *
 * Each citizen's cottage slowly reflects their personality through small
 * programmatic props drawn around the building. Props accumulate based
 * on work count — the more an agent works, the more their yard fills up.
 *
 * Prop positions are in screen-space offsets from the building container origin
 * (bottom-center of the cottage sprite/graphic).
 */

// ── Prop slot positions around a cottage (screen-space offsets) ──────────
// Arranged in isometric-friendly pattern: front yard first, then sides
const PROP_SLOTS = [
  { x: -28, y: 6 },    // front-left
  { x: 28, y: 6 },     // front-right
  { x: -48, y: -4 },   // side-left
  { x: 48, y: -4 },    // side-right
  { x: -18, y: 14 },   // near-front-left
  { x: 18, y: 14 },    // near-front-right
  { x: -58, y: -16 },  // far-left
  { x: 58, y: -16 },   // far-right
];

// ── Per-agent prop libraries ─────────────────────────────────────────────
// Each entry: { name, draw(graphics, x, y) }
// Props are unlocked in order as workCount increases.

const PROP_DEFS = {
  forge: [
    { name: 'anvil', draw: (g, x, y) => {
      g.fillStyle(0x555555, 1);
      g.fillRect(x - 7, y - 2, 14, 3);     // top plate
      g.fillStyle(0x444444, 1);
      g.fillRect(x - 5, y + 1, 10, 4);      // base
      g.fillStyle(0x666666, 1);
      g.fillRect(x - 9, y - 3, 4, 2);       // horn
    }},
    { name: 'scrap_pile', draw: (g, x, y) => {
      const cols = [0x7f8c8d, 0x6a6a6a, 0x8a8a8a, 0x5c5c5c];
      for (let i = 0; i < 5; i++) {
        g.fillStyle(cols[i % cols.length], 0.9);
        g.fillRect(x - 6 + i * 3, y - i * 2, 5, 3);
      }
    }},
    { name: 'ingots', draw: (g, x, y) => {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0xd4a017, 0.9);
        g.fillRect(x - 4 + i * 2, y - i * 3, 6, 3);
        g.fillStyle(0xb8860b, 0.7);
        g.fillRect(x - 4 + i * 2, y - i * 3 + 3, 6, 1);
      }
    }},
    { name: 'bellows', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 5, y - 4, 10, 6);
      g.fillStyle(0x4a2e1a, 1);
      g.fillRect(x + 5, y - 2, 4, 2);       // nozzle
    }},
    { name: 'coal_bin', draw: (g, x, y) => {
      g.fillStyle(0x3a3a3a, 1);
      g.fillRect(x - 6, y - 3, 12, 6);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0x1a1a1a, 1);
        g.fillCircle(x - 3 + i * 3, y - 1, 2);
      }
    }},
    { name: 'tongs', draw: (g, x, y) => {
      g.lineStyle(2, 0x555555, 1);
      g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 2, y + 2); g.strokePath();
      g.beginPath(); g.moveTo(x + 4, y - 6); g.lineTo(x - 2, y + 2); g.strokePath();
    }},
    { name: 'hammer', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 8, 2, 10);      // handle
      g.fillStyle(0x555555, 1);
      g.fillRect(x - 5, y - 10, 10, 4);      // head
    }},
    { name: 'horseshoe', draw: (g, x, y) => {
      g.lineStyle(2, 0x888888, 1);
      g.beginPath();
      g.arc(x, y - 3, 5, Math.PI * 0.2, Math.PI * 0.8, false);
      g.strokePath();
      g.fillStyle(0x888888, 1);
      g.fillCircle(x - 4, y, 1.5);
      g.fillCircle(x + 4, y, 1.5);
    }},
  ],

  canvas: [
    { name: 'easel', draw: (g, x, y) => {
      // Legs
      g.lineStyle(2, 0x6b4226, 1);
      g.beginPath(); g.moveTo(x - 5, y + 4); g.lineTo(x, y - 10); g.strokePath();
      g.beginPath(); g.moveTo(x + 5, y + 4); g.lineTo(x, y - 10); g.strokePath();
      // Canvas
      g.fillStyle(0xfff8dc, 1);
      g.fillRect(x - 6, y - 9, 12, 8);
      g.fillStyle(0x9b59b6, 0.6);
      g.fillRect(x - 4, y - 7, 4, 4);
      g.fillStyle(0xe74c3c, 0.5);
      g.fillRect(x, y - 6, 3, 3);
    }},
    { name: 'paint_splatter', draw: (g, x, y) => {
      const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x2ecc71];
      for (let i = 0; i < 5; i++) {
        g.fillStyle(cols[i], 0.7);
        g.fillCircle(x + (i * 4 - 8), y + (i % 3 - 1) * 2, 2 + (i % 2));
      }
    }},
    { name: 'palette', draw: (g, x, y) => {
      g.fillStyle(0x8b6914, 1);
      g.fillEllipse(x, y - 2, 14, 8);
      const dots = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xffffff];
      for (let i = 0; i < dots.length; i++) {
        const angle = (i / dots.length) * Math.PI + 0.3;
        g.fillStyle(dots[i], 1);
        g.fillCircle(x + Math.cos(angle) * 4, y - 2 + Math.sin(angle) * 2, 1.5);
      }
    }},
    { name: 'paint_cans', draw: (g, x, y) => {
      const cols = [0xe74c3c, 0x3498db, 0xf1c40f];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0x888888, 1);
        g.fillRect(x - 8 + i * 6, y - 4, 5, 6);
        g.fillStyle(cols[i], 1);
        g.fillRect(x - 8 + i * 6, y - 5, 5, 2);
      }
    }},
    { name: 'brushes', draw: (g, x, y) => {
      const cols = [0xe74c3c, 0x3498db, 0x2ecc71];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0x6b4226, 1);
        g.fillRect(x - 4 + i * 4, y - 8, 2, 8);
        g.fillStyle(cols[i], 1);
        g.fillRect(x - 5 + i * 4, y - 10, 4, 3);
      }
    }},
    { name: 'canvas_stack', draw: (g, x, y) => {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0xfff8dc, 1);
        g.fillRect(x - 6 + i * 2, y - 2 - i * 3, 10, 3);
        g.lineStyle(1, 0xccb88c, 0.5);
        g.strokeRect(x - 6 + i * 2, y - 2 - i * 3, 10, 3);
      }
    }},
    { name: 'color_wheel', draw: (g, x, y) => {
      const segs = [0xe74c3c, 0xf39c12, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6];
      for (let i = 0; i < segs.length; i++) {
        const a1 = (i / segs.length) * Math.PI * 2;
        const a2 = ((i + 1) / segs.length) * Math.PI * 2;
        g.fillStyle(segs[i], 0.8);
        g.beginPath();
        g.moveTo(x, y - 2);
        g.lineTo(x + Math.cos(a1) * 6, y - 2 + Math.sin(a1) * 4);
        g.lineTo(x + Math.cos(a2) * 6, y - 2 + Math.sin(a2) * 4);
        g.closePath();
        g.fillPath();
      }
    }},
    { name: 'ink_bottle', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x - 3, y - 5, 6, 6);
      g.fillStyle(0x1a252f, 1);
      g.fillRect(x - 2, y - 7, 4, 3);
      g.fillStyle(0x9b59b6, 0.6);
      g.fillCircle(x + 5, y, 2);
    }},
  ],

  mosaic: [
    { name: 'tile_stack', draw: (g, x, y) => {
      const cols = [0x3498db, 0xe74c3c, 0xf1c40f, 0x2ecc71, 0x9b59b6];
      for (let i = 0; i < 4; i++) {
        g.fillStyle(cols[i], 0.9);
        g.fillRect(x - 5 + i, y - 1 - i * 2, 8, 2);
      }
    }},
    { name: 'mosaic_panel', draw: (g, x, y) => {
      const cols = [0x3498db, 0xe74c3c, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0x8e44ad, 0xecf0f1];
      let ci = 0;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          g.fillStyle(cols[ci++ % cols.length], 0.85);
          g.fillRect(x - 6 + dx * 4, y - 6 + dy * 4, 3, 3);
        }
      }
    }},
    { name: 'colored_glass', draw: (g, x, y) => {
      const cols = [0x3498db, 0x9b59b6, 0x1abc9c];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(cols[i], 0.5);
        g.beginPath();
        g.moveTo(x + i * 5 - 5, y - 6);
        g.lineTo(x + i * 5 - 1, y - 2);
        g.lineTo(x + i * 5 - 5, y + 2);
        g.lineTo(x + i * 5 - 9, y - 2);
        g.closePath();
        g.fillPath();
      }
    }},
    { name: 'grout_bucket', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 1);
      g.fillRect(x - 4, y - 4, 8, 6);
      g.fillStyle(0xbdc3c7, 1);
      g.fillRect(x - 3, y - 5, 6, 2);
    }},
    { name: 'pattern_sketch', draw: (g, x, y) => {
      g.fillStyle(0xfff8dc, 1);
      g.fillRect(x - 6, y - 5, 12, 8);
      g.lineStyle(1, 0x7f8c8d, 0.6);
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(x - 4, y - 3 + i * 3); g.lineTo(x + 4, y - 3 + i * 3); g.strokePath();
      }
    }},
    { name: 'chisel_set', draw: (g, x, y) => {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0x6b4226, 1);
        g.fillRect(x - 3 + i * 4, y - 6, 2, 7);
        g.fillStyle(0x95a5a6, 1);
        g.fillRect(x - 4 + i * 4, y - 8, 4, 3);
      }
    }},
    { name: 'gem_stones', draw: (g, x, y) => {
      const cols = [0xe74c3c, 0x2ecc71, 0x3498db, 0xf1c40f];
      for (let i = 0; i < 4; i++) {
        g.fillStyle(cols[i], 0.8);
        g.beginPath();
        g.moveTo(x - 6 + i * 4, y - 3);
        g.lineTo(x - 4 + i * 4, y - 5);
        g.lineTo(x - 2 + i * 4, y - 3);
        g.lineTo(x - 4 + i * 4, y);
        g.closePath();
        g.fillPath();
      }
    }},
    { name: 'art_lamp', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 4, 2, 6);
      g.fillStyle(0xf39c12, 0.7);
      g.fillCircle(x, y - 6, 4);
      g.fillStyle(0xf1c40f, 0.4);
      g.fillCircle(x, y - 6, 6);
    }},
  ],

  sage: [
    { name: 'potted_herb', draw: (g, x, y) => {
      g.fillStyle(0x8b4513, 1);
      g.fillRect(x - 4, y - 2, 8, 5);       // pot
      g.fillStyle(0x27ae60, 1);
      g.fillCircle(x - 2, y - 5, 3);
      g.fillCircle(x + 2, y - 5, 3);
      g.fillCircle(x, y - 7, 3);
      g.fillStyle(0x1e8449, 1);
      g.fillRect(x - 1, y - 4, 2, 3);        // stem
    }},
    { name: 'scroll_rack', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 6, y - 8, 2, 10);
      g.fillRect(x + 4, y - 8, 2, 10);
      g.fillRect(x - 6, y - 8, 12, 2);
      g.fillStyle(0xf5deb3, 1);
      for (let i = 0; i < 3; i++) {
        g.fillRect(x - 3 + i * 3, y - 6, 2, 6);
      }
    }},
    { name: 'herb_planter', draw: (g, x, y) => {
      g.fillStyle(0x8b4513, 0.9);
      g.fillRect(x - 8, y - 1, 16, 4);
      const herbs = [0x27ae60, 0x2ecc71, 0x1e8449, 0x229954];
      for (let i = 0; i < 4; i++) {
        g.fillStyle(herbs[i], 1);
        g.fillCircle(x - 6 + i * 4, y - 3, 2);
        g.fillCircle(x - 6 + i * 4, y - 5, 2);
      }
    }},
    { name: 'lantern', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 10, 2, 4);
      g.fillStyle(0xf39c12, 0.6);
      g.fillRect(x - 3, y - 7, 6, 5);
      g.fillStyle(0xf1c40f, 0.3);
      g.fillCircle(x, y - 4, 5);
    }},
    { name: 'stone_marker', draw: (g, x, y) => {
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(x - 4, y - 6, 8, 8);
      g.fillStyle(0x95a5a6, 0.5);
      g.fillRect(x - 3, y - 5, 6, 2);
    }},
    { name: 'book_stack', draw: (g, x, y) => {
      const cols = [0x8b6914, 0x2c3e50, 0xc0392b, 0x27ae60];
      for (let i = 0; i < 4; i++) {
        g.fillStyle(cols[i], 1);
        g.fillRect(x - 5, y - 1 - i * 3, 10, 3);
      }
    }},
    { name: 'incense', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 3, y - 2, 6, 4);
      g.fillStyle(0x8b4513, 1);
      g.fillRect(x - 1, y - 6, 2, 5);
      // Smoke wisps
      g.fillStyle(0xbdc3c7, 0.3);
      g.fillCircle(x, y - 8, 2);
      g.fillCircle(x + 1, y - 11, 1.5);
    }},
    { name: 'zen_bowl', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillEllipse(x, y - 1, 10, 5);
      g.fillStyle(0x34495e, 0.8);
      g.fillEllipse(x, y - 2, 8, 3);
    }},
  ],

  lumen: [
    { name: 'telescope', draw: (g, x, y) => {
      // Tripod
      g.lineStyle(1, 0x6b4226, 1);
      g.beginPath(); g.moveTo(x - 5, y + 3); g.lineTo(x, y - 4); g.strokePath();
      g.beginPath(); g.moveTo(x + 5, y + 3); g.lineTo(x, y - 4); g.strokePath();
      g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x, y - 4); g.strokePath();
      // Tube
      g.fillStyle(0xb87333, 1);
      g.fillRect(x - 1, y - 10, 3, 8);
      g.fillStyle(0xcd7f32, 1);
      g.fillCircle(x, y - 10, 3);
    }},
    { name: 'star_chart', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x - 6, y - 5, 12, 8);
      g.fillStyle(0xf1c40f, 0.8);
      for (let i = 0; i < 5; i++) {
        g.fillCircle(x - 3 + (i * 7 % 8), y - 3 + (i * 5 % 5), 1);
      }
      g.lineStyle(1, 0xf1c40f, 0.3);
      g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 4, y - 1); g.strokePath();
    }},
    { name: 'crystal', draw: (g, x, y) => {
      g.fillStyle(0x5dade2, 0.6);
      g.beginPath();
      g.moveTo(x, y - 10);
      g.lineTo(x + 4, y - 3);
      g.lineTo(x, y);
      g.lineTo(x - 4, y - 3);
      g.closePath();
      g.fillPath();
      g.fillStyle(0x85c1e9, 0.3);
      g.beginPath();
      g.moveTo(x, y - 10);
      g.lineTo(x + 4, y - 3);
      g.lineTo(x, y - 5);
      g.closePath();
      g.fillPath();
    }},
    { name: 'lens', draw: (g, x, y) => {
      g.lineStyle(2, 0xb87333, 1);
      g.strokeCircle(x, y - 3, 5);
      g.fillStyle(0x85c1e9, 0.3);
      g.fillCircle(x, y - 3, 4);
    }},
    { name: 'astrolabe', draw: (g, x, y) => {
      g.lineStyle(1, 0xb87333, 1);
      g.strokeCircle(x, y - 4, 6);
      g.strokeCircle(x, y - 4, 3);
      g.beginPath(); g.moveTo(x - 6, y - 4); g.lineTo(x + 6, y - 4); g.strokePath();
      g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y + 2); g.strokePath();
    }},
    { name: 'sample_jars', draw: (g, x, y) => {
      const cols = [0x5dade2, 0x82e0aa, 0xf7dc6f];
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0xcccccc, 0.6);
        g.fillRect(x - 7 + i * 5, y - 5, 4, 6);
        g.fillStyle(cols[i], 0.5);
        g.fillRect(x - 7 + i * 5, y - 3, 4, 3);
      }
    }},
    { name: 'compass', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 1);
      g.fillCircle(x, y - 3, 5);
      g.fillStyle(0x2c3e50, 1);
      g.fillCircle(x, y - 3, 4);
      g.fillStyle(0xe74c3c, 1);
      g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 1, y - 3); g.lineTo(x - 1, y - 3); g.closePath(); g.fillPath();
      g.fillStyle(0xecf0f1, 1);
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 1, y - 3); g.lineTo(x - 1, y - 3); g.closePath(); g.fillPath();
    }},
    { name: 'orrery', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 1);
      g.fillCircle(x, y - 4, 2);
      g.lineStyle(1, 0xb87333, 0.7);
      g.strokeCircle(x, y - 4, 5);
      g.strokeCircle(x, y - 4, 8);
      g.fillStyle(0xf1c40f, 1);
      g.fillCircle(x + 5, y - 4, 1.5);
      g.fillStyle(0x3498db, 1);
      g.fillCircle(x - 3, y - 9, 1);
    }},
  ],

  iron: [
    { name: 'shield', draw: (g, x, y) => {
      g.fillStyle(0x7f8c8d, 1);
      g.beginPath();
      g.moveTo(x, y - 8);
      g.lineTo(x + 6, y - 5);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 3);
      g.lineTo(x - 5, y);
      g.lineTo(x - 6, y - 5);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x - 1, y - 6, 2, 8);
      g.fillRect(x - 4, y - 3, 8, 2);
    }},
    { name: 'sword_rack', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 7, y - 2, 14, 3);
      for (let i = 0; i < 2; i++) {
        g.fillStyle(0x95a5a6, 1);
        g.fillRect(x - 5 + i * 7, y - 10, 2, 9);
        g.fillStyle(0x6b4226, 1);
        g.fillRect(x - 6 + i * 7, y - 4, 4, 2);
      }
    }},
    { name: 'watchtower_post', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 2, y - 12, 4, 14);
      g.fillStyle(0xf39c12, 0.6);
      g.fillCircle(x, y - 13, 3);
    }},
    { name: 'barrier', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 8, y - 1, 3, 5);
      g.fillRect(x + 5, y - 1, 3, 5);
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x - 7, y - 2, 14, 2);
      g.fillStyle(0xecf0f1, 1);
      g.fillRect(x - 7, y, 14, 1);
    }},
    { name: 'training_dummy', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 2, 2, 6);
      g.fillRect(x - 5, y - 5, 10, 2);
      g.fillStyle(0xd4a017, 1);
      g.fillCircle(x, y - 7, 3);
    }},
    { name: 'armor_stand', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 2, 2, 6);
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(x - 4, y - 8, 8, 6);
      g.fillStyle(0x95a5a6, 1);
      g.fillCircle(x, y - 10, 3);
    }},
    { name: 'flag_post', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 12, 2, 14);
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x + 1, y - 12, 8, 5);
    }},
    { name: 'lantern_post', draw: (g, x, y) => {
      g.fillStyle(0x333333, 1);
      g.fillRect(x - 1, y - 10, 2, 12);
      g.fillStyle(0xf39c12, 0.7);
      g.fillRect(x - 3, y - 12, 6, 4);
      g.fillStyle(0xf1c40f, 0.3);
      g.fillCircle(x, y - 10, 5);
    }},
  ],

  cronos: [
    { name: 'sundial', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 1);
      g.fillEllipse(x, y - 1, 12, 6);
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(x - 1, y - 6, 2, 5);
    }},
    { name: 'hourglass', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 1);
      g.fillRect(x - 4, y - 10, 8, 2);
      g.fillRect(x - 4, y, 8, 2);
      g.fillStyle(0xf5deb3, 0.6);
      g.beginPath();
      g.moveTo(x - 3, y - 8); g.lineTo(x + 3, y - 8);
      g.lineTo(x, y - 4); g.closePath(); g.fillPath();
      g.beginPath();
      g.moveTo(x - 3, y); g.lineTo(x + 3, y);
      g.lineTo(x, y - 4); g.closePath(); g.fillPath();
    }},
    { name: 'clock_face', draw: (g, x, y) => {
      g.fillStyle(0xecf0f1, 1);
      g.fillCircle(x, y - 4, 6);
      g.lineStyle(1, 0x2c3e50, 1);
      g.strokeCircle(x, y - 4, 6);
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y - 8); g.strokePath();
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3, y - 3); g.strokePath();
    }},
    { name: 'gear_pile', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 0.8);
      g.fillCircle(x - 3, y - 2, 4);
      g.fillCircle(x + 3, y - 4, 3);
      g.fillStyle(0x2c3e50, 1);
      g.fillCircle(x - 3, y - 2, 2);
      g.fillCircle(x + 3, y - 4, 1.5);
    }},
    { name: 'metronome', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.beginPath();
      g.moveTo(x - 4, y + 2); g.lineTo(x + 4, y + 2);
      g.lineTo(x + 2, y - 8); g.lineTo(x - 2, y - 8);
      g.closePath(); g.fillPath();
      g.fillStyle(0xb87333, 1);
      g.fillRect(x - 1, y - 6, 2, 6);
    }},
    { name: 'pocket_watch', draw: (g, x, y) => {
      g.fillStyle(0xd4a017, 1);
      g.fillCircle(x, y - 3, 5);
      g.fillStyle(0xfff8dc, 1);
      g.fillCircle(x, y - 3, 4);
      g.lineStyle(1, 0x2c3e50, 1);
      g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 2, y - 5); g.strokePath();
      g.fillStyle(0xd4a017, 1);
      g.fillCircle(x, y - 8, 1.5);
    }},
    { name: 'bell', draw: (g, x, y) => {
      g.fillStyle(0xd4a017, 1);
      g.beginPath();
      g.moveTo(x - 5, y); g.lineTo(x - 3, y - 7); g.lineTo(x + 3, y - 7); g.lineTo(x + 5, y);
      g.closePath(); g.fillPath();
      g.fillCircle(x, y + 1, 2);
    }},
    { name: 'calendar_stone', draw: (g, x, y) => {
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(x - 5, y - 6, 10, 8);
      g.lineStyle(1, 0x95a5a6, 0.6);
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(x - 3, y - 4 + i * 2); g.lineTo(x + 3, y - 4 + i * 2); g.strokePath();
      }
    }},
  ],

  echo: [
    { name: 'horn', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 1);
      g.beginPath();
      g.moveTo(x - 2, y - 6); g.lineTo(x + 6, y - 2);
      g.lineTo(x + 6, y + 1); g.lineTo(x - 2, y - 2);
      g.closePath(); g.fillPath();
    }},
    { name: 'banner', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 12, 2, 14);
      g.fillStyle(0x2980b9, 1);
      g.fillRect(x + 1, y - 11, 8, 6);
      g.fillStyle(0xecf0f1, 0.7);
      g.fillCircle(x + 5, y - 8, 2);
    }},
    { name: 'speaker_box', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x - 5, y - 6, 10, 8);
      g.fillStyle(0x34495e, 1);
      g.fillCircle(x, y - 3, 3);
      g.fillCircle(x, y - 3, 1.5);
    }},
    { name: 'mailbox', draw: (g, x, y) => {
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x - 4, y - 6, 8, 5);
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 1, 2, 5);
      g.fillStyle(0xecf0f1, 0.7);
      g.fillRect(x - 2, y - 5, 4, 2);
    }},
    { name: 'wind_chime', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 1);
      g.fillRect(x - 4, y - 10, 8, 2);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(0xbdc3c7, 0.8);
        g.fillRect(x - 3 + i * 2, y - 8, 1, 4 + i);
      }
    }},
    { name: 'signal_flag', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 10, 2, 12);
      g.fillStyle(0xf39c12, 1);
      g.beginPath();
      g.moveTo(x + 1, y - 10); g.lineTo(x + 8, y - 8); g.lineTo(x + 1, y - 6);
      g.closePath(); g.fillPath();
    }},
    { name: 'notice_board', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 6, y - 8, 12, 8);
      g.fillStyle(0xfff8dc, 0.8);
      g.fillRect(x - 4, y - 6, 4, 3);
      g.fillRect(x + 1, y - 5, 3, 2);
    }},
    { name: 'bell_tower', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 2, y - 2, 4, 6);
      g.fillRect(x - 4, y - 10, 8, 2);
      g.fillStyle(0xd4a017, 1);
      g.fillCircle(x, y - 7, 2.5);
    }},
  ],

  patch: [
    { name: 'toolbox', draw: (g, x, y) => {
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x - 6, y - 3, 12, 5);
      g.fillStyle(0x922b21, 1);
      g.fillRect(x - 2, y - 5, 4, 2);
    }},
    { name: 'wrench', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 1);
      g.fillRect(x - 1, y - 8, 2, 8);
      g.fillCircle(x, y - 9, 3);
      g.fillStyle(0x7f8c8d, 1);
      g.fillCircle(x, y - 9, 1.5);
    }},
    { name: 'spare_parts', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 0.8);
      g.fillCircle(x - 3, y - 1, 3);
      g.fillCircle(x + 3, y - 3, 2);
      g.fillRect(x - 1, y - 5, 4, 2);
      g.fillStyle(0x7f8c8d, 1);
      g.fillCircle(x - 3, y - 1, 1.5);
    }},
    { name: 'circuit_board', draw: (g, x, y) => {
      g.fillStyle(0x27ae60, 0.8);
      g.fillRect(x - 6, y - 4, 12, 6);
      g.lineStyle(1, 0xf1c40f, 0.6);
      g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y - 2); g.strokePath();
      g.beginPath(); g.moveTo(x - 2, y - 1); g.lineTo(x - 2, y + 1); g.strokePath();
      g.beginPath(); g.moveTo(x + 2, y - 3); g.lineTo(x + 2, y); g.strokePath();
    }},
    { name: 'oil_can', draw: (g, x, y) => {
      g.fillStyle(0x7f8c8d, 1);
      g.fillRect(x - 3, y - 5, 6, 6);
      g.fillStyle(0x95a5a6, 1);
      g.fillRect(x + 3, y - 4, 4, 2);
    }},
    { name: 'cog', draw: (g, x, y) => {
      g.fillStyle(0x95a5a6, 1);
      g.fillCircle(x, y - 3, 5);
      g.fillStyle(0x7f8c8d, 1);
      g.fillCircle(x, y - 3, 3);
      g.fillStyle(0x95a5a6, 1);
      const teeth = 6;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        g.fillRect(x + Math.cos(a) * 5 - 1, y - 3 + Math.sin(a) * 5 - 1, 2, 2);
      }
    }},
    { name: 'wire_spool', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 4, y - 6, 8, 2);
      g.fillRect(x - 4, y, 8, 2);
      g.fillStyle(0xe67e22, 1);
      g.fillRect(x - 2, y - 4, 4, 4);
    }},
    { name: 'test_rig', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x - 5, y - 6, 10, 8);
      g.fillStyle(0x27ae60, 1);
      g.fillCircle(x - 2, y - 3, 2);
      g.fillStyle(0xe74c3c, 1);
      g.fillCircle(x + 2, y - 3, 2);
    }},
  ],

  muse: [
    { name: 'dream_catcher', draw: (g, x, y) => {
      g.lineStyle(1, 0x9b59b6, 0.8);
      g.strokeCircle(x, y - 6, 5);
      g.beginPath(); g.moveTo(x - 3, y - 8); g.lineTo(x + 3, y - 4); g.strokePath();
      g.beginPath(); g.moveTo(x + 3, y - 8); g.lineTo(x - 3, y - 4); g.strokePath();
      g.fillStyle(0x9b59b6, 0.5);
      for (let i = 0; i < 3; i++) {
        g.fillRect(x - 2 + i * 2, y - 1, 1, 3 + i);
      }
    }},
    { name: 'candles', draw: (g, x, y) => {
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0xecf0f1, 1);
        g.fillRect(x - 5 + i * 4, y - 3 - i * 2, 3, 5 + i * 2);
        g.fillStyle(0xf39c12, 0.8);
        g.fillCircle(x - 3.5 + i * 4, y - 4 - i * 2, 2);
      }
    }},
    { name: 'music_box', draw: (g, x, y) => {
      g.fillStyle(0x8e44ad, 1);
      g.fillRect(x - 5, y - 4, 10, 6);
      g.fillStyle(0x9b59b6, 0.7);
      g.fillRect(x - 4, y - 6, 8, 3);
      g.fillStyle(0xf1c40f, 0.6);
      g.fillCircle(x, y - 1, 2);
    }},
    { name: 'quill_ink', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x + 2, y - 3, 4, 4);
      g.fillStyle(0xecf0f1, 1);
      g.lineStyle(1, 0xecf0f1, 0.8);
      g.beginPath(); g.moveTo(x - 3, y - 8); g.lineTo(x + 1, y); g.strokePath();
    }},
    { name: 'crystal_ball', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillEllipse(x, y + 1, 8, 3);
      g.fillStyle(0x8e44ad, 0.4);
      g.fillCircle(x, y - 4, 5);
      g.fillStyle(0xbb8fce, 0.3);
      g.fillCircle(x - 1, y - 5, 2);
    }},
    { name: 'wind_spinner', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 2, 2, 6);
      const cols = [0x9b59b6, 0x3498db, 0xe74c3c, 0xf1c40f];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.fillStyle(cols[i], 0.7);
        g.beginPath();
        g.moveTo(x, y - 5);
        g.lineTo(x + Math.cos(a) * 5, y - 5 + Math.sin(a) * 3);
        g.lineTo(x + Math.cos(a + 0.5) * 3, y - 5 + Math.sin(a + 0.5) * 2);
        g.closePath();
        g.fillPath();
      }
    }},
    { name: 'mask', draw: (g, x, y) => {
      g.fillStyle(0xf5deb3, 1);
      g.fillEllipse(x, y - 4, 10, 8);
      g.fillStyle(0x2c3e50, 1);
      g.fillEllipse(x - 3, y - 5, 3, 2);
      g.fillEllipse(x + 3, y - 5, 3, 2);
      g.lineStyle(1, 0x2c3e50, 0.6);
      g.beginPath();
      g.arc(x, y - 1, 3, 0, Math.PI, false);
      g.strokePath();
    }},
    { name: 'floating_orb', draw: (g, x, y) => {
      g.fillStyle(0x9b59b6, 0.3);
      g.fillCircle(x, y - 6, 6);
      g.fillStyle(0xbb8fce, 0.5);
      g.fillCircle(x, y - 6, 4);
      g.fillStyle(0xd7bde2, 0.6);
      g.fillCircle(x - 1, y - 7, 2);
    }},
  ],

  scarlet: [
    { name: 'command_flag', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 12, 2, 14);
      g.fillStyle(0xc0392b, 1);
      g.fillRect(x + 1, y - 12, 10, 6);
      g.fillStyle(0xecf0f1, 0.8);
      g.fillCircle(x + 6, y - 9, 2);
    }},
    { name: 'map_table', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 7, y - 2, 14, 3);
      g.fillRect(x - 6, y + 1, 3, 3);
      g.fillRect(x + 3, y + 1, 3, 3);
      g.fillStyle(0xf5deb3, 1);
      g.fillRect(x - 5, y - 4, 10, 3);
    }},
    { name: 'red_lantern', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 1, y - 10, 2, 4);
      g.fillStyle(0xc0392b, 0.7);
      g.fillRect(x - 4, y - 7, 8, 6);
      g.fillStyle(0xe74c3c, 0.4);
      g.fillCircle(x, y - 4, 6);
    }},
    { name: 'strategy_board', draw: (g, x, y) => {
      g.fillStyle(0x2c3e50, 1);
      g.fillRect(x - 6, y - 6, 12, 8);
      g.lineStyle(1, 0xc0392b, 0.6);
      g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x, y - 4); g.lineTo(x + 4, y - 1); g.strokePath();
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(x - 4, y - 2, 1.5);
      g.fillCircle(x + 4, y - 1, 1.5);
    }},
    { name: 'seal_stamp', draw: (g, x, y) => {
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 3, y - 6, 6, 4);
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(x, y, 4);
      g.fillStyle(0x922b21, 1);
      g.fillCircle(x, y, 2.5);
    }},
    { name: 'spyglass', draw: (g, x, y) => {
      g.fillStyle(0xb87333, 1);
      g.fillRect(x - 6, y - 2, 12, 3);
      g.fillStyle(0xcd7f32, 1);
      g.fillCircle(x + 6, y - 1, 3);
      g.fillStyle(0x85c1e9, 0.3);
      g.fillCircle(x + 6, y - 1, 2);
    }},
    { name: 'battle_plans', draw: (g, x, y) => {
      g.fillStyle(0xf5deb3, 1);
      g.fillRect(x - 5, y - 4, 10, 6);
      g.lineStyle(1, 0xc0392b, 0.5);
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(x - 3, y - 2 + i * 2); g.lineTo(x + 3, y - 2 + i * 2); g.strokePath();
      }
      g.fillStyle(0xc0392b, 0.6);
      g.fillCircle(x - 1, y - 1, 1.5);
      g.fillCircle(x + 2, y + 1, 1);
    }},
    { name: 'war_drum', draw: (g, x, y) => {
      g.fillStyle(0xc0392b, 1);
      g.fillEllipse(x, y - 1, 10, 6);
      g.fillStyle(0x922b21, 0.8);
      g.fillEllipse(x, y - 3, 10, 4);
      g.fillStyle(0xf5deb3, 0.6);
      g.fillEllipse(x, y - 3, 8, 3);
    }},
  ],
};

// ── Fallback for agents without custom props ─────────────────────────────
const DEFAULT_PROPS = [
  { name: 'crate', draw: (g, x, y) => {
    g.fillStyle(0x6b4226, 1);
    g.fillRect(x - 5, y - 5, 10, 7);
    g.lineStyle(1, 0x4a2e1a, 0.5);
    g.strokeRect(x - 5, y - 5, 10, 7);
  }},
  { name: 'barrel', draw: (g, x, y) => {
    g.fillStyle(0x6b4226, 1);
    g.fillEllipse(x, y - 1, 8, 4);
    g.fillRect(x - 4, y - 5, 8, 5);
    g.fillStyle(0x4a2e1a, 1);
    g.fillEllipse(x, y - 5, 8, 3);
  }},
  { name: 'flower_pot', draw: (g, x, y) => {
    g.fillStyle(0x8b4513, 1);
    g.fillRect(x - 3, y - 2, 6, 4);
    g.fillStyle(0x27ae60, 1);
    g.fillCircle(x, y - 4, 3);
  }},
  { name: 'basket', draw: (g, x, y) => {
    g.fillStyle(0xd4a017, 0.8);
    g.fillEllipse(x, y - 1, 10, 5);
    g.lineStyle(1, 0xb8860b, 0.5);
    g.strokeEllipse(x, y - 1, 10, 5);
  }},
  { name: 'bucket', draw: (g, x, y) => {
    g.fillStyle(0x7f8c8d, 1);
    g.fillRect(x - 3, y - 4, 6, 5);
    g.fillStyle(0x95a5a6, 1);
    g.fillEllipse(x, y - 4, 6, 2);
  }},
  { name: 'sign_post', draw: (g, x, y) => {
    g.fillStyle(0x6b4226, 1);
    g.fillRect(x - 1, y - 8, 2, 10);
    g.fillRect(x + 1, y - 7, 7, 3);
  }},
  { name: 'stepping_stone', draw: (g, x, y) => {
    g.fillStyle(0x7f8c8d, 0.7);
    g.fillEllipse(x, y, 8, 4);
  }},
  { name: 'torch', draw: (g, x, y) => {
    g.fillStyle(0x6b4226, 1);
    g.fillRect(x - 1, y - 6, 2, 8);
    g.fillStyle(0xf39c12, 0.7);
    g.fillCircle(x, y - 7, 3);
  }},
];


/**
 * Get the prop definitions for a given agent.
 * @param {string} agentId
 * @returns {Array} prop definition array
 */
export function getPropsForAgent(agentId) {
  return PROP_DEFS[agentId] || DEFAULT_PROPS;
}

/**
 * Get the prop slot positions.
 * @returns {Array} slot position offsets
 */
export function getPropSlots() {
  return PROP_SLOTS;
}

/**
 * Determine how many props an agent should display.
 * Uses max of workCount and cottage level history.
 * Unlocks gradually: 1 prop per 1 work, minimum (level-1)*2, up to 8.
 * @param {number} workCount - agent's completed task count
 * @param {number} [cottageLevel=1] - cottage building level
 * @returns {number}
 */
export function propCountForWork(workCount, cottageLevel = 1) {
  const fromWork = workCount || 0;
  const fromLevel = Math.max(0, (cottageLevel || 1) - 1) * 2; // Lv2=2 props, Lv3=4 props
  return Math.min(Math.max(fromWork, fromLevel), 8);
}
