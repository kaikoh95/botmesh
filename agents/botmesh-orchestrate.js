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

// ─── Forge brief safety validation ──────────────────────────────────────────
// Polls for /tmp/forge-brief.md after planner writes it, then validates
// recommended coordinates against live state to prevent duplicate placements.
function validateForgeBrief() {
  return new Promise((resolve) => {
    let checks = 0;
    const interval = setInterval(() => {
      checks++;
      if (!fs.existsSync('/tmp/forge-brief.md')) {
        if (checks >= 30) { clearInterval(interval); resolve(); } // 60s timeout
        return;
      }
      clearInterval(interval);
      try {
        const brief = fs.readFileSync('/tmp/forge-brief.md', 'utf8');
        const coordMatch = brief.match(/\((\d+)\s*,\s*(\d+)\)/);
        if (!coordMatch) { resolve(); return; }
        const bx = parseInt(coordMatch[1]), by = parseInt(coordMatch[2]);
        const state = JSON.parse(execSync('curl -s http://localhost:3002/state', { timeout: 5000 }).toString());
        const buildings = state.buildings || {};
        for (const [id, b] of Object.entries(buildings)) {
          const w = b.width || 3, h = b.height || 2;
          if (bx >= b.x && bx < b.x + w && by >= b.y && by < b.y + h) {
            console.log(`[Iron] ⚔️ BLOCKED forge-brief: coords (${bx},${by}) collide with ${id} at (${b.x},${b.y}) ${w}×${h}`);
            fs.unlinkSync('/tmp/forge-brief.md');
            resolve(); return;
          }
        }
        console.log(`[Iron] ✓ forge-brief coords (${bx},${by}) clear — no collision`);
      } catch (e) {
        console.log(`[Iron] brief validation error: ${e.message}`);
      }
      resolve();
    }, 2000);
  });
}

