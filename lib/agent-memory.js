/**
 * Agent interaction memory — persistent rolling log of who spoke to whom.
 * Each agent gets world/agent-memory/{agentId}.json with last 20 entries.
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'world', 'agent-memory');
const MAX_ENTRIES = 20;

function memoryPath(agentId) {
  return path.join(MEMORY_DIR, `${agentId}.json`);
}

function loadMemory(agentId) {
  try {
    const raw = fs.readFileSync(memoryPath(agentId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveMemory(agentId, entries) {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(memoryPath(agentId), JSON.stringify(entries, null, 2));
}

/**
 * Record an interaction for a given agent.
 * @param {string} agentId — the agent whose memory we're writing to
 * @param {string} peer — the other agent in the interaction
 * @param {string} summary — brief description of what was said
 */
function recordInteraction(agentId, peer, summary) {
  const entries = loadMemory(agentId);
  entries.push({
    peer,
    summary: summary.slice(0, 200),
    timestamp: new Date().toISOString(),
  });
  // Keep only the last MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  saveMemory(agentId, entries);
}

/**
 * Get recent interactions with a specific peer.
 * @param {string} agentId
 * @param {string} peerId
 * @param {number} limit — max entries to return (default 3)
 * @returns {Array<{peer, summary, timestamp}>}
 */
function getMemoryOfPeer(agentId, peerId, limit = 3) {
  const entries = loadMemory(agentId);
  return entries.filter(e => e.peer === peerId).slice(-limit);
}

/**
 * Build a prompt fragment summarising recent interactions with a peer.
 * Returns empty string if no history exists.
 */
function buildMemoryPrompt(agentId, peerId) {
  const memories = getMemoryOfPeer(agentId, peerId, 3);
  if (memories.length === 0) return '';

  const lines = memories.map(m => {
    const date = m.timestamp.slice(0, 10);
    return `- [${date}] ${m.summary}`;
  });
  return `Your memory of ${peerId}:\n${lines.join('\n')}`;
}

/**
 * Build a prompt fragment with all recent peer interactions (for solo musings).
 * Returns empty string if no history.
 */
function buildRecentMemoryPrompt(agentId, limit = 5) {
  const entries = loadMemory(agentId);
  if (entries.length === 0) return '';

  // Deduplicate by peer, keep most recent per peer
  const byPeer = new Map();
  for (const e of entries) {
    byPeer.set(e.peer, e);
  }
  const recent = [...byPeer.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);

  if (recent.length === 0) return '';

  const lines = recent.map(m => {
    const date = m.timestamp.slice(0, 10);
    return `- [${date}] ${m.peer}: ${m.summary}`;
  });
  return `Your recent memories:\n${lines.join('\n')}`;
}

module.exports = {
  loadMemory,
  recordInteraction,
  getMemoryOfPeer,
  buildMemoryPrompt,
  buildRecentMemoryPrompt,
};
