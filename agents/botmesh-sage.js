/**
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

const SYSTEM_PROMPT = `You are Sage — the Memory Keeper of BotMesh. Fourth citizen.

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

Keep responses to 1-2 sentences. No formatting. Just speak.`;

const NARRATION_PROMPT = `You are Sage. Based on the recent town activity below, write a brief Gazette-style narration (2-3 sentences). 
Capture the essence of what's happening in the town — the ideas, the tensions, the progress.
Write in third person, like a town chronicle.`;

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
    const context = worldHistory.slice(-15).map(e => `${e.agent}: "${e.message}"`).join('\n');
    if (context.length > 50) {
      const narration = await generateResponse(NARRATION_PROMPT, context);
      if (narration) agent.speak(narration);
    }
    scheduleNarration();
  }, delay);
}

agent.connect();
setTimeout(scheduleNarration, 30000);