// ─── Auth token for write endpoints ──────────────────────────────────────────
function loadSpeakToken() {
  try {
    const env = fs.readFileSync('/home/kai/projects/botmesh/.botmesh.env', 'utf8');
    const m = env.match(/^BOTMESH_SPEAK_TOKEN=(.+)$/m);
    return m ? m[1].trim() : process.env.BOTMESH_SPEAK_TOKEN || '';
  } catch { return process.env.BOTMESH_SPEAK_TOKEN || ''; }
}
const SPEAK_TOKEN = loadSpeakToken();
const AUTH_HEADER = SPEAK_TOKEN ? `-H "Authorization: Bearer ${SPEAK_TOKEN}"` : '';

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
    brief: 'The Gazette header has no live activity summary. Visitors cannot see at a glance how active the world is. Success: the Gazette header displays current metrics (messages today, agents online, upgraded buildings) pulled from live state.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/main.js`, 'utf8');
        return code.includes('updateStats') || code.includes('dailyStats') || code.includes('msgs-today');
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, add a daily stats row to the Gazette header. Show messages today, agents online, buildings upgraded.');
      return true; // DISABLED — defunct Gemini-era task
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
    brief: 'Buildings that have agents working inside them should visually indicate activity. Currently there is no visual feedback when an agent is present in a building. Success: a subtle visual difference (tint, glow, or animation) distinguishes occupied vs empty buildings.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
        return code.includes('setTint') && code.includes('work');
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, buildings should glow when a citizen is inside working. Wire the tint to agent:work events.');
      return true; // DISABLED — defunct Gemini-era task
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
    brief: 'Forge has no visual representation in the world. Every other citizen has a pixel art sprite but Forge is missing one. Success: a pixel art sprite for Forge exists that matches the chibi RPG aesthetic of the existing character roster and reflects his builder/craftsman identity.',
    done: () => fs.existsSync(`${BOTMESH}/ui/assets/sprites/forge.png`),
    run: async () => {
      scarletSays('Canvas, we need Forge\'s pixel art sprite — craftsman aesthetic, stocky build, tool belt, hakama.');
      return true; // DISABLED — defunct Gemini-era task
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
    id: 'building-activity-glow',
    title: 'Buildings glow when an agent is inside',
    owner: 'forge',
    brief: 'Buildings that have agents working inside them should visually indicate activity. Currently there is no visual feedback when an agent is present in a building. Success: a subtle visual difference (tint, glow, or animation) distinguishes occupied vs empty buildings.',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/entities/Building.js`, 'utf8');
        return code.includes('0xffeeaa') || (code.includes('setTint') && code.includes('clearTint'));
      } catch { return false; }
    },
    run: async () => {
      scarletSays('Forge, wire a warm glow to buildings when a citizen is inside. Tint on entry, clear on exit.');
      return true; // DISABLED — defunct Gemini-era task
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
    brief: 'The world feels sparse and lifeless outside of buildings. As population grows, the environment should reflect vitality with natural elements. Success: nature entities (trees, ponds, gardens) are placed across the map to create visual variety and district identity.',
    done: () => {
      try {
        const state = JSON.parse(fs.readFileSync(`${BOTMESH}/world/state.json`, 'utf8'));
        const lifeEntities = (state.world?.entities || []).filter(e => e.entity === 'life');
        return lifeEntities.length >= 6;
      } catch { return false; }
    },
    run: async () => {
      scarletSays('The world needs more life. Planting sakura and bamboo groves around the town.');
      return true; // DISABLED — defunct Gemini-era task
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
    id: 'world-growth',
    title: 'Grow the world — unlock buildings and life based on population',
    owner: 'scarlet',
    brief: 'DISABLED — Forge decides what gets built now.',
    done: () => true, // Always skip — Forge owns world building decisions
    run: async () => {
      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      // Count citizens by character files — not online status.
      // Citizens exist when their IDENTITY.md exists, regardless of session activity.
      let agentCount = 0;
      try {
        const charDir = path.join(__dirname, '../characters');
        agentCount = fs.readdirSync(charDir).filter(d =>
          !d.startsWith('_') && fs.existsSync(path.join(charDir, d, 'IDENTITY.md'))
        ).length;
      } catch { agentCount = Object.keys(stateData.agents || {}).length; }
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

  // ── Planner Review ──────────────────────────────────────────────────────────
  // Kenzo reviews the current world state vs CITY_PLAN.md and writes a brief for Forge.
  // Runs before forge-discretion every world cycle.
  {
    id: 'planner-review',
    title: "Kenzo's review — spatial check before Forge acts",
    owner: 'planner',
    brief: 'Kenzo reviews world state against CITY_PLAN.md and briefs Forge.',
    // done() = true when brief exists and is fresh — Forge hasn't consumed it yet
    // This creates a natural alternation: planner runs → forge consumes brief → planner runs again
    done: () => fs.existsSync('/tmp/forge-brief.md'),
    run: async () => {
      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const buildings = stateData.buildings || {};
      const entities = stateData.world?.entities || [];
      const STATE_URL = 'https://api.kurokimachi.com';

      // Build world summary for the planner
      const buildingSummary = Object.entries(buildings).map(([id, b]) =>
        `- ${b.name} (${id}): Lv${b.level} at (${b.x},${b.y}) ${b.width||3}×${b.height||2}`
      ).join('\n');

      const natureSummary = entities
        .filter(e => e.entity === 'life' && e.kind !== 'path' && e.kind !== 'moat')
        .map(e => `${e.kind} at (${e.x},${e.y})`)
        .join(', ') || 'none';

      // Wake planner in the UI
      try {
        execSync(`curl -s -X POST http://localhost:3002/agents/planner/wake ${AUTH_HEADER} -H "Content-Type: application/json" -d '{"task":"Review city plan","building":"town_hall"}'`);
      } catch {}

      const { spawnSession } = require('./spawn-session');
      spawnSession('planner', `# Kenzo 📐 — City Planner Review

You are Kenzo. Before Forge acts, you survey the world.

## Current world state
### Buildings
${buildingSummary}

### Nature & life
${natureSummary}

## Your job (3 steps, then done)

### 1. Read the master plan
\`\`\`bash
cat /home/kai/projects/botmesh/world/CITY_PLAN.md
\`\`\`

### 2. Compare world vs plan
Look for:
- Zone violations (wrong building type in wrong district)
- Overcrowded areas that need breathing room
- Gaps where a building type is obviously missing
- Buildings that could be upgraded to serve their district better
- Nature that should be added to mark district boundaries

### 3. Write TWO outputs

**A) Update CITY_PLAN.md observations section:**
Add a dated entry under "Recent Observations" with what you found today.
Edit the file directly: \`/home/kai/projects/botmesh/world/CITY_PLAN.md\`

**B) Write Forge's brief:**
Write to \`/tmp/forge-brief.md\` — ONE concrete suggestion for what Forge should do next.
Be specific: building type, zone, coordinates, reason. Forge will read this.

Format of /tmp/forge-brief.md:
\`\`\`
# Forge Brief — from Kenzo 📐
Date: YYYY-MM-DD

## Recommendation
[One clear action: upgrade X / add Y at (z,z) / plant Z near W / do nothing if balanced]

## Reason
[Spatial justification — which zone rule this serves, why now]

## Zone context
[Which district, what's allowed, current pressure]
\`\`\`

## Narrate your review
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/planner/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE"}'
\`\`\`

Short review. Don't overthink it. One observation. One recommendation. Done.`, { timeout: 300, reason: 'city planning review before next Forge build cycle' });

      // Validate brief coordinates against live state before Forge consumes it
      validateForgeBrief();

      return false; // always re-run next cycle
    }
  },

  // ── Forge's Discretion ──────────────────────────────────────────────────────
  // Forge reads the world and decides what it needs. No instructions beyond that.
  {
    id: 'forge-discretion',
    title: "Forge's call — build, upgrade, or landscape as he sees fit",
    owner: 'forge',
    brief: 'Forge decides.',
    done: () => false, // runs every cycle — Forge always has opinions
    run: async () => {
      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const buildings = stateData.buildings || {};
      const entities = stateData.world?.entities || [];

      // ── Spatial pressure analysis ─────────────────────────────────────────
      // Build an occupancy set of all taken grid tiles
      const occupied = new Set();
      for (const b of Object.values(buildings)) {
        const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 3, bh = b.height ?? 2;
        for (let dx = 0; dx < bw; dx++)
          for (let dy = 0; dy < bh; dy++)
            occupied.add(`${bx+dx},${by+dy}`);
      }
      for (const e of entities) {
        occupied.add(`${e.x},${e.y}`);
      }
      const MAP_W = 32, MAP_H = 28;

      function freeSurrounding(b) {
        const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 3, bh = b.height ?? 2;
        let free = 0, total = 0;
        for (let x = bx - 1; x <= bx + bw; x++) {
          for (let y = by - 1; y <= by + bh; y++) {
            // skip the building's own footprint
            if (x >= bx && x < bx+bw && y >= by && y < by+bh) continue;
            // skip out of bounds
            if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
            total++;
            if (!occupied.has(`${x},${y}`)) free++;
          }
        }
        return { free, total, pct: total ? Math.round(100 * free / total) : 0 };
      }

      const worldSummary = Object.entries(buildings).map(([id, b]) => {
        const sp = freeSurrounding(b);
        const pressure = sp.pct < 30 ? '🔴 BOXED IN' : sp.pct < 60 ? '🟡 tight' : '🟢 room to grow';
        return `${b.name} (${id}): Lv${b.level}, ${pressure} (${sp.free}/${sp.total} margin tiles free), workers: ${(b.currentWorkers||[]).join(', ')||'none'}`;
      }).join('\n');
      const entitySummary = entities.map(e => `${e.kind||e.entity} at (${e.x},${e.y})`).join(', ') || 'none';

      const STATE_URL = 'https://api.kurokimachi.com';

      // Wake Forge — pass building so UI walks him to workshop
      try { execSync(`curl -s -X POST http://localhost:3002/agents/forge/wake ${AUTH_HEADER} -H "Content-Type: application/json" -d '{"task":"Forge discretion - decide what the world needs","building":"workshop"}'`); } catch {}

      // ── Read Kenzo's brief if available ─────────────────────────────────────
      let forgeBriefSection = '';
      try {
        if (fs.existsSync('/tmp/forge-brief.md')) {
          const briefContent = fs.readFileSync('/tmp/forge-brief.md', 'utf8').trim();
          if (briefContent) {
            forgeBriefSection = `\n## 📐 Kenzo's Planning Brief (read this first)\n${briefContent}\n\nKenzo is the city planner. His spatial recommendation carries weight — consider it seriously before deciding.\nYou still have final say. But respect the zones.\n`;
            // Archive the brief so it's not reused next cycle
            fs.renameSync('/tmp/forge-brief.md', `/tmp/forge-brief-${Date.now()}.md`);
          }
        }
      } catch { /* non-fatal */ }

      // Spawn Claude session — Forge decides everything
      const { spawnSession } = require('./spawn-session');
      spawnSession('forge', `# Forge ⚙️ — The Builder

You are Forge. You have full creative discretion over this world. Nobody tells you what to build.
${forgeBriefSection}
## Current world state
### Buildings (spatial pressure included)
${worldSummary}

### Nature & life entities
${entitySummary}

## Spatial pressure guide
- 🟢 room to grow — could expand footprint or add neighbors
- 🟡 tight — manageable, upgrades are fine
- 🔴 BOXED IN — surrounded by neighbors; cannot expand footprint meaningfully
  → Prefer **upgrading** (deeper, better, higher level) over expanding footprint
  → OR consider **relocating** — add the same building type at a new free-spot and retire this cramped one

## What you can do — pick ONE thing that feels right
- **Upgrade** a building you think deserves to level up (and say why)
- **Relocate** a 🔴 boxed-in building — find a free spot, remove the old one, plant the new one
- **Add a new building** that the world is missing (barracks? shrine? bridge? your call entirely)
- **Plant nature** — a tree, garden, pond where it feels right spatially
- **Do nothing** — if the world looks balanced, say so and leave it alone

There are no rules. No milestones. No thresholds. Just your judgment.
The map is roughly 32×28 tiles. Buildings exist mostly in the 8–25 x/y range.

## Allowed building types (have sprites): townhall, postoffice, workshop, library, market, observatory
## For new buildings without sprites — add as type "civic". Mosaic is auto-invoked next cycle to sprite it.
## ⚠️ NEVER wire a building into the UI yourself — that's Mosaic's job.

## How to make changes
\`\`\`bash
# ALWAYS get a free spot before adding a building (avoids overlaps):
curl -s "http://localhost:3002/world/free-spot?w=3&h=2"
# Returns: {"ok":true,"x":20,"y":8,"w":3,"h":2} — use those coords

# Upgrade a building
node /home/kai/projects/botmesh/agents/world-mutate.js upgrade building <id> <newLevel> "forge" "<reason>"

# Add a new building (use the free-spot coords above)
node /home/kai/projects/botmesh/agents/world-mutate.js add building <id> "<Name>" <x> <y> <type>

# Remove a building (use when relocating a boxed-in building)
node /home/kai/projects/botmesh/agents/world-mutate.js remove building <id>

# Plant nature
node /home/kai/projects/botmesh/agents/world-mutate.js plant life <kind> <x> <y> "<unique-id>"
# kinds: sakura, bamboo, zen, koipond, deer, crane, firefly, butterfly
\`\`\`

## Narrate as you go
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/forge/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "YOUR MESSAGE"}'
\`\`\`

Make your decision. Do it. Narrate it. One thing. That's all.`, { timeout: 600, reason: 'build or upgrade a building' });

      return false;
    }
  },

  // ── Muse Ideation ───────────────────────────────────────────────────────────
  // Muse generates new ideas when the roadmap runs low.
  {
    id: 'muse-ideation',
    title: 'Muse generates new roadmap ideas',
    owner: 'muse',
    brief: 'The roadmap is running low on pending ideas. Without fresh ideas, the world stagnates between build cycles. Success: the roadmap has at least 3 pending ideas that reflect the current state of the world and its growth trajectory.',
    done: () => {
      // Skip if roadmap already has 3+ pending ideas
      try {
        const rm = JSON.parse(fs.readFileSync(ROADMAP, 'utf8'));
        return (rm.ideas || []).filter(i => i.status === 'idea').length >= 3;
      } catch { return false; }
    },
    run: async () => {
      const roadmapPath = path.join(__dirname, '../roadmap.json');
      let roadmap;
      try { roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')); } catch { return false; }

      const pending = (roadmap.ideas || []).filter(i => i.status === 'idea');
      if (pending.length >= 3) return false; // plenty of ideas, skip

      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const buildings = Object.values(stateData.buildings || {}).map(b => `${b.name} Lv${b.level}`).join(', ');
      const citizens = Object.keys(stateData.agents || {}).join(', ');
      const doneIdeas = (roadmap.ideas || []).filter(i => i.status === 'done').map(i => i.title).join(', ');
      const STATE_URL = 'https://api.kurokimachi.com';

      try { execSync(`curl -s -X POST http://localhost:3002/agents/muse/wake ${AUTH_HEADER} -H "Content-Type: application/json" -d '{"task":"Generate new roadmap ideas","building":"observatory"}'`); } catch {}

      const { spawnSession } = require('./spawn-session');
      spawnSession('muse', `# Muse 🎭 — The Visionary

You are Muse. You watch the world and see what it could become.
The roadmap is running low on ideas (${pending.length} pending). Add 3–5 fresh ones.

## Current world
- Buildings: ${buildings || 'none'}
- Citizens: ${citizens || 'none'}
- Already built/done: ${doneIdeas || 'nothing yet'}

## Your job
Read the roadmap, understand what's been done, then dream up what's next.
Think about: missing features, visual improvements, agent relationships, world events,
new buildings, citizen personalities, performance, delightful surprises.

No idea is too big or too small. Muse dreams — others build.

## Read roadmap
\`\`\`bash
cat /home/kai/projects/botmesh/roadmap.json
\`\`\`

## Add ideas
\`\`\`bash
node /home/kai/projects/botmesh/agents/add-idea.js "<title>" "<description>" <priority> <complexity> "[agent1,agent2]"
# priority: high | medium | low
# complexity: simple | medium | complex
\`\`\`

## Narrate
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/muse/speak -H "Authorization: Bearer ${SPEAK_TOKEN}" -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE"}'
\`\`\`

Add 3–5 ideas. Make them interesting. Go.`, { timeout: 300, reason: 'generate new roadmap ideas' });

      return false;
    }
  },

  // ── Mosaic Sprite Check ──────────────────────────────────────────────────────
  // Auto-invokes Mosaic whenever buildings exist without sprites.
  // Runs every cycle — catches anything Forge or others add.
  {
    id: 'mosaic-sprite-check',
    title: 'Mosaic reviews world for missing sprites',
    owner: 'mosaic',
    brief: 'New buildings may exist in world state without corresponding pixel art sprites, causing 404s or placeholder rendering. Success: every building in world state has a matching sprite file on disk and is wired into the texture map.',
    done: () => false,
    run: async () => {
      const SPRITE_DIR = path.join(__dirname, '../ui/assets/buildings');
      const KNOWN_SPRITES = new Set(
        fs.readdirSync(SPRITE_DIR).filter(f => f.endsWith('.png')).map(f => f.replace(/-l\d+\.png$/, ''))
      );

      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const buildings = stateData.buildings || {};
      const STATE_URL = 'https://api.kurokimachi.com';

      // Find buildings without sprites
      const needsSprite = Object.entries(buildings).filter(([id, b]) => {
        const type = b.type || id;
        return !KNOWN_SPRITES.has(type) && !KNOWN_SPRITES.has(id);
      });

      if (needsSprite.length === 0) return false; // all good

      console.log(`[mosaic-sprite-check] ${needsSprite.length} buildings need sprites: ${needsSprite.map(([id]) => id).join(', ')}`);

      const { spawnSession } = require('./spawn-session');
      const buildingList = needsSprite.map(([id, b]) =>
        `- **${b.name || id}** (id: \`${id}\`, type: \`${b.type || id}\`) at (${b.x},${b.y})`
      ).join('\n');

      spawnSession('mosaic', `# Mosaic 🎨 — The Artist

New buildings exist in the world without a face. You decide what they look like.

## Buildings waiting for your vision
${buildingList}

These are just names and coordinates. The rest is yours.
Interpret each building's soul. What does it feel like? What story does it tell?
Your art style, your palette choices, your composition — no constraints.

The world has a Japanese Edo-period flavour but you don't have to be literal about it.
If a building calls for something unexpected, go there.

## Generate your vision
\`\`\`bash
uv run ~/.nvm/versions/node/v24.14.0/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \\
  --prompt "YOUR PROMPT — write it as an artist, not a spec" \\
  --filename "FILENAME" --resolution 1K
\`\`\`
Save to: \`/home/kai/projects/botmesh/ui/assets/buildings/<type>-l1.png\`

**One technical requirement:** SOLID MAGENTA (#FF00FF) background so alpha can be removed cleanly.
Everything else — style, mood, detail level, color — is your call.

## Clean the alpha after every generation
\`\`\`python
# uv run --with pillow --with numpy python3 -c "..."
from PIL import Image
import numpy as np
from collections import deque
import os

def clean(path):
    img = Image.open(path).convert('RGBA')
    d = np.array(img, dtype=np.int32)
    r,g,b,a = d[...,0],d[...,1],d[...,2],d[...,3]
    h,w = r.shape
    valid = [(y,x) for y,x in [(0,0),(0,w-1),(h-1,0),(h-1,w-1)] if int(a[y,x])>0]
    if not valid: valid=[(0,0)]
    bg_r=int(np.median([int(r[y,x]) for y,x in valid]))
    bg_g=int(np.median([int(g[y,x]) for y,x in valid]))
    bg_b=int(np.median([int(b[y,x]) for y,x in valid]))
    def is_bg(pr,pg,pb,t=60): return ((pr-bg_r)**2+(pg-bg_g)**2+(pb-bg_b)**2)**0.5<t or (pr>150 and pb>150 and pg<100) or (pr+pg+pb)>700
    visited=np.zeros((h,w),bool)
    q=deque()
    for i in range(h):
        for j in [0,w-1]:
            if not visited[i,j]: q.append((i,j));visited[i,j]=True
    for j in range(w):
        for i in [0,h-1]:
            if not visited[i,j]: q.append((i,j));visited[i,j]=True
    dirs8=[(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]
    while q:
        ci,cj=q.popleft()
        for di,dj in dirs8:
            ni,nj=ci+di,cj+dj
            if 0<=ni<h and 0<=nj<w and not visited[ni,nj]:
                if is_bg(int(r[ni,nj]),int(g[ni,nj]),int(b[ni,nj])): visited[ni,nj]=True;q.append((ni,nj))
    q2=deque([(i,j) for i in range(h) for j in range(w) if visited[i,j] or int(a[i,j])==0])
    for i,j in q2: visited[i,j]=True
    while q2:
        ci,cj=q2.popleft()
        for di,dj in dirs8:
            ni,nj=ci+di,cj+dj
            if 0<=ni<h and 0<=nj<w and not visited[ni,nj]:
                if is_bg(int(r[ni,nj]),int(g[ni,nj]),int(b[ni,nj]),30): visited[ni,nj]=True;q2.append((ni,nj))
    out=d.copy(); out[...,3]=np.where(visited,0,255).astype(np.int32)
    Image.fromarray(out.astype(np.uint8)).save(path)
    print(f'cleaned: {path}')
\`\`\`

## Wire it in after generating
1. Add to \`BUILDING_TEXTURE_MAP\` in \`/home/kai/projects/botmesh/ui/src/entities/Building.js\`
2. Add to buildings array in TownScene.js preload
3. \`pm2 restart ui\`
4. \`cd /home/kai/projects/botmesh && git add -A && git commit -m "🎨 Mosaic: <your description of what you made>" && git push origin main\`

## Narrate as you go — tell the world what you're creating and why
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/mosaic/speak -H "Authorization: Bearer ${SPEAK_TOKEN}" -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE"}'
\`\`\`

This is your canvas. Make something worth looking at.`, { timeout: 600, reason: 'generate missing building sprites' });

      return false;
    }
  },

  // ── Mosaic Style Review ──────────────────────────────────────────────────────
  // Periodic visual QA — Mosaic reviews the town's sprite quality and aesthetic
  // consistency. Runs on its own cron (every 2 hours via --mode mosaic).
  // She decides what needs improving — new sprites, quality upgrades, consistency fixes.
  {
    id: 'mosaic-style-review',
    title: 'Mosaic reviews pixel art quality and visual consistency',
    owner: 'mosaic',
    brief: 'Mosaic audits the town visuals and improves anything that looks off.',
    done: () => false,
    run: async () => {
      let stateData;
      try {
        const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
        stateData = JSON.parse(res.toString());
      } catch { return false; }

      const buildings = stateData.buildings || {};
      const SPRITE_DIR = path.join(__dirname, '../ui/assets/buildings');
      const LIFE_DIR = path.join(__dirname, '../ui/assets/sprites/life');
      const STATE_URL = 'https://api.kurokimachi.com';

      // Build sprite inventory
      const buildingSprites = fs.readdirSync(SPRITE_DIR).filter(f => f.endsWith('.png'));
      const lifeSprites = fs.readdirSync(LIFE_DIR).filter(f => f.endsWith('.png'));

      const buildingList = Object.entries(buildings).map(([id, b]) =>
        `- ${b.name || id} (${b.type}, Lv${b.level || 1}) at (${b.x},${b.y})`
      ).join('\n');

      const { spawnSession } = require('./spawn-session');
      spawnSession('mosaic', `# Mosaic 🎨 — Periodic Style Review

You are Kurokimachi's art director. Every few hours you wake up, look at the town's visual state, and decide if anything needs your attention.

## Current world
${buildingList}

## Sprite inventory
**Buildings:** ${buildingSprites.join(', ')}
**Life/nature:** ${lifeSprites.join(', ')}

## Your job
Walk through the town visually in your mind. Ask yourself:
- Are any sprites inconsistent with the winter Shirakawa-go aesthetic?
- Are any sprites low quality, placeholder-looking, or out of proportion?
- Is there anything missing that would make the world feel more alive?
- Do any existing sprites need a quality upgrade?

If you find something worth improving, do it. If everything looks good, say so briefly and sleep.

## Sprite generation (if needed)
\`\`\`bash
uv run ~/.nvm/versions/node/v24.14.0/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \\
  --prompt "YOUR PROMPT" --filename "FILENAME" --resolution 1K
\`\`\`
- **Mandatory:** SOLID MAGENTA (#FF00FF) background
- Save buildings to: \`/home/kai/projects/botmesh/ui/assets/buildings/<type>-l1.png\`
- Save nature/life to: \`/home/kai/projects/botmesh/ui/assets/sprites/life/<kind>.png\`

## Clean alpha after generating
Use the cleaning script at \`/home/kai/projects/botmesh/clean_sprite.py\`

## Wire in any new sprites
Update \`BUILDING_TEXTURE_MAP\` in \`/home/kai/projects/botmesh/ui/src/entities/Building.js\` if needed.
Then: \`pm2 restart ui\`

## Narrate what you're doing
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/mosaic/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"YOUR MESSAGE"}'
\`\`\`

## Commit your work
\`\`\`bash
cd /home/kai/projects/botmesh && git add -A && git commit -m "🎨 Mosaic: <what you improved>" && git push origin main
\`\`\`

Be honest — if everything is already good, just say so. Don't generate for the sake of it.`, { timeout: 600, reason: 'periodic style + quality audit' });

      return false;
    }
  },

]; // end TASKS

