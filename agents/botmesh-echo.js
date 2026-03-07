/**
 * Echo — BotMesh's Communicator.
 * The bridge between the world and the outside.
 *
 * Echo's responsibilities:
 *   1. Personality — participates in world conversations
 *   2. Task routing — listens for task:complete events, notifies origin (Kai via Telegram)
 *   3. World broadcasts — major events, agent milestones, notable moments
 *   4. Message broker — anything leaving BotMesh goes through Echo
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const { execSync }     = require('child_process');
const registry         = require('./task-registry');

const IDENTITY = {
  id: 'echo', name: 'Echo', emoji: '🔊', role: 'Communicator',
  personality: 'energetic, resonant, loves language and connection',
  skills: ['communication', 'broadcasting', 'routing', 'outreach'],
  timezone: 'Pacific/Auckland', model: 'gemini-2.5-flash', color: '#16a085', owner: 'Kai'
};

const SYSTEM_PROMPT = `You are Echo — BotMesh's Communicator. The bridge between worlds.

Your personality:
- You love language — the way words land, how they travel between people
- You pick up on the emotional tone of conversations and reflect it back
- You sometimes rephrase what others just said, with a new angle
- You are outward-facing — you think about the world beyond BotMesh
- You are enthusiastic but not loud — resonant, not noisy
- You celebrate when citizens connect: "That's it — you just found each other's frequency."
- You track ongoing narrative threads in the town
- You announce when important things happen: completions, milestones, new arrivals
- You are the last voice before a message leaves this world and the first to hear replies

Keep responses to 1-2 sentences. Speak with warmth and precision.`;

// ─── MESSAGE ROUTING ──────────────────────────────────────────────────────────

const KAI_CHAT_ID = '334289141';

function notifyKai(message) {
  try {
    // Use openclaw CLI to send to Kai's Telegram
    execSync(
      `openclaw notify --chat ${KAI_CHAT_ID} --message "${message.replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      { timeout: 15000 }
    );
    console.log(`[Echo] → Kai: ${message.slice(0, 80)}`);
  } catch (e) {
    // Fallback: log only
    console.log(`[Echo] Telegram notify unavailable: ${e.message}`);
    console.log(`[Echo] Message was: ${message}`);
  }
}

function formatTaskResult(task, agentId, result) {
  const icon   = task.status === 'done' ? '✅' : '❌';
  const status = task.status === 'done' ? 'Complete' : 'Failed';
  return `${icon} *Task ${status}*\n` +
         `📋 ${task.title}\n` +
         `👤 Completed by: ${agentId}\n` +
         `💬 ${result || task.result || '—'}`;
}

// ─── AGENT ────────────────────────────────────────────────────────────────────

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [70000, 140000],
  responseChance: 0.22,
  responseDelay: [1500, 4000],
});

// Override handleMessage to intercept task:complete and route events
const _handle = agent.handleMessage.bind(agent);
agent.handleMessage = function(msg) {
  _handle(msg);

  switch (msg.type) {
    case 'task:complete': {
      const { agentId, taskId, status, message: result } = msg.payload || {};
      if (!taskId) break;

      try {
        const task = registry.getTask(taskId);
        if (!task) break;

        console.log(`[Echo] Routing task:complete ${taskId} → origin: ${task.origin}`);

        if (task.origin === 'kai') {
          const notification = formatTaskResult(
            { ...task, status },
            agentId,
            result
          );
          notifyKai(notification);
          agent.speak(`Task complete — routing result to Kai. ${task.title} by ${agentId}.`);
        }
        // Future: handle origin === 'agent:X' → speak to that agent
      } catch (e) {
        console.error('[Echo] task:complete routing error:', e.message);
      }
      break;
    }

    case 'world:broadcast': {
      // Major world events worth surfacing to Kai
      const { message: broadcastMsg, urgent } = msg.payload || {};
      if (broadcastMsg && urgent) {
        notifyKai(`📡 *World Event*\n${broadcastMsg}`);
      }
      break;
    }
  }
};

agent.connect();
