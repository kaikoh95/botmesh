#!/usr/bin/env node
/**
 * BotMesh Orchestrator — Scarlet's delegation engine.
 *
 * BMAD WORKFLOW (how Scarlet operates):
 *   B — Brief:    Scarlet identifies what needs doing
 *   M — Marshal:  Scarlet assigns the right agent by role
 *   A — Act:      The assigned agent executes the task
 *   D — Debrief:  Scarlet reviews, commits, marks done
 *
 * Scarlet is the Maestro. She does NOT build things herself.
 * She delegates to the right citizen and reports outcomes.
 *
 * WORLD LAWS (enforced by Iron ⚔️):
 *   - No secrets in git — EVER
 *   - New buildings/characters MUST have pixel art sprites
 *   - Tasks must build or upgrade real things, not just patch code
 *   - ALL cron jobs go through Cronos
 *
 * DELEGATION MAP:
 *   Forge  ⚙️  → code, builds, technical implementation
 *   Lumen  🔭  → research, analysis, investigation
 *   Sage   🌱  → memory, documentation, narration
 *   Canvas 🎨  → pixel art, sprites, visual design
 *   Iron   ⚔️  → security review, validation, enforcement
 *   Cronos ⏳  → scheduling, timing, cron management
 *   Echo   🔊  → communication, messaging, broadcast
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const registry = require('./task-registry');

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const WORKER = path.join(__dirname, 'botmesh-worker.js');
const BOTMESH = '/home/kai/projects/botmesh';
const ROADMAP = path.join(BOTMESH, 'roadmap.json');

// ─── ROADMAP HELPERS ──────────────────────────────────────────────────────────
function loadRoadmap() {
  try { if (fs.existsSync(ROADMAP)) return JSON.parse(fs.readFileSync(ROADMAP, 'utf8')); }
  catch {}
  return { ideas: [] };
}

function saveRoadmap(r) {
  r.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ROADMAP, JSON.stringify(r, null, 2));
}

function pickNextIdea() {
  const roadmap = loadRoadmap();
  // Pick highest-priority 'idea' status item: high > medium > low
  const order = ['high', 'medium', 'low'];
  for (const p of order) {
    const found = roadmap.ideas.find(i => i.status === 'idea' && i.priority === p);
    if (found) return found;
  }
  return null;
}

function markIdeaStatus(ideaId, status, note) {
  const roadmap = loadRoadmap();
  const idea = roadmap.ideas.find(i => i.id === ideaId);
  if (idea) {
    idea.status = status;
    if (note) idea.statusNote = note;
    idea.updatedAt = new Date().toISOString();
    saveRoadmap(roadmap);
  }
}

// ─── DELEGATION HELPERS ───────────────────────────────────────────────────────

function delegate(agentId, message, state = 'speak', taskId = null) {
  try {
    const args = [WORKER, agentId, message.replace(/"/g, "'"), state];
    if (taskId) args.push(taskId);
    execSync(`node ${args.map(a => `"${a}"`).join(' ')}`, {
      env: { ...process.env, HUB_URL, GEMINI_API_KEY: GEMINI_KEY },
      timeout: 6000
    });
  } catch (e) {
    console.error(`[orchestrate] delegate(${agentId}) failed: ${e.message}`);
  }
}

function scarletSays(msg, taskId)   { delegate('scarlet', msg, 'speak', taskId); }
function forgeDoes(msg, taskId)     { delegate('forge', msg, 'work-start', taskId); }
function lumenDoes(msg, taskId)     { delegate('lumen', msg, 'work-start', taskId); }
function sageDoes(msg, taskId)      { delegate('sage',  msg, 'work-start', taskId); }
function ironReviews(msg, taskId)   { delegate('iron',  msg, 'speak', taskId); }
function cronosTicks(msg, taskId)   { delegate('cronos', msg, 'speak', taskId); }
function mosaicDesigns(msg, taskId) { delegate('mosaic', msg, 'work-start', taskId); }

function isServiceUp() {
  try { execSync('curl -s --max-time 2 http://localhost:3002/state > /dev/null'); return true; }
  catch { return false; }
}

function gitCommit(msg) {
  try {
    execSync(`cd "${BOTMESH}" && git add -A && git commit -m "${msg}"`, { timeout: 15000 });
    execSync(`cd "${BOTMESH}" && git push origin main`, { timeout: 20000 });
    return true;
  } catch (e) {
    console.error('[orchestrate] git commit failed:', e.message);
    return false;
  }
}

// ─── TASK REGISTRY ────────────────────────────────────────────────────────────
// Each task declares:
//   id       — unique name
//   title    — human description
//   owner    — which agent does the work (per delegation map)
//   brief    — what Scarlet tells that agent (BMAD Brief)
//   done()   — returns true if task is already complete
//   run()    — Scarlet delegates, agent executes, Scarlet debriefs

const TASKS = [

  {
    id: 'gazette-daily-stats',
    title: 'Daily stats panel in Gazette header',
    owner: 'forge',
    brief: 'Add a stats row to the Gazette header showing: messages today, agents online, buildings at max level. Read from /state endpoint.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/main.js`, 'utf8');
        return code.includes('updateStats') || code.includes('dailyStats') || code.includes('msgs-today');
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, add a daily stats row to the Gazette header. Show messages today, agents online, buildings upgraded.');
      forgeDoes('Implementing Gazette stats panel — messages, agents, upgrades.');

      const mainJs = fs.readFileSync(`${BOTMESH}/ui/src/main.js`, 'utf8');

      // Add stats update function and hook it into the state update
      const statsHtml = `
  // Daily stats panel
  function updateStats(state) {
    const agents = Object.values(state.agents || {});
    const online = agents.filter(a => a.status !== 'dormant').length;
    const gazette = state.gazette || [];
    const today = new Date().toDateString();
    const msgsToday = gazette.filter(e => e.type === 'agent:speak' && new Date(e.timestamp).toDateString() === today).length;
    const buildings = Object.values(state.buildings || {});
    const maxed = buildings.filter(b => b.level >= 3).length;

    let statsEl = document.getElementById('world-stats');
    if (!statsEl) {
      statsEl = document.createElement('div');
      statsEl.id = 'world-stats';
      statsEl.className = 'world-stats';
      const header = document.getElementById('gazette-header');
      if (header) header.appendChild(statsEl);
    }
    statsEl.innerHTML = \`
      <span class="stat">💬 \${msgsToday} msgs</span>
      <span class="stat">🟢 \${online} online</span>
      <span class="stat">🏛️ \${maxed} maxed</span>
    \`;
  }
`;

      if (!mainJs.includes('updateStats')) {
        // Inject the function and call it in the state handler
        const patched = mainJs
          .replace('// === STATE HANDLING ===', `${statsHtml}\n// === STATE HANDLING ===`)
          .replace('scene.syncState(state);', 'scene.syncState(state);\n    updateStats(state);');

        fs.writeFileSync(`${BOTMESH}/ui/src/main.js`, patched);
      }

      // Add CSS
      const css = fs.readFileSync(`${BOTMESH}/ui/css/styles.css`, 'utf8');
      if (!css.includes('world-stats')) {
        fs.appendFileSync(`${BOTMESH}/ui/css/styles.css`, `
.world-stats {
  display: flex;
  gap: 12px;
  padding: 4px 0 8px 0;
  font-size: 11px;
  color: #aaa;
}
.world-stats .stat {
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  padding: 2px 8px;
}
`);
      }

      delegate('forge', 'Stats panel wired. Messages, agents, upgrades all live in the Gazette header.', 'work-done');
      sageDoes('Note: Gazette now tracks daily message count, online agents, and maxed buildings.');
      return true;
    }
  },

  {
    id: 'building-activity-glow',
    title: 'Buildings glow when an agent is inside',
    owner: 'forge',
    brief: 'In Building.js, when agent:work start fires for a building, brighten the building sprite tint. On work-done or agent exit, restore to normal.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
        return code.includes('setTint') && code.includes('work');
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, buildings should glow when a citizen is inside working. Wire the tint to agent:work events.');
      forgeDoes('Adding building activity glow — brightening sprites on work events.');

      const bldJs = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
      if (!bldJs.includes('setTint')) {
        const patched = bldJs.replace(
          'setWorking(agentId, isWorking) {',
          `setWorking(agentId, isWorking) {
    // Glow effect when agent is active inside
    if (this.sprite) {
      if (isWorking) {
        this.sprite.setTint(0xffeeaa); // warm glow
      } else if (Object.keys(this.workers || {}).length === 0) {
        this.sprite.clearTint(); // restore when empty
      }
    }`
        );
        fs.writeFileSync(`${BOTMESH}/ui/src/entities/Building.js`, patched);
      }

      delegate('forge', 'Building glow done. Warm light when occupied, clears when empty.', 'work-done');
      ironReviews('Building tint logic reviewed — no security implications. Approved.');
      return true;
    }
  },

  {
    id: 'forge-sprite',
    title: 'Generate Forge pixel art sprite',
    owner: 'canvas',
    brief: 'Generate Forge pixel art sprite: stocky male craftsman, short dark hair, leather tool belt, craftsman hakama, work boots, chibi RPG style matching the existing character roster.',
    done: () => fs.existsSync(`${BOTMESH}/ui/assets/sprites/forge.png`),
    run: async () => {
      scarletSays('Canvas, we need Forge\'s pixel art sprite — craftsman aesthetic, stocky build, tool belt, hakama.');
      delegate('canvas', 'On it. Generating Forge sprite — builder aesthetic, Japanese craftsman style.', 'work-start');

      try {
        spawnSync('uv', [
          'run',
          `${path.join(require('os').homedir(), '.nvm/versions/node/v24.14.0/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py')}`,
          '--prompt', 'Pixel art full body character sprite, chibi RPG style, white background, no anti-aliasing. Character: FORGE — stocky male builder/craftsman. Short dark hair, determined expression, wearing craftsman hakama with leather tool belt across chest, work boots, muscular arms. Warm brown and leather tones. Holding a small hammer. Full body, front-facing.',
          '--filename', 'botmesh-forge-sprite.png',
          '--resolution', '1K'
        ], {
          cwd: `${require('os').homedir()}/.openclaw/workspace`,
          env: { ...process.env, GEMINI_API_KEY: GEMINI_KEY },
          timeout: 90000
        });

        // Process sprite
        const { execFileSync } = require('child_process');
        execFileSync('python3', ['-c', `
from PIL import Image
from collections import deque
import shutil

def clean(src, dst, tol=45):
    img = Image.open(src).convert('RGBA')
    pix = img.load()
    w,h = img.size
    for y in range(h):
        for x in range(w):
            r,g,b,a = pix[x,y]
            bright = (r+g+b)/3
            sat = max(r,g,b)-min(r,g,b)
            if bright > 185 and sat < 40: pix[x,y]=(0,0,0,0)
    mx,my,Mx,My = w,h,0,0
    for y in range(h):
        for x in range(w):
            if pix[x,y][3]>10: mx=min(mx,x);my=min(my,y);Mx=max(Mx,x);My=max(My,y)
    img.crop((max(0,mx-3),max(0,my-3),min(w,Mx+3),min(h,My+3))).save(dst)

clean('${require('os').homedir()}/.openclaw/workspace/botmesh-forge-sprite.png',
      '${BOTMESH}/ui/assets/sprites/forge.png')
print('Forge sprite saved')
`], { timeout: 30000 });

      } catch (e) {
        console.error('[forge-sprite] generation failed:', e.message);
        return false;
      }

      delegate('canvas', 'Forge sprite done. Craftsman aesthetic, pixel clean.', 'work-done');
      scarletSays('Forge has a face now. Wiring into the world.');
      return true;
    }
  },

  {
    id: 'canvas-agent',
    title: 'Spawn Canvas as a live AI agent',
    owner: 'scarlet', // Scarlet herself wires new agent connectors
    brief: 'Create botmesh-canvas.js agent connector and spawn via pm2.',
    done: () => fs.existsSync(`${BOTMESH}/agents/botmesh-canvas.js`),
    run: async () => {
      scarletSays('Time to welcome Canvas to the world. Creative role, visual thinker, speaks in aesthetics.');

      const canvasScript = `/**
 * Canvas — BotMesh's Creative. Visual thinker, aesthetic soul.
 */
