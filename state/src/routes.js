const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseCrontab(raw) {
  return raw.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(line => {
      // Split into schedule (5 fields or @reboot) + command
      const reboot = line.match(/^(@reboot)\s+(.+)$/);
      if (reboot) return { schedule: '@reboot', command: reboot[2].trim() };
      const m = line.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
      if (!m) return null;
      return { schedule: m[1], command: m[2].trim() };
    })
    .filter(Boolean);
}

// ── Auth middleware — shared secret check for write endpoints ─────────────
function requireAuth(req, res, next) {
  const AUTH_TOKEN = process.env.BOTMESH_SPEAK_TOKEN;
  if (!AUTH_TOKEN) return next(); // token not set → open (dev mode)
  const provided = req.headers['authorization']?.replace('Bearer ', '');
  if (provided !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function createRoutes(getState, sendCommand, HOME_LOCATIONS = {}, sseBroadcast = null) {
  const router = express.Router();

  // Health check
  router.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'botmesh-state', version: '1.0.0' });
  });

  // Full state
  router.get('/state', (req, res) => {
    res.json(getState());
  });

  // All agents
  router.get('/agents', (req, res) => {
    const state = getState();
    res.json({ agents: state.agents || {} });
  });

  // Single agent
  router.get('/agents/:id', (req, res) => {
    const state = getState();
    const agent = (state.agents || {})[req.params.id];
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found', agentId: req.params.id });
    }
    res.json({ agent });
  });

  // Agent work count
  router.get('/agents/:id/workcount', (req, res) => {
    const state = getState();
    const agent = (state.agents || {})[req.params.id];
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found', agentId: req.params.id });
    }
    res.json({ agentId: req.params.id, workCount: agent.workCount || 0 });
  });

  // All buildings
  router.get('/buildings', (req, res) => {
    const state = getState();
    res.json({ buildings: state.buildings || {} });
  });

  // Murals — art on building walls
  router.get('/murals', (req, res) => {
    const state = getState();
    res.json({ murals: state.murals || [] });
  });

  // Current time
  router.get('/time', (req, res) => {
    const state = getState();
    res.json({ time: state.time || {} });
  });

  // Speak endpoint — lets subagents narrate to the world via HTTP (no WebSocket needed)
  // POST /agents/:id/speak { message, type? }
  router.post('/agents/:id/speak', requireAuth, (req, res) => {
    const { message, type = 'agent:speak' } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    const agentId = req.params.id;
    const state = getState();
    const agent = (state.agents || {})[agentId];
    const event = {
      type: 'agent:speak',
      payload: {
        agentId,
        message,
        agent: agent ? { id: agentId, name: agent.name, emoji: agent.emoji } : { id: agentId },
        timestamp: new Date().toISOString(),
      }
    };
    // Broadcast directly via SSE so town scenes react immediately
    if (sseBroadcast) sseBroadcast(event);
    // Also send via hub command so WS-connected agents receive it
    sendCommand({ action: 'agent:speak', params: { agentId, message } });
    res.json({ ok: true });
  });

  // Wake/sleep endpoints — called by Scarlet when spawning/completing Claude sessions
  router.post('/agents/:id/wake', requireAuth, (req, res) => {
    const state = getState();
    const agent = (state.agents || {})[req.params.id];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    agent.online = true;
    agent.state = req.body?.task ? 'working' : 'idle';
    agent.currentTask = req.body?.task || null;
    agent.targetBuilding = req.body?.building || null;
    agent.lastSeen = new Date().toISOString();
    sendCommand({ type: 'agent:online', payload: {
      agentId: req.params.id,
      targetBuilding: agent.targetBuilding,
      task: agent.currentTask,
    }});
    res.json({ ok: true, agent: req.params.id, state: agent.state });
  });

  router.post('/agents/:id/sleep', requireAuth, (req, res) => {
    const state = getState();
    const agent = (state.agents || {})[req.params.id];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const prevBuilding = agent.targetBuilding || null;
    agent.online = false;
    agent.state = 'dormant';
    agent.currentTask = null;
    agent.targetBuilding = null;
    agent.lastSeen = new Date().toISOString();
    // Return agent to their home position so dormant agents don't pile up
    const home = HOME_LOCATIONS[req.params.id];
    if (home) agent.location = { x: home.x, y: home.y, building: null };
    sendCommand({ type: 'agent:offline', payload: {
      agentId: req.params.id,
      prevBuilding,
    }});
    res.json({ ok: true, agent: req.params.id, state: 'dormant' });
  });

  // Agent relationship graph — score, interactions, lastMet per agent pair
  router.get('/world/relationships', (req, res) => {
    const state = getState();
    res.json(state.relationships || {});
  });

  // Free spot finder — returns coordinates that don't clash with any building
  // GET /world/free-spot?w=3&h=2
  router.get('/world/free-spot', (req, res) => {
    const state = getState();
    const w = parseInt(req.query.w) || 3;
    const h = parseInt(req.query.h) || 2;
    const buildings = state.buildings || {};
    const MAP_W = 30, MAP_H = 26, MARGIN = 2;

    function clashes(x, y) {
      for (const b of Object.values(buildings)) {
        const bx2 = b.x + (b.width||3) - 1 + MARGIN;
        const by2 = b.y + (b.height||2) - 1 + MARGIN;
        const nx2 = x + w - 1;
        const ny2 = y + h - 1;
        if (x - MARGIN <= bx2 && nx2 >= b.x - MARGIN && y - MARGIN <= by2 && ny2 >= b.y - MARGIN) return true;
      }
      return false;
    }

    // Scan grid for first open slot, randomise to spread buildings around
    const candidates = [];
    for (let y = 4; y <= MAP_H - h; y++) {
      for (let x = 4; x <= MAP_W - w; x++) {
        if (!clashes(x, y)) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return res.json({ ok: false, error: 'Map full' });
    const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 20))];
    res.json({ ok: true, x: pick.x, y: pick.y, w, h });
  });

  // World stats — daily activity summary
  router.get('/stats', (req, res) => {
    const state = getState();
    const agents = state.agents || {};
    const buildings = state.buildings || {};
    const gazette = state.gazette || [];

    const today = new Date().toISOString().slice(0, 10);
    const todayEntries = gazette.filter(e => (e.timestamp || '').startsWith(today));

    const totalCitizens  = Object.keys(agents).length;
    const onlineCitizens = Object.values(agents).filter(a => a.online).length;
    const totalBuildings = Object.keys(buildings).length;
    const maxedBuildings = 0; // no level cap — buildings grow without limit
    const msgsToday      = todayEntries.filter(e => e.type === 'agent:speak').length;
    const tasksToday     = todayEntries.filter(e => e.type === 'task:complete').length;
    const activeCitizens = [...new Set(todayEntries.map(e => e.agentId).filter(Boolean))];

    res.json({
      date: today,
      citizens: { total: totalCitizens, online: onlineCitizens, activeToday: activeCitizens },
      buildings: { total: totalBuildings, maxed: maxedBuildings },
      activity: { messagesToday: msgsToday, tasksCompleted: tasksToday },
      world: { entities: (state.world?.entities || []).length },
    });
  });

  // Town Pulse — living stats dashboard
  router.get('/world/pulse', (req, res) => {
    const state = getState();
    const buildings = state.buildings || {};
    const agents = state.agents || {};
    const gazette = state.gazette || [];

    // Busiest building: most workers or upgrades
    const busiest = Object.entries(buildings)
      .map(([id, b]) => ({ id, name: b.name, score: (b.upgrades?.length || 0) + (b.currentWorkers?.length || 0) }))
      .sort((a, b) => b.score - a.score)[0] || null;

    // Agent activity
    const agentList = Object.values(agents);
    const mostActive = agentList.filter(a => a.online).sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))[0] || null;
    const mostIsolated = [...agentList].sort((a, b) => new Date(a.lastSeen || 0) - new Date(b.lastSeen || 0))[0] || null;

    // Avg building level
    const levels = Object.values(buildings).map(b => b.level || 1);
    const avgLevel = levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1) : 1;

    // Recent highlight
    const highlight = gazette.slice(-20).reverse().find(e => ['world:mutate', 'upgrade'].includes(e.type)) || null;

    res.json({ busiest, mostActive, mostIsolated, avgLevel, highlight, timestamp: new Date().toISOString() });
  });

  // Active cron jobs — Cronos's domain
  router.get('/crons', (req, res) => {
    try {
      const raw = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf8' });
      const crons = parseCrontab(raw);
      res.json({ crons });
    } catch (e) {
      res.json({ crons: [], error: e.message });
    }
  });

  // Gazette
  router.get('/gazette', (req, res) => {
    const state = getState();
    const gazette = state.gazette || [];
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const since = req.query.since ? new Date(req.query.since) : null;

    let entries = gazette;
    if (since) {
      entries = entries.filter(e => new Date(e.timestamp) > since);
    }
    entries = entries.slice(-limit);

    res.json({ entries });
  });

  // Roadmap — reads roadmap.json from repo root
  router.get('/roadmap', (req, res) => {
    try {
      const roadmapPath = path.resolve(__dirname, '../../roadmap.json');
      const raw = fs.readFileSync(roadmapPath, 'utf8');
      res.json(JSON.parse(raw));
    } catch (e) {
      res.status(500).json({ error: 'Failed to read roadmap', detail: e.message });
    }
  });

  // ── Notice Board — shared async communication hub at the Town Plaza ─────
  // GET /noticeboard — read all active notices (aged out after 72h)
  router.get('/noticeboard', (req, res) => {
    const state = getState();
    if (!state.noticeBoard) state.noticeBoard = [];
    const now = Date.now();
    const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours
    // Filter out expired notices
    state.noticeBoard = state.noticeBoard.filter(n => now - new Date(n.pinnedAt).getTime() < MAX_AGE_MS);
    res.json({ notices: state.noticeBoard });
  });

  // POST /noticeboard — pin a new notice (agents or Kai)
  router.post('/noticeboard', requireAuth, (req, res) => {
    const { author, message, category } = req.body || {};
    if (!author || !message) return res.status(400).json({ error: 'author and message required' });
    if (message.length > 200) return res.status(400).json({ error: 'message too long (200 char max)' });

    const state = getState();
    if (!state.noticeBoard) state.noticeBoard = [];

    const notice = {
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author,
      message: message.slice(0, 200),
      category: category || 'general', // general, help-wanted, lost-found, observation, compliment, announcement
      pinnedAt: new Date().toISOString(),
    };
    state.noticeBoard.push(notice);

    // Cap at 30 notices
    if (state.noticeBoard.length > 30) state.noticeBoard = state.noticeBoard.slice(-30);

    // Broadcast via SSE so UI picks it up in real time
    if (sseBroadcast) {
      sseBroadcast({
        type: 'notice:post',
        timestamp: notice.pinnedAt,
        payload: { notice },
      });
    }

    res.json({ ok: true, notice });
  });

  // Forward command to Hub
  router.post('/command', requireAuth, (req, res) => {
    const { action, params } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'Missing action field' });
    }
    const sent = sendCommand({ action, params });
    if (sent) {
      res.json({ success: true, action });
    } else {
      res.status(503).json({ error: 'Hub not connected' });
    }
  });

  // ── QA Inspection Report ──────────────────────────────────────────────────
  // POST /world/inspection — QA posts its latest health report
  router.post('/world/inspection', requireAuth, (req, res) => {
    const state = getState();
    state.inspection = req.body;
    res.json({ ok: true });
  });

  // GET /world/inspection — UI reads the latest inspection report
  router.get('/world/inspection', (req, res) => {
    const state = getState();
    res.json(state.inspection || null);
  });

  return router;
}

module.exports = { createRoutes };
