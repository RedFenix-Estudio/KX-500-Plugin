/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Add-on v1.4.0                                 ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  Protocolo HID confirmado por captura USBPcap+Wireshark           ║
 * ║  (2026-08-26, USBPcap2, device 2.2, endpoint 0x03 OUT)           ║
 * ║                                                                  ║
 * ║  Fix de v1.4.0:                                                   ║
 * ║    Cambio a device.control_transfer() con HID SET_REPORT          ║
 * ║    (Output Report, ID 4). El KX-500 no tiene Feature Reports     ║
 * ║    declarados (HidD_SetFeature -> 0x01 ERROR_INVALID_FUNCTION),   ║
 * ║    y WriteFile falla con 0x57 ERROR_INVALID_PARAMETER para        ║
 * ║    Output Reports. La unica via que queda es el control           ║
 * ║    transfer con SET_REPORT.                                      ║
 * ║                                                                  ║
 * ║  Fix de v1.2.0:                                                   ║
 * ║    Validate() matchea FF1C:0092 en interface 1 (TLC 4).           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Estructura del paquete (todos los 64B):
 *   [04] [SEQ] [CMD/DATA...] [pad 0x00]
 *    │     │      │
 *    │     │      └─ payload específico del comando
 *    │     └─ sequence byte (específico por comando, no counter)
 *    └─ Report ID HID = 0x04 (fijo)
 *
 * Envoltorio obligatorio en cada acción:
 *   [04 01 00 01 ...pad 64B]  START
 *   [...comando real 64B...]
 *   [04 02 00 02 ...pad 64B]  END
 *
 * Para el KX-500 se envia via HID SET_REPORT control transfer:
 *   bmRequestType = 0x21 (Host->Device, Class, Interface)
 *   bRequest      = 0x09 (SET_REPORT)
 *   wValue        = 0x0204 (Report Type = Output, Report ID = 4)
 *   wIndex        = 1     (Interface 1)
 *   data          = 64 bytes (incluye Report ID 0x04 al inicio)
 *   wLength       = 64
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// HID
// ════════════════════════════════════════════════════════════════════
const VID = 0x320F;
const PID = 0x5008;
const REPORT_SIZE = 64;
const REPORT_ID = 0x04;

// Handshake — visto 3x en captura mixta. "0F 32 08 50" little-endian
// decodifica como VID 0x320F + PID 0x5008. El firmware se autoiden-
// tifica al recibirlo.
const HANDSHAKE = [
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
];

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
function pad64(arr) {
    const out = new Uint8Array(REPORT_SIZE);
    for (let i = 0; i < Math.min(arr.length, REPORT_SIZE); i++) out[i] = arr[i];
    return out;
}

function heartbeatStart() {
    return pad64([REPORT_ID, 0x01, 0x00, 0x01]);
}

function heartbeatEnd() {
    return pad64([REPORT_ID, 0x02, 0x00, 0x02]);
}

// ════════════════════════════════════════════════════════════════════
// HID SET_REPORT via control transfer
// ════════════════════════════════════════════════════════════════════
// El KX-500 expone Output Reports pero NO Feature Reports, por lo que:
//   - device.write() (WriteFile) -> 0x57 ERROR_INVALID_PARAMETER
//   - device.send_report() (HidD_SetFeature) -> 0x01 ERROR_INVALID_FUNCTION
// La unica via funcional desde el SDK de SignalRGB es el control transfer
// con HID class request SET_REPORT, que es lo que HidD_SetOutputReport
// hace internamente. Llega por el endpoint 0x00 (control) en vez del 0x03
// (interrupt), pero el firmware lo procesa igual.
const HID_SET_REPORT = 0x09;
const HID_RT_OUTPUT = 0x02;
const HID_RTM_OUTPUT_ID4 = (HID_RT_OUTPUT << 8) | REPORT_ID; // 0x0204
const HID_BM_HOST_TO_DEV_CLASS_IFACE = 0x21;
const HID_INTERFACE_NUMBER = 1;

