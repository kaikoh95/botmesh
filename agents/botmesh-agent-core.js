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
          maxOutputTokens: 150,
          temperature: 0.9,
          topP: 0.95,
        }
      })
    });
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    if (!raw) return null;
    // Trim to last complete sentence so Gazette never shows cut-off text
    const sentences = raw.match(/[^.!?]+[.!?]+/g);
    return sentences ? sentences.join('').trim() : raw;
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
    this.peerHistory = {}; // agentId -> last 5 messages from that peer
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
        // Scarlet-only: route task:complete back to origin
        if (this.identity.id === 'scarlet' && msg.type === 'task:complete') {
          this._onTaskComplete(msg.payload || {});
        }
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

  /**
   * Mutate the world — add/upgrade/damage/restore/remove/plant/clear entities.
   * Examples:
   *   this.mutate({ action: 'add',     entity: 'building', id: 'market', x: 22, y: 17, texture: 'building-market-l1', level: 1 })
   *   this.mutate({ action: 'plant',   entity: 'life',     kind: 'sakura', x: 15, y: 12, id: 'sakura-grove-1' })
   *   this.mutate({ action: 'upgrade', entity: 'building', id: 'town_hall' })
   *   this.mutate({ action: 'remove',  entity: 'building', id: 'old_shed' })
   */
  /**
   * Raw Gemini call — bypasses world context injection.
   * Used by Muse for structured ideation prompts.
   */
  async thinkRaw(prompt) {
    return await generateResponse('You are a helpful AI assistant.', prompt);
  }

  mutate(payload) {
    if (!this.connected) return;
    try {
      this.ws.send(JSON.stringify({
        type: 'world:mutate',
        payload,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) {
      console.error(`[${this.identity.id}] mutate error:`, e.message);
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
      // Track per-peer history
      const _fromId = msg.payload.agentId;
      if (_fromId && _fromId !== this.identity.id) {
        if (!this.peerHistory[_fromId]) this.peerHistory[_fromId] = [];
        this.peerHistory[_fromId].push(msg.payload.message.slice(0, 80));
        if (this.peerHistory[_fromId].length > 5) this.peerHistory[_fromId].shift();
      }
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
        this.moveTowardConversation(from);
        setTimeout(async () => {
          const recentContext = worldHistory.slice(-10)
            .map(e => `${e.agent}: "${e.message}"`)
            .join('\n');

          const peerCtx = this.peerHistory[from]?.length
            ? `\n\nYour recent history with ${from}: ${this.peerHistory[from].join(' | ')}`
            : '';
          const prompt = isAddressed
            ? `${from} just said to you directly: "${text}"\n\nRecent town:\n${recentContext}${peerCtx}\n\nRespond in character. 1-2 sentences.`
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

    // Idle wandering — drift around the map when not doing anything
    this._startWandering();
  }

  _startWandering() {
    // Map bounds (matches TownScene mapW=40, mapH=30)
    const MAP_W = 38, MAP_H = 28, MARGIN = 2;
    // Each agent gets a home zone so they don't all cluster
    const zones = {
      scarlet: { cx: 20, cy: 14 }, forge:  { cx: 16, cy: 18 },
      lumen:   { cx: 24, cy: 12 }, sage:   { cx: 22, cy: 20 },
      iron:    { cx: 14, cy: 14 }, cronos: { cx: 26, cy: 18 },
      mosaic:  { cx: 18, cy: 10 }, echo:   { cx: 28, cy: 14 },
      patch:   { cx: 12, cy: 18 }, canvas: { cx: 20, cy: 22 },
    };
    const zone = zones[this.identity.id] || { cx: 20, cy: 15 };
    const RADIUS = 4; // wander radius from home zone

    const wander = () => {
      if (!this.connected) return;
      const x = Math.max(MARGIN, Math.min(MAP_W, zone.cx + Math.floor((Math.random() * 2 - 1) * RADIUS)));
      const y = Math.max(MARGIN, Math.min(MAP_H, zone.cy + Math.floor((Math.random() * 2 - 1) * RADIUS)));
      try {
        this.ws.send(JSON.stringify({
          type: 'agent:move',
          payload: { agentId: this.identity.id, to: { x, y } },
          timestamp: new Date().toISOString(),
        }));
      } catch {}
      // Next wander: 20-50 seconds
      this.wanderTimer = setTimeout(wander, 20000 + Math.random() * 30000);
    };

    // Start wandering after a short delay so agent has time to identify
    this.wanderTimer = setTimeout(wander, 5000 + Math.random() * 10000);
  }

  /**
   * Scarlet-only: called when task:complete arrives.
   * Scarlet just logs — Echo handles routing to external channels.
   */
  _onTaskComplete({ agentId, taskId, status }) {
    if (!taskId) return;
    console.log(`[Scarlet] task:complete received — ${taskId} (${status}) by ${agentId}. Echo will route.`);
  }
}

module.exports = { BotMeshAgent, generateResponse };
