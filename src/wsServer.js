// WebSocket updates for the web UI when a new receipt arrives, the list is
// cleared, or the simulated printer state changes.
const { WebSocketServer } = require('ws');
const store = require('./store');
const state = require('./state');

function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  store.emitter.on('receipt', (entry) => {
    broadcast({ type: 'receipt', entry });
  });

  store.emitter.on('cleared', () => {
    broadcast({ type: 'cleared' });
  });

  state.emitter.on('change', (status) => {
    broadcast({ type: 'state', status, label: state.getLabel(status) });
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'state', status: state.getStatus(), label: state.getLabel(state.getStatus()) }));
  });

  return wss;
}

module.exports = { attachWebSocket };
