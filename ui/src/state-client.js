const STATE_URL = window.BOTMESH_STATE_URL || 'http://localhost:3002';

export function createStateClient({ onEvent, onStateSync, onConnect, onDisconnect }) {
  let evtSource = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;

  function connectSSE() {
    if (evtSource) {
      evtSource.close();
    }

    evtSource = new EventSource(`${STATE_URL}/events`);

    evtSource.addEventListener('connected', () => {
      console.log('[UI] SSE connected');
      reconnectDelay = 1000;
      if (onConnect) onConnect();
    });

    evtSource.addEventListener('state:sync', (e) => {
      const state = JSON.parse(e.data);
      if (onStateSync) onStateSync(state);
    });

    // Listen for all known event types
    const eventTypes = [
      'time:tick',
      'agent:move', 'agent:speak', 'agent:action',
      'agent:state', 'agent:mood',
      'agent:joined', 'agent:online', 'agent:offline',
      'agent:work', 'building:upgraded',
      'world:event', 'system:start'
    ];

    for (const type of eventTypes) {
      evtSource.addEventListener(type, (e) => {
        const data = JSON.parse(e.data);
        // Hub events have shape {type, payload, timestamp}
        // Normalize so UI always receives {type, payload}
        const payload = data.payload || data;
        if (onEvent) onEvent({ type, payload, timestamp: data.timestamp });
      });
    }

    evtSource.onerror = () => {
      console.warn('[UI] SSE disconnected, reconnecting...');
      evtSource.close();
      evtSource = null;
      if (onDisconnect) onDisconnect();
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connectSSE();
    }, reconnectDelay);
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

  return { connectSSE, fetchState, sendCommand };
}
