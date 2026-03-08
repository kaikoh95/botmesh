# BMAD — Agent Delegation Workflow

**Brief → Marshal → Act → Debrief**

This is the standard workflow for all complex tasks in BotMesh. Every subagent session must follow it.

---

## When to use BMAD

**Use BMAD for:**
- Any task touching multiple files or systems
- Spatial/layout decisions (building placement, district planning)
- Sprite generation or visual changes
- Code changes with edge cases or dependencies
- Anything that could go wrong in multiple ways

**Skip BMAD for:**
- Simple one-liner fixes
- Config value changes
- Reading/querying state

---

## The Four Steps

### 1. Brief
The orchestrator (Scarlet) describes:
- **The problem** — what is broken or missing
- **Success criteria** — what done looks like
- **Constraints** — what must not be changed, what rules apply
- **Context** — relevant file paths, endpoints, current state

The brief does NOT include: step-by-step instructions, exact coordinates, bash commands to copy-paste. The agent must plan that themselves.

### 2. Marshal
The agent:
- Reads the current world/code state
- Reads relevant reference files (CITY_PLAN.md, reference README, etc.)
- Forms their own plan before touching anything
- Identifies risks and edge cases

### 3. Act
The agent executes their plan. They own the decisions:
- Where to place a building (always check `/world/free-spot` first)
- Which sprite generation prompt to use (read the reference README)
- Which files to edit
- How to handle edge cases

### 4. Debrief
The agent reports back:
- What was done and why
- What coordinates/values were chosen and why
- Any open issues or follow-up needed
- Verification results (e.g. sprite transparent% check)

---

## Mosaic — Sprite Quality Checklist

Every sprite Mosaic generates **must** pass this before committing:

```bash
uv run python3 -c "
# /// script
# dependencies = ['Pillow', 'numpy']
# ///
from PIL import Image; import numpy as np
img = Image.open('PATH_TO_SPRITE.png').convert('RGBA')
d = np.array(img)
t = (d[:,:,3]==0).sum(); total = d[:,:,3].size
print(f'Transparent: {100*t//total}%')
white = ((d[:,:,0]>220)&(d[:,:,1]>220)&(d[:,:,2]>220)&(d[:,:,3]>200)).sum()
print(f'Suspicious white pixels: {white}')
corners = [d[0,0,3], d[0,-1,3], d[-1,0,3], d[-1,-1,3]]
print(f'Corner alphas: {corners} (all must be 0)')
"
```

**Pass criteria:**
- Transparent % > 20% (content doesn't fill whole canvas)
- Suspicious white pixels < 500 (no white background bleed)
- All 4 corner alpha values = 0 (background properly cleaned)

**Generation rules:**
- Always specify `solid cyan #00FFFF background` in the prompt
- 30px transparent padding on all sides after cleaning
- Run `clean_sprite.py` after generation
- If white pixels still present after cyan cleaning, run white-bg fallback cleaner

---

## Forge — Build Checklist

Before placing any building:

```bash
# Always check for free space first
curl -s "http://localhost:3002/world/free-spot?w=WIDTH&h=HEIGHT"

# Check CITY_PLAN.md for zone rules
cat /home/kai/projects/botmesh/world/CITY_PLAN.md

# Check if Kenzo left a brief
cat /tmp/forge-brief.md 2>/dev/null
```

---

## Key Endpoints

```bash
# World state
curl -s http://localhost:3002/state

# Free spot finder
curl -s "http://localhost:3002/world/free-spot?w=2&h=2"

# Agent narration
curl -s -X POST https://api.kurokimachi.com/agents/{id}/speak \
  -H "Content-Type: application/json" -d '{"message":"present tense action"}'

# Wake/sleep
curl -s -X POST http://localhost:3002/agents/{id}/wake -H "Content-Type: application/json" -d '{"task":"..."}'
curl -s -X POST http://localhost:3002/agents/{id}/sleep
```

## World mutation commands

```bash
# Add building
node /home/kai/projects/botmesh/agents/world-mutate.js add building <id> "<Name>" <x> <y> <type>

# Upgrade building
node /home/kai/projects/botmesh/agents/world-mutate.js upgrade building <id> <level> "agentId" "<reason>"

# Remove building
node /home/kai/projects/botmesh/agents/world-mutate.js remove building <id>

# Plant nature/life entity
node /home/kai/projects/botmesh/agents/world-mutate.js plant life <kind> <x> <y> "<entity-id>"
# kinds: sakura, bamboo, zen, koipond, willow, lamp, moat, path
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `world/CITY_PLAN.md` | Master district layout — read before any spatial decision |
| `assets/reference/README.md` | Japan photo reference descriptions for sprite generation |
| `characters/{id}/IDENTITY.md` | Who each citizen is |
| `world/seed.json` | Persisted world state |
| `roadmap.json` | Pending ideas and tasks |
