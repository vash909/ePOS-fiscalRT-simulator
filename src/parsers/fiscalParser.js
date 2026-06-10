// Tolerant parser for the "Fiscal ePOS-Print" protocol used by Italian Epson
// RT fiscal printers (FP-81II RT, FP-90III RT, Epson Server RT / EpsonFPMate,
// endpoint /cgi-bin/fpmate.cgi).
//
// Important: public documentation for this XML protocol is fragmented and can
// vary by model/firmware. This parser implements a best-effort subset of the
// most common commands, based on the historic Epson FP fiscal command set
// exposed as XML:
// beginFiscalReceipt, printRecItem, printRecItemAdjustment,
// printRecSubtotal, printRecTotal, printRecMessage, printRecVoid,
// endFiscalReceipt, printerStatus, directIO, etc.).
//
// Unknown tags do not block parsing. They are emitted as raw lines
// (RAW/UNKNOWN) so they remain visible in the UI.
const {
  parseXml,
  stripNs,
  normalizeNodes,
  getText,
  lowerAttrs,
  num,
  fmtMoney,
} = require('./xmlUtils');

const FISCAL_ROOT_HINTS = [
  'printerfiscalreceipt',
  'fiscalreceipt',
  'request',
  'printerfiscaldocument',
  'fiscalrequest',
  'printerfpcommand',
];

const PAYMENT_TYPE_LABELS = {
  '0': 'Cash',
  '1': 'Check',
  '2': 'Credit/debit card',
  '3': 'Ticket/meal voucher',
  '4': 'Payment 4',
  '5': 'Payment 5',
  '6': 'Payment 6',
  '7': 'Unpaid',
  'cash': 'Cash',
  'check': 'Check',
  'creditcard': 'Credit/debit card',
  'ticket': 'Ticket/meal voucher',
  'notpaid': 'Unpaid',
};

// "adjustmentType" codes historically used by Epson FP fiscal commands for
// amount/percentage discounts or surcharges.
const ADJUSTMENT_TYPE_LABELS = {
  '1': { label: 'Discount', kind: 'amount', sign: -1 },
  '2': { label: 'Discount', kind: 'percent', sign: -1 },
  '3': { label: 'Surcharge', kind: 'amount', sign: 1 },
  '4': { label: 'Surcharge', kind: 'percent', sign: 1 },
};

function extractCommandList(treeArr) {
  let nodes = normalizeNodes(treeArr).filter((n) => n.tag !== '#text');

  // Unwrap optional SOAP wrappers (Envelope/Body).
  let guard = 0;
  while (nodes.length === 1 && /envelope$|body$/i.test(stripNs(nodes[0].tag)) && guard < 5) {
    nodes = normalizeNodes(nodes[0].children).filter((n) => n.tag !== '#text');
    guard += 1;
  }

  // Unwrap a single fiscal-document wrapper.
  if (nodes.length === 1) {
    const lower = stripNs(nodes[0].tag).toLowerCase();
    if (FISCAL_ROOT_HINTS.includes(lower) || lower.includes('fiscal')) {
      const inner = normalizeNodes(nodes[0].children).filter((n) => n.tag !== '#text');
      if (inner.length > 0) {
        return { commands: inner, rootTag: stripNs(nodes[0].tag), rootAttrs: nodes[0].attrs };
      }
    }
  }

  return { commands: nodes, rootTag: null, rootAttrs: {} };
}

function adjustmentInfo(attrs) {
  const typeCode = String(attrs['@_adjustmenttype'] ?? attrs['@_type'] ?? '').trim();
  return ADJUSTMENT_TYPE_LABELS[typeCode] || { label: 'Discount/Surcharge', kind: 'amount', sign: 1 };
}

function paymentLabel(attrs) {
  if (attrs['@_description']) return attrs['@_description'];
  const code = String(attrs['@_paymenttype'] ?? '').trim().toLowerCase();
  return PAYMENT_TYPE_LABELS[code] || (code ? `Payment (type ${code})` : 'Payment');
}