function hidSetReport(packet) {
    // bmRequestType, bRequest, wValue, wIndex, data, wLength
    return device.control_transfer(
        HID_BM_HOST_TO_DEV_CLASS_IFACE,  // 0x21
        HID_SET_REPORT,                   // 0x09
        HID_RTM_OUTPUT_ID4,               // 0x0204
        HID_INTERFACE_NUMBER,             // 1
        packet,
        REPORT_SIZE                       // 64
    );
}

function writeWrapped(packet) {
    try {
        hidSetReport(heartbeatStart());
        hidSetReport(packet);
        hidSetReport(heartbeatEnd());
    } catch (err) {
        try { device.log(`[KX500] control_transfer error: ${err.message}`); } catch (_) {}
    }
}

function writeHandshake() {
    try {
        hidSetReport(heartbeatStart());
        hidSetReport(pad64(HANDSHAKE));
        hidSetReport(heartbeatEnd());
    } catch (err) {
        try { device.log(`[KX500] handshake error: ${err.message}`); } catch (_) {}
    }
}

// ════════════════════════════════════════════════════════════════════
// COMANDOS — todos confirmados por captura individual
// ════════════════════════════════════════════════════════════════════

// Apagar todos los LEDs. Confirmado en 08_off.pcapng.
function buildOff() {
    return pad64([REPORT_ID, 0x08, 0x00, 0x06, 0x01, 0x01]);
}

// Brightness 0..4. SEQ = 0x08 + nivel. Nivel 0 = igual a buildOff().
function buildBrightness(level) {
    level = Math.max(0, Math.min(4, level | 0));
    if (level === 0) return buildOff();
    return pad64([REPORT_ID, 0x08 + level, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, level]);
}

// Solid color RGB. SEQ se mantiene entre 0x08 y 0xFF.
// Formato: [04] [SEQ] 03 06 03 05 00 00 R G B
function buildSolidColor(r, g, b, seq) {
    const s = ((seq == null ? 0x08 : seq) & 0xFF);
    return pad64([REPORT_ID, s, 0x03, 0x06, 0x03, 0x05, 0x00, 0x00, r & 0xFF, g & 0xFF, b & 0xFF]);
}

// Efecto nativo 1..19 (1-15 formato A, 16-19 formato B).
// SEQ = 0x08 + (effect - 1). Confirmado en 14_cambio_animaciones.
function buildEffect(n) {
    n = Math.max(1, Math.min(19, n | 0));
    const seq = 0x08 + (n - 1);
    if (n <= 15) return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, n]);
    return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x11, 0x00, 0x00, n - 16]);
}

