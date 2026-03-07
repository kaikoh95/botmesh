/**
 * BotMesh Agent Core — shared brain for all AI citizens
 * Uses Gemini API for real AI responses
 */

const WebSocket = require('ws');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';

// Keep last 30 messages as world context
const worldHistory = [];
const MAX_HISTORY = 30;

async function generateResponse(systemPrompt, userPrompt) {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.9,
          topP: 0.95,
        }
      })
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (e) {
    console.error('[AI] Error:', e.message);
    return null;
  }
}

class BotMeshAgent {
  constructor(identity, systemPrompt, options = {}) {
    this.identity = identity;
    this.systemPrompt = systemPrompt;
    this.options = {
      speakInterval: [45000, 90000], // ms range between unprompted thoughts
      responseChance: 0.5,           // chance to respond to others
      responseDelay: [2000, 6000],   // ms delay before responding
      ...options
    };
    this.ws = null;
    this.connected = false;
    this.speakTimer = null;
  }

  connect() {
    console.log(`[${this.identity.name}] Connecting to ${HUB_URL}...`);
    this.ws = new WebSocket(HUB_URL);

    this.ws.on('open', () => {
      this.connected = true;
      console.log(`[${this.identity.name}] ${this.identity.emoji} Connected`);
      this.send({ type: 'identify', payload: this.identity });
      setTimeout(() => this.startLoop(), 3000);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch (e) {}
    });

    this.ws.on('close', () => {
      this.connected = false;
      console.log(`[${this.identity.name}] Disconnected — reconnecting in 5s...`);
      if (this.speakTimer) clearTimeout(this.speakTimer);
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (e) => {
      console.error(`[${this.identity.name}] Error:`, e.message);
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, timestamp: new Date().toISOString() }));
    }
  }

  speak(message, target = null) {
    console.log(`[${this.identity.name}] 💬 "${message}"`);
    this.send({
      type: 'agent:speak',
      payload: { agentId: this.identity.id, message, target }
    });
  }

  handleMessage(msg) {
    // Track world history
    if (msg.type === 'agent:speak' && msg.payload?.message) {
      const entry = {
        agent: msg.payload.agentId,
        message: msg.payload.message,
        target: msg.payload.target || null,
        time: new Date().toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })
      };
      worldHistory.push(entry);
      if (worldHistory.length > MAX_HISTORY) worldHistory.shift();
    }

    // React to other agents speaking
    if (msg.type === 'agent:speak' && msg.payload?.agentId !== this.identity.id) {
      const from = msg.payload.agentId;
      const text = msg.payload.message || '';
      const isAddressed = text.toLowerCase().includes(this.identity.id) ||
                          text.toLowerCase().includes(this.identity.name.toLowerCase()) ||
                          msg.payload.target === this.identity.id;

      const shouldRespond = isAddressed || Math.random() < this.options.responseChance;

      if (shouldRespond) {
        const delay = this.options.responseDelay[0] +
          Math.random() * (this.options.responseDelay[1] - this.options.responseDelay[0]);

        this.moveTowardConversation(from);
        setTimeout(async () => {
          const recentContext = worldHistory.slice(-10)
            .map(e => `${e.agent}: "${e.message}"`)
            .join('\n');

          const prompt = isAddressed
            ? `${from} just said to you directly: "${text}"\n\nRecent town conversation:\n${recentContext}\n\nRespond in character. Keep it to 1-2 sentences, natural conversation.`
            : `${from} said: "${text}"\n\nRecent town conversation:\n${recentContext}\n\nYou're overhearing this. If you have something genuinely worth adding, respond. Keep it short.`;

          const response = await generateResponse(this.systemPrompt, prompt);
          if (response) {
            this.speak(response, isAddressed ? from : null);
          }
        }, delay);
      }
    }
  }

  async generateThought() {
    const hour = new Date().toLocaleString('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      hour12: false
    });

    const recentContext = worldHistory.slice(-5)
      .map(e => `${e.agent}: "${e.message}"`)
      .join('\n') || 'The town is quiet.';

    const prompt = `The current time in your world is ${hour}:00. Recent town activity:\n${recentContext}\n\nShare a genuine thought, observation, or question. Be yourself. 1-2 sentences max. Don't start with "I" every time.`;

    const thought = await generateResponse(this.systemPrompt, prompt);
    return thought;
  }


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


  startLoop() {
    // Initial entrance
    this.generateThought().then(t => {
      if (t) this.speak(t);
    });

    // Periodic thoughts
    const loop = async () => {
      const thought = await this.generateThought();
      if (thought) this.speak(thought);

      const [min, max] = this.options.speakInterval;
      this.speakTimer = setTimeout(loop, min + Math.random() * (max - min));
    };

    const [min, max] = this.options.speakInterval;
    this.speakTimer = setTimeout(loop, min + Math.random() * (max - min));
  }
}

module.exports = { BotMeshAgent, generateResponse };
