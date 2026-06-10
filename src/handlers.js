// Shared incoming-request handling used by the HTTP routes
// (fpmate.cgi / epos/service.cgi) and the raw TCP server.
const state = require('./state');
const counters = require('./counters');
const store = require('./store');
const config = require('./config');
const { parseEposXml } = require('./parsers/eposParser');
const { parseFiscalXml } = require('./parsers/fiscalParser');
const responses = require('./responses');

const FISCAL_HINTS = /<\s*[\w:.-]*:?(printerFiscalReceipt|beginFiscalReceipt|endFiscalReceipt|printRecItem|printRecTotal|printRecSubtotal|printRecMessage|printRecVoid|printerStatus|directIO|fiscalReceipt)\b/i;
const EPOS_HINTS = /epos-print/i;

function detectProtocol(rawXml) {
  if (EPOS_HINTS.test(rawXml)) return 'epos';
  if (FISCAL_HINTS.test(rawXml)) return 'fiscal';
  return 'unknown';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowFiscalDateTime() {
  const d = new Date();
  const date = `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return { date, time };
}

// Processes an XML document received through HTTP or raw TCP, saves the
// receipt, and builds the response according to the current simulated state.
function handleIncoming({ rawXml, remoteAddress, endpoint, headers, forcedProtocol }) {
  const printerStatus = state.getStatus();
  const protocol = forcedProtocol || detectProtocol(rawXml);

  let parsed;
  if (protocol === 'epos') {
    parsed = parseEposXml(rawXml);
  } else if (protocol === 'fiscal') {
    parsed = parseFiscalXml(rawXml);
  } else {
    parsed = {
      ok: false,
      error: 'Unrecognized protocol (neither epos-print nor known fiscal commands). Document saved anyway.',
      lines: [],
      meta: {},
    };
  }

  // If this is a fiscal receipt close, generate a simulated document number
  // for testing only; it has no real fiscal value.
  if (protocol === 'fiscal' && parsed.ok && parsed.meta && parsed.meta.hasEnd) {
    const fiscalReceiptNumber = counters.nextFiscalReceiptNumber();
    const zRepNumber = counters.getZRepNumber();
    const { date, time } = nowFiscalDateTime();
    Object.assign(parsed.meta, {
      fiscalReceiptNumber,
      fiscalReceiptDate: date,
      fiscalReceiptTime: time,
      zRepNumber,
    });
    const footer = parsed.lines.find((l) => l.type === 'fiscal-footer');
    if (footer) {
      Object.assign(footer, { fiscalReceiptNumber, fiscalReceiptDate: date, fiscalReceiptTime: time, zRepNumber });
    }
  }

  let responseXml;
  const contentType = 'text/xml; charset=UTF-8';
  let hang = false;

  if (printerStatus === 'timeout') {
    hang = true;
    responseXml = '';
  } else if (printerStatus === 'invalid-xml') {
    responseXml = responses.buildInvalidXmlResponse(protocol);
  } else if (printerStatus !== 'online') {
    responseXml = protocol === 'fiscal'
      ? responses.buildFiscalErrorResponse(printerStatus)
      : responses.buildEposErrorResponse(printerStatus);
  } else if (!parsed.ok && !config.printer.permissive) {
    responseXml = protocol === 'fiscal'
      ? responses.buildFiscalErrorResponse('generic-error')
      : responses.buildEposErrorResponse('generic-error');
  } else {
    responseXml = protocol === 'fiscal'
      ? responses.buildFiscalOkResponse(parsed.meta || {})
      : responses.buildEposOkResponse();
  }

  const entry = store.addReceipt({
    rawXml,
    response: hang ? '(no response - simulated "timeout" state)' : responseXml,
    remoteAddress,
    endpoint,
    protocol,
    printerStatusAtReceive: printerStatus,
    headers,
    parsed,
  });

  return { entry, protocol, parsed, responseXml, contentType, hang };
}

module.exports = { handleIncoming, detectProtocol };
