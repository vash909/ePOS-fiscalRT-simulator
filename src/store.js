// Storage for received receipts: raw XML and response files on disk, with
// metadata in a simple JSON file (data/db.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const config = require('./config');

const RECEIPTS_DIR = path.join(config.dataDir, 'receipts');
const DB_PATH = path.join(config.dataDir, 'db.json');

fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

let db = [];
if (fs.existsSync(DB_PATH)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error('Unable to read data/db.json, restarting from an empty list:', e.message);
    db = [];
  }
}

const emitter = new EventEmitter();

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function addReceipt(record) {
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const receivedAt = new Date().toISOString();

  const rawXmlFile = `${id}.xml`;
  const responseFile = `${id}.response.xml`;

  fs.writeFileSync(path.join(RECEIPTS_DIR, rawXmlFile), record.rawXml ?? '', 'utf-8');
  fs.writeFileSync(path.join(RECEIPTS_DIR, responseFile), record.response ?? '', 'utf-8');

  const entry = {
    id,
    receivedAt,
    remoteAddress: record.remoteAddress || '',
    endpoint: record.endpoint || '',
    protocol: record.protocol || 'unknown',
    printerStatusAtReceive: record.printerStatusAtReceive || 'online',
    headers: record.headers || null,
    parsed: record.parsed || null,
    rawXmlFile,
    responseFile,
  };

  db.unshift(entry);

  if (db.length > config.maxReceipts) {
    const removed = db.splice(config.maxReceipts);
    for (const r of removed) {
      try { fs.unlinkSync(path.join(RECEIPTS_DIR, r.rawXmlFile)); } catch (_) {}
      try { fs.unlinkSync(path.join(RECEIPTS_DIR, r.responseFile)); } catch (_) {}
    }
  }

  saveDb();
  emitter.emit('receipt', entry);
  return entry;
}

function listReceipts() {
  return db;
}

function getReceipt(id) {
  return db.find((r) => r.id === id);
}

function getRawXml(id) {
  const entry = getReceipt(id);
  if (!entry) return null;
  try {
    return fs.readFileSync(path.join(RECEIPTS_DIR, entry.rawXmlFile), 'utf-8');
  } catch (_) {
    return null;
  }
}

function getResponseXml(id) {
  const entry = getReceipt(id);
  if (!entry) return null;
  try {
    return fs.readFileSync(path.join(RECEIPTS_DIR, entry.responseFile), 'utf-8');
  } catch (_) {
    return null;
  }
}

function clearAll() {
  for (const r of db) {
    try { fs.unlinkSync(path.join(RECEIPTS_DIR, r.rawXmlFile)); } catch (_) {}
    try { fs.unlinkSync(path.join(RECEIPTS_DIR, r.responseFile)); } catch (_) {}
  }
  db = [];
  saveDb();
  emitter.emit('cleared');
}

module.exports = {
  emitter,
  addReceipt,
  listReceipts,
  getReceipt,
  getRawXml,
  getResponseXml,
  clearAll,
  RECEIPTS_DIR,
};
