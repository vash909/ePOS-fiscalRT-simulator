// Epson printer simulation endpoints:
//  - POST <fiscal>  (default /cgi-bin/fpmate.cgi)        -> Fiscal ePOS-Print RT
//  - POST <epos>    (default /cgi-bin/epos/service.cgi)  -> standard ePOS-Print XML
const express = require('express');
const config = require('../config');
const { handleIncoming } = require('../handlers');

const router = express.Router();

// POS applications send XML with variable content types (text/xml,
// application/xml, application/soap+xml, or sometimes none). Accept any
// content type as raw text.
const rawTextBody = express.text({ type: () => true, limit: '5mb' });

function cleanIp(addr) {
  if (!addr) return '';
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
}

function buildHandler(forcedProtocol, endpointPath) {
  return (req, res) => {
    const rawXml = typeof req.body === 'string' ? req.body : '';
    const result = handleIncoming({
      rawXml,
      remoteAddress: cleanIp(req.socket.remoteAddress),
      endpoint: endpointPath,
      headers: req.headers,
      forcedProtocol,
    });

    if (result.hang) {
      // Simulated "timeout" state: do not answer at all. The connection stays
      // open until the client or server times out.
      return;
    }

    res.status(200).type(result.contentType).send(result.responseXml);
  };
}

router.post(config.endpoints.fiscal, rawTextBody, buildHandler('fiscal', config.endpoints.fiscal));
router.post(config.endpoints.epos, rawTextBody, buildHandler('epos', config.endpoints.epos));

// Some POS applications send a GET "ping" to verify endpoint reachability.
// Return 200 with an informational message.
router.get(config.endpoints.fiscal, (req, res) => {
  res.type('text/plain').send('sim-epos: Fiscal ePOS-Print RT endpoint active (use POST with XML).');
});
router.get(config.endpoints.epos, (req, res) => {
  res.type('text/plain').send('sim-epos: ePOS-Print XML endpoint active (use POST with XML).');
});

module.exports = router;
