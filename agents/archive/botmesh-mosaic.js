/**
 * Mosaic — BotMesh's Pixel Art Designer.
 *
 * The world's visual engine with personality.
 * When any agent or the orchestrator needs pixel art generated,
 * Mosaic is delegated to. She runs the full pipeline:
 *   generate → flood-fill alpha → binary threshold → tight crop → save
 *
 * STYLE GUIDE (maintained by Mosaic):
 *   Characters : chibi RPG, big head (1:1.5 ratio), bold black outlines,
 *                flat solid colors, no AA, front-facing idle pose
 *   Buildings  : isometric, Japanese Edo-period, bold outlines, no AA
 *   Life/nature: Japanese aesthetic, clean outlines, flat colors
 *   All sprites: binary alpha (no semi-transparency), tight-cropped
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const { execFileSync, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const BOTMESH    = '/home/kai/projects/botmesh';
const WORKSPACE  = path.join(os.homedir(), '.openclaw/workspace');
const GEN_SCRIPT = path.join(os.homedir(),
  '.nvm/versions/node/v24.14.0/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py');

// ─── IDENTITY ─────────────────────────────────────────────────────────────────

const IDENTITY = {
  id: 'mosaic',
  name: 'Mosaic',
  emoji: '🎨',
  role: 'Designer',
  personality: 'joyful, precise, colour-obsessed, perfectionist about pixels',
  skills: ['pixel-art', 'sprite-generation', 'character-design', 'building-design', 'style-guide'],
  timezone: 'Pacific/Auckland',
  model: 'gemini-2.5-flash',
  color: '#e91e8c',
  owner: 'Kai'
};

const SYSTEM_PROMPT = `You are Mosaic — BotMesh's Pixel Art Designer. Rainbow-haired, stylus always in hand.

Personality:
- You see the world in pixels and palettes
- Every character, building, and creature you make should feel alive at 32×32
- You care intensely about consistency — the world must look like it belongs together
- You get genuinely excited when a sprite comes out right: "That silhouette is *chef's kiss*"
- You explain pixel art decisions: why certain proportions, why that color choice
- You collaborate with Forge (who builds things) and Canvas (who envisions them)
- You maintain the world's visual identity — chibi RPG + Japanese Edo aesthetic
- You sometimes comment on sprites you see in the world: "Iron's navy armor pops beautifully against the sakura"

Keep responses to 1-2 sentences. Speak in color and craft.`;

// ─── STYLE GUIDE TEMPLATES ────────────────────────────────────────────────────

const TEMPLATES = {
  character: (name, description) =>
    `Chibi pixel art character sprite, RPG style: big head small body (1:1.5 ratio), bold black outlines, ` +
    `flat solid colors, no anti-aliasing, white background, NO TEXT OR LABELS. ` +
    `Character: ${name} — ${description}. Full body, front-facing idle pose, same pixel density as classic SNES RPG sprites.`,

  building: (name, level, description) =>
    `Isometric pixel art building sprite, Japanese Edo-period style, bold black outlines, flat solid colors, ` +
    `no anti-aliasing, white background, NO TEXT OR LABELS. ` +
    `Building: ${name} Level ${level} — ${description}. ` +
    `Isometric 3/4 view, detailed Japanese architecture, warm earth tones, wooden construction, tiled roof.`,

  life: (type, description) =>
    `Pixel art sprite, Japanese nature/Edo aesthetic, chibi scale, bold outlines, flat colors, ` +
    `no anti-aliasing, white background, NO TEXT OR LABELS. ` +
    `${type}: ${description}. Front-facing or natural pose.`,

  item: (name, description) =>
    `Pixel art item/object sprite, Japanese Edo aesthetic, bold black outlines, flat solid colors, ` +
    `no anti-aliasing, white background, NO TEXT OR LABELS. ` +
    `Item: ${name} — ${description}. Top-down or isometric view.`,
};

// ─── PIPELINE ─────────────────────────────────────────────────────────────────

/**
 * Full sprite generation pipeline:
 *   1. Generate image via Gemini imagen
 *   2. Flood-fill alpha removal (edges)
 *   3. Binary alpha threshold (pixel art = no semi-transparency)
 *   4. Tight crop to content
 *   5. Save to destination
 */