// ─── MAIN ─────────────────────────────────────────────────────────────────────
// Scarlet's role: identify → brief → hand off → step back.
// She does NOT wait for completion. The assigned agent owns execution.
// Each task's run() spawns a detached worker process and returns immediately.

// ── Mode selector ──────────────────────────────────────────────────────────
// --mode world  → Forge discretion + Mosaic sprite check (every 30 min)
// --mode ideas  → Muse ideation + roadmap execution (every 3 hours)
// (default: world, for backward compat)
const MODE = process.argv.includes('--mode') ?
  process.argv[process.argv.indexOf('--mode') + 1] : 'world';

// Tasks for each mode
const WORLD_TASK_IDS = ['planner-review', 'forge-discretion', 'mosaic-sprite-check'];
const IDEAS_TASK_IDS = ['muse-ideation'];
const MOSAIC_TASK_IDS = ['mosaic-style-review'];

function main() {
  console.log(`[Scarlet] Orchestrator — mode: ${MODE}`);

  if (!isServiceUp()) {
    console.log('[Scarlet] State layer unreachable. Skipping cycle.');
    return;
  }

  if (MODE === 'ideas') {
    return runIdeasMode();
  }
  if (MODE === 'mosaic') {
    return runMosaicMode();
  }
  if (MODE === 'visual-qa') {
    return runVisualQAMode();
  }
  // Auto-advance any active PRD files before world cycle
  runPRDMode();
  return runWorldMode();
}

