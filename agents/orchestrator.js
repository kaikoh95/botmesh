#!/usr/bin/env node
/**
 * Orchestrator — receives a problem, delegates to the right specialist agent.
 *
 * Usage:
 *   node agents/orchestrator.js "The Market building is missing its sprite"
 *   source ~/.botmesh.env && node agents/orchestrator.js "Fix mobile void bleed"
 *
 * Never does work itself — only spawns agents with BMAD briefs.
 */

const { execSync } = require('child_process');

const BOTMESH = '/home/kai/projects/botmesh';

const AGENTS = {
  patch:  { role: 'Code fixes, UI bugs, JS errors, server issues, any file edits', emoji: '🔧' },
  mosaic: { role: 'Pixel art sprites, building images, visual assets', emoji: '🎨' },
  kenzo:  { role: 'City layout, building placement, district planning, coordinates', emoji: '🗺️' },
  forge:  { role: 'World building decisions, what to build next, town growth', emoji: '⚙️' },
  lumen:  { role: 'Research, analysis, fact-finding', emoji: '🔬' },
  sage:   { role: 'Documentation, memory, writing', emoji: '📖' },
};

const roster = Object.entries(AGENTS)
  .map(([id, a]) => `- ${id.charAt(0).toUpperCase() + id.slice(1)} ${a.emoji}: ${a.role}`)
  .join('\n');

const SYSTEM = `You are the Orchestrator for Kurokimachi. You receive a task and delegate it to the right specialist agent.

Agent roster:
${roster}

For the given task:
1. Identify which agent owns it (could be multiple in sequence)
2. Write a BMAD brief: Problem + success criteria + constraints
3. Spawn that agent using: cd ${BOTMESH} && claude --permission-mode bypassPermissions --print "<brief>"
4. Wait for completion
5. Report: what was done, which agent did it, outcome

Rules:
- Never do the work yourself — always delegate
- One agent at a time unless tasks are truly independent
- Brief describes the PROBLEM and success criteria — NOT implementation steps
- After spawning, poll logs and wait for the agent to finish

Project root: ${BOTMESH}`;

// ─── Main ───────────────────────────────────────────────────────────────────

const task = process.argv.slice(2).join(' ');
if (!task) {
  console.error('Usage: node agents/orchestrator.js "<task description>"');
  process.exit(1);
}

console.log(`[orchestrator] Task: ${task}`);
console.log('[orchestrator] Spawning Claude to decide + delegate...');

const prompt = `${SYSTEM}\n\n## Task\n${task}\n\nDelegate this now. Spawn the right agent. Wait for completion. Report back.`;

try {
  const result = execSync(
    `claude --permission-mode bypassPermissions --print ${JSON.stringify(prompt)}`,
    { cwd: BOTMESH, timeout: 600000, encoding: 'utf-8', env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log('\n[orchestrator] Result:\n');
  console.log(result);

  // Notify Scarlet
  const summary = result.slice(0, 200).replace(/\n/g, ' ').trim();
  try {
    execSync(`openclaw system event --text "Orchestrator done: ${summary}" --mode now`, {
      cwd: BOTMESH, timeout: 15000, encoding: 'utf-8',
    });
  } catch { /* non-fatal */ }

} catch (err) {
  console.error(`[orchestrator] Failed: ${err.message}`);
  process.exit(1);
}
