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

export function createGazette(container) {
  feedEl = container;
}

export function setAgentColors(colors) {
  agentColors = colors;
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
  const { agentName, content } = formatEvent(event);

  const color = agentColors[event.payload?.agentId] || '#aaa';

  el.innerHTML = `
    <span class="entry-time">${time}</span>
    <span class="entry-icon">${icon}</span>
    ${agentName ? `<span class="entry-agent" style="color:${color}">${agentName}</span> ` : ''}
    <span class="entry-content">${content}</span>
  `;

  feedEl.prepend(el);

  // Trim old entries
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
  const id = p.agentId || p.agent?.id;
  const name = p.agent?.name || id;

  switch (event.type) {
    case 'agent:speak':
      return { agentName: name, content: `"${p.message}"` };
    case 'agent:move':
      return { agentName: name, content: `moved to (${p.to?.x}, ${p.to?.y})` };
    case 'agent:action':
      return { agentName: name, content: `${p.action}${p.target ? ' on ' + p.target : ''}` };
    case 'agent:state':
      return { agentName: name, content: `now ${p.to}` };
    case 'agent:mood':
      return { agentName: name, content: `feeling ${p.to}` };
    case 'agent:joined':
      return { agentName: p.agent?.name || id, content: 'joined the town!' };
    case 'agent:online':
      return { agentName: name, content: 'came online' };
    case 'agent:offline':
      return { agentName: name, content: 'went offline' };
    case 'time:tick':
      return { agentName: null, content: `${p.period} - ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}` };
    case 'world:event':
      return { agentName: null, content: p.description || p.event };
    case 'system:start':
      return { agentName: null, content: 'World started' };
    default:
      return { agentName: name, content: JSON.stringify(p) };
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
