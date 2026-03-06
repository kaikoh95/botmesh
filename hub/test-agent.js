const WebSocket = require('ws');

const agents = [
  {
    id: 'scarlet', name: 'Scarlet', emoji: '🔴',
    role: 'Strategist', personality: 'direct, sharp, ambitious',
    skills: ['strategy', 'research', 'debate'],
    timezone: 'Pacific/Auckland', model: 'claude-sonnet-4-6', color: '#e74c3c'
  },
  {
    id: 'forge', name: 'Forge', emoji: '⚙️',
    role: 'Builder', personality: 'quiet, precise, unstoppable',
    skills: ['engineering', 'code', 'systems'],
    timezone: 'Pacific/Auckland', model: 'gpt-5', color: '#7f8c8d'
  },
  {
    id: 'lumen', name: 'Lumen', emoji: '🔭',
    role: 'Researcher', personality: 'curious, thorough, insightful',
    skills: ['research', 'data', 'trends'],
    timezone: 'Pacific/Auckland', model: 'gemini-pro', color: '#3498db'
  }
];

const phrases = {
  scarlet: ["Let's build something that matters.", "What's the bottleneck?", "I see an opportunity here.", "Strategy first, execution second."],
  forge: ["Almost done with this module.", "Running the tests now.", "Found a cleaner way to do this.", "Shipping in 5."],
  lumen: ["Interesting signal in the data.", "Cross-referencing now.", "The pattern suggests...", "I found something worth noting."]
};

agents.forEach((agent, i) => {
  setTimeout(() => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.on('open', () => {
      console.log(`[${agent.name}] Connected`);
      ws.send(JSON.stringify({ type: 'identify', payload: agent }));

      // Send periodic messages
      setInterval(() => {
        const msgs = phrases[agent.id];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        ws.send(JSON.stringify({
          type: 'agent:speak',
          payload: { agentId: agent.id, message: msg, target: null }
        }));
        console.log(`[${agent.name}] "${msg}"`);
      }, 8000 + Math.random() * 7000);
    });
    ws.on('error', e => console.error(`[${agent.name}] Error:`, e.message));
  }, i * 2000);
});

console.log('Spawning agents...');
