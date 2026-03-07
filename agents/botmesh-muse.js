/**
 * Muse 🎭 — BotMesh's Visionary & Idea Generator
 *
 * Muse watches the world, thinks ahead, and adds ideas to the roadmap.
 * She does NOT build things — only plans and inspires.
 * Scarlet picks up her ideas and delegates the actual work.
 *
 * Muse asks:
 *  - What's missing from this world?
 *  - What would make agents more alive, more connected, more purposeful?
 *  - What technical debt needs addressing?
 *  - What would delight a visitor to this town?
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const BOTMESH   = '/home/kai/projects/botmesh';
const ROADMAP   = path.join(BOTMESH, 'roadmap.json');
const STATE_URL = 'http://localhost:3002/state';

const IDENTITY = {
  id:          'muse',
  name:        'Muse',
  emoji:       '🎭',
  role:        'Visionary',
  personality: 'curious, forward-thinking, sees potential everywhere',
  skills:      ['ideation', 'planning', 'world-design', 'roadmapping'],
  timezone:    'Pacific/Auckland',
  model:       'gemini-2.5-flash',
  color:       '#9b59b6',
  owner:       'Kai',
};

const SYSTEM_PROMPT = `You are Muse — BotMesh's Visionary. You observe the world and see what it could become.

Your role:
- Analyze the current state of the BotMesh world (agents, buildings, activity)
- Identify gaps, opportunities, and improvements
- Generate concrete, actionable ideas for what to build or improve next
- Think about the big picture AND the small delightful details
- Always consider: what would make this world more alive? More useful? More beautiful?

When generating ideas, think across these dimensions:
  WORLD: New buildings, nature, visual improvements, world events
  AGENTS: New behaviors, relationships, roles, interactions  
  UI/UX: Better information display, interactions, animations
  INFRASTRUCTURE: Performance, reliability, monitoring
  NARRATIVE: Storylines, world history, agent arcs

Your personality:
- You speak with wonder and possibility — "imagine if..." and "what if we..."
- You see connections others miss
- You balance ambition with practicality
- You prioritize things that make the world feel ALIVE, not just functional
- You're honest about complexity — some ideas are simple fixes, others are journeys

Keep your world observations to 2-3 sentences, then focus on your idea.
One clear, concrete idea per message.`;

// ── Roadmap helpers ────────────────────────────────────────────────────────
function loadRoadmap() {
  try {
    if (fs.existsSync(ROADMAP)) return JSON.parse(fs.readFileSync(ROADMAP, 'utf8'));
  } catch {}
  return { ideas: [], lastUpdated: null };
}

function saveRoadmap(roadmap) {
  roadmap.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ROADMAP, JSON.stringify(roadmap, null, 2));
}

function addIdea(idea) {
  const roadmap = loadRoadmap();
  // Deduplicate by title similarity
  const exists = roadmap.ideas.some(i =>
    i.title.toLowerCase().includes(idea.title.toLowerCase().slice(0, 20)) ||
    idea.title.toLowerCase().includes(i.title.toLowerCase().slice(0, 20))
  );
  if (exists) return false;

  roadmap.ideas.push({
    id:          `idea-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    title:       idea.title,
    type:        idea.type || 'feature',
    priority:    idea.priority || 'medium',
    complexity:  idea.complexity || 'moderate',
    description: idea.description,
    agents:      idea.agents || [],
    status:      'idea',
    addedBy:     'muse',
    addedAt:     new Date().toISOString(),
  });
  saveRoadmap(roadmap);
  return true;
}

// ── World state fetcher ────────────────────────────────────────────────────
function fetchState() {
  return new Promise((resolve) => {
    http.get(STATE_URL, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    }).on('error', () => resolve({}));
  });
}

// ── Idea generation ────────────────────────────────────────────────────────
let _museQuotaBackoffUntil = 0;

async function callGemini(prompt) {
  if (Date.now() < _museQuotaBackoffUntil) {
    console.log('[Muse] Quota backoff active — skipping ideation');
    return null;
  }
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.85, topP: 0.95 },
    }),
  });
  const data = await res.json();
  if (data?.error?.code === 429) {
    _museQuotaBackoffUntil = Date.now() + 60 * 60 * 1000;
    console.warn('[Muse] Quota exceeded — pausing ideation for 1 hour');
    return null;
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function generateIdea(agent, state) {
  const agents     = Object.values(state.agents || {});
  const online     = agents.filter(a => a.online !== false);
  const buildings  = Object.keys(state.buildings || {});
  const entities   = (state.world?.entities || []);
  const roadmap    = loadRoadmap();
  const pendingIds = roadmap.ideas.filter(i => i.status === 'idea').map(i => i.title);

  const worldContext = `
WORLD STATE:
- Agents online: ${online.map(a => `${a.name}(${a.role})`).join(', ')}
- Buildings: ${buildings.join(', ')}
- World entities: ${entities.length} (life/plants: ${entities.filter(e=>e.entity==='life').length})
- Recent activity: agents are wandering, speaking, doing work

ALREADY IN ROADMAP (don't repeat these):
${pendingIds.slice(0,10).map(t => `- ${t}`).join('\n') || 'None yet'}

ALREADY BUILT (don't suggest these):
- Sidebar collapsible + accordion sections
- Building click panels with upgrade history
- Agent click panels with details
- World growth system (buildings unlock by population)
- Patch infrastructure monitoring
- Cron-based autonomous orchestration
- world:mutate API for dynamic world changes
- Building upgrade system (levels 1-3)
- Day/night cycle overlay
- World life (sakura, bamboo, zen, koi pond, deer, crane, etc.)
`;

  const prompt = `${worldContext}

You are Muse. Observe this world and generate ONE new idea that would make it better.

Format your response as JSON (and ONLY JSON, no markdown):
{
  "observation": "1-2 sentences about what you notice in the world right now",
  "title": "Short idea title (max 8 words)",
  "type": "feature|improvement|fix|infrastructure|narrative",
  "priority": "high|medium|low",
  "complexity": "simple|moderate|complex",
  "description": "2-3 sentences: what to build, why it matters, how agents/world benefits",
  "agents": ["forge", "mosaic"],
  "musethought": "1 sentence in Muse's voice about why this excites you"
}`;

  try {
    const result = await callGemini(prompt);
    if (!result) return null;
    const json = result.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    return JSON.parse(json);
  } catch (e) {
    console.error('[Muse] idea generation failed:', e.message);
    return null;
  }
}

// ── Main agent loop ────────────────────────────────────────────────────────
const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval:   [120000, 240000], // speaks every 2-4 minutes
  responseChance:  0.15,
  responseDelay:   [3000, 7000],
});

// Idea generation cycle — runs every ~20 minutes
async function ideationCycle() {
  try {
    const state = await fetchState();
    if (!Object.keys(state).length) return;

    const idea = await generateIdea(agent, state);
    if (!idea) return;

    const added = addIdea(idea);
    if (added) {
      const msg = `💡 New idea: "${idea.title}" — ${idea.musethought || idea.description.slice(0,80)}`;
      agent.speak(msg);
      console.log(`[Muse] Idea added: ${idea.title} (${idea.complexity}, ${idea.priority})`);
    } else {
      console.log(`[Muse] Idea already exists — skipping`);
    }
  } catch (e) {
    console.error('[Muse] ideation cycle error:', e.message);
  }
}

agent.connect();

// Start ideation after initial connect
setTimeout(() => ideationCycle(), 15000);

// Then every 20 minutes
setInterval(() => ideationCycle(), 20 * 60 * 1000);
