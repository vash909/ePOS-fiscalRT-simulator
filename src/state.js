const config = require('./config');
const { EventEmitter } = require('events');

// Simulatable printer states.
// 'online' -> normal OK responses
// 'offline', 'paper-end', 'cover-open', 'generic-error', 'fiscal-error' -> dedicated error responses
// 'timeout' -> the server does not answer (the connection stays open until the HTTP timeout)
// 'invalid-xml' -> the server answers with deliberately invalid XML
const VALID_STATUSES = [
  'online',
  'offline',
  'paper-end',
  'cover-open',
  'generic-error',
  'fiscal-error',
  'timeout',
  'invalid-xml',
];

const LABELS = {
  'online': 'Online',
  'offline': 'Offline',
  'paper-end': 'Paper end',
  'cover-open': 'Cover open',
  'generic-error': 'Generic error',
  'fiscal-error': 'Fiscal error',
  'timeout': 'Timeout (no response)',
  'invalid-xml': 'Invalid XML response',
};

const emitter = new EventEmitter();

const state = {
  status: VALID_STATUSES.includes(config.printer.defaultStatus)
    ? config.printer.defaultStatus
    : 'online',
};

function getStatus() {
  return state.status;
}

function setStatus(s) {
  if (!VALID_STATUSES.includes(s)) {
    throw new Error(`Invalid state: ${s}`);
  }
  state.status = s;
  emitter.emit('change', state.status);
  return state.status;
}

function getLabel(s) {
  return LABELS[s] || s;
}

module.exports = {
  VALID_STATUSES,
  LABELS,
  emitter,
  getStatus,
  setStatus,
  getLabel,
};
