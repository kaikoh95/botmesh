#!/usr/bin/env node
// Generate moat water tile and bridge tile sprites using OpenAI gpt-image-1
const OpenAI = require('openai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SPRITES_DIR = path.join(__dirname, '..', 'ui', 'assets', 'sprites', 'life');

async function generateSprite(name, prompt, width, height) {
  console.log(`Generating ${name} sprite...`);
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "high",
  });

  const imgData = response.data[0];
  let buffer;
  if (imgData.b64_json) {
    buffer = Buffer.from(imgData.b64_json, 'base64');
  } else {
    const resp = await fetch(imgData.url);
    buffer = Buffer.from(await resp.arrayBuffer());
  }

  const outPath = path.join(SPRITES_DIR, `${name}.png`);
  await sharp(buffer)
    .resize(width, height, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(outPath);

  console.log(`Saved ${outPath} (${width}x${height})`);
}

async function main() {
  fs.mkdirSync(SPRITES_DIR, { recursive: true });

  await generateSprite('moat', 
    `Isometric pixel art water tile for a winter moat/canal.
Semi-frozen icy water surface, pale blue-white with subtle cracks and thin ice patterns.
Japanese Shirakawa-go canal aesthetic. Cool blue-gray tones.
Diamond/rhombus shape matching isometric grid (2:1 width:height ratio).
Transparent background outside the diamond shape.
The diamond should fill the entire image corner to corner.
Style: 32-bit pixel art, clean edges, no anti-aliasing.
Single tile, top-down isometric view.`,
    64, 32
  );

  await generateSprite('bridge',
    `Isometric pixel art small wooden bridge tile crossing water.
Aged dark wooden planks, slightly snow-dusted. Japanese style arched footbridge.
Diamond/rhombus shape matching isometric grid (2:1 width:height ratio).
Transparent background outside the diamond shape.
The diamond should fill the entire image corner to corner.
Winter Japanese village aesthetic, Shirakawa-go style.
Style: 32-bit pixel art, clean edges, no anti-aliasing.
Single tile, top-down isometric view.`,
    64, 32
  );

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
