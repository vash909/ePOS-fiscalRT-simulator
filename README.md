# sim-epos

Local/network Epson printer simulator for POS application development and
debugging. It provides best-effort compatibility with:

1. **Epson Fiscal ePOS-Print XML** for Italian RT fiscal printers
   (`fpmate.cgi` / EpsonFPMate / FP-81II RT / FP-90III RT / Epson Server RT
   style endpoints).
2. **Standard Epson ePOS-Print XML** for non-fiscal printers
   (`/cgi-bin/epos/service.cgi` style endpoint).

Instead of printing, the simulator displays the receipt in a **web UI** with
a thermal-paper preview (58 mm / 80 mm), stores the received XML, and replies
to the POS application with an "OK" XML response, or with a simulated error.

> ## Fiscal Disclaimer
> This simulator has **no fiscal value**, **does not send anything to the
> Italian Revenue Agency or Sistema Tessera Sanitaria**, and **does not replace
> an RT fiscal printer**. Receipt numbers, Z report numbers, and XML responses
> are **fake local test data** used only to let POS software continue its
> application flow during development and debugging. Do not use it for fiscal
> production workflows.

---

## Contents

- [Requirements](#requirements)
- [Quick Install on Lubuntu 24](#quick-install-on-lubuntu-24)
- [Generic Install](#generic-install)
- [Start](#start)
- [Configuration](#configuration)
- [POS Application Setup](#pos-application-setup)
- [Available Endpoints](#available-endpoints)
- [Web UI](#web-ui)
- [Simulated Printer States](#simulated-printer-states)
- [curl Examples](#curl-examples)
- [Standard ePOS-Print XML Example](#standard-epos-print-xml-example)
- [Fiscal ePOS RT XML Example](#fiscal-epos-rt-xml-example)
- [What Is Supported vs Simulated](#what-is-supported-vs-simulated)
- [Raw TCP](#raw-tcp)
- [Project Structure](#project-structure)
- [Known Limits](#known-limits)

---

## Requirements

- Node.js >= 18
- npm
- Linux, Windows, or macOS
- No proprietary Epson dependency and no cloud API

## Quick Install on Lubuntu 24

On a fresh Lubuntu 24 machine:

```bash
sudo apt update
sudo apt install -y git nodejs npm
node -v
npm -v
```

If `node -v` prints a version lower than 18, install a newer Node.js release
with your preferred method, for example NodeSource or nvm, then reopen the
terminal and check `node -v` again.

Clone and install the project:

```bash
git clone <this-repo-url> sim-epos
cd sim-epos
npm install
cp config.example.json config.json
npm start
```

Open the web UI from the same PC:

```text
http://localhost:8000/
```

From another device on the same LAN, use the IP printed at startup, for example:

```text
http://192.168.1.50:8000/
```

If the Lubuntu firewall is enabled, allow the default ports:

```bash
sudo ufw allow 8000/tcp
sudo ufw allow 9100/tcp
```

## Generic Install

```bash
git clone <this-repo-url> sim-epos
cd sim-epos
npm install
cp config.example.json config.json   # optional, see below
```

## Start

```bash
npm start
# or
node src/server.js
```

At startup the server prints the local IP address and all available endpoints:

```text
=================================================
 sim-epos - Epson printer simulator (NON-FISCAL)
=================================================
HTTP server listening on 0.0.0.0:8000

Available endpoints:
  Web UI              : http://192.168.1.50:8000/
  Fiscal ePOS RT      : http://192.168.1.50:8000/cgi-bin/fpmate.cgi
  Standard ePOS-Print : http://192.168.1.50:8000/cgi-bin/epos/service.cgi
  Raw TCP             : 192.168.1.50:9100

NOTE: non-fiscal simulator, development/debug only.
=================================================
```

The server listens on `0.0.0.0`, so it is reachable from any device on the
same LAN, such as the PC running the POS application.

### Start With Different Ports

Ports and selected options can be overridden with environment variables without
editing `config.json`:

```bash
HTTP_PORT=9000 RAW_TCP_PORT=9200 RAW_TCP_ENABLED=false npm start
```

## Configuration

`config.example.json` contains the default configuration. Copy it to
`config.json` to customize local settings. `config.json` is ignored by git.

```json
{
  "httpHost": "0.0.0.0",
  "httpPort": 8000,

  "rawTcp": {
    "enabled": true,
    "port": 9100,
    "host": "0.0.0.0"
  },

  "endpoints": {
    "fiscal": "/cgi-bin/fpmate.cgi",
    "epos": "/cgi-bin/epos/service.cgi"
  },

  "paper": {
    "defaultWidthMm": 58,
    "allowedWidthsMm": [58, 80]
  },

  "printer": {
    "defaultStatus": "online",
    "defaultResponseMode": "ok",
    "permissive": true
  },

  "dataDir": "./data",
  "maxReceipts": 500
}
```

| Field | Description |
|---|---|
| `httpHost` / `httpPort` | HTTP server and web UI address/port, default `0.0.0.0:8000` |
| `rawTcp.enabled` | Enables or disables the raw TCP listener on port 9100 |
| `rawTcp.port` / `rawTcp.host` | Raw TCP listener port and host |
| `endpoints.fiscal` | Fiscal ePOS RT endpoint path, default `/cgi-bin/fpmate.cgi` |
| `endpoints.epos` | Standard ePOS-Print endpoint path, default `/cgi-bin/epos/service.cgi` |
| `paper.defaultWidthMm` | Default paper width selected in the UI, 58 or 80 |
| `printer.defaultStatus` | Simulated startup state, such as `online`, `offline`, `paper-end` |
| `printer.permissive` | If `true`, unrecognized documents still receive a generic OK response |
| `dataDir` | Folder used to save receipts and JSON databases |
| `maxReceipts` | Maximum number of retained receipts; older entries are removed |

Equivalent environment variables: `HTTP_HOST`, `HTTP_PORT`,
`RAW_TCP_ENABLED`, `RAW_TCP_PORT`, `RAW_TCP_HOST`.

## POS Application Setup

In your POS application, configure the Epson fiscal or non-fiscal printer so
that it points to the IP address of the machine running `sim-epos` and to the
endpoints printed at startup:

- **RT fiscal printer**: address `http://<SIM-EPOS-IP>:8000`, endpoint
  `/cgi-bin/fpmate.cgi` over HTTP.
- **Non-fiscal ePOS-Print printer**: address `http://<SIM-EPOS-IP>:8000`,
  endpoint `/cgi-bin/epos/service.cgi`.
- **Raw TCP mode**: if the POS application sends raw TCP data to port 9100,
  as many network Epson printers do for ESC/POS + XML flows, point it to
  `<SIM-EPOS-IP>:9100`.

Open `http://<SIM-EPOS-IP>:8000/` in a browser to watch receipts arrive in
real time.

## Available Endpoints

| Method | Default path | Description |
|---|---|---|
| `POST` | `/cgi-bin/fpmate.cgi` | Receives Fiscal ePOS-Print RT XML and replies with OK or error XML |
| `POST` | `/cgi-bin/epos/service.cgi` | Receives standard ePOS-Print XML and replies with OK or error XML |
| `GET` | `/` | Web UI |
| `GET` | `/api/receipts` | Receipt list as JSON |
| `GET` | `/api/receipts/:id` | Receipt details as JSON, including parsed data |
| `GET` | `/api/receipts/:id/raw` | Original XML download |
| `GET` | `/api/receipts/:id/response` | XML response sent for that receipt |
| `DELETE` | `/api/receipts` | Deletes all receipts and saved files |
| `GET` | `/api/state` | Current simulated printer state |
| `POST` | `/api/state` | Sets the simulated state, for example `{"status": "paper-end"}` |
| `GET` | `/api/config` | Current endpoint, port, and paper-width configuration |
| `WS` | `/ws` | WebSocket used by the UI for real-time updates |
| Raw TCP | `9100` (configurable) | Receives raw XML and auto-detects Fiscal or ePOS |

## Web UI

The web UI at `http://<IP>:8000/` shows:

- Received receipts in reverse chronological order, with detected protocol,
  sender IP, timestamp, endpoint, and simulated printer state.
- Thermal-paper preview for the selected receipt, selectable at **58 mm** or
  **80 mm**, with monospace rendering.
- **Original XML** and **Sent response** tabs.
- Parsing warnings highlighted without blocking the rest of the preview.
- Buttons to clear the list, download the original XML, download a standalone
  HTML preview, or re-render the preview on screen.
- A simulated printer-state selector. The selected state affects subsequent
  requests across HTTP and raw TCP until it is changed again.
- A WebSocket connection indicator.

When a new receipt arrives, the list updates through `/ws` without reloading
the page.

## Simulated Printer States

These states can be selected from the UI or through `/api/state`. They apply to
all subsequent requests on both protocols and raw TCP.

| State | Effect |
|---|---|
| `online` | Normal OK response, default |
| `offline` | Simulated printer offline error |
| `paper-end` | Simulated paper-end error |
| `cover-open` | Simulated cover-open error |
| `generic-error` | Simulated generic error |
| `fiscal-error` | Simulated fiscal error; Fiscal RT includes `<fiscalError>` |
| `timeout` | No response is sent; the connection stays open until the client/server times out |
| `invalid-xml` | Deliberately malformed or truncated XML response |

Except for `timeout`, the received receipt is still saved and displayed in the
UI together with the simulated state active at receive time.

## curl Examples

### Standard ePOS-Print OK

```bash
curl -X POST http://localhost:8000/cgi-bin/epos/service.cgi \
  -H "Content-Type: text/xml; charset=utf-8" \
  --data-binary @examples/epos-normal.xml
```

Expected response:

```xml
<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Body>
  <response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="0" battery="100"/>
 </soapenv:Body>
</soapenv:Envelope>
```

### Fiscal ePOS RT OK

```bash
curl -X POST http://localhost:8000/cgi-bin/fpmate.cgi \
  -H "Content-Type: text/xml; charset=utf-8" \
  --data-binary @examples/fiscal-rt.xml
```

Expected response. The receipt number and Z report number are **simulated** and
generated locally on each `endFiscalReceipt`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response success="true" code="" status="0">
  <printerStatus>online</printerStatus>
  <fiscalReceiptNumber>1</fiscalReceiptNumber>
  <fiscalReceiptDate>10-06-2026</fiscalReceiptDate>
  <fiscalReceiptTime>10:25:47</fiscalReceiptTime>
  <zRepNumber>1</zRepNumber>
  <fiscalReceiptAmount>5.85</fiscalReceiptAmount>
</response>
```

### Simulate an Error

```bash
# Set the simulated printer state.
curl -X POST http://localhost:8000/api/state \
  -H "Content-Type: application/json" \
  -d '{"status": "paper-end"}'

# Every subsequent request receives the simulated error.
curl -X POST http://localhost:8000/cgi-bin/epos/service.cgi \
  -H "Content-Type: text/xml" \
  --data '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text>test</text></epos-print>'
```

Response:

```xml
<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Body>
  <response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="false" code="EPTR_REC_EMPTY" status="8" battery="100"/>
 </soapenv:Body>
</soapenv:Envelope>
```

Return to normal:

```bash
curl -X POST http://localhost:8000/api/state \
  -H "Content-Type: application/json" -d '{"status": "online"}'
```

### Unrecognized XML in Permissive Mode

```bash
curl -X POST http://localhost:8000/cgi-bin/epos/service.cgi \
  -H "Content-Type: text/xml" \
  --data '<not-epos><foo bar="baz"/></not-epos>'
```

With `printer.permissive = true`, the default, the document is saved, shown in
the UI with an "unrecognized protocol" warning, and receives a generic ePOS OK
response. With `permissive = false`, it receives a generic error response.

## Standard ePOS-Print XML Example

Full file: [`examples/epos-normal.xml`](examples/epos-normal.xml)

```xml
<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Body>
  <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
    <text align="center" em="true">DEMO SHOP LLC&#10;</text>
    <text align="center">1 Main Street - Milan&#10;</text>
    <text>--------------------------------&#10;</text>
    <text align="left">Coffee             1 x 1.20   1.20&#10;</text>
    <text align="left">Croissant          2 x 1.00   2.00&#10;</text>
    <text>--------------------------------&#10;</text>
    <text align="right" width="2" height="2">TOT EUR 3.20&#10;</text>
    <feed line="2"/>
    <barcode type="code128">1234567890</barcode>
    <symbol type="qrcode">https://example.com</symbol>
    <feed line="2"/>
    <cut type="feed"/>
  </epos-print>
 </soapenv:Body>
</soapenv:Envelope>
```

ePOS parser commands and attributes:

| Tag | Interpretation |
|---|---|
| `<text align="left|center|right" em="true" ul="true" reverse="true" width="1-8" height="1-8" dw="true" dh="true">` | Text, alignment, bold, underline, reverse, and approximate preview size |
| `<feed line="N"/>` | N blank lines |
| `<cut type="..."/>` | Cut line |
| `<image>` | `[ IMAGE ]` placeholder |
| `<barcode type="...">data</barcode>` | `[ BARCODE type: data ]` placeholder |
| `<symbol type="qrcode">data</symbol>` | `[ QRCODE: data ]` placeholder |
| `<logo/>` | `[ LOGO ]` placeholder |
| Any other tag | `RAW/UNKNOWN: <tag attrs> text` line |

## Fiscal ePOS RT XML Example

Full file: [`examples/fiscal-rt.xml`](examples/fiscal-rt.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<printerFiscalReceipt operator="1">
  <beginFiscalReceipt operator="1"/>
  <printRecItem description="STILL WATER 0.5L" quantity="2.000" unitPrice="1.50" department="1"/>
  <printRecItem description="HAM SANDWICH" quantity="1.000" unitPrice="3.50" department="2"/>
  <printRecItemAdjustment description="Customer discount" adjustmentType="2" amount="10"/>
  <printRecSubtotal/>
  <printRecMessage message="Thank you, see you soon!"/>
  <printRecTotal description="CASH" payment="7.00" paymentType="0" index="1"/>
  <endFiscalReceipt operator="1"/>
</printerFiscalReceipt>
```

Example with void and an unknown custom tag:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<printerFiscalReceipt operator="2">
  <beginFiscalReceipt operator="2"/>
  <printRecItem description="BOOK" quantity="1" unitPrice="20.00" department="3"/>
  <posSpecificField value="ABC123"/>
  <printRecVoid/>
  <endFiscalReceipt operator="2"/>
</printerFiscalReceipt>
```

`<posSpecificField>` is not a recognized command. It is shown in the preview as
a `RAW/UNKNOWN` line without blocking the rest of the document.

## What Is Supported vs Simulated

Public documentation for the XML protocol used by `fpmate.cgi`,
EpsonFPMate, and Server RT on Italian Epson RT fiscal printers is fragmented
and can vary by firmware or SDK. This simulator implements a tolerant,
best-effort parser based on the most common Epson FP fiscal command set exposed
as XML.

### Interpreted Commands

| Command | Interpreted as |
|---|---|
| `beginFiscalReceipt` | Fiscal receipt header |
| `printRecItem` | Item line with description, quantity, unit price, line total, department/VAT |
| `printRecItemAdjustment`, `printRecSubtotalAdjustment` | Discount or surcharge by amount or percentage |
| `printRecItemVoid`, `printRecItemAdjustmentVoid` | Item or discount void |
| `printRecRefund` | Refund |
| `printRecSubtotal` | Subtotal |
| `printRecTotal` | Payment; maps `paymentType` to common labels such as cash, check, card, ticket |
| `printRecMessage` | Free receipt message |
| `printRecVoid` | Whole-document void |
| `endFiscalReceipt` | Receipt close; computes total/change and generates simulated document and Z report numbers |
| `printerStatus` | Printer status request |
| `printNormal`, `printNonFiscalText`, `beginNonFiscal`, `endNonFiscal` | Free non-fiscal text |
| `printXReport`, `printZReport` | X/Z report print placeholder |
| `directIO`, `fiscalDirectIO` | Raw line, not interpreted |
| `openDrawer` | Cash-drawer placeholder |
| Any other tag | `RAW/UNKNOWN`; the document is still saved and displayed |

### Simulated Data

- `fiscalReceiptNumber` and `zRepNumber` are local incremental counters stored
  in `data/counters.json`; they do not come from any real fiscal register.
- The successful Fiscal RT `<response>` is plausible but not guaranteed to
  match every real Epson RT firmware or SDK byte for byte.
- ePOS and fiscal error codes are chosen to be plausible, but they are not
  guaranteed to be identical to the real firmware codes.
- There is no fiscal transmission, no legal fiscal log, and no interaction with
  external government systems.

## Raw TCP

When `rawTcp.enabled` is `true`, the default, the simulator also opens a raw
TCP listener on port **9100**, a common port for network Epson printers.

- The client connects and sends Fiscal or ePOS XML as raw text, without HTTP
  headers.
- The simulator buffers incoming data and, after a short idle delay or socket
  close, detects the protocol by looking for `epos-print` or known fiscal tags.
- It writes the XML response to the same socket, using the same logic as the
  HTTP routes, including the current simulated printer state.
- The received receipt appears in the UI with endpoint `raw-tcp:9100`.

Quick example with `nc`:

```bash
cat examples/fiscal-rt.xml | nc localhost 9100
```

## Project Structure

```text
sim-epos/
|-- package.json
|-- config.example.json
|-- README.md
|-- data/                     # created automatically
|   |-- db.json               # receipt metadata
|   |-- counters.json         # simulated fiscalReceiptNumber and zRepNumber
|   `-- receipts/             # original XML files and sent responses
|-- examples/
|   |-- epos-normal.xml
|   |-- fiscal-rt.xml
|   `-- fiscal-rt-void.xml
|-- public/                   # static web UI
|   |-- index.html
|   |-- css/style.css
|   `-- js/app.js
`-- src/
    |-- server.js             # entry point, Express + WebSocket + raw TCP
    |-- config.js             # configuration loader
    |-- state.js              # simulated printer state
    |-- counters.js           # simulated fiscal counters
    |-- store.js              # receipt persistence, JSON + filesystem
    |-- handlers.js           # shared request processing logic
    |-- responses.js          # OK/error XML response generation
    |-- rawTcp.js             # raw TCP listener, port 9100
    |-- wsServer.js           # WebSocket real-time updates
    |-- parsers/
    |   |-- xmlUtils.js       # shared XML helpers for fast-xml-parser
    |   |-- eposParser.js     # standard ePOS-Print parser
    |   `-- fiscalParser.js   # tolerant Fiscal ePOS RT parser
    `-- routes/
        |-- printer.js        # fpmate.cgi and epos/service.cgi endpoints
        `-- api.js            # REST API for the web UI
```

## Known Limits

- The Fiscal RT parser covers common commands but not the full command set of
  every Epson model or firmware. Unknown tags are shown as `RAW/UNKNOWN`.
- Text scaling through `width`, `height`, `dw`, and `dh` is approximate and
  does not reproduce the exact output of a real thermal printer.
- `image`, `barcode`, and `symbol`/`qrcode` are shown as text placeholders, not
  rendered graphically.
- Raw TCP framing is based on a 150 ms inactivity timeout instead of a protocol
  delimiter. For very large documents sent in bursts, adjust `FLUSH_DELAY_MS`
  in `src/rawTcp.js`.
- No fiscal log, signature, or external system interaction exists. Everything
  stays local in `./data/`.
