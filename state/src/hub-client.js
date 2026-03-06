const WebSocket = require('ws');

const HUB_URL = process.env.HUB_URL || 'ws://localhost:3001';
const INITIAL_RETRY = 2000;
const MAX_RETRY = 30000;

function connectToHub(onEvent, onConnect, onDisconnect) {
  let retryDelay = INITIAL_RETRY;
  let ws = null;
  let alive = true;

  function connect() {
    ws = new WebSocket(HUB_URL);

    ws.on('open', () => {
      console.log('[State] Connected to Hub');
      retryDelay = INITIAL_RETRY;
      if (onConnect) onConnect(ws);
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        onEvent(event);
      } catch (err) {
        console.error('[State] Failed to parse Hub message:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[State] Disconnected from Hub');
      if (onDisconnect) onDisconnect();
      if (alive) scheduleReconnect();
    });

    ws.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED') {
        console.error('[State] Hub WebSocket error:', err.message);
      }
    });
  }

  function scheduleReconnect() {
    console.log(`[State] Reconnecting in ${retryDelay / 1000}s...`);
    setTimeout(() => {
      if (alive) connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
  }

  function sendCommand(command) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'command', payload: command }));
      return true;
    }
    return false;
  }

  function close() {
    alive = false;
    if (ws) ws.close();
  }

  connect();

  return { sendCommand, close };
}

module.exports = { connectToHub };