function parseFiscalXml(xmlString) {
  let tree;
  try {
    tree = parseXml(xmlString);
  } catch (e) {
    return { ok: false, error: `Invalid XML: ${e.message}`, lines: [], meta: {} };
  }

  const { commands, rootTag } = extractCommandList(tree);

  if (commands.length === 0) {
    return {
      ok: false,
      error: 'No recognizable fiscal command found in the document.',
      lines: [],
      meta: {},
    };
  }

  const lines = [];
  const errors = [];

  let runningTotal = 0; // Total built from item lines and adjustments.
  let subtotal = null;
  let totalPayments = 0;
  const items = [];
  const payments = [];
  const adjustments = [];
  const messages = [];
  let hasBegin = false;
  let hasEnd = false;
  let voided = false;

  for (const child of commands) {
    if (child.tag === '#text') continue;
    const tag = stripNs(child.tag).toLowerCase();
    const attrs = lowerAttrs(child.attrs);
    const text = getText(child);

    switch (tag) {
      case 'beginfiscalreceipt': {
        hasBegin = true;
        lines.push({ type: 'fiscal-header', operator: attrs['@_operator'] });
        break;
      }

      case 'printrecitem':
      case 'printrecitemraw': {
        const description = attrs['@_description'] || text || '(no description)';
        const quantity = num(attrs['@_quantity'], 1);
        const unitPrice = num(attrs['@_unitprice'], 0);
        const explicitTotal = attrs['@_itemamount'] !== undefined ? num(attrs['@_itemamount']) : null;
        const total = explicitTotal !== null ? explicitTotal : quantity * unitPrice;
        const vat = attrs['@_department'] ?? attrs['@_iddepartment'] ?? attrs['@_vatratecode'] ?? attrs['@_vat'] ?? '';

        items.push({ description, quantity, unitPrice, total, vat });
        runningTotal += total;

        lines.push({
          type: 'item',
          description,
          quantity,
          unitPrice,
          total,
          vat: vat !== '' ? String(vat) : null,
        });
        break;
      }

      case 'printrecitemadjustment':
      case 'printrecsubtotaladjustment': {
        const info = adjustmentInfo(attrs);
        const rawAmount = num(attrs['@_amount'], 0);
        let delta;
        if (info.kind === 'percent') {
          delta = (runningTotal * rawAmount) / 100;
        } else {
          delta = rawAmount;
        }
        delta *= info.sign;
        runningTotal += delta;

        const entry = {
          description: attrs['@_description'] || info.label,
          kind: info.kind,
          rawAmount,
          delta,
          scope: tag === 'printrecsubtotaladjustment' ? 'subtotal' : 'item',
        };
        adjustments.push(entry);

        lines.push({
          type: 'adjustment',
          label: info.label,
          description: entry.description,
          kind: info.kind,
          rawAmount,
          delta,
        });
        break;
      }

      case 'printrecitemadjustmentvoid':
      case 'printrecitemvoid': {
        lines.push({
          type: 'item-void',
          description: attrs['@_description'] || text || '(item void)',
        });
        break;
      }

      case 'printrecrefund': {
        const description = attrs['@_description'] || text || '(refund)';
        const quantity = num(attrs['@_quantity'], 1);
        const unitPrice = num(attrs['@_unitprice'], 0);
        const total = quantity * unitPrice;
        runningTotal -= total;
        lines.push({ type: 'refund', description, quantity, unitPrice, total });
        break;
      }

      case 'printrecsubtotal': {
        subtotal = attrs['@_amount'] !== undefined ? num(attrs['@_amount']) : runningTotal;
        lines.push({ type: 'subtotal', amount: subtotal });
        break;
      }

      case 'printrectotal': {
        const amount = num(attrs['@_payment'] ?? attrs['@_paymentamount'], 0);
        const description = paymentLabel(attrs);
        payments.push({ description, amount, paymentType: attrs['@_paymenttype'] });
        totalPayments += amount;
        lines.push({ type: 'payment', description, amount, index: attrs['@_index'] });
        break;
      }

      case 'printrecmessage': {
        const message = attrs['@_message'] || text || '';
        messages.push(message);
        lines.push({ type: 'message', text: message, messageType: attrs['@_messagetype'] });
        break;
      }

      case 'printrecvoid': {
        voided = true;
        lines.push({ type: 'void-document' });
        break;
      }

      case 'endfiscalreceipt': {
        hasEnd = true;
        lines.push({
          type: 'fiscal-footer',
          // These fields are completed by the caller (handlers.js) with the
          // simulated document number, date/time, Z report, and so on.
          total: subtotal !== null ? subtotal : runningTotal,
          totalPayments,
          change: totalPayments - (subtotal !== null ? subtotal : runningTotal),
          operator: attrs['@_operator'],
        });
        break;
      }

      case 'printernormal':
      case 'printnormal': {
        lines.push({ type: 'plain-text', text: attrs['@_data'] || text || '' });
        break;
      }

      case 'beginnonfiscal':
        lines.push({ type: 'plain-text', text: '--- BEGIN NON-FISCAL DOCUMENT ---' });
        break;

      case 'endnonfiscal':
        lines.push({ type: 'plain-text', text: '--- END NON-FISCAL DOCUMENT ---' });
        break;

      case 'printnonfiscaltext':
        lines.push({ type: 'plain-text', text: attrs['@_data'] || text || '' });
        break;

      case 'printrecmessagetype':
        lines.push({ type: 'message', text: text || attrs['@_message'] || '' });
        break;

      case 'printerstatus':
        lines.push({ type: 'status-request' });
        break;

      case 'printxreport':
      case 'printzreport':
        lines.push({ type: 'report', reportType: tag === 'printzreport' ? 'Z' : 'X' });
        break;

      case 'directio':
      case 'fiscaldirectio':
        lines.push({ type: 'raw', tag: stripNs(child.tag), attrs: child.attrs, text, note: 'DirectIO not interpreted' });
        break;

      case 'opendrawer':
        lines.push({ type: 'pulse', info: 'Open cash drawer' });
        break;

      default: {
        lines.push({ type: 'raw', tag: stripNs(child.tag), attrs: child.attrs, text });
        break;
      }
    }
  }

  const total = subtotal !== null ? subtotal : runningTotal;
  const change = totalPayments - total;

  return {
    ok: true,
    error: null,
    lines,
    rootTag,
    meta: {
      hasBegin,
      hasEnd,
      voided,
      items,
      adjustments,
      payments,
      messages,
      subtotal: subtotal !== null ? fmtMoney(subtotal) : null,
      total: fmtMoney(total),
      totalPayments: fmtMoney(totalPayments),
      change: fmtMoney(change),
    },
    errors,
  };
}

module.exports = { parseFiscalXml, PAYMENT_TYPE_LABELS, ADJUSTMENT_TYPE_LABELS };