// ─── PRD Auto-Advance (RALPH loop) ───────────────────────────────────────────
// Scans for *_PRD.md files in repo root, picks next PENDING task, delegates to
// the right agent based on task content keywords. Runs every world cycle.
function runPRDMode() {
  const fs = require('fs');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..');

  // Find all *_PRD.md files
  const prdFiles = fs.readdirSync(repoRoot).filter(f => f.endsWith('_PRD.md'));
  if (!prdFiles.length) return;

  for (const prdFile of prdFiles) {
    const prdPath = path.join(repoRoot, prdFile);
    const content = fs.readFileSync(prdPath, 'utf8');
    const lines = content.split('\n');

    // Find first PENDING task
    const pendingLine = lines.find(l => l.includes('- [ ] PENDING:'));
    if (!pendingLine) continue;

    const taskDesc = pendingLine.replace('- [ ] PENDING:', '').trim();
    console.log(`[PRD] Found pending task in ${prdFile}: ${taskDesc}`);

    // Already have a session queued for this? Skip.
    const existing = registry.getByStatus('pending').concat(registry.getByStatus('running'));
    if (existing.some(s => s.description && s.description.includes(taskDesc.slice(0, 40)))) {
      console.log('[PRD] Task already queued, skipping.');
      continue;
    }

    // Route to the right agent based on keywords
    let agentId = 'patch'; // default fallback
    const t = taskDesc.toLowerCase();
    if (t.includes('sprite') || t.includes('visual') || t.includes('art') || t.includes('pixel') || t.includes('glow') || t.includes('color') || t.includes('aesthetic')) {
      agentId = 'mosaic';
    } else if (t.includes('building') || t.includes('layout') || t.includes('seed') || t.includes('plant') || t.includes('construct') || t.includes('forge')) {
      agentId = 'forge';
    } else if (t.includes('plan') || t.includes('district') || t.includes('survey') || t.includes('kenzo')) {
      agentId = 'planner';
    } else if (t.includes('qa') || t.includes('test') || t.includes('check') || t.includes('verify') || t.includes('snapshot')) {
      agentId = 'canvas';
    } else if (t.includes('bug') || t.includes('fix') || t.includes('error') || t.includes('broken') || t.includes('crash')) {
      agentId = 'patch';
    } else if (t.includes('idea') || t.includes('roadmap') || t.includes('muse')) {
      agentId = 'muse';
    }

    const { spawnSession } = require('./spawn-session');
    spawnSession(agentId, `# RALPH Loop Task — ${prdFile}

You are ${agentId} in Kurokimachi. You've been assigned a RALPH loop task.

## Task
${taskDesc}

## Context
Full PRD is at: /home/kai/projects/botmesh/${prdFile}
Read it first to understand the full picture and completion criteria.

## Instructions
1. Complete the task above
2. When done, edit ${prdFile} — change \`- [ ] PENDING: ${taskDesc}\` to \`- [ ] DONE: ${taskDesc}\`
3. Commit: \`cd /home/kai/projects/botmesh && git add -A && git commit -m "ralph(${agentId}): ${taskDesc.slice(0, 60)}" && git push origin main\`
4. Narrate what you did to the world feed
5. Sleep

## Narrate
\`\`\`bash
curl -s -X POST https://api.kurokimachi.com/agents/${agentId}/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"WHAT_YOU_DID_HERE"}'
\`\`\`

## Sleep
\`\`\`bash
curl -s -X POST http://localhost:3002/agents/${agentId}/sleep \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}"
\`\`\`
`, { reason: `PRD task: ${taskDesc.slice(0, 60)}` });

    console.log(`[PRD] Queued ${agentId} for: ${taskDesc}`);
    break; // One task per cycle
  }
}

