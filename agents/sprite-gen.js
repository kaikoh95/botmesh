#!/usr/bin/env node
// sprite-gen.js — Regenerate agent character sprites using gpt-image-1
// Backs up originals first, generates one-by-one with delay, resizes to 64×64.

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const sharp = require('sharp');

// Load env from ~/.botmesh.env
const envPath = path.join(require('os').homedir(), '.botmesh.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SPRITES_DIR = path.join(__dirname, '..', 'ui', 'assets', 'sprites');
const BACKUP_DIR = path.join(SPRITES_DIR, 'backup');

const AGENTS = [
  { id: 'scarlet', color: '#e74c3c red',        desc: 'Red haori jacket, commanding presence, female strategist' },
  { id: 'forge',   color: '#7f8c8d grey',       desc: 'Blacksmith apron, hammer, sturdy male build' },
  { id: 'lumen',   color: '#3498db blue',       desc: 'Scholar robes, telescope accessory, curious female' },
  { id: 'canvas',  color: '#9b59b6 purple',     desc: 'Artist garb, paint-stained, creative female' },
  { id: 'sage',    color: '#27ae60 green',       desc: 'Librarian robes, scroll, calm elder' },
  { id: 'iron',    color: '#e67e22 orange',      desc: 'Samurai armor, enforcer stance, male warrior' },
  { id: 'cronos',  color: '#f1c40f gold',        desc: 'Timekeeper robes, hourglass accessory, mysterious' },
  { id: 'echo',    color: '#1abc9c teal',        desc: 'Light flowing clothing, listener posture, gentle' },
  { id: 'mosaic',  color: '#e91e63 pink',        desc: 'Artist/crafter, mosaic patterns on clothing, female' },
  { id: 'patch',   color: '#795548 brown',       desc: "Workman's clothes, tool belt, practical male" },
  { id: 'muse',    color: '#ff9800 amber',       desc: "Performer's outfit, expressive, theatrical female" },
  { id: 'planner', color: '#607d8b blue-grey',   desc: "Architect's garb, compass/ruler, thoughtful male" },
  { id: 'qa',      color: '#9c27b0 deep purple', desc: "Inspector's outfit, magnifying glass, meticulous" },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateSprite(agent, retries = 1) {
  const prompt = `Pixel art character sprite, front-facing, standing pose.
${agent.desc}
Style: 16-bit JRPG character, chibi proportions (2-3 head tall).
Japanese Edo-period clothing, ${agent.color} as primary color accent.
Transparent background, clean edges, no shadow.
Single character centered in frame.`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      });

      // gpt-image-1 returns b64_json by default
      const b64 = response.data[0].b64_json;
      if (b64) {
        return Buffer.from(b64, 'base64');
      }
      // fallback: URL
      const url = response.data[0].url;
      if (url) {
        const resp = await fetch(url);
        return Buffer.from(await resp.arrayBuffer());
      }
      throw new Error('No image data in response');
    } catch (err) {
      console.error(`  ⚠ Attempt ${attempt + 1} failed for ${agent.id}: ${err.message}`);
      if (attempt < retries) {
        console.log('  Retrying in 3s...');
        await sleep(3000);
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  // 1. Backup originals
  console.log('📦 Backing up originals...');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  for (const agent of AGENTS) {
    const src = path.join(SPRITES_DIR, `${agent.id}.png`);
    const dst = path.join(BACKUP_DIR, `${agent.id}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`  ✓ ${agent.id}.png → backup/`);
    }
  }

  // 2. Generate new sprites
  console.log('\n🎨 Generating new sprites...');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i];
    console.log(`\n[${i + 1}/${AGENTS.length}] ${agent.id} (${agent.color})...`);

    try {
      const rawBuf = await generateSprite(agent);
      
      // Resize to 64×64 with nearest-neighbor (preserves pixel art)
      const resized = await sharp(rawBuf)
        .resize(64, 64, { kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();

      const outPath = path.join(SPRITES_DIR, `${agent.id}.png`);
      fs.writeFileSync(outPath, resized);
      const kb = (resized.length / 1024).toFixed(1);
      console.log(`  ✅ Saved ${agent.id}.png (${kb} KB, 64×64)`);
      success++;
    } catch (err) {
      console.error(`  ❌ FAILED ${agent.id}: ${err.message}`);
      failed++;
    }

    // Delay between requests (skip after last)
    if (i < AGENTS.length - 1) {
      console.log('  ⏳ Waiting 2s...');
      await sleep(2000);
    }
  }

  console.log(`\n🏁 Done! ${success} generated, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