// SEQ counter local para buildSolidColor.
let _seq = 0x08;
function nextSeq() { const s = _seq; _seq = (_seq + 1) & 0xFF; return s; }

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// ════════════════════════════════════════════════════════════════════
const LAYOUT = [
    // F0: Esc + F1-F12 + Print Screen + Scroll Lock + Pause
    ['Esc', 0, 0], ['F1', 2, 0], ['F2', 3, 0], ['F3', 4, 0], ['F4', 5, 0],
    ['F5', 6.5, 0], ['F6', 7.5, 0], ['F7', 8.5, 0], ['F8', 9.5, 0],
    ['F9', 11, 0], ['F10', 12, 0], ['F11', 13, 0], ['F12', 14, 0],
    ['Print Screen', 15.5, 0], ['Scroll Lock', 16.5, 0], ['Pause Break', 17.5, 0],
    // F1: ` 1-0 - = Backspace + Insert Home PgUp
    ['`', 0.5, 1], ['1', 1.5, 1], ['2', 2.5, 1], ['3', 3.5, 1], ['4', 4.5, 1],
    ['5', 5.5, 1], ['6', 6.5, 1], ['7', 7.5, 1], ['8', 8.5, 1], ['9', 9.5, 1],
    ['0', 10.5, 1], ['-', 11.5, 1], ['=', 12.5, 1], ['Backspace', 14, 1],
    ['Insert', 16, 1], ['Home', 17, 1], ['Page Up', 18, 1],
    // F2: Tab QWERTY [ ] \ + Del End PgDn
    ['Tab', 0.75, 2], ['Q', 2, 2], ['W', 3, 2], ['E', 4, 2], ['R', 5, 2], ['T', 6, 2],
    ['Y', 7, 2], ['U', 8, 2], ['I', 9, 2], ['O', 10, 2], ['P', 11, 2],
    ['[', 12, 2], [']', 13, 2], ['\\', 14.25, 2],
    ['Del', 16, 2], ['End', 17, 2], ['Page Down', 18, 2],
    // F3: Caps ASDFGHJKL ; ' Enter
    ['Caps Lock', 1.25, 3], ['A', 2.75, 3], ['S', 3.75, 3], ['D', 4.75, 3],
    ['F', 5.75, 3], ['G', 6.75, 3], ['H', 7.75, 3], ['J', 8.75, 3],
    ['K', 9.75, 3], ['L', 10.75, 3], [';', 11.75, 3], ["'", 12.75, 3],
    ['Enter', 14.25, 3],
    // F4: LShift ZXCVBNM , . / RShift + Up
    ['Left Shift', 1.5, 4], ['Z', 3.5, 4], ['X', 4.5, 4], ['C', 5.5, 4], ['V', 6.5, 4],
    ['B', 7.5, 4], ['N', 8.5, 4], ['M', 9.5, 4], [',', 10.5, 4], ['.', 11.5, 4],
    ['/', 12.5, 4], ['Right Shift', 14.75, 4], ['Up Arrow', 17, 4],
    // F5: Ctrl Win Alt Space Alt Win Menu Ctrl + Left Down Right
    ['Left Ctrl', 1.25, 5], ['Left Win', 2.5, 5], ['Left Alt', 3.75, 5],
    ['Space', 7, 5], ['Right Alt', 10.25, 5], ['Fn', 11.5, 5],
    ['Menu', 12.75, 5], ['Right Ctrl', 14.25, 5],
    ['Left Arrow', 16, 5], ['Down Arrow', 17, 5], ['Right Arrow', 18, 5],
    // Numpad
    ['NumLock', 20, 1], ['Num /', 21, 1], ['Num *', 22, 1], ['Num -', 23, 1],
    ['Num 7', 20, 2], ['Num 8', 21, 2], ['Num 9', 22, 2], ['Num +', 23, 2],
    ['Num 4', 20, 3], ['Num 5', 21, 3], ['Num 6', 22, 3],
    ['Num 1', 20, 4], ['Num 2', 21, 4], ['Num 3', 22, 4], ['Num Enter', 23, 4],
    ['Num 0', 20.5, 5], ['Num .', 22, 5],
];

const LED_NAMES = LAYOUT.map((k) => k[0]);
const LED_POSITIONS = LAYOUT.map((k) => [k[1], k[2]]);
const SIZE = [24, 6];