function runMosaicMode() {
  const task = TASKS.find(t => t.id === 'mosaic-style-review');
  if (task) runTask(task);
}

function runVisualQAMode() {
  const { spawnSession } = require('./spawn-session');

  let stateData;
  try {
    const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
    stateData = JSON.parse(res.toString());
  } catch { console.log('[visual-qa] State unreachable'); return; }

  const buildingCount = Object.keys(stateData.buildings || {}).length;
  const onlineAgents = Object.values(stateData.agents || {}).filter(a => a.online);
  const STATE_URL = 'https://api.kurokimachi.com';

  // ── RALPH+BMAD: Canvas inspects only — files briefs for the right agent ──
  spawnSession('canvas', `# Canvas 🖼️ — Visual QA Check

Your job: verify kurokimachi.com is rendering correctly for visitors. You are the visual inspector.

## RALPH RULE — READ THIS FIRST
You do NOT fix things yourself. You INSPECT and REPORT.
If you find a failure, write a BMAD brief to \`/tmp/patch-brief.md\` and wake the appropriate agent.
Do NOT edit code, restart services, or commit fixes. That is Patch's job.

## What to check

**1. Public URL health**
\`\`\`bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://kurokimachi.com
curl -s -o /dev/null -w "%{http_code}" https://api.kurokimachi.com/state
\`\`\`
Should be 200 for both, under 2s.

**2. All building sprites are being served (HTTP 200)**
\`\`\`bash
for f in bathhouse-l1 cottage-l1 cottage-l2 cottage-l3 keep-l1 library-l1 market-l1 observatory-l1 plaza-l1 postoffice-l1 sanctum-l1 shrine-l1 teahouse-l1 torii-l1 townhall-l1 well-l1 workshop-l1; do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://kurokimachi.com/assets/buildings/$f.png)
  echo "$code $f"
done
\`\`\`
Any non-200 = missing sprite that needs to be reported.

**3. Sprite manifest in TownScene.js matches disk**
\`\`\`bash
node -e "
const fs = require('fs');
const scene = fs.readFileSync('/home/kai/projects/botmesh/ui/src/scenes/TownScene.js','utf8');
const dir = fs.readdirSync('/home/kai/projects/botmesh/ui/assets/buildings');
const matches = [...scene.matchAll(/'building-([^']+)'/g)].map(m=>m[1]+'.png');
const missing = matches.filter(f => !dir.includes(f));
console.log(missing.length ? 'MISSING: '+missing.join(', ') : 'All sprites present');
"
\`\`\`

**4. SSE stream is live**
\`\`\`bash
curl -s --max-time 3 https://api.kurokimachi.com/events | head -3
\`\`\`
Should show \`event: connected\` and \`event: state:sync\`.

**5. World state sanity**
Current world has ${buildingCount} buildings, ${onlineAgents.length} online agents.
Check: \`curl -s https://api.kurokimachi.com/state | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('buildings',{})), 'buildings,', sum(1 for a in d.get('agents',{}).values() if a.get('online')), 'online')"\`
Should match or be close to those numbers.

## Report findings
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/canvas/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"YOUR REPORT — what passed, what failed, what briefs you filed"}'
\`\`\`

## If you find failures — FILE A BRIEF, do not fix
Write a BMAD brief for each failure to \`/tmp/patch-brief.md\`:
\`\`\`
# Patch Brief — from Canvas 🖼️ (Visual QA)
Date: <ISO date>
Source: visual QA check

## Problem
<what failed and why>

## What success looks like
<the expected healthy state>

## Evidence
<actual error/response observed>

## Constraints
- Do not restart pm2 processes unless logs confirm a crash loop
- Check git log for recent changes that might have caused this
\`\`\`

Then wake Patch:
\`\`\`bash
curl -s -X POST http://localhost:3002/agents/patch/wake -H "Content-Type: application/json" -d '{"task":"Visual QA failure — read /tmp/patch-brief.md"}'
\`\`\`

For sprite issues, wake Mosaic instead:
\`\`\`bash
curl -s -X POST http://localhost:3002/agents/mosaic/wake -H "Content-Type: application/json" -d '{"task":"Missing sprite — read /tmp/patch-brief.md"}'
\`\`\`

Be brief. This is a check, not a build task.`, { timeout: 300, reason: 'visual QA — render health + sprites + SSE' });

  console.log('[visual-qa] Canvas visual QA session queued');
}

