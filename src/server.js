// Simulator entry point.
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');

const config = require('./config');
const printerRoutes = require('./routes/printer');
const apiRoutes = require('./routes/api');
const { attachWebSocket } = require('./wsServer');
const { startRawTcpServer } = require('./rawTcp');

const app = express();

// Printer endpoints: read the request body as raw text (see routes/printer.js).
app.use('/', printerRoutes);

// Web UI API.
app.use('/api', express.json(), apiRoutes);

// Static web UI.
app.use('/', express.static(path.join(__dirname, '..', 'public')));

const httpServer = http.createServer(app);
attachWebSocket(httpServer);

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

httpServer.listen(config.httpPort, config.httpHost, () => {
  const ips = getLocalIPs();
  const hosts = ips.length > 0 ? ips : ['127.0.0.1'];

  console.log('=================================================');
  console.log(' sim-epos - Epson printer simulator (NON-FISCAL)');
  console.log('=================================================');
  console.log(`HTTP server listening on ${config.httpHost}:${config.httpPort}`);
  console.log('');
  console.log('Available endpoints:');
  for (const host of hosts) {
    console.log(`  Web UI              : http://${host}:${config.httpPort}/`);
    console.log(`  Fiscal ePOS RT      : http://${host}:${config.httpPort}${config.endpoints.fiscal}`);
    console.log(`  Standard ePOS-Print : http://${host}:${config.httpPort}${config.endpoints.epos}`);
  }
  if (config.rawTcp.enabled) {
    for (const host of hosts) {
      console.log(`  Raw TCP             : ${host}:${config.rawTcp.port}`);
    }
  } else {
    console.log('  Raw TCP             : disabled (see config.json -> rawTcp.enabled)');
  }
  console.log('');
  console.log('NOTE: non-fiscal simulator, development/debug only.');
  console.log('=================================================');
});

startRawTcpServer();
