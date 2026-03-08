const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';

export function createStateClient({ onEvent, onStateSync, onConnect, onDisconnect }) {
  let evtSource = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let sseFailCount = 0;
  let pollTimer = null;
  let lastStateHash = null;
  let sseAlive = false;

  // ── Polling fallback ───────────────────────────────────────────────────────
  // Cloudflare tunnels buffer SSE — polling guarantees real-time updates
  // regardless of tunnel behaviour. SSE still runs in parallel for instant events.
  async function pollState() {
    try {
      const res = await fetch(`${STATE_URL}/state`);
      if (!res.ok) return;
      const state = await res.json();
      const hash = JSON.stringify([
        Object.keys(state.buildings || {}).length,
        Object.keys(state.agents || {}).length,
        (state.world?.entities || []).length,
        state.time?.hour,
      ]);
      if (hash !== lastStateHash) {
        lastStateHash = hash;
        if (onStateSync) onStateSync(state);
      }
      // Update connection indicator
      _setStatus(sseAlive ? 'live' : 'polling');
    } catch (e) {
      _setStatus('disconnected');
    }
  }

  function startPolling(intervalMs = 3000) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollState, intervalMs);
    pollState(); // immediate first fetch
  }

  function _setStatus(status) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    const colors = { live: '#4caf50', polling: '#ff9800', disconnected: '#f44336' };
    const labels = { live: '⚡ Live', polling: '🔄 Polling', disconnected: '❌ Offline' };
    el.style.color = colors[status] || '#888';
    el.textContent = labels[status] || status;
  }

  // ── SSE (real-time bonus — instant when working) ───────────────────────────
  function connectSSE() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource(`${STATE_URL}/events`);

    evtSource.addEventListener('connected', () => {
      console.log('[UI] SSE connected');
      reconnectDelay = 1000;
      sseFailCount = 0;
      sseAlive = true;
      _setStatus('live');
      if (onConnect) onConnect();
    });

    evtSource.addEventListener('state:sync', (e) => {
      const state = JSON.parse(e.data);
      lastStateHash = null; // force poll to see this as fresh
      if (onStateSync) onStateSync(state);
    });

    // Live viewer count
    evtSource.addEventListener('viewers', (e) => {
      const data = JSON.parse(e.data);
      const el = document.getElementById('viewer-count');
      if (el) el.textContent = '👁 ' + (data.count || 1);
    });

    const eventTypes = [
      'time:tick',
      'agent:move', 'agent:speak', 'agent:action',
      'agent:state', 'agent:mood',
      'agent:joined', 'agent:online', 'agent:offline',
      'agent:work', 'building:upgraded',
      'building:damaged', 'building:restored',
      'task:complete', 'infra:down', 'infra:up', 'agent:crashed',
      'world:mutate', 'world:event', 'system:start'
    ];

    for (const type of eventTypes) {
      evtSource.addEventListener(type, (e) => {
        const data = JSON.parse(e.data);
        const payload = data.payload || data;
        if (onEvent) onEvent({ type, payload, timestamp: data.timestamp });
        // Any SSE event = invalidate poll hash so next poll catches full state
        lastStateHash = null;
      });
    }

    evtSource.onerror = () => {
      console.warn('[UI] SSE error — polling will cover updates');
      evtSource.close();
      evtSource = null;
      sseAlive = false;
      sseFailCount++;
      _setStatus('polling');
      if (onDisconnect) onDisconnect();
      // Cap backoff at 5s — poll covers us while SSE is down
      reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, reconnectDelay);
  }

  // Override connectSSE to also start polling
  const _origConnect = connectSSE;
  function connectSSE_withPoll() {
    _origConnect();
    startPolling(3000); // always poll every 3s — reliable through any proxy
  }

  async function fetchState() {
    const res = await fetch(`${STATE_URL}/state`);
    return res.json();
  }

  async function sendCommand(action, params) {
    const res = await fetch(`${STATE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params })
    });
    return res.json();
  }

  return { connectSSE: connectSSE_withPoll, fetchState, sendCommand };
}