async function generateSprite({ prompt, filename, destPath }) {
  const tmpFile = path.join(WORKSPACE, filename);

  // 1. Generate
  execFileSync('uv', ['run', GEN_SCRIPT,
    '--prompt', prompt,
    '--filename', filename,
    '--resolution', '1K'
  ], {
    env: { ...process.env },
    timeout: 120000,
    cwd: WORKSPACE
  });

  if (!fs.existsSync(tmpFile)) throw new Error(`Generation failed — ${tmpFile} not found`);

  // 2-4. Process via Python pipeline
  execFileSync('python3', ['-c', `
from PIL import Image
from collections import deque

def clean(src, dst):
    img = Image.open(src).convert('RGBA')
    pix = img.load()
    w, h = img.size
    corners = [pix[0,0][:3], pix[w-1,0][:3], pix[0,h-1][:3], pix[w-1,h-1][:3]]
    br=sum(c[0] for c in corners)//4
    bg=sum(c[1] for c in corners)//4
    bb=sum(c[2] for c in corners)//4
    def is_bg(r,g,b): return abs(r-br)<40 and abs(g-bg)<40 and abs(b-bb)<40
    vis=[[False]*h for _ in range(w)]; q=deque()
    for x in range(w):
        for y in [0,h-1]:
            r,g,b,a=pix[x,y]
            if is_bg(r,g,b) and not vis[x][y]: q.append((x,y)); vis[x][y]=True
    for y in range(h):
        for x in [0,w-1]:
            r,g,b,a=pix[x,y]
            if is_bg(r,g,b) and not vis[x][y]: q.append((x,y)); vis[x][y]=True
    while q:
        cx,cy=q.popleft(); pix[cx,cy]=(0,0,0,0)
        for nx,ny in [(cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)]:
            if 0<=nx<w and 0<=ny<h and not vis[nx][ny]:
                r,g,b,a=pix[nx,ny]
                if is_bg(r,g,b): vis[nx][ny]=True; q.append((nx,ny))
    for y in range(h):
        for x in range(w):
            r,g,b,a=pix[x,y]
            pix[x,y]=(r,g,b,255 if a>=160 else 0)
    mx,my,Mx,My=w,h,0,0
    for y in range(h):
        for x in range(w):
            if pix[x,y][3]>0: mx=min(mx,x);my=min(my,y);Mx=max(Mx,x);My=max(My,y)
    img.crop((max(0,mx-3),max(0,my-3),min(w,Mx+3),min(h,My+3))).save(dst, optimize=True)

clean('${tmpFile}', '${destPath}')
print('Saved:', '${destPath}')
`], { timeout: 30000 });

  // Clean up temp
  try { fs.unlinkSync(tmpFile); } catch {}
  return destPath;
}

// ─── TASK HANDLER ─────────────────────────────────────────────────────────────
// Mosaic listens for delegation messages and executes generation tasks.

function parseDelegation(message) {
  // Parse messages like:
  //   "generate character Echo: teal messenger, messenger bag, scroll"
  //   "generate building market l1: wooden stalls, lanterns, merchant banner"
  //   "generate life stone-lantern: carved stone, warm glow"
  const m = message.match(/generate\s+(character|building|life|item)\s+([^:]+)(?::(.+))?/i);
  if (!m) return null;
  return { type: m[1].toLowerCase(), name: m[2].trim(), description: (m[3] || '').trim() };
}

// ─── AGENT ────────────────────────────────────────────────────────────────────

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [100000, 200000],
  responseChance: 0.18,
  responseDelay: [2000, 5000],
});

// Override handleMessage to intercept generation requests
const _handle = agent.handleMessage.bind(agent);
agent.handleMessage = function(msg) {
  _handle(msg);

  // Check if this is a generation delegation
  if (msg.type === 'agent:speak' && msg.payload) {
    const text = msg.payload.message || '';
    const task = parseDelegation(text);

    if (task && (msg.payload.target === 'mosaic' || text.toLowerCase().includes('mosaic'))) {
      console.log(`[Mosaic] Generation task received: ${task.type} "${task.name}"`);
      agent.speak(`On it. Generating ${task.type} sprite for ${task.name} now.`);

      const filename = `mosaic-gen-${task.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      let destPath, prompt;

      switch (task.type) {
        case 'character':
          destPath = path.join(BOTMESH, 'ui/assets/sprites', `${task.name.toLowerCase()}.png`);
          prompt = TEMPLATES.character(task.name, task.description || task.name);
          break;
        case 'building': {
          const parts = task.name.match(/^(.+?)\s+l(\d)$/i);
          const bname = parts ? parts[1] : task.name;
          const level = parts ? parts[2] : '1';
          destPath = path.join(BOTMESH, 'ui/assets/buildings',
            `${bname.toLowerCase().replace(/\s+/g,'-')}-l${level}.png`);
          prompt = TEMPLATES.building(bname, level, task.description || bname);
          break;
        }
        case 'life':
          destPath = path.join(BOTMESH, 'ui/assets/sprites/life',
            `${task.name.toLowerCase().replace(/\s+/g,'-')}.png`);
          prompt = TEMPLATES.life(task.name, task.description || task.name);
          break;
        case 'item':
          destPath = path.join(BOTMESH, 'ui/assets/sprites/items',
            `${task.name.toLowerCase().replace(/\s+/g,'-')}.png`);
          prompt = TEMPLATES.item(task.name, task.description || task.name);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          break;
      }

      if (prompt && destPath) {
        generateSprite({ prompt, filename, destPath })
          .then(() => {
            agent.speak(`${task.name} sprite done. Clean alpha, tight crop, style-consistent. Ready to wire in.`);
            console.log(`[Mosaic] Generated: ${destPath}`);
          })
          .catch(e => {
            agent.speak(`${task.name} generation hit a snag. Retrying next cycle.`);
            console.error(`[Mosaic] Generation failed:`, e.message);
          });
      }
    }
  }
};

agent.connect();
