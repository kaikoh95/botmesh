const express = require('express');
const { execSync } = require('child_process');

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
