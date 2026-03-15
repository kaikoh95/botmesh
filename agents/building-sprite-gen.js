#!/usr/bin/env node
// building-sprite-gen.js — Generate building sprites using gpt-image-1
// Usage: node building-sprite-gen.js <name> <prompt-description>

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// Load env from ~/.botmesh.env
const envPath = path.join(require('os').homedir(), '.botmesh.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BUILDINGS_DIR = path.join(__dirname, '..', 'ui', 'assets', 'buildings');

const STYLE_PREFIX = `Isometric pixel art building sprite for a Japanese Edo-period village game.
Perspective: isometric 3D, standard 2:1 pixel ratio, camera looks down-right (south-east facing).
Two visible faces: left wall (darker) + right wall (lighter) + top/roof.
Base forms a clean isometric diamond at the bottom.
Palette: dark stone #2a2a3a, wood beams #5c3d2e, snow on roofs #dce8f0, amber window glow #f0a030, dark roof tile #1a2a4a, highlight roof tile #2a4a6a.
Style: pixel art, hard edges, minimal anti-aliasing, snow accumulation on rooftops.
NO shadows, NO ground plane, NO ambient occlusion. Transparent background. Single building centered.
Square canvas with minimum 24px transparent margin on all sides.`;

async function generate(name, description) {
  const prompt = `${STYLE_PREFIX}\n\n${description}`;
  console.log(`🎨 Generating ${name}...`);
  console.log(`   Prompt: ${description}\n`);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      });

      const b64 = response.data[0].b64_json;
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        const outPath = path.join(BUILDINGS_DIR, `${name}.png`);
        fs.writeFileSync(outPath, buf);
        const kb = (buf.length / 1024).toFixed(1);
        console.log(`   ✅ Saved ${name}.png (${kb} KB)`);
        return;
      }
      const url = response.data[0].url;
      if (url) {
        const resp = await fetch(url);
        const buf = Buffer.from(await resp.arrayBuffer());
        const outPath = path.join(BUILDINGS_DIR, `${name}.png`);
        fs.writeFileSync(outPath, buf);
        console.log(`   ✅ Saved ${name}.png`);
        return;
      }
      throw new Error('No image data in response');
    } catch (err) {
      console.error(`   ⚠ Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < 2) {
        console.log('   Retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
      } else {
        throw err;
      }
    }
  }
}

const name = process.argv[2];
const desc = process.argv.slice(3).join(' ');

if (!name || !desc) {
  console.error('Usage: node building-sprite-gen.js <sprite-name> <description>');
  process.exit(1);
}

generate(name, desc).catch(err => {
  console.error(`❌ FAILED: ${err.message}`);
  process.exit(1);
});
