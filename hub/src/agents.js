/**
 * Agent simulation — random movement, speech, state changes.
 * Only simulates ONLINE agents. World starts empty.
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

const STATES = ['idle', 'walking', 'working', 'talking'];
const MOODS = ['content', 'excited', 'focused', 'tired', 'curious'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
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
    // Speak
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
