// REST API used by the web UI: receipt list, details, XML downloads,
// simulated printer state, and configuration.
const express = require('express');
const store = require('../store');
const state = require('../state');
const config = require('../config');

const router = express.Router();

router.get('/receipts', (req, res) => {
  res.json(store.listReceipts());
});

router.get('/receipts/:id', (req, res) => {
  const entry = store.getReceipt(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Receipt not found' });
  res.json(entry);
});

router.get('/receipts/:id/raw', (req, res) => {
  const entry = store.getReceipt(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Receipt not found' });
  const xml = store.getRawXml(req.params.id) || '';
  res.set('Content-Disposition', `attachment; filename="${entry.id}.xml"`);
  res.type('application/xml').send(xml);
});

router.get('/receipts/:id/response', (req, res) => {
  const entry = store.getReceipt(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Receipt not found' });
  const xml = store.getResponseXml(req.params.id) || '';
  res.type('application/xml').send(xml);
});

router.delete('/receipts', (req, res) => {
  store.clearAll();
  res.json({ ok: true });
});

router.get('/state', (req, res) => {
  res.json({
    status: state.getStatus(),
    statuses: state.VALID_STATUSES,
    labels: state.LABELS,
  });
});

router.post('/state', (req, res) => {
  const { status } = req.body || {};
  try {
    state.setStatus(status);
    res.json({ ok: true, status: state.getStatus() });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, statuses: state.VALID_STATUSES });
  }
});

router.get('/config', (req, res) => {
  res.json({
    endpoints: config.endpoints,
    paper: config.paper,
    rawTcp: { enabled: config.rawTcp.enabled, port: config.rawTcp.port },
    httpPort: config.httpPort,
    permissive: config.printer.permissive,
  });
});

module.exports = router;
