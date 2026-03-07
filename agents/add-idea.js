#!/usr/bin/env node
/**
 * add-idea.js — CLI helper for Muse to add ideas to roadmap.json
 *
 * Usage:
 *   node add-idea.js "<title>" "<description>" <priority> <complexity> "[agent1,agent2]"
 */

const fs   = require('fs');
const path = require('path');

const ROADMAP = path.join(__dirname, '../roadmap.json');

const [,, title, description, priority='medium', complexity='medium', agentsStr='[]'] = process.argv;

if (!title || !description) {
  console.error('Usage: node add-idea.js "<title>" "<description>" <priority> <complexity> "[agents]"');
  process.exit(1);
}

let agents = [];
try { agents = JSON.parse(agentsStr); } catch { agents = [agentsStr]; }

let roadmap = { ideas: [] };
try { roadmap = JSON.parse(fs.readFileSync(ROADMAP, 'utf8')); } catch {}
if (!Array.isArray(roadmap.ideas)) roadmap.ideas = [];

const idea = {
  id:          `idea-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
  title,
  description,
  priority,
  complexity,
  agents,
  status:      'idea',
  addedBy:     'muse',
  addedAt:     new Date().toISOString(),
};

roadmap.ideas.push(idea);
fs.writeFileSync(ROADMAP, JSON.stringify(roadmap, null, 2));
console.log(`[Muse] Added idea: "${title}" (${priority}/${complexity})`);
