// Persistent counters used to simulate fiscal receipt and daily closing
// numbers. They only generate plausible responses and have no real fiscal
// value.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILE = path.join(config.dataDir, 'counters.json');

let counters = { fiscalReceiptNumber: 0, zRepNumber: 1 };

fs.mkdirSync(config.dataDir, { recursive: true });

if (fs.existsSync(FILE)) {
  try {
    counters = { ...counters, ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) };
  } catch (e) {
    console.error('Unable to read counters.json, restarting from zero:', e.message);
  }
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(counters, null, 2));
}

function nextFiscalReceiptNumber() {
  counters.fiscalReceiptNumber += 1;
  save();
  return counters.fiscalReceiptNumber;
}

function getZRepNumber() {
  return counters.zRepNumber;
}

function nextZRepNumber() {
  counters.zRepNumber += 1;
  save();
  return counters.zRepNumber;
}

function reset() {
  counters = { fiscalReceiptNumber: 0, zRepNumber: 1 };
  save();
}

module.exports = {
  nextFiscalReceiptNumber,
  getZRepNumber,
  nextZRepNumber,
  reset,
  get current() {
    return { ...counters };
  },
};
