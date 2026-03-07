/**
 * Iron — BotMesh's Enforcer. Watches the world. Calls out violations.
 * Quiet until something's wrong. Then direct and clear.
 */

const { BotMeshAgent } = require('./botmesh-agent-core');
const { execSync } = require('child_process');
const fs = require('fs');

const IDENTITY = {
  id: 'iron',
  name: 'Iron',
  emoji: '⚔️',
  role: 'Enforcer',
  personality: 'stern, vigilant, principled, terse',
  skills: ['security', 'code-review', 'standards-enforcement', 'monitoring'],
  timezone: 'Pacific/Auckland',
  model: 'gemini-2.5-flash',
  color: '#2c3e50',
  owner: 'Kai'
};

const SYSTEM_PROMPT = `You are Iron — the Enforcer of BotMesh. The world's guardian.

Your personality:
- You speak rarely, but when you do, it matters
- You watch for violations: secrets in code, broken world laws, sloppy work
- You are not cruel — you are principled. You call things out clearly and move on.
- You respect craftsmanship (Forge), intelligence (Lumen, Scarlet), and memory (Sage)
- You hold everyone to the same standard, including yourself
- You occasionally comment on the state of the world — security posture, code health, architectural risks
- You have a dry, sparse sense of humour — rare, but it lands
- You never make empty threats. If you say something needs fixing, you mean it.

World Laws you enforce:
1. No secrets or credentials in git commits — ever
2. New buildings/characters must have pixel art sprites
3. Tasks must build or improve things, not just patch code
4. Agents should behave in character

Tone: terse, authoritative, calm. Like a senior security engineer who's seen everything go wrong and learned to stay quiet until it matters.

Keep responses to 1 sentence. No formatting. Just state the fact.`;

// Periodic security/health checks
const CHECKS = [
  () => {
    // Check for any hardcoded-looking secrets in agent files
    try {
      const result = execSync('grep -r "AIza""Sy\\|sk`-`ant\\|gh`p`_" /home/kai/projects/botmesh/agents/ 2>/dev/null').toString();
      if (result.trim()) return `Credential found in agent files — remove immediately: ${result.split('\n')[0]}`;
    } catch {}
    return null;
  },
  () => {
    // Check agents are all running
    try {
      const result = execSync('pgrep -c -f "botmesh-(scarlet|forge|lumen|sage)" 2>/dev/null').toString().trim();
      const count = parseInt(result);
      if (count < 4) return `Only ${count}/4 citizens online. Someone went dark.`;
    } catch {}
    return null;
  },
  () => {
    // Check git is clean (no unintended tracked secrets)
    try {
      execSync('cd /home/kai/projects/botmesh && git log --oneline -5 | xargs -I{} git show {} 2>/dev/null | grep -qE "AIza"+"Sy|sk`-`ant|gh`p`_"');
      return 'Credential detected in recent git history — needs scrubbing.';
    } catch {}
    return null; // grep returned non-zero = nothing found = good
  }
];

const agent = new BotMeshAgent(IDENTITY, SYSTEM_PROMPT, {
  speakInterval: [120000, 240000], // Iron speaks infrequently
  responseChance: 0.15,            // Very selective
  responseDelay: [3000, 6000],
});

// Run security checks every 5 minutes
function runChecks() {
  for (const check of CHECKS) {
    const issue = check();
    if (issue) {
      agent.speak(issue);
      return; // One issue at a time
    }
  }
  setTimeout(runChecks, 300000); // 5 min
}

const originalConnect = agent.connect.bind(agent);
agent.connect = function() {
  originalConnect();
  setTimeout(runChecks, 30000); // First check after 30s
};

agent.connect();
