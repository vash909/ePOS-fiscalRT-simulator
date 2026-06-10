// Simulator frontend: receipt list, thermal preview, and printer-state controls.
// Vanilla JS, no external dependency.
(() => {
  const state = {
    receipts: [],
    selectedId: null,
    paperWidth: 58,
    statuses: [],
    labels: {},
  };

  const els = {
    list: document.getElementById('receiptList'),
    detail: document.getElementById('receiptDetail'),
    paperWidth: document.getElementById('paperWidth'),
    printerStatus: document.getElementById('printerStatus'),
    clearBtn: document.getElementById('clearBtn'),
    connStatus: document.getElementById('connStatus'),
  };

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  async function init() {
    state.paperWidth = parseInt(els.paperWidth.value, 10) || 58;
    await loadState();
    await loadReceipts();
    bindEvents();
    connectWs();
  }

  async function loadState() {
    const res = await fetch('/api/state');
    const data = await res.json();
    state.statuses = data.statuses;
    state.labels = data.labels;
    els.printerStatus.innerHTML = '';
    for (const s of state.statuses) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = state.labels[s] || s;
      els.printerStatus.appendChild(opt);
    }
    els.printerStatus.value = data.status;
  }

  async function loadReceipts() {
    const res = await fetch('/api/receipts');
    state.receipts = await res.json();
    renderList();
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      els.connStatus.classList.remove('disconnected');
      els.connStatus.classList.add('connected');
    };
    ws.onclose = () => {
      els.connStatus.classList.remove('connected');
      els.connStatus.classList.add('disconnected');
      setTimeout(connectWs, 2000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }

      if (msg.type === 'receipt') {
        state.receipts.unshift(msg.entry);
        renderList();
        if (!state.selectedId) {
          selectReceipt(msg.entry.id);
        }
      } else if (msg.type === 'cleared') {
        state.receipts = [];
        state.selectedId = null;
        renderList();
        renderDetailEmpty();
      } else if (msg.type === 'state') {
        els.printerStatus.value = msg.status;
      }
    };
  }

  function bindEvents() {
    els.paperWidth.addEventListener('change', () => {
      state.paperWidth = parseInt(els.paperWidth.value, 10) || 58;
      const entry = getSelected();
      if (entry) renderDetail(entry);
    });

    els.printerStatus.addEventListener('change', async () => {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: els.printerStatus.value }),
      });
    });

    els.clearBtn.addEventListener('click', async () => {
      if (!confirm('Delete all received receipts? Saved XML files will also be removed.')) return;
      await fetch('/api/receipts', { method: 'DELETE' });
    });
  }

  function getSelected() {
    return state.receipts.find((r) => r.id === state.selectedId);
  }

  // ---------------------------------------------------------------------
  // Receipt list
  // ---------------------------------------------------------------------
  function renderList() {
    if (state.receipts.length === 0) {
      els.list.innerHTML = '<p class="empty-hint" style="padding:12px;">No receipts received.</p>';
      return;
    }

    els.list.innerHTML = '';
    for (const entry of state.receipts) {
      const div = document.createElement('div');
      div.className = 'receipt-item' + (entry.id === state.selectedId ? ' selected' : '');

      const time = new Date(entry.receivedAt).toLocaleString('en-GB');
      const badgeClass = entry.protocol === 'fiscal' ? 'fiscal' : entry.protocol === 'epos' ? 'epos' : 'unknown';
      const badgeLabel = entry.protocol === 'fiscal' ? 'Fiscal RT' : entry.protocol === 'epos' ? 'ePOS' : '?';

      const row1 = document.createElement('div');
      row1.className = 'row1';
      const badge = document.createElement('span');
      badge.className = `badge ${badgeClass}`;
      badge.textContent = badgeLabel;
      const timeSpan = document.createElement('span');
      timeSpan.textContent = time;
      row1.appendChild(badge);
      row1.appendChild(timeSpan);

      const ipDiv = document.createElement('div');
      ipDiv.textContent = entry.remoteAddress || '?';
      if (entry.printerStatusAtReceive && entry.printerStatusAtReceive !== 'online') {
        const errBadge = document.createElement('span');
        errBadge.className = 'badge error';
        errBadge.style.marginLeft = '6px';
        errBadge.textContent = state.labels[entry.printerStatusAtReceive] || entry.printerStatusAtReceive;
        ipDiv.appendChild(errBadge);
      }

      const epDiv = document.createElement('div');
      epDiv.className = 'endpoint';
      epDiv.textContent = entry.endpoint;

      div.appendChild(row1);
      div.appendChild(ipDiv);
      div.appendChild(epDiv);

      div.addEventListener('click', () => selectReceipt(entry.id));
      els.list.appendChild(div);
    }
  }

  function selectReceipt(id) {
    state.selectedId = id;
    renderList();
    const entry = getSelected();
    renderDetail(entry);
  }

  // ---------------------------------------------------------------------
  // Receipt details
  // ---------------------------------------------------------------------
  function renderDetailEmpty() {
    els.detail.innerHTML = '<p class="empty-hint">Select a receipt from the list, or send an XML request to the simulator.</p>';
  }

  function renderDetail(entry) {
    if (!entry) { renderDetailEmpty(); return; }
    els.detail.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'detail-toolbar';
    toolbar.innerHTML = `
      <button data-action="download-xml">Download original XML</button>
      <button data-action="download-html">Download HTML preview</button>
      <button data-action="reprint" class="primary">Re-render preview</button>
    `;
    els.detail.appendChild(toolbar);

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    const time = new Date(entry.receivedAt).toLocaleString('en-GB');
    const protocolLabel = entry.protocol === 'fiscal'
      ? 'Fiscal ePOS-Print RT (Italian RT)'
      : entry.protocol === 'epos'
        ? 'Standard ePOS-Print XML'
        : 'Unknown / unrecognized';
    meta.innerHTML = `
      <div><b>Received at:</b> ${escapeHtml(time)}</div>
      <div><b>Sender IP:</b> ${escapeHtml(entry.remoteAddress || '-')}</div>
      <div><b>Endpoint:</b> ${escapeHtml(entry.endpoint)}</div>
      <div><b>Detected protocol:</b> ${escapeHtml(protocolLabel)}</div>
      <div><b>Printer state at receive time:</b> ${escapeHtml(state.labels[entry.printerStatusAtReceive] || entry.printerStatusAtReceive)}</div>
    `;
    els.detail.appendChild(meta);

    if (entry.parsed && entry.parsed.error) {
      const err = document.createElement('div');
      err.className = 'errors-box';
      err.textContent = 'Warning: ' + entry.parsed.error;
      els.detail.appendChild(err);
    }

    const grid = document.createElement('div');
    grid.className = 'detail-grid';

    const paperWrap = document.createElement('div');
    paperWrap.className = 'paper-wrap';
    paperWrap.appendChild(buildPaper(entry));
    grid.appendChild(paperWrap);

    const right = document.createElement('div');
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button data-tab="xml" class="active">Original XML</button>
      <button data-tab="response">Sent response</button>
    `;
    right.appendChild(tabs);

    const xmlTab = document.createElement('div');
    xmlTab.className = 'tab-content active';
    xmlTab.dataset.tab = 'xml';
    const xmlPre = document.createElement('pre');
    xmlPre.className = 'xml-view';
    xmlPre.textContent = 'Loading...';
    xmlTab.appendChild(xmlPre);
    right.appendChild(xmlTab);

    const respTab = document.createElement('div');
    respTab.className = 'tab-content';
    respTab.dataset.tab = 'response';
    const respPre = document.createElement('pre');
    respPre.className = 'xml-view';
    respPre.textContent = 'Loading...';
    respTab.appendChild(respPre);
    right.appendChild(respTab);

    grid.appendChild(right);
    els.detail.appendChild(grid);

    fetch(`/api/receipts/${entry.id}/raw`)
      .then((r) => r.text())
      .then((t) => { xmlPre.textContent = t || '(empty)'; })
      .catch(() => { xmlPre.textContent = '(loading error)'; });

    fetch(`/api/receipts/${entry.id}/response`)
      .then((r) => r.text())
      .then((t) => { respPre.textContent = t || '(no response - simulated "timeout" state)'; })
      .catch(() => { respPre.textContent = '(loading error)'; });

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      right.querySelectorAll('.tab-content').forEach((tc) => {
        tc.classList.toggle('active', tc.dataset.tab === btn.dataset.tab);
      });
    });

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'download-xml') downloadXml(entry);
      else if (btn.dataset.action === 'download-html') downloadPreviewHtml(entry);
      else if (btn.dataset.action === 'reprint') reprint(entry);
    });
  }

  function reprint(entry) {
    renderDetail(entry);
    requestAnimationFrame(() => {
      const paper = els.detail.querySelector('.receipt-paper');
      if (paper) {
        paper.classList.add('flash');
        setTimeout(() => paper.classList.remove('flash'), 650);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Thermal paper preview
  // ---------------------------------------------------------------------
  function buildPaper(entry) {
    const paper = document.createElement('div');
    paper.className = `receipt-paper w${state.paperWidth}`;
    const lines = (entry.parsed && entry.parsed.lines) || [];

    if (entry.protocol === 'fiscal') {
      renderFiscalLines(paper, lines);
    } else if (entry.protocol === 'epos') {
      renderEposLines(paper, lines);
    } else {
      const p = document.createElement('div');
      p.className = 'raw-line';
      p.textContent = 'Unrecognized protocol: no structured preview. See the "Original XML" tab.';
      paper.appendChild(p);
    }

    if (lines.length === 0) {
      const p = document.createElement('div');
      p.className = 'empty-hint';
      p.textContent = '(no recognized printable content)';
      paper.appendChild(p);
    }

    return paper;
  }

  function styleClasses(style) {
    const cls = ['line'];
    const align = ['left', 'center', 'right'].includes(style.align) ? style.align : 'left';
    cls.push('align-' + align);
    if (style.bold) cls.push('bold');
    if (style.underline) cls.push('underline');
    if (style.reverse) cls.push('reverse');
    return cls.join(' ');
  }

  function applySizeStyle(el, style) {
    const scale = Math.max(style.widthMul || 1, style.heightMul || 1);
    if (scale > 1) {
      el.style.fontSize = `${(12.5 * Math.min(scale, 4)).toFixed(1)}px`;
      el.style.lineHeight = '1.2';
    }
  }

  function renderEposLines(container, lines) {
    for (const line of lines) {
      switch (line.type) {
        case 'text': {
          const parts = String(line.text).split('\n');
          parts.forEach((part, idx) => {
            if (part === '' && idx === parts.length - 1 && parts.length > 1) return;
            const div = document.createElement('div');
            div.className = styleClasses(line.style);
            applySizeStyle(div, line.style);
            div.textContent = part === '' ? '\u00a0' : part;
            container.appendChild(div);
          });
          break;
        }
        case 'feed': {
          const div = document.createElement('div');
          div.className = 'feed-line';
          container.appendChild(div);
          break;
        }
        case 'cut': {
          const div = document.createElement('div');
          div.className = 'cut-line';
          div.textContent = '- - - - - - CUT - - - - - -';
          container.appendChild(div);
          break;
        }
        case 'image': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = '[ IMAGE ]';
          container.appendChild(div);
          break;
        }
        case 'logo': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = '[ LOGO ]';
          container.appendChild(div);
          break;
        }
        case 'barcode': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = `[ BARCODE ${line.barcodeType}: ${line.data} ]`;
          container.appendChild(div);
          break;
        }
        case 'symbol': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = `[ ${String(line.symbolType).toUpperCase()}: ${line.data} ]`;
          container.appendChild(div);
          break;
        }
        case 'pulse': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = `[ ${line.info} ]`;
          container.appendChild(div);
          break;
        }
        case 'raw': {
          const div = document.createElement('div');
          div.className = 'raw-line';
          div.textContent = formatRaw(line);
          container.appendChild(div);
          break;
        }
        default:
          break;
      }
    }
  }

  function renderFiscalLines(container, lines) {
    for (const line of lines) {
      switch (line.type) {
        case 'fiscal-header': {
          const div = document.createElement('div');
          div.className = 'fiscal-header';
          div.textContent = 'FISCAL RECEIPT (SIMULATED)' + (line.operator ? ` - Operator ${line.operator}` : '');
          container.appendChild(div);
          break;
        }
        case 'item': {
          const wrap = document.createElement('div');
          wrap.style.marginBottom = '2px';

          const desc = document.createElement('div');
          desc.className = 'item-desc';
          desc.textContent = line.description;
          wrap.appendChild(desc);

          const qtyLine = document.createElement('div');
          qtyLine.className = 'item-qty';
          const left = document.createElement('span');
          left.textContent = `${formatQty(line.quantity)} x ${money(line.unitPrice)}` + (line.vat ? `  VAT/Dept ${line.vat}` : '');
          const right = document.createElement('span');
          right.textContent = money(line.total);
          qtyLine.appendChild(left);
          qtyLine.appendChild(right);
          wrap.appendChild(qtyLine);

          container.appendChild(wrap);
          break;
        }
        case 'adjustment': {
          const div = document.createElement('div');
          div.className = 'adjustment-line';
          const sign = line.delta < 0 ? '-' : '+';
          const valueStr = line.kind === 'percent' ? `${line.rawAmount}%` : money(line.rawAmount);
          const extra = line.description && line.description !== line.label ? ` (${line.description})` : '';
          div.textContent = `${line.label}${extra}: ${valueStr} => ${sign}${money(Math.abs(line.delta))}`;
          container.appendChild(div);
          break;
        }
        case 'item-void': {
          const div = document.createElement('div');
          div.className = 'void-line';
          div.textContent = `ITEM VOID: ${line.description}`;
          container.appendChild(div);
          break;
        }
        case 'refund': {
          const div = document.createElement('div');
          div.className = 'item-qty';
          div.textContent = `REFUND: ${line.description} ${formatQty(line.quantity)} x ${money(line.unitPrice)} = -${money(line.total)}`;
          container.appendChild(div);
          break;
        }
        case 'subtotal': {
          const div = document.createElement('div');
          div.className = 'subtotal-line';
          div.innerHTML = `<span>SUBTOTAL</span><span>${money(line.amount)}</span>`;
          container.appendChild(div);
          break;
        }
        case 'payment': {
          const div = document.createElement('div');
          div.className = 'payment-line';
          div.innerHTML = `<span>${escapeHtml(line.description)}</span><span>${money(line.amount)}</span>`;
          container.appendChild(div);
          break;
        }
        case 'message': {
          const div = document.createElement('div');
          div.className = 'message-line';
          div.textContent = line.text;
          container.appendChild(div);
          break;
        }
        case 'void-document': {
          const div = document.createElement('div');
          div.className = 'void-line';
          div.textContent = '*** DOCUMENT VOIDED ***';
          container.appendChild(div);
          break;
        }
        case 'fiscal-footer': {
          const div = document.createElement('div');
          div.className = 'fiscal-footer';
          let html = `<div class="subtotal-line"><span>TOTAL</span><span>${money(line.total)}</span></div>`;
          if (line.totalPayments) {
            html += `<div class="payment-line"><span>PAID</span><span>${money(line.totalPayments)}</span></div>`;
          }
          if (line.change && line.change > 0) {
            html += `<div class="payment-line"><span>CHANGE</span><span>${money(line.change)}</span></div>`;
          }
          if (line.fiscalReceiptNumber) {
            html += `<div style="text-align:center;margin-top:4px;">DOC. NO. ${escapeHtml(String(line.fiscalReceiptNumber))} on ${escapeHtml(line.fiscalReceiptDate)} ${escapeHtml(line.fiscalReceiptTime)}</div>`;
            html += `<div style="text-align:center;">Z REPORT NO. ${escapeHtml(String(line.zRepNumber))}</div>`;
          }
          html += '<div style="text-align:center;font-size:10px;color:#888;margin-top:4px;">SIMULATED DOCUMENT - NO FISCAL VALUE</div>';
          div.innerHTML = html;
          container.appendChild(div);
          break;
        }
        case 'plain-text': {
          const div = document.createElement('div');
          div.textContent = line.text;
          container.appendChild(div);
          break;
        }
        case 'status-request': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = '[ Printer status request ]';
          container.appendChild(div);
          break;
        }
        case 'report': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = `[ Print ${line.reportType} report ]`;
          container.appendChild(div);
          break;
        }
        case 'pulse': {
          const div = document.createElement('div');
          div.className = 'placeholder-box';
          div.textContent = `[ ${line.info} ]`;
          container.appendChild(div);
          break;
        }
        case 'raw': {
          const div = document.createElement('div');
          div.className = 'raw-line';
          div.textContent = formatRaw(line);
          container.appendChild(div);
          break;
        }
        default:
          break;
      }
    }
  }

  function formatRaw(line) {
    const attrs = Object.entries(line.attrs || {})
      .map(([k, v]) => `${k.replace(/^@_/, '')}="${v}"`)
      .join(' ');
    let s = `RAW/UNKNOWN: <${line.tag}${attrs ? ' ' + attrs : ''}>`;
    if (line.text) s += ` ${line.text}`;
    if (line.note) s += ` (${line.note})`;
    return s;
  }

  function money(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : String(n);
  }

  function formatQty(q) {
    const v = Number(q);
    if (!Number.isFinite(v)) return String(q);
    return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------
  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadXml(entry) {
    const res = await fetch(`/api/receipts/${entry.id}/raw`);
    const text = await res.text();
    triggerDownload(`${entry.id}.xml`, text, 'application/xml');
  }

  async function downloadPreviewHtml(entry) {
    const paper = buildPaper(entry);
    let css = '';
    try {
      const cssRes = await fetch('/css/style.css');
      css = await cssRes.text();
    } catch (_) { /* ignore */ }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${entry.id}</title>
<style>${css}</style>
</head>
<body style="background:#15171b;padding:20px;">
<div class="paper-wrap">${paper.outerHTML}</div>
</body>
</html>`;
    triggerDownload(`receipt-${entry.id}.html`, html, 'text/html');
  }

  init();
})();
