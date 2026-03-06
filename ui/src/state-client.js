const STATE_URL = 'https://employer-awesome-leaving-translation.trycloudflare.com';

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
      'world:event', 'system:start'
    ];

    for (const type of eventTypes) {
      evtSource.addEventListener(type, (e) => {
        const data = JSON.parse(e.data);
        if (onEvent) onEvent({ type, payload: data });
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
