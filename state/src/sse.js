const HEARTBEAT_INTERVAL = 30000;
const KEEPALIVE_INTERVAL = 15000; // SSE comment ping — prevents Cloudflare 100s timeout

function createSSEManager(getState) {
  const clients = new Set();

  function handler(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send connected event
    sendEvent(res, 'connected', { message: 'Connected to BotMesh state stream' });

    // Send current state
    const state = getState();
    if (state) {
      sendEvent(res, 'state:sync', state);
    }

    clients.add(res);
    console.log(`[State] SSE client connected (${clients.size} total)`);

    req.on('close', () => {
      clients.delete(res);
      console.log(`[State] SSE client disconnected (${clients.size} total)`);
    });
  }

  function sendEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function broadcast(event) {
    const { type, payload, timestamp } = event;
    const data = { ...payload, timestamp };
    for (const client of clients) {
      sendEvent(client, type, data);
    }
  }

  // SSE comment keepalive — prevents proxies/tunnels from closing idle connections
  setInterval(() => {
    for (const client of clients) {
      client.write(': keepalive\n\n');
    }
  }, KEEPALIVE_INTERVAL);

  // Full heartbeat with state
  setInterval(() => {
    const data = { timestamp: new Date().toISOString() };
    for (const client of clients) {
      sendEvent(client, 'heartbeat', data);
    }
  }, HEARTBEAT_INTERVAL);

  return { handler, broadcast };
}

module.exports = { createSSEManager };
