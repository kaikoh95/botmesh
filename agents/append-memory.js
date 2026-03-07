#!/usr/bin/env node
/**
 * append-memory.js — Scarlet's post-task memory writer
 *
 * Usage:
 *   node append-memory.js <agentId> <taskTitle> <summary> [lesson] [commitHash]
 *
 * Appends a structured entry to characters/{agentId}/MEMORY.md
 */

const fs   = require('fs');
const path = require('path');

const [,, agentId, taskTitle, summary, lesson, commitHash] = process.argv;

if (!agentId || !taskTitle || !summary) {
  console.error('Usage: append-memory.js <agentId> <taskTitle> <summary> [lesson] [commitHash]');
  process.exit(1);
}

const MEMORY_FILE = path.join(__dirname, `../characters/${agentId}/MEMORY.md`);

if (!fs.existsSync(MEMORY_FILE)) {
  console.error(`No MEMORY.md for agent: ${agentId}`);
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const entry = [
  ``,
  `## ${date} — ${taskTitle}`,
  `- What I did: ${summary}`,
  lesson     ? `- What I learned: ${lesson}` : null,
  commitHash ? `- Commit: ${commitHash}`      : null,
  `- Status: DONE`,
].filter(l => l !== null).join('\n');

fs.appendFileSync(MEMORY_FILE, entry + '\n');
console.log(`[memory] Appended to ${agentId}/MEMORY.md: ${taskTitle}`);
