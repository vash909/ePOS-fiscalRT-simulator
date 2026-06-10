// Shared helpers for walking the fast-xml-parser tree in preserveOrder mode.
// That mode keeps command order, which is needed to rebuild receipt print
// sequences.
const { XMLParser } = require('fast-xml-parser');

const PARSER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
};

function parseXml(xmlString) {
  const parser = new XMLParser(PARSER_OPTIONS);
  return parser.parse(xmlString);
}

// Removes an optional namespace prefix ("soapenv:Envelope" -> "Envelope").
function stripNs(tag) {
  if (typeof tag !== 'string') return tag;
  const idx = tag.indexOf(':');
  return idx === -1 ? tag : tag.slice(idx + 1);
}

// Converts a preserveOrder array into simpler { tag, attrs, children } nodes.
function normalizeNodes(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr) {
    if (raw === null || typeof raw !== 'object') continue;
    const key = Object.keys(raw).find((k) => k !== ':@');
    if (key === undefined) continue;
    out.push({
      tag: key,
      attrs: raw[':@'] || {},
      children: raw[key],
    });
  }
  return out;
}

// Returns all direct #text content under a node.
function getText(node) {
  if (node == null) return '';
  if (typeof node.children === 'string') return node.children;
  if (!Array.isArray(node.children)) return '';
  let out = '';
  for (const c of normalizeNodes(node.children)) {
    if (c.tag === '#text') {
      out += typeof c.children === 'string' ? c.children : String(c.children ?? '');
    }
  }
  return out;
}

// Lowercases attribute names for case-insensitive parsing of imperfect XML.
function lowerAttrs(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

// Recursively finds the first node matching the predicate.
function findDeep(arr, predicate) {
  for (const node of normalizeNodes(arr)) {
    if (predicate(node)) return node;
    if (Array.isArray(node.children)) {
      const found = findDeep(node.children, predicate);
      if (found) return found;
    }
  }
  return null;
}

// Converts numeric strings with comma or dot decimal separators to floats.
function num(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function truthy(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

function fmtMoney(n) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

module.exports = {
  PARSER_OPTIONS,
  parseXml,
  stripNs,
  normalizeNodes,
  getText,
  lowerAttrs,
  findDeep,
  num,
  truthy,
  fmtMoney,
};