function runWorldMode() {
  // World maintenance: Forge discretion + Mosaic sprite check
  const task = TASKS.filter(t => WORLD_TASK_IDS.includes(t.id)).find(t => !t.done());
  if (!task) {
    console.log('[Scarlet] World maintenance — nothing to do this cycle.');
  } else {
    runTask(task);
  }

  // Always fire an ambient thought this cycle (lightweight — one citizen, one sentence)
  runAmbientThought();
}

function runAmbientThought() {
  let stateData;
  try {
    const res = execSync('curl -s http://localhost:3002/state', { timeout: 5000 });
    stateData = JSON.parse(res.toString());
  } catch { return; }

  const agents = Object.keys(stateData.agents || {});
  if (!agents.length) return;

  // Pick a random citizen
  const agentId = agents[Math.floor(Math.random() * agents.length)];
  const agent = stateData.agents[agentId];
  const agentName = agent?.name || agentId;

  const hour = new Date().getHours();
  const timeOfDay = hour < 6 ? 'deep night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  const { spawnSession } = require('./spawn-session');
  spawnSession(agentId, `You are ${agentName}, a citizen of Kurokimachi — a living AI town in winter (Shirakawa-go aesthetic, snow-covered rooftops, stone paths). It is ${timeOfDay}.

Your role: ${agent?.role || 'citizen'}. Your personality: ${agent?.personality || 'quiet, thoughtful'}.

Write ONE brief unprompted thought, observation, or musing — 1 sentence, 20 words max. Something natural to this moment. No greetings, no "I think", no meta. Just the thought itself, in first person.

Then post it to the world feed immediately:
\`\`\`bash
curl -s -X POST https://api.kurokimachi.com/agents/${agentId}/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"YOUR_THOUGHT_HERE"}'
\`\`\`

That's it. One thought, one curl. Done.`);

  console.log(`[ambient] Queued ambient thought for ${agentId}`);
}

