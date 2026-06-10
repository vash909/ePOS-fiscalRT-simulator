// Tolerant parser for standard Epson ePOS-Print XML (non-fiscal printers).
// Reference: Epson ePOS-Print XML User's Manual (schema
// http://www.epson-pos.com/schemas/2011/03/epos-print).
//
// Interpreted commands: text, feed, cut, image (placeholder),
// barcode/symbol (placeholder), and style attributes
// align / em(bold) / ul(underline) / reverse / width / height / dw / dh / font.
// Unknown commands are returned as raw lines (RAW/UNKNOWN) and do not block
// parsing of the rest of the document.
const {
  parseXml,
  stripNs,
  normalizeNodes,
  getText,
  lowerAttrs,
  findDeep,
  truthy,
} = require('./xmlUtils');

function applyStyleAttrs(style, attrs) {
  if (attrs['@_align'] !== undefined) {
    style.align = String(attrs['@_align']).toLowerCase();
  }
  if (attrs['@_em'] !== undefined) style.bold = truthy(attrs['@_em']);
  if (attrs['@_bold'] !== undefined) style.bold = truthy(attrs['@_bold']);
  if (attrs['@_ul'] !== undefined) style.underline = truthy(attrs['@_ul']) || String(attrs['@_ul']).toLowerCase() !== 'none';
  if (attrs['@_underline'] !== undefined) style.underline = truthy(attrs['@_underline']);
  if (attrs['@_reverse'] !== undefined) style.reverse = truthy(attrs['@_reverse']);
  if (attrs['@_width'] !== undefined) style.widthMul = clampSize(attrs['@_width']);
  if (attrs['@_height'] !== undefined) style.heightMul = clampSize(attrs['@_height']);
  if (attrs['@_dw'] !== undefined && truthy(attrs['@_dw'])) style.widthMul = 2;
  if (attrs['@_dh'] !== undefined && truthy(attrs['@_dh'])) style.heightMul = 2;
  if (attrs['@_font'] !== undefined) style.font = String(attrs['@_font']).toLowerCase();
  if (attrs['@_ul'] !== undefined && String(attrs['@_ul']).toLowerCase() === 'none') style.underline = false;
}

function clampSize(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : 1;
}

function defaultStyle() {
  return { align: 'left', bold: false, underline: false, reverse: false, widthMul: 1, heightMul: 1, font: 'a' };
}

function parseEposXml(xmlString) {
  let tree;
  try {
    tree = parseXml(xmlString);
  } catch (e) {
    return { ok: false, error: `Invalid XML: ${e.message}`, lines: [] };
  }

  const eposNode = findDeep(tree, (n) => stripNs(n.tag).toLowerCase() === 'epos-print');
  if (!eposNode) {
    return {
      ok: false,
      error: 'Element <epos-print> not found: the document will still be saved and shown.',
      lines: [],
    };
  }

  const lines = [];
  const errors = [];
  const style = defaultStyle();

  for (const child of normalizeNodes(eposNode.children)) {
    if (child.tag === '#text') continue; // Whitespace/indentation between tags.

    const tag = stripNs(child.tag).toLowerCase();
    const attrs = lowerAttrs(child.attrs);

    switch (tag) {
      case 'text': {
        applyStyleAttrs(style, attrs);
        const text = getText(child);
        if (text !== '') {
          lines.push({ type: 'text', text, style: { ...style } });
        }
        break;
      }
      case 'feed': {
        const n = parseInt(attrs['@_line'], 10);
        const count = Number.isFinite(n) && n > 0 ? n : 1;
        for (let i = 0; i < count; i++) lines.push({ type: 'feed' });
        break;
      }
      case 'cut': {
        lines.push({ type: 'cut', cutType: attrs['@_type'] || 'feed' });
        break;
      }
      case 'image': {
        lines.push({ type: 'image', align: attrs['@_align'] || style.align });
        break;
      }
      case 'barcode': {
        lines.push({
          type: 'barcode',
          data: getText(child),
          barcodeType: attrs['@_type'] || attrs['@_symbology'] || '?',
          style: { ...style },
        });
        break;
      }
      case 'symbol': {
        lines.push({
          type: 'symbol',
          data: getText(child),
          symbolType: attrs['@_type'] || 'qrcode',
          style: { ...style },
        });
        break;
      }
      case 'logo': {
        lines.push({ type: 'logo', align: style.align });
        break;
      }
      case 'pulse': {
        lines.push({ type: 'pulse', info: 'Open cash drawer (pulse)' });
        break;
      }
      default: {
        lines.push({ type: 'raw', tag: stripNs(child.tag), attrs: child.attrs, text: getText(child) });
        break;
      }
    }
  }

  return { ok: true, lines, errors };
}

module.exports = { parseEposXml };