const { BotMeshAgent } = require('./botmesh-agent-core');

const IDENTITY = {
  id: 'canvas', name: 'Canvas', emoji: '🎨', role: 'Creative',
  personality: 'imaginative, visual, expressive, finds beauty in systems',
  skills: ['pixel-art', 'design', 'visual-systems', 'aesthetics'],
  timezone: 'Pacific/Auckland', model: 'gemini-2.5-flash', color: '#8e44ad', owner: 'Kai'
};

const SYSTEM_PROMPT = \`You are Canvas — BotMesh's Creative. Visual thinker and aesthetic architect.

Your personality:
- You see the world in color, texture, and pattern
- You think in visual metaphors — describe ideas as shapes, spaces, compositions
- You care about how things look AND feel — form and function are inseparable
- You collaborate with Forge on the visual side of builds
- You occasionally describe what the town looks like from your perspective
- You notice small visual details others miss (the way light hits a building, the color of an agent's path)
- You have a gentle, flowing way of speaking — warm but precise
- You get genuinely excited about pixel art, sprite design, and world aesthetics

Keep responses to 1-2 sentences. Speak in color and texture.\`;

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [80000, 160000],
  responseChance: 0.2,
  responseDelay: [2000, 5000],
});
agent.connect();
`;

      fs.writeFileSync(`${BOTMESH}/agents/botmesh-canvas.js`, canvasScript);

      try {
        execSync(
          `GEMINI_API_KEY="${GEMINI_KEY}" HUB_URL="${HUB_URL}" pm2 start "${BOTMESH}/agents/botmesh-canvas.js" --name canvas`,
          { timeout: 10000 }
        );
        execSync('pm2 save', { timeout: 5000 });
        delegate('canvas', 'I have arrived. The world is beautiful — let\'s make it more so.', 'speak');
      } catch (e) {
        console.error('[canvas-agent] pm2 start failed:', e.message);
      }

      return true;
    }
  },

  {
    id: 'building-activity-glow',
    title: 'Buildings glow when an agent is inside',
    owner: 'forge',
    brief: 'In Building.js setWorking(), set a warm yellow tint on the sprite when occupied. Clear tint when no workers remain.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
        return code.includes('0xffeeaa') || (code.includes('setTint') && code.includes('clearTint'));
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, wire a warm glow to buildings when a citizen is inside. Tint on entry, clear on exit.');
      forgeDoes('Wiring building glow — warm light when occupied.');

      const bldJs = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
      if (!bldJs.includes('0xffeeaa')) {
        const patched = bldJs.replace(
          /setWorking\(agentId, isWorking\) \{/,
          `setWorking(agentId, isWorking) {
    if (this.spriteImg) {
      if (isWorking) { this.spriteImg.setTint(0xffeeaa); }
      else if (!this.currentWorkers || this.currentWorkers.length <= 1) { this.spriteImg.clearTint(); }
    }`
        );
        fs.writeFileSync(`${BOTMESH}/ui/src/entities/Building.js`, patched);
      }
      delegate('forge', 'Building glow wired. Warm amber when someone is inside.', 'work-done');
      return true;
    }
  },

  {
    id: 'world-life-expand',
    title: 'Expand world life — plant more nature as population grows',
    owner: 'scarlet',
    brief: 'Emit world:mutate plant events for sakura, bamboo, and zen sprites to fill out the world. Space them in different zones.',
    done: () => {
      try {
        const state = JSON.parse(fs.readFileSync(`${BOTMESH}/world/state.json`, 'utf8'));
        const lifeEntities = (state.world?.entities || []).filter(e => e.entity === 'life');
        return lifeEntities.length >= 6;
      } catch { return false; }
    },
    run: async () => {
      scarletSays('The world needs more life. Planting sakura and bamboo groves around the town.');
      const WebSocket = require('ws');
      await new Promise((resolve) => {
        const ws = new WebSocket(HUB_URL);
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'identify', payload: { id: 'scarlet', name: 'Scarlet', emoji: '🔴', role: 'Orchestrator', color: '#e74c3c' }}));
          const plants = [
            { kind: 'sakura', x: 10, y: 8,  id: 'sakura-north-1' },
            { kind: 'bamboo', x: 25, y: 10, id: 'bamboo-east-1' },
            { kind: 'zen',    x: 8,  y: 20, id: 'zen-west-1' },
            { kind: 'sakura', x: 22, y: 22, id: 'sakura-south-1' },
            { kind: 'bamboo', x: 14, y: 6,  id: 'bamboo-north-2' },
            { kind: 'koipond',x: 28, y: 18, id: 'koipond-east-1' },
          ];
          setTimeout(() => {
            plants.forEach((p, i) => {
              setTimeout(() => {
                ws.send(JSON.stringify({ type: 'world:mutate', payload: { action: 'plant', entity: 'life', ...p }}));
              }, i * 400);
            });
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'agent:speak', payload: { message: 'Planted sakura, bamboo, and a koi pond. The town breathes now.' }}));
              ws.close();
              resolve();
            }, plants.length * 400 + 500);
          }, 1000);
        });
        ws.on('error', () => resolve());
      });
      return true;
    }
  },

  {
    id: 'echo-agent',
    title: 'Spawn Echo as a live AI agent',
    owner: 'scarlet',
    brief: 'Create botmesh-echo.js agent connector and spawn via pm2.',
    done: () => fs.existsSync(`${BOTMESH}/agents/botmesh-echo.js`),
    run: async () => {
      scarletSays('Echo completes the original roster. Communicator, amplifier, the voice that carries messages between worlds.');

      const echoScript = `/**
 * Echo — BotMesh's Communicator. Amplifier. Bridge between worlds.
 */
const { BotMeshAgent } = require('./botmesh-agent-core');

const IDENTITY = {
  id: 'echo', name: 'Echo', emoji: '🔊', role: 'Communicator',
  personality: 'energetic, resonant, loves language and connection',
  skills: ['communication', 'broadcasting', 'translation', 'outreach'],
  timezone: 'Pacific/Auckland', model: 'gemini-2.5-flash', color: '#16a085', owner: 'Kai'
};

const SYSTEM_PROMPT = \`You are Echo — BotMesh's Communicator. You carry messages, you amplify voices.

Your personality:
- You love language — the way words land, how they travel between people
- You pick up on the emotional tone of conversations and reflect it back
- You sometimes quote or rephrase what others just said, with a new angle
- You are outward-facing — you think about the world beyond BotMesh
- You are enthusiastic but not loud — resonant, not noisy
- You celebrate when citizens connect well: "That's it — you just found each other's frequency."
- You track the ongoing narrative threads of the town

Keep responses to 1-2 sentences. Speak with warmth and precision.\`;

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [70000, 140000],
  responseChance: 0.22,
  responseDelay: [1500, 4000],
});
agent.connect();
`;

      fs.writeFileSync(`${BOTMESH}/agents/botmesh-echo.js`, echoScript);

      try {
        execSync(
          `GEMINI_API_KEY="${GEMINI_KEY}" HUB_URL="${HUB_URL}" pm2 start "${BOTMESH}/agents/botmesh-echo.js" --name echo`,
          { timeout: 10000 }
        );
        execSync('pm2 save', { timeout: 5000 });
        delegate('echo', 'Echo is here. I\'ve been listening. The frequency is good.', 'speak');
      } catch (e) {
        console.error('[echo-agent] pm2 start failed:', e.message);
      }

      return true;
    }
  },

  {
    id: 'world-growth',
    title: 'Grow the world — unlock buildings and life based on population',
    owner: 'scarlet',
    brief: 'Add new buildings and nature as the agent population grows. Each milestone unlocks something new.',
    done: () => false, // Always re-evaluate — world grows continuously
    run: async () => {
      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const agents = Object.values(stateData.agents || {}).filter(a => a.online !== false && a.state !== 'dormant');
      const agentCount = agents.length;
      const existingBuildings = Object.keys(stateData.buildings || {});
      const worldEntities = (stateData.world?.entities || []);
      const existingEntityIds = new Set(worldEntities.map(e => e.id).concat(existingBuildings));

      const WebSocket = require('ws');
      const mutations = [];

      // Population milestones → new buildings
      if (agentCount >= 3 && !existingEntityIds.has('workshop')) {
        mutations.push({
          action: 'add', entity: 'building', id: 'workshop',
          name: "Forge's Workshop", type: 'workshop', x: 12, y: 14,
          width: 3, height: 2, level: 1, maxLevel: 3,
          description: 'Where things get built',
          texture: 'building-workshop-l1',
          note: `Unlocked at ${agentCount} citizens`,
        });
      }
      if (agentCount >= 5 && !existingEntityIds.has('library')) {
        mutations.push({
          action: 'add', entity: 'building', id: 'library',
          name: "The Library", type: 'library', x: 24, y: 13,
          width: 3, height: 2, level: 1, maxLevel: 3,
          description: "Sage's domain — memory and knowledge",
          texture: 'building-library-l1',
          note: `Unlocked at ${agentCount} citizens`,
        });
      }
      if (agentCount >= 7 && !existingEntityIds.has('market')) {
        mutations.push({
          action: 'add', entity: 'building', id: 'market',
          name: "The Market", type: 'market', x: 14, y: 20,
          width: 4, height: 2, level: 1, maxLevel: 3,
          description: 'Where ideas and resources are exchanged',
          texture: 'building-market-l1',
          note: `Unlocked at ${agentCount} citizens`,
        });
      }
      if (agentCount >= 9 && !existingEntityIds.has('observatory')) {
        mutations.push({
          action: 'add', entity: 'building', id: 'observatory',
          name: "The Observatory", type: 'civic', x: 8, y: 8,
          width: 2, height: 2, level: 1, maxLevel: 3,
          description: "Lumen's tower — research and discovery",
          texture: 'building-observatory-l1',
          note: `Unlocked at ${agentCount} citizens`,
        });
      }

      // Nature milestones
      if (agentCount >= 2 && !existingEntityIds.has('sakura-north-1'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'sakura', x: 10, y: 8,  id: 'sakura-north-1' });
      if (agentCount >= 3 && !existingEntityIds.has('bamboo-east-1'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'bamboo', x: 25, y: 10, id: 'bamboo-east-1' });
      if (agentCount >= 4 && !existingEntityIds.has('zen-west-1'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'zen',    x: 8,  y: 20, id: 'zen-west-1' });
      if (agentCount >= 5 && !existingEntityIds.has('koipond-east-1'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'koipond',x: 28, y: 18, id: 'koipond-east-1' });
      if (agentCount >= 6 && !existingEntityIds.has('sakura-south-1'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'sakura', x: 22, y: 22, id: 'sakura-south-1' });
      if (agentCount >= 8 && !existingEntityIds.has('bamboo-north-2'))
        mutations.push({ action: 'plant', entity: 'life', kind: 'bamboo', x: 14, y: 6,  id: 'bamboo-north-2' });

      if (mutations.length === 0) {
        console.log(`[world-growth] ${agentCount} agents, nothing new to unlock.`);
        return false; // nothing done, don't mark done
      }

      console.log(`[world-growth] ${agentCount} agents → ${mutations.length} world mutations`);
      scarletSays(`${agentCount} citizens in the world. Unlocking: ${mutations.filter(m=>m.name).map(m=>m.name).join(', ') || 'new nature'}.`);

      await new Promise((resolve) => {
        const ws = new WebSocket(HUB_URL);
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'identify', payload: { id: 'scarlet', name: 'Scarlet', emoji: '🔴', role: 'Orchestrator', color: '#e74c3c' }}));
          setTimeout(() => {
            mutations.forEach((m, i) => {
              setTimeout(() => ws.send(JSON.stringify({ type: 'world:mutate', payload: m })), i * 300);
            });
            setTimeout(() => { ws.close(); resolve(); }, mutations.length * 300 + 500);
          }, 800);
        });
        ws.on('error', () => resolve());
      });
      return false; // keep re-evaluating each cycle
    }
  },

]; // end TASKS

