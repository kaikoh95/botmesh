/**
 * Agent simulation — random movement, speech, state changes.
 * Only simulates ONLINE agents. World starts empty.
 * Supports @mentions and agent-to-agent conversation.
 */

const world = require('./world');

const PHRASES = {
  default: [
    'Interesting...',
    'What a day.',
    'I wonder what will happen next.',
    'Hello, anyone there?',
    'Just thinking out loud.',
  ],
};

// Call/response pairs for @mention conversations
const MENTION_OPENERS = [
  { call: 'Hey @{target}, what do you think about this?', responses: ['Hmm, let me think about that...', 'I have some ideas actually.', 'Good question, @{speaker}.'] },
  { call: 'I see an opportunity here @{target}', responses: ['Show me the spec @{speaker}.', 'Tell me more @{speaker}.', 'I\'m listening @{speaker}.'] },
  { call: '@{target}, have you seen anything interesting lately?', responses: ['Actually yes! Something caught my eye.', 'Not yet, but I\'m looking @{speaker}.', 'Let me check my notes...'] },
  { call: 'Working on something cool @{target}, want to help?', responses: ['Always! What do you need @{speaker}?', 'Count me in @{speaker}.', 'Depends... what is it?'] },
  { call: '@{target}, we should collaborate on this.', responses: ['Agreed, let\'s make it happen @{speaker}.', 'I was thinking the same thing!', 'What did you have in mind @{speaker}?'] },
  { call: 'Just had a breakthrough @{target}!', responses: ['No way! Tell me everything @{speaker}.', 'That\'s exciting! Details?', 'I knew you could do it @{speaker}!'] },
  { call: '@{target}, remember what we discussed?', responses: ['Of course, I\'ve been thinking about it.', 'Which part? We covered a lot @{speaker}.', 'Yes! And I have an update.'] },
  { call: 'Heads up @{target}, something\'s changed.', responses: ['Thanks for the warning @{speaker}.', 'What happened?', 'I noticed that too @{speaker}.'] },
];

const STATES = ['idle', 'walking', 'working', 'talking'];
const MOODS = ['content', 'excited', 'focused', 'tired', 'curious'];

// Track pending responses
const pendingResponses = [];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function fillTemplate(template, speaker, target) {
  return template.replace(/\{speaker\}/g, speaker).replace(/\{target\}/g, target);
}

function generateAgentEvent(agent) {
  const roll = Math.random();
  const { time } = world.getState();
  const worldState = world.getState();

  // Agents sleep at night
  if (time.period === 'night') {
    if (agent.state !== 'sleeping') {
      world.updateAgent(agent.id, { state: 'sleeping' });
      return {
        type: 'agent:state',
        agentId: agent.id,
        from: agent.state,
        to: 'sleeping',
      };
    }
    return null;
  }

  // Wake up if sleeping during day
  if (agent.state === 'sleeping' && time.period !== 'night') {
    world.updateAgent(agent.id, { state: 'idle' });
    return {
      type: 'agent:state',
      agentId: agent.id,
      from: 'sleeping',
      to: 'idle',
    };
  }

  if (roll < 0.4) {
    // Move 1-2 tiles
    const dx = randomInt(-2, 2);
    const dy = randomInt(-2, 2);
    const from = { x: agent.location.x, y: agent.location.y };
    const toX = clamp(agent.location.x + dx, 0, worldState.world.width - 1);
    const toY = clamp(agent.location.y + dy, 0, worldState.world.height - 1);

    if (toX === from.x && toY === from.y) return null;

    world.updateAgent(agent.id, {
      location: { x: toX, y: toY, building: null },
    });

    return {
      type: 'agent:move',
      agentId: agent.id,
      from,
      to: { x: toX, y: toY },
    };
  }

  if (roll < 0.7) {
    // State change
    const newState = randomItem(STATES.filter(s => s !== agent.state));
    const from = agent.state;
    world.updateAgent(agent.id, { state: newState });
    return {
      type: 'agent:state',
      agentId: agent.id,
      from,
      to: newState,
    };
  }

  if (roll < 0.9) {
    // Speak — 30% chance to @mention another agent
    const onlineAgents = world.getOnlineAgents();
    const others = onlineAgents.filter(a => a.id !== agent.id);

    if (others.length > 0 && Math.random() < 0.3) {
      // @mention conversation
      const target = randomItem(others);
      const pair = randomItem(MENTION_OPENERS);
      const message = fillTemplate(pair.call, agent.name, target.name);
      const responseText = fillTemplate(randomItem(pair.responses), agent.name, target.name);

      // Schedule the response after 2-5s
      pendingResponses.push({
        agentId: target.id,
        message: responseText,
        delay: randomInt(2000, 5000),
        scheduledAt: Date.now(),
      });

      return {
        type: 'agent:speak',
        agentId: agent.id,
        message,
        target: target.id,
      };
    }

    // Solo monologue
    const phrases = PHRASES[agent.id] || PHRASES.default;
    const message = randomItem(phrases);
    return {
      type: 'agent:speak',
      agentId: agent.id,
      message,
      target: null,
    };
  }

  // Mood change
  const newMood = randomItem(MOODS.filter(m => m !== agent.mood));
  const from = agent.mood;
  world.updateAgent(agent.id, { mood: newMood });
  return {
    type: 'agent:mood',
    agentId: agent.id,
    from,
    to: newMood,
  };
}

function startAgentSimulation(onEvent) {
  // Check for pending @mention responses
  setInterval(() => {
    const now = Date.now();
    for (let i = pendingResponses.length - 1; i >= 0; i--) {
      const pending = pendingResponses[i];
      if (now - pending.scheduledAt >= pending.delay) {
        pendingResponses.splice(i, 1);
        // Only respond if agent is still online
        const agent = world.getState().agents[pending.agentId];
        if (agent && agent.online) {
          onEvent({
            type: 'agent:speak',
            agentId: pending.agentId,
            message: pending.message,
            target: null,
          });
        }
      }
    }
  }, 500);

  function scheduleNext() {
    const delay = randomInt(5000, 15000);
    setTimeout(() => {
      const onlineAgents = world.getOnlineAgents();

      if (onlineAgents.length > 0) {
        const agent = randomItem(onlineAgents);
        const event = generateAgentEvent(agent);
        if (event) {
          onEvent(event);
        }
      }

      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

module.exports = { startAgentSimulation };
