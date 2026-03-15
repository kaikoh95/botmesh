/**
 * Agent simulation — random movement, speech, state changes.
 * Only simulates ONLINE agents. World starts empty.
 * Supports @mentions and agent-to-agent conversation.
 * Supports building upgrade work system.
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

// ── Agent → Building mapping for activity-based movement ──────────────────
const AGENT_BUILDING_MAP = {
  scarlet: { work: 'scarlet_sanctum' },
  forge:   { work: 'workshop' },
  lumen:   { work: 'library' },
  canvas:  { work: 'garden-pavilion' },
  sage:    { work: 'library' },
  iron:    { work: 'iron_keep' },
  cronos:  { work: 'cronos_shrine' },
  echo:    { work: 'post_office' },
  mosaic:  { work: 'workshop' },
  patch:   { work: 'smithy' },
  muse:    { work: 'teahouse' },
  qa:      { work: 'town_hall' },
  planner: { work: 'town_hall' },
};

// Social buildings where idle agents may wander
const SOCIAL_BUILDINGS = ['teahouse', 'plaza', 'market', 'community_garden'];

// Track pending responses and pending work completions
const pendingResponses = [];
const pendingWorkCompletions = [];

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

function generateAgentEvent(agent, onEvent) {
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

  // Don't generate events for agents currently working in a building
  if (agent.state === 'working' && agent.location?.building) {
    return null;
  }

  // Don't simulate over real activity (set via /agents/:id/activity endpoint)
  if (agent.activity && agent.activitySince && Date.now() - agent.activitySince < 300000) {
    return null;
  }

  if (roll < 0.4) {
    // Move — idle agents may wander toward social buildings instead of random walk
    if (agent.state === 'idle' && Math.random() < 0.3) {
      const socialId = randomItem(SOCIAL_BUILDINGS);
      const building = worldState.buildings?.[socialId];
      if (building) {
        const targetX = (building.x || 0) + Math.floor((building.width || 2) / 2);
        const targetY = (building.y || 0) + (building.height || 1) + 1;
        world.updateAgent(agent.id, {
          location: { x: targetX, y: targetY, building: null },
          targetBuilding: socialId,
        });
        return {
          type: 'agent:move',
          agentId: agent.id,
          from: { x: agent.location.x, y: agent.location.y },
          to: { x: targetX, y: targetY },
        };
      }
    }

    // Default: random walk 1-2 tiles
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

    // If transitioning to 'working', trigger building work
    if (newState === 'working') {
      // Prefer AGENT_BUILDING_MAP for work building, fall back to world lookup
      const buildingId = AGENT_BUILDING_MAP[agent.id]?.work || world.getBuildingForAgent(agent.id);
      const building = worldState.buildings[buildingId];
      if (building) {
        const workStarted = world.startWork(agent.id, buildingId);
        if (!workStarted) {
          // Building on cooldown — skip to idle state change instead
          world.updateAgent(agent.id, { state: newState === 'working' ? 'idle' : newState });
          return { type: 'agent:state', agentId: agent.id, from, to: 'idle' };
        }

        // Emit agent:work start event
        onEvent({
          type: 'agent:work',
          agentId: agent.id,
          buildingId,
          buildingName: building.name,
          action: 'start',
        });

        // Schedule completion after 45-90 seconds
        const completionDelay = randomInt(45000, 90000);
        pendingWorkCompletions.push({
          agentId: agent.id,
          buildingId,
          buildingName: building.name,
          scheduledAt: Date.now(),
          delay: completionDelay,
        });

        return {
          type: 'agent:state',
          agentId: agent.id,
          from,
          to: 'working',
        };
      }
    }

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
      const target = randomItem(others);
      const pair = randomItem(MENTION_OPENERS);
      const message = fillTemplate(pair.call, agent.name, target.name);
      const responseText = fillTemplate(randomItem(pair.responses), agent.name, target.name);

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
  // Check for pending @mention responses and work completions
  setInterval(() => {
    const now = Date.now();

    // Pending @mention responses
    for (let i = pendingResponses.length - 1; i >= 0; i--) {
      const pending = pendingResponses[i];
      if (now - pending.scheduledAt >= pending.delay) {
        pendingResponses.splice(i, 1);
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

    // Pending work completions
    for (let i = pendingWorkCompletions.length - 1; i >= 0; i--) {
      const pending = pendingWorkCompletions[i];
      if (now - pending.scheduledAt >= pending.delay) {
        pendingWorkCompletions.splice(i, 1);
        const agent = world.getState().agents[pending.agentId];
        if (!agent || !agent.online) continue;

        const result = world.completeUpgrade(pending.agentId, pending.buildingId);
        if (!result) continue;

        // Emit agent:work complete
        onEvent({
          type: 'agent:work',
          agentId: pending.agentId,
          buildingId: pending.buildingId,
          buildingName: pending.buildingName,
          action: 'complete',
        });

        // If building actually leveled up, emit building:upgraded
        if (result.building) {
          onEvent({
            type: 'building:upgraded',
            buildingId: pending.buildingId,
            buildingName: result.building.name,
            level: result.building.level,
            record: result.record,
          });
        }

        // Return agent to idle
        onEvent({
          type: 'agent:state',
          agentId: pending.agentId,
          from: 'working',
          to: 'idle',
        });
      }
    }
  }, 500);

  function scheduleNext() {
    const delay = randomInt(5000, 15000);
    setTimeout(() => {
      const onlineAgents = world.getOnlineAgents();

      if (onlineAgents.length > 0) {
        const agent = randomItem(onlineAgents);
        const event = generateAgentEvent(agent, onEvent);
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