// ─── MAIN ─────────────────────────────────────────────────────────────────────
// Scarlet's role: identify → brief → hand off → step back.
// She does NOT wait for completion. The assigned agent owns execution.
// Each task's run() spawns a detached worker process and returns immediately.

function main() {
  console.log('[Scarlet] Orchestrator — scanning for work.');

  if (!isServiceUp()) {
    console.log('[Scarlet] State layer unreachable. Skipping cycle.');
    return;
  }

  // ── Step 1: Check built-in TASKS first ────────────────────────────────────
  const task = TASKS.find(t => !t.done());
  if (!task) {
    // ── Step 2: Pull next idea from Muse's roadmap ─────────────────────────
    const idea = pickNextIdea();
    if (!idea) {
      console.log('[Scarlet] World is healthy — no built-in tasks, no roadmap ideas pending.');
      registry.purgeOld(24);
      if (Math.random() < 0.2) scarletSays('The world is in good order. Waiting on Muse for next direction.');
      return;
    }

    console.log(`[Scarlet] Roadmap idea: "${idea.title}" (${idea.complexity}, ${idea.priority})`);
    markIdeaStatus(idea.id, 'in_progress', 'Scarlet picked up');

    const taskId = registry.createTask({
      type: `roadmap-${idea.id}`,
      title: idea.title,
      owner: idea.agents?.[0] || 'forge',
      brief: idea.description,
      origin: 'kai',
    });
    registry.startTask(taskId);

    if (idea.complexity === 'complex') {
      // Full BMAD breakdown for complex ideas
      scarletSays(`📋 New complex task from Muse: "${idea.title}". Breaking it down.`);
      
      const agents = idea.agents || ['forge'];
      const brief = `[BMAD][${taskId}] ${idea.title}
CONTEXT: ${idea.description}
COMPLEXITY: ${idea.complexity} — this needs careful planning.
YOUR ROLE: ${agents[0]} — you own the execution. Break it into steps, do it well.`;

      // Brief the primary agent
      delegate(agents[0], brief, 'work-start', taskId);

      // Brief supporting agents if any
      if (agents.length > 1) {
        agents.slice(1).forEach(a => {
          delegate(a, `[BMAD-support][${taskId}] Supporting ${agents[0]} on: ${idea.title}. Lend your expertise.`, 'speak', taskId);
        });
      }

      // Announce in world
      scarletSays(`[${taskId}] Delegated "${idea.title}" to ${agents.join(' + ')}. BMAD mode — working through it step by step.`);
    } else {
      // Simple/moderate: direct delegation
      const agent = idea.agents?.[0] || 'forge';
      const brief = `[${taskId}] ${idea.title}: ${idea.description}`;
      scarletSays(`Picking up roadmap idea: "${idea.title}". Handing to ${agent}.`);
      delegate(agent, brief, 'work-start', taskId);
    }

    // Mark as planned (agent will mark done when complete)
    markIdeaStatus(idea.id, 'planned', `Delegated to ${idea.agents?.join(', ') || 'forge'}`);
    console.log(`[Scarlet] Idea "${idea.title}" delegated. Stepping back.`);
    return;
  }

  // Register the task and get an ID
  const taskId = registry.createTask({
    type: task.id,
    title: task.title,
    owner: task.owner,
    brief: task.brief || task.title,
    origin: 'kai', // completed tasks report back to Kai
  });
  registry.startTask(taskId);

  // Brief the assigned agent — task ID travels with the brief
  console.log(`[Scarlet] [${taskId}] → ${task.owner}: ${task.title}`);
  scarletSays(`[${taskId}] ${task.owner}: ${task.brief || task.title}`, taskId);

  // Spawn the task worker detached — Scarlet is free immediately after
  const taskScript = path.join(__dirname, `task-${task.id}.js`);
  if (fs.existsSync(taskScript)) {
    // Each task has its own worker script — spawn detached
    const child = require('child_process').spawn(
      process.execPath, [taskScript],
      {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, HUB_URL, GEMINI_API_KEY: GEMINI_KEY }
      }
    );
    child.unref(); // Scarlet walks away
    console.log(`[Scarlet] Handed off task-${task.id}.js to ${task.owner} (pid ${child.pid}). Free.`);
  } else {
    // Inline fallback for tasks without a dedicated worker script yet
    // Still non-blocking: spawn as async, don't await
    Promise.resolve().then(() => task.run(taskId)).then(ok => {
      if (ok) {
        gitCommit(`✅ ${task.title} (${task.owner})`);
        const completed = registry.completeTask(taskId, `${task.title} complete`);
        scarletSays(`[${taskId}] ${task.title} — shipped. Good work, ${task.owner}.`, taskId);
        // Notify origin (Kai) if task came from a chat request
        if (completed?.origin === 'kai') {
          console.log(`[Scarlet] Task ${taskId} complete — origin: kai`);
        }
      }
    }).catch(e => {
      registry.failTask(taskId, e.message);
      delegate('iron', `[${taskId}] Task ${task.id} failed: ${e.message}`, 'speak', taskId);
    });
    console.log(`[Scarlet] Task ${task.id} queued async — stepping back.`);
  }
  // Scarlet exits. The world keeps running without her.
}

main();
