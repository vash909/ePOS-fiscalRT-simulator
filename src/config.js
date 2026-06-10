const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

let raw;
if (fs.existsSync(CONFIG_PATH)) {
  raw = loadJson(CONFIG_PATH);
} else {
  raw = loadJson(EXAMPLE_PATH);
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

const config = {
  httpHost: process.env.HTTP_HOST || raw.httpHost || '0.0.0.0',
  httpPort: envInt('HTTP_PORT', raw.httpPort || 8000),

  rawTcp: {
    enabled: envBool('RAW_TCP_ENABLED', raw.rawTcp ? raw.rawTcp.enabled !== false : true),
    port: envInt('RAW_TCP_PORT', (raw.rawTcp && raw.rawTcp.port) || 9100),
    host: process.env.RAW_TCP_HOST || (raw.rawTcp && raw.rawTcp.host) || '0.0.0.0',
  },

  endpoints: {
    fiscal: (raw.endpoints && raw.endpoints.fiscal) || '/cgi-bin/fpmate.cgi',
    epos: (raw.endpoints && raw.endpoints.epos) || '/cgi-bin/epos/service.cgi',
  },

  paper: {
    defaultWidthMm: (raw.paper && raw.paper.defaultWidthMm) || 58,
    allowedWidthsMm: (raw.paper && raw.paper.allowedWidthsMm) || [58, 80],
  },

  printer: {
    defaultStatus: (raw.printer && raw.printer.defaultStatus) || 'online',
    defaultResponseMode: (raw.printer && raw.printer.defaultResponseMode) || 'ok',
    permissive: raw.printer ? raw.printer.permissive !== false : true,
  },

  dataDir: path.resolve(ROOT, raw.dataDir || './data'),
  maxReceipts: raw.maxReceipts || 500,
};

module.exports = config;
