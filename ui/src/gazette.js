const ICONS = {
  'agent:speak':   '\u{1F4AC}',
  'agent:move':    '\u{1F6B6}',
  'agent:action':  '\u26A1',
  'agent:state':   '\u{1F504}',
  'agent:mood':    '\u{1F60A}',
  'agent:joined':  '\u{1F31F}',
  'agent:online':  '\u{1F7E2}',
  'agent:offline': '\u26AB',
  'time:tick':     '\u{1F305}',
  'world:event':   '\u{1F30D}',
  'system:start':  '\u{1F680}',
};

const MAX_ENTRIES = 100;
let feedEl = null;
let agentColors = {};
let agentEmojis = {};

export function createGazette(container) {
  feedEl = container;
}

export function setAgentColors(colors) {
  agentColors = colors;
}

export function setAgentEmojis(emojis) {
  agentEmojis = emojis;
}

export function setNightMode(isNight) {
  if (!feedEl) return;
  const existing = feedEl.querySelector('.night-banner');
  if (isNight && !existing) {
    const banner = document.createElement('div');
    banner.className = 'night-banner';
    banner.innerHTML = '\u{1F319} Town is asleep...';
    feedEl.prepend(banner);
  } else if (!isNight && existing) {
    existing.remove();
  }
}

export function addEntry(event) {
  if (!feedEl) return;

  // Remove empty state message
  const empty = feedEl.querySelector('.empty-state');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'gazette-entry';
  el.dataset.type = event.type;

  const icon = ICONS[event.type] || '\u2022';
  const time = formatTime(event.payload?.timestamp || new Date().toISOString());
  const { agentName, content, agentId } = formatEvent(event);

  const color = agentColors[agentId] || '#aaa';
  const emoji = agentEmojis[agentId] || '';

  // Speech entries get chat bubble styling
  if (event.type === 'agent:speak') {
    el.innerHTML = `
      <span class="entry-time">${time}</span>
      <div class="chat-bubble">
        <span class="agent-dot" style="background:${color}"></span>
        ${emoji ? `<span class="entry-emoji">${emoji}</span>` : ''}
        <span class="entry-agent" style="color:${color}">${agentName}</span>
        <div class="entry-content chat-message">${content}</div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <span class="entry-time">${time}</span>
      <span class="entry-icon">${icon}</span>
      ${agentName ? `<span class="agent-dot" style="background:${color}"></span><span class="entry-agent" style="color:${color}">${agentName}</span> ` : ''}
      <span class="entry-content">${content}</span>
    `;
  }

  feedEl.prepend(el);

  while (feedEl.children.length > MAX_ENTRIES) {
    feedEl.removeChild(feedEl.lastChild);
  }
}

export function loadEntries(entries) {
  for (const entry of entries.reverse()) {
    addEntry(entry);
  }
}

function formatEvent(event) {
  const p = event.payload || {};
  const agentId = p.agentId || p.agent?.id;
  const name = p.agent?.name || p.agentId || agentId;

  switch (event.type) {
    case 'agent:speak':
      return { agentId, agentName: name, content: p.message };
    case 'agent:move':
      return { agentId, agentName: name, content: `moved to (${p.to?.x}, ${p.to?.y})` };
    case 'agent:action':
      return { agentId, agentName: name, content: `${p.action}${p.target ? ' on ' + p.target : ''}` };
    case 'agent:state':
      return { agentId, agentName: name, content: `now ${p.to}` };
    case 'agent:mood':
      return { agentId, agentName: name, content: `feeling ${p.to}` };
    case 'agent:joined':
      return { agentId: p.agent?.id, agentName: p.agent?.name || agentId, content: 'joined the town!' };
    case 'agent:online':
      return { agentId, agentName: name, content: 'came online' };
    case 'agent:offline':
      return { agentId, agentName: name, content: 'went offline' };
    case 'time:tick':
      return { agentId: null, agentName: null, content: `${p.period} \u2014 ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}` };
    case 'world:event':
      return { agentId: null, agentName: null, content: p.description || p.event };
    case 'system:start':
      return { agentId: null, agentName: null, content: 'World started' };
    default:
      return { agentId, agentName: name, content: JSON.stringify(p) };
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
