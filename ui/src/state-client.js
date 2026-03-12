/**
 * State Client — connects to the BotMesh state layer via SSE.
 *
 * Architecture:
 *   1. fetchState()   — one HTTP GET on startup to get full world snapshot
 *   2. connectSSE()   — subscribe to the live event stream (permanent tunnel = reliable)
 *   3. onEvent()      — delta updates only; UI renders exactly what arrives
 *   4. onStateSync()  — full re-sync on SSE reconnect (hub sends it on connect)
 *
 * No polling. The tunnel is the broadcast pipe. UI is a pure renderer.
 */
const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';

export function createStateClient({ onEvent, onStateSync, onConnect, onDisconnect }) {
  let evtSource = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let sseAlive = false;

  function _setStatus(status) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    const map = {
      live:         { color: '#4caf50', label: '⚡ Live' },
      reconnecting: { color: '#ff9800', label: '🔄 Reconnecting' },
      disconnected: { color: '#f44336', label: '❌ Offline' },
    };
    const s = map[status] || { color: '#888', label: status };
    el.style.color = s.color;
    el.textContent = s.label;
  }

  // ── SSE stream ─────────────────────────────────────────────────────────────
  function connectSSE() {
    if (evtSource) { evtSource.close(); evtSource = null; }

    evtSource = new EventSource(`${STATE_URL}/events?transport=sse`);

    evtSource.addEventListener('connected', () => {
      console.log('[SSE] connected');
      sseAlive = true;
      reconnectDelay = 1000;
      _setStatus('live');
      if (onConnect) onConnect();
    });

    // Full world snapshot — sent by hub on connect and after reconnect
    evtSource.addEventListener('state:sync', (e) => {
      const state = JSON.parse(e.data);
      if (onStateSync) onStateSync(state);
    });

    // Viewer count
    evtSource.addEventListener('viewers', (e) => {
      const data = JSON.parse(e.data);
      const el = document.getElementById('viewer-count');
      if (el) el.textContent = '👁 ' + (data.count || 1);
    });

    // Delta events — UI renders exactly what arrives, no extra logic
    const eventTypes = [
      'time:tick',
      'agent:move', 'agent:speak', 'agent:action',
      'agent:state', 'agent:mood',
      'agent:joined', 'agent:online', 'agent:offline', 'agent:activity',
      'agent:work', 'building:upgraded',
      'building:damaged', 'building:restored',
      'task:complete', 'infra:down', 'infra:up', 'agent:crashed',
      'world:mutate', 'world:event', 'system:start', 'notice:post',
    ];
    for (const type of eventTypes) {
      evtSource.addEventListener(type, (e) => {
        const data = JSON.parse(e.data);
        const payload = data.payload || data;
        if (onEvent) onEvent({ type, payload, timestamp: data.timestamp });
      });
    }

    evtSource.onerror = () => {
      console.warn('[SSE] connection dropped — reconnecting');
      evtSource.close();
      evtSource = null;
      sseAlive = false;
      _setStatus('reconnecting');
      if (onDisconnect) onDisconnect();
      reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectSSE, reconnectDelay);
    };
  }

  async function fetchState() {
    const res = await fetch(`${STATE_URL}/state`);
    return res.json();
  }

  async function sendCommand(action, params) {
    const res = await fetch(`${STATE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    });
    return res.json();
  }

  return { connectSSE, fetchState, sendCommand };
}
