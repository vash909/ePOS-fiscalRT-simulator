// Raw TCP listener (default port 9100): receives raw XML without HTTP,
// detects whether it is Fiscal ePOS RT or standard ePOS-Print, and processes it
// with the same logic as the HTTP routes, writing the simulated XML response to
// the same socket.
const net = require('net');
const config = require('./config');
const { handleIncoming } = require('./handlers');

const FLUSH_DELAY_MS = 150;

function cleanIp(addr) {
  if (!addr) return '';
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
}

function startRawTcpServer() {
  if (!config.rawTcp.enabled) {
    return null;
  }

  const server = net.createServer((socket) => {
    const remoteAddress = cleanIp(socket.remoteAddress);
    let buf = Buffer.alloc(0);
    let timer = null;

    function flush() {
      if (buf.length === 0) return;
      const rawXml = buf.toString('utf8');
      buf = Buffer.alloc(0);

      const result = handleIncoming({
        rawXml,
        remoteAddress,
        endpoint: `raw-tcp:${config.rawTcp.port}`,
        headers: null,
        forcedProtocol: null,
      });

      if (result.hang) {
        // Simulated "timeout" state: do not answer and keep the socket open.
        return;
      }

      try {
        socket.write(result.responseXml);
      } catch (_) {
        // Socket already closed by the client.
      }
    }

    // With no explicit framing or standard delimiter, buffer incoming data and
    // process the document after a short idle period or when the client closes.
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_DELAY_MS);
    });

    socket.on('end', () => {
      if (timer) clearTimeout(timer);
      flush();
    });

    socket.on('error', () => {});
  });

  server.listen(config.rawTcp.port, config.rawTcp.host, () => {
    console.log(`[sim-epos] Raw TCP listening on ${config.rawTcp.host}:${config.rawTcp.port}`);
  });

  return server;
}

module.exports = { startRawTcpServer };
