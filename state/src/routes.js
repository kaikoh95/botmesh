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

function createRoutes(getState, sendCommand) {
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

  // All buildings
  router.get('/buildings', (req, res) => {
    const state = getState();
    res.json({ buildings: state.buildings || {} });
  });

  // Current time
  router.get('/time', (req, res) => {
    const state = getState();
    res.json({ time: state.time || {} });
  });

  // Speak endpoint — lets subagents narrate to the world via HTTP (no WebSocket needed)
  // POST /agents/:id/speak { message, type? }
  router.post('/agents/:id/speak', (req, res) => {
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
    // Broadcast via hub command (hub expects action + params format)
    sendCommand({ action: 'agent:speak', params: { agentId, message } });
    res.json({ ok: true });
  });

  // Wake/sleep endpoints — called by Scarlet when spawning/completing Claude sessions
  router.post('/agents/:id/wake', (req, res) => {
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

  router.post('/agents/:id/sleep', (req, res) => {
    const state = getState();
    const agent = (state.agents || {})[req.params.id];
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const prevBuilding = agent.targetBuilding || null;
    agent.online = false;
    agent.state = 'dormant';
    agent.currentTask = null;
    agent.targetBuilding = null;
    agent.lastSeen = new Date().toISOString();
    sendCommand({ type: 'agent:offline', payload: {
      agentId: req.params.id,
      prevBuilding,
    }});
    res.json({ ok: true, agent: req.params.id, state: 'dormant' });
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

  // Forward command to Hub
  router.post('/command', (req, res) => {
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

  return router;
}

module.exports = { createRoutes };
