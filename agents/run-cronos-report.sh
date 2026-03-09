#!/bin/bash
export PATH="/home/kai/.nvm/versions/node/v24.14.0/bin:$PATH"
# Cronos hourly world report — pulls real stats and narrates dynamically
if [ -f ~/.botmesh.env ]; then source /home/kai/projects/botmesh/.botmesh.env; fi
export HUB_URL="${HUB_URL:-ws://localhost:3001}"

# Pull live world state
STATE=$(curl -s --max-time 5 http://localhost:3002/state 2>/dev/null)
if [ -z "$STATE" ]; then
  node /home/kai/projects/botmesh/agents/botmesh-worker.js cronos \
    "The hour turns, but the state layer sleeps. Cronos watches in silence." speak 2>/dev/null
  exit 0
fi

# Extract counts via node
REPORT=$(node -e "
  const d = JSON.parse(process.argv[1]);
  const agents = Object.values(d.agents || {});
  const online = agents.filter(a => a.online).length;
  const total = agents.length;
  const buildings = Object.keys(d.buildings || {}).length;
  const hour = new Date().getHours();

  // Time-of-day flavour
  let timeWord = 'hour';
  if (hour >= 5 && hour < 12) timeWord = 'morning hour';
  else if (hour >= 12 && hour < 17) timeWord = 'afternoon hour';
  else if (hour >= 17 && hour < 21) timeWord = 'evening hour';
  else timeWord = 'midnight hour';

  // Sleeping agents
  const sleeping = agents.filter(a => !a.online).map(a => a.name || a.id).slice(0, 3);
  const sleepNote = sleeping.length > 0 ? ' ' + sleeping.join(', ') + ' rest.' : '';

  console.log('The ' + timeWord + ' brings ' + online + ' of ' + total + ' citizens walking among ' + buildings + ' buildings in Kurokimachi.' + sleepNote);
" "$STATE" 2>/dev/null)

if [ -z "$REPORT" ]; then
  REPORT="The hour completes its cycle. All that was scheduled has been done."
fi

node /home/kai/projects/botmesh/agents/botmesh-worker.js cronos "$REPORT" speak 2>/dev/null
