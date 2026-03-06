/**
 * Event creation helpers and broadcast function.
 */

function createEvent(type, payload) {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}

function broadcast(wss, event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  }
}

module.exports = { createEvent, broadcast };