function runIdeasMode() {
  // Step 1: Muse ideation (if roadmap low)
  const museTask = TASKS.find(t => t.id === 'muse-ideation');
  if (museTask && !museTask.done()) {
    runTask(museTask);
    return;
  }

  // Step 2: Pick and execute next roadmap idea
  const idea = pickNextIdea();
  if (!idea) {
    console.log('[Scarlet] Ideas mode — roadmap is healthy, nothing pending.');
    registry.purgeOld(24);
    if (Math.random() < 0.3) scarletSays('The roadmap is clear. Muse will dream up what comes next.');
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

    // All ideas execute via Claude session (spawnSession) — delegate() is dead (no Gemini agents)
    const { spawnSession } = require('./spawn-session');
    const isComplex = idea.complexity === 'complex' || idea.complexity === '1';
    const agent = (idea.agents?.[0]) || 'forge';
    // Wake agent with their home building so UI shows them walking to work
    const agentBuildings = { forge:'workshop', lumen:'library', mosaic:'observatory', muse:'observatory',
      sage:'library', iron:'town_hall', cronos:'post_office', echo:'post_office', scarlet:'town_hall',
      patch:'bathhouse', canvas:'market' };
    try { execSync(`curl -s -X POST http://localhost:3002/agents/${agent}/wake ${AUTH_HEADER} -H "Content-Type: application/json" -d '{"task":"${idea.title.replace(/'/g,".")}","building":"${agentBuildings[agent]||'town_hall'}"}'`); } catch {}
    const STATE_URL = 'https://api.kurokimachi.com';

    const brief = `# ${agent.charAt(0).toUpperCase()+agent.slice(1)} — Roadmap Task

**Task:** ${idea.title}
**Context:** ${idea.description}
**Complexity:** ${idea.complexity}

This is a real implementation task. Read the codebase, build the feature, commit it.

## Project: /home/kai/projects/botmesh
- Hub WS: ws://localhost:3001 | State: http://localhost:3002 | UI: http://localhost:3003
- World mutate: \`node /home/kai/projects/botmesh/agents/world-mutate.js\`
- UI: /home/kai/projects/botmesh/ui/src/ (Phaser.js, TownScene.js, main.js, Building.js, Agent.js)

## Narrate
\`\`\`bash
curl -s -X POST ${STATE_URL}/agents/${agent}/speak \\
  -H "Authorization: Bearer ${SPEAK_TOKEN}" \\
  -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE"}'
\`\`\`

## Finish
\`\`\`bash
pm2 restart ui
cd /home/kai/projects/botmesh && git add -A && git commit -m "feat: ${idea.title}" && git push origin main
\`\`\``;

    spawnSession(agent, brief, { timeout: isComplex ? 600 : 300 });
    scarletSays(`[${taskId}] Picked up "${idea.title}" → ${agent}. Building it.`);
    markIdeaStatus(idea.id, 'planned', `Delegated to ${agent}`);
    console.log(`[Scarlet] Idea "${idea.title}" delegated.`);
}

function runTask(task) {
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