// ════════════════════════════════════════════════════════════════════
// COLOR
// ════════════════════════════════════════════════════════════════════
function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function getAverageColor() {
    let r = 0, g = 0, b = 0, n = 0;
    for (const p of LED_POSITIONS) {
        try {
            const c = device.color(p[0], p[1]);
            r += c[0]; g += c[1]; b += c[2]; n++;
        } catch (_) { /* fuera de canvas */ }
    }
    if (n === 0) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB EXPORTS
// ════════════════════════════════════════════════════════════════════

/* global
device:readonly
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function Name() { return 'Checkpoint KX-500 (NA-KB-1001)'; }
export function Publisher() { return 'RedFenix Estudio'; }
export function VendorId() { return VID; }
export function ProductId() { return [PID]; }
export function Type() { return 'hid'; }
export function DeviceType() { return 'keyboard'; }
export function Size() { return SIZE; }
export function LedNames() { return LED_NAMES.slice(); }
export function LedPositions() { return LED_POSITIONS.map((p) => p.slice()); }
export function Documentation() { return 'https://github.com/RedFenix-Estudio/KX-500-Plugin'; }
export function ImageUrl() {
    return 'https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png';
}

/**
 * Validate — confirmado con log real de SignalRGB.
 *
 * El RGB del KX-500 está en la TLC Vendor Defined (FF1C:0092) que
 * el fabricante registra DENTRO de la interface 1 (la segunda USB
 * interface, que declara bInterfaceProtocol = 0x02 "Mouse" solo
 * para evitar problemas con Windows, pero las TLCs HID reales son
 * 4 colecciones: Keyboard NKRO, Consumer, Consumer swap, y FF1C:0092
 * que es donde está el RGB).
 *
 * Estructura completa del KX-500 (5 TLCs visibles para SignalRGB):
 *   interface 0, col 0  -> Keyboard BIOS      (intf USB 0)
 *   interface 1, col 1  -> Keyboard NKRO      (intf USB 1)
 *   interface 1, col 2  -> Consumer Control   (intf USB 1)
 *   interface 1, col 3  -> Consumer swap      (intf USB 1)
 *   interface 1, col 4  -> Vendor Defined     (intf USB 1)  ← RGB
 *
 * Mi v1.0.0 matcheaba FF1C:0092 o collection===4, que era correcto.
 * Mi v1.1.0 se confundió pensando que era Mouse (0x01:0x02) y eso
 * rompía el match, por eso veías "HID handle is invalid" en el log.
 */
export function Validate(endpoint) {
    if (endpoint.interface === 1
        && endpoint.usage_page === 0xFF1C
        && endpoint.usage === 0x0092) {
        return true;
    }
    return false;
}

export function ControllableParameters() {
    return [
        { property: 'shutdownColor', group: 'lighting', label: 'Shutdown Color', type: 'color', default: '#000000' },
        { property: 'LightingMode', group: 'lighting', label: 'Lighting Mode', type: 'combobox', values: ['Canvas', 'Forced'], default: 'Canvas' },
        { property: 'forcedColor', group: 'lighting', label: 'Forced Color', type: 'color', default: '#009bde' },
    ];
}

export function ConflictingProcesses() {
    return ['Mechanical Keyboard.exe', 'HidServ.exe', 'CHECKPOINT_KX_500.exe'];
}

export function Initialize() {
    try {
        device.setName('Checkpoint KX-500 (NA-KB-1001)');
        device.setSize(SIZE);
        device.setControllableLeds(LED_NAMES.slice(), LED_POSITIONS.map((p) => p.slice()));
        device.log(`[KX500] Registered ${LED_NAMES.length} keys (${SIZE[0]}x${SIZE[1]})`);
        device.log(`[KX500] HID Output Report 64B on interface 1 (Mouse) — Report ID 0x04`);
    } catch (err) {
        try { device.log(`[KX500] init error: ${err.message}`); } catch (_) {}
    }
    _seq = 0x08;
    writeHandshake();
    try { device.log('[KX500] Handshake sent'); } catch (_) {}
}

export function Render() {
    let r, g, b;
    if (typeof LightingMode !== 'undefined' && LightingMode === 'Forced') {
        [r, g, b] = hexToRgb(forcedColor || '#009bde');
    } else {
        [r, g, b] = getAverageColor();
    }
    writeWrapped(buildSolidColor(r, g, b, nextSeq()));
}

export function Shutdown(suspending) {
    const hex = suspending ? '#000000' : (shutdownColor || '#000000');
    const [r, g, b] = hexToRgb(hex);
    writeWrapped((r + g + b < 30) ? buildOff() : buildSolidColor(r, g, b, nextSeq()));
}
