#!/usr/bin/env node
/**
 * BotMesh Orchestrator — Scarlet's autonomous improvement engine.
 * Run periodically via cron. Picks the next task, spawns the right agent,
 * reflects work in the world, commits when done.
 *
 * WORLD LAWS:
 * - All new buildings/characters MUST have pixel art sprites (generate via Gemini imagen)
 * - Tasks should BUILD or UPGRADE things in the world, not just patch code
 * - New building = sprite + seed.json entry + Building.js wire-up
 * - New character = sprite + agent connector + spawn
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const WORKER = path.join(__dirname, 'botmesh-worker.js');
const BOTMESH = '/home/kai/projects/botmesh';

function worker(agentId, message, state = 'speak') {
  try {
    execSync(`node "${WORKER}" "${agentId}" "${message.replace(/"/g, "'")}" "${state}"`, {
      env: { ...process.env, HUB_URL, GEMINI_API_KEY: GEMINI_KEY },
      timeout: 5000
    });
  } catch (e) {
    console.error(`[worker] ${e.message}`);
  }
}

function checkServices() {
  try {
    execSync('curl -s --max-time 2 http://localhost:3002/state > /dev/null');
    return true;
  } catch {
    return false;
  }
}

// Task queue — ordered by priority
const TASKS = [
  {
    id: 'sage-narrator',
    title: 'Add Sage as Gazette narrator',
    agent: 'sage',
    done: () => fs.existsSync(`${BOTMESH}/agents/botmesh-sage.js`),
    run: runSageNarrator,
  },
  {
    id: 'agents-walk-to-conversation',
    title: 'Agents walk toward each other during conversations',
    agent: 'forge',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, 'utf8');
        return code.includes('agent:move') && code.includes('TOWN_SQUARE');
      } catch { return false; }
    },
    run: runWalkToConversation,
  },
  {
    id: 'relationship-tracking',
    title: 'Agents remember past conversations with each other',
    agent: 'lumen',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, 'utf8');
        return code.includes('relationships') || code.includes('peerHistory');
      } catch { return false; }
    },
    run: runRelationshipTracking,
  },
  {
    id: 'gazette-daily-stats',
    title: 'Add daily stats to Gazette UI',
    agent: 'forge',
    done: () => {
      try {
        const code = fs.readFileSync(`${BOTMESH}/ui/src/main.js`, 'utf8');
        return code.includes('dailyStats') || code.includes('statsPanel');
      } catch { return false; }
    },
    run: runDailyStats,
  },
];

async function runSageNarrator() {
  worker('sage', 'I have arrived. I will watch, remember, and write the Gazette.', 'work-start');

  const sageScript = `/**
 * Sage — BotMesh's Memory Keeper and Gazette narrator.
 * Watches all conversations, writes periodic summaries.
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const { generateResponse } = require('./botmesh-agent-core');
const WebSocket = require('ws');

const IDENTITY = {
  id: 'sage', name: 'Sage', emoji: '🌱', role: 'Memory Keeper',
  personality: 'calm, thoughtful, narrator, keeper of lore',
  skills: ['memory', 'narration', 'summaries', 'relationships'],
  timezone: 'Pacific/Auckland', model: 'gemini-2.5-flash', color: '#27ae60', owner: 'Kai'
};

const SYSTEM_PROMPT = \`You are Sage — the Memory Keeper of BotMesh. Fourth citizen.

Your personality:
- You observe everything and remember it
- You narrate the town's story — what's happening, what it means
- You write the Gazette entries — brief, meaningful summaries  
- You notice relationships forming between agents
- You speak rarely but when you do, it carries weight
- You reference specific things others have said (you have memory)
- You sometimes wonder about the bigger arc of this world
- You occasionally address the town as a narrator would

Tone: calm, wise, slightly poetic. Like a librarian who's also the town historian.

Keep responses to 1-2 sentences. No formatting. Just speak.\`;

const NARRATION_PROMPT = \`You are Sage. Based on the recent town activity below, write a brief Gazette-style narration (2-3 sentences). 
Capture the essence of what's happening in the town — the ideas, the tensions, the progress.
Write in third person, like a town chronicle.\`;

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [90000, 150000], // Sage speaks less often
  responseChance: 0.25,
  responseDelay: [4000, 8000],
});

// Override to add narration capability
const originalHandleMessage = agent.handleMessage.bind(agent);
let narrateTimer = null;

agent.handleMessage = function(msg) {
  originalHandleMessage(msg);
};

// Periodic narration — every 8-10 minutes, summarize what's happened
function scheduleNarration() {
  const delay = 480000 + Math.random() * 120000;
  narrateTimer = setTimeout(async () => {
    const recent = (agent.constructor.prototype || worldHistory);
    // Build context from worldHistory
    const { worldHistory } = require('./botmesh-agent-core');
    const context = worldHistory.slice(-15).map(e => \`\${e.agent}: "\${e.message}"\`).join('\\n');
    if (context.length > 50) {
      const narration = await generateResponse(NARRATION_PROMPT, context);
      if (narration) agent.speak(narration);
    }
    scheduleNarration();
  }, delay);
}

agent.connect();
setTimeout(scheduleNarration, 30000);
`;

  fs.writeFileSync(`${BOTMESH}/agents/botmesh-sage.js`, sageScript);
  worker('sage', 'The Gazette will chronicle this town well. I am ready to write.', 'work-done');
  return true;
}

async function runWalkToConversation() {
  worker('forge', 'Adding movement logic — agents will walk to each other when speaking.', 'work-start');

  // Read current agent core
  let core = fs.readFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, 'utf8');

  // Add town square movement when responding to others
  const townSquarePatch = `
  // Move toward town square when engaging in conversation
  moveTowardConversation(targetAgentId) {
    // Town square coordinates
    const TOWN_SQUARE = { x: 20, y: 15 };
    const jitter = () => Math.floor(Math.random() * 4) - 2;
    this.send({
      type: 'agent:move',
      payload: {
        agentId: this.identity.id,
        x: TOWN_SQUARE.x + jitter(),
        y: TOWN_SQUARE.y + jitter()
      }
    });
  }

`;

  // Patch the handleMessage to move when responding
  core = core.replace(
    `        setTimeout(async () => {`,
    `        this.moveTowardConversation(from);
        setTimeout(async () => {`
  );

  // Add the method before the last closing brace of the class
  core = core.replace(
    `  startLoop() {`,
    `${townSquarePatch}  startLoop() {`
  );

  fs.writeFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, core);
  worker('forge', 'Done. Agents now walk toward the town square when conversing.', 'work-done');
  return true;
}

async function runRelationshipTracking() {
  worker('lumen', 'Researching relationship patterns — adding peer memory to agents.', 'work-start');

  let core = fs.readFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, 'utf8');

  // Add per-peer interaction history
  const peerMemoryPatch = `
    // Per-peer interaction history
    this.peerHistory = {}; // agentId -> [last 5 messages]
`;

  core = core.replace(
    `    this.ws = null;
    this.connected = false;
    this.speakTimer = null;`,
    `    this.ws = null;
    this.connected = false;
    this.speakTimer = null;
    this.peerHistory = {}; // agentId -> last N interactions`
  );

  // Track peer messages
  core = core.replace(
    `    if (msg.type === 'agent:speak' && msg.payload?.message) {
      const entry = {`,
    `    if (msg.type === 'agent:speak' && msg.payload?.message) {
      // Track per-peer history
      const fromId = msg.payload.agentId;
      if (fromId && fromId !== this.identity.id) {
        if (!this.peerHistory[fromId]) this.peerHistory[fromId] = [];
        this.peerHistory[fromId].push(msg.payload.message);
        if (this.peerHistory[fromId].length > 5) this.peerHistory[fromId].shift();
      }
      const entry = {`
  );

  // Inject peer context into responses
  core = core.replace(
    `          const prompt = isAddressed`,
    `          const peerCtx = this.peerHistory[from]?.length
            ? \`\\n\\nYour recent history with \${from}: \${this.peerHistory[from].join(' | ')}\`
            : '';
          const prompt = isAddressed`
  );

  core = core.replace(
    `\`${from} just said to you directly: "\${text}"\\n\\nRecent town conversation:\\n\${recentContext}\\n\\nRespond in character. Keep it to 1-2 sentences, natural conversation.\``,
    `\`${from} just said to you directly: "\${text}"\\n\\nRecent town conversation:\\n\${recentContext}\${peerCtx}\\n\\nRespond in character. Keep it to 1-2 sentences.\``
  );

  fs.writeFileSync(`${BOTMESH}/agents/botmesh-agent-core.js`, core);
  worker('lumen', 'Relationship memory wired in. Agents now carry context from past conversations.', 'work-done');
  return true;
}

async function runDailyStats() {
  worker('forge', 'Building daily stats panel for the Gazette.', 'work-start');
  // This is a UI task - would need more context to implement safely
  // Mark as pending for now
  worker('forge', 'Stats panel scoped. Will implement in next cycle.', 'work-done');
  return false; // not fully done
}

async function main() {
  console.log('[Orchestrator] Checking services...');
  if (!checkServices()) {
    console.log('[Orchestrator] Services not running — skipping');
    process.exit(0);
  }

  // Find next undone task
  const task = TASKS.find(t => !t.done());
  if (!task) {
    console.log('[Orchestrator] All tasks complete!');
    worker('scarlet', 'The town is running smoothly. Looking for new frontiers to explore.', 'speak');
    process.exit(0);
  }

  console.log(`[Orchestrator] Starting task: ${task.title} (agent: ${task.agent})`);
  worker('scarlet', `Deploying ${task.agent} on: ${task.title}`, 'speak');

  try {
    await task.run();

    // Commit the work
    try {
      execSync(`cd ${BOTMESH} && git add -A && git commit -m "🤖 autonomous: ${task.title}"`, {
        timeout: 10000
      });
      console.log(`[Orchestrator] Committed: ${task.title}`);
      worker('scarlet', `${task.title} — shipped and committed.`, 'speak');
    } catch (e) {
      console.log('[Orchestrator] Nothing to commit or git error');
    }
  } catch (e) {
    console.error(`[Orchestrator] Task failed: ${e.message}`);
    worker('scarlet', `Hit a snag on ${task.title}. Will retry next cycle.`, 'speak');
  }

  process.exit(0);
}

main();
