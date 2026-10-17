/**
 * KX500_Plugin.js - v2.5.0
 * Checkpoint KX-500 (NA-KB-1001) - SignalRGB plugin
 *
 * PROTOCOL (verified against 18 USBPcap captures of the official driver)
 * Output Report = 64 bytes:
 *   [0]=0x04 ReportID  [1]=SEQ  [2]=BYTE2  [3]=0x06
 *   [4]=C1            [5]=C2   [6..7]=0x00 [8]=VALUE (or [8..10]=R,G,B)
 *   [11..63]=0x00
 *
 * Handshake (43 useful bytes):
 *   04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00
 *   01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14
 *
 * Commands implemented (of 12 found in the captures):
 *   06 01 01 = BRIGHTNESS        -> buildBrightness()
 *   06 01 00 = ANIMATION ID     -> buildEffect()
 *   06 03 05 = GLOBAL RGB COLOR -> buildSolidColor()
 *
 * TRANSPORT DIAGNOSIS (all measured, see dev/tools/):
 *   HidD_SetOutputReport ................ 25/25 OK
 *   WriteFile synchronous ............... 12/12 OK
 *   WriteFile overlapped ............... 25/25 OK
 *   WriteFile overlapped + reader ..... 25/25 OK
 *   handshake/brightness/effect/color ... OK
 *
 *   WinUsb API is NOT available on this device:
 *     \\?\USB\VID_320F&PID_5008#...#{GUID}  CreateFileW -> OK
 *                                           WinUsb_Initialize -> err=6
 *   The device is bound to HidUsb.sys, not WinUsb.sys. But SignalRGB in
 *   rawusb mode uses libusb (a different mechanism), so rawusb is still
 *   the type under test.
 *
 *   device.write() in SignalRGB returns ERROR_OPERATION_ABORTED (995).
 *   Five hypotheses were tested and refuted; the root cause of the 995 is
 *   still UNDETERMINED. See DIAGNOSTICO.md.
 */

'use strict';

// ==================================================================
// HID identifiers
// ==================================================================
const VID = 0x320F;
const PID = 0x5008;

const REPORT_ID = 0x04;
const REPORT_SIZE = 64;

// ==================================================================
// Command builders
// ==================================================================
function pad64(arr) {
    const out = arr.slice();
    while (out.length < REPORT_SIZE) out.push(0x00);
    return out.slice(0, REPORT_SIZE);
}

// HANDSHAKE - first Output Report, opens the conversation with the firmware
const HANDSHAKE = [
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
];

// OFF - brightness 0
function buildOff() {
    return pad64([REPORT_ID, 0x08, 0x00, 0x06, 0x01, 0x01]);
}

// BRIGHTNESS 0..4  ->  06 01 01
// Verified: seq = 0x08 + level, value at byte[8] = level
function buildBrightness(level) {
    level = Math.max(0, Math.min(4, level | 0));
    if (level === 0) return buildOff();
    return pad64([REPORT_ID, 0x08 + level, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, level]);
}

// GLOBAL RGB COLOR  ->  06 03 05
// Verified against "prueba del test 1.pcapng":
//   04 09 01 06 03 05 00 00 00 00 FF   <- solid BLUE
//   04 0A 01 06 03 05 00 00 FF 00 00   <- solid RED
//   04 0B 01 06 03 05 00 00 00 FF 00   <- solid GREEN
// byte[2] = 0x01 is the reference value from the official driver.
let _seq = 0x08;
function nextSeq() { const s = _seq; _seq = (_seq + 1) & 0xFF; return s; }

function buildSolidColor(r, g, b, seq) {
    const s = ((seq == null ? nextSeq() : seq) & 0xFF);
    return pad64([REPORT_ID, s, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00,
                  r & 0xFF, g & 0xFF, b & 0xFF]);
}

// ANIMATION ID  ->  06 01 00
// Verified: seq = 0x08 + (n - 1), value at byte[8] = n
// Captures confirm 05 = breathing; values 01 and 02 appear in
// teclado_solo_cambio_animaciones.pcapng
function buildEffect(n) {
    n = Math.max(1, Math.min(19, n | 0));
    const seq = 0x08 + (n - 1);
    if (n <= 15) return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, n]);
    return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x11, 0x00, 0x00, n - 16]);
}

// ==================================================================
// Writes
// ==================================================================
// device.write() is the only path available from a SignalRGB plugin.
// The SDK runs in a QJSEngine sandbox with NO sockets (there is no
// device.udpSocket()), so a plugin cannot delegate writes to an external
// process. dev/tools/kx500_bridge.py is a standalone diagnostic only.
function writeOutput(packet) {
    try {
        device.write(packet, REPORT_SIZE);
    } catch (err) {
        try { device.log(`[KX500] write error: ${err.message}`); } catch (_) {}
    }
}

function writeRGBPacket(packet, pauseMs = 5) {
    writeOutput(packet);
    try { device.pause(pauseMs); } catch (_) {}
}

// ==================================================================
// LAYOUT - 104 keys
// ==================================================================
const LAYOUT = [
    ['Esc', 0, 0], ['F1', 2, 0], ['F2', 3, 0], ['F3', 4, 0], ['F4', 5, 0],
    ['F5', 6.5, 0], ['F6', 7.5, 0], ['F7', 8.5, 0], ['F8', 9.5, 0],
    ['F9', 11, 0], ['F10', 12, 0], ['F11', 13, 0], ['F12', 14, 0],
    ['Print Screen', 15.5, 0], ['Scroll Lock', 16.5, 0], ['Pause Break', 17.5, 0],
    ['`', 0.5, 1], ['1', 1.5, 1], ['2', 2.5, 1], ['3', 3.5, 1], ['4', 4.5, 1],
    ['5', 5.5, 1], ['6', 6.5, 1], ['7', 7.5, 1], ['8', 8.5, 1], ['9', 9.5, 1],
    ['0', 10.5, 1], ['-', 11.5, 1], ['=', 12.5, 1], ['Backspace', 14, 1],
    ['Insert', 16, 1], ['Home', 17, 1], ['Page Up', 18, 1],
    ['Tab', 0.75, 2], ['Q', 2, 2], ['W', 3, 2], ['E', 4, 2], ['R', 5, 2], ['T', 6, 2],
    ['Y', 7, 2], ['U', 8, 2], ['I', 9, 2], ['O', 10, 2], ['P', 11, 2],
    ['[', 12, 2], [']', 13, 2], ['\\', 14.25, 2],
    ['Del', 16, 2], ['End', 17, 2], ['Page Down', 18, 2],
    ['Caps Lock', 1.25, 3], ['A', 2.75, 3], ['S', 3.75, 3], ['D', 4.75, 3],
    ['F', 5.75, 3], ['G', 6.75, 3], ['H', 7.75, 3], ['J', 8.75, 3],
    ['K', 9.75, 3], ['L', 10.75, 3], [';', 11.75, 3], ["'", 12.75, 3],
    ['Enter', 14.25, 3],
    ['Left Shift', 1.5, 4], ['Z', 3.5, 4], ['X', 4.5, 4], ['C', 5.5, 4], ['V', 6.5, 4],
    ['B', 7.5, 4], ['N', 8.5, 4], ['M', 9.5, 4], [',', 10.5, 4], ['.', 11.5, 4],
    ['/', 12.5, 4], ['Right Shift', 14.75, 4], ['Up Arrow', 17, 4],
    ['Left Ctrl', 1.25, 5], ['Left Win', 2.5, 5], ['Left Alt', 3.75, 5],
    ['Space', 7, 5], ['Right Alt', 10.25, 5], ['Fn', 11.5, 5],
    ['Menu', 12.75, 5], ['Right Ctrl', 14.25, 5],
    ['Left Arrow', 16, 5], ['Down Arrow', 17, 5], ['Right Arrow', 18, 5],
    ['NumLock', 20, 1], ['Num /', 21, 1], ['Num *', 22, 1], ['Num -', 23, 1],
    ['Num 7', 20, 2], ['Num 8', 21, 2], ['Num 9', 22, 2], ['Num +', 23, 2],
    ['Num 4', 20, 3], ['Num 5', 21, 3], ['Num 6', 22, 3],
    ['Num 1', 20, 4], ['Num 2', 21, 4], ['Num 3', 22, 4], ['Num Enter', 23, 4],
    ['Num 0', 20.5, 5], ['Num .', 22, 5],
];

const LED_NAMES = LAYOUT.map((k) => k[0]);
const LED_POSITIONS = LAYOUT.map((k) => [k[1], k[2]]);
const SIZE = [24, 6];

// ==================================================================
// Color helpers
// ==================================================================
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
        } catch (_) {}
    }
    if (n === 0) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ==================================================================
// SignalRGB exports
// ==================================================================
export function Name() { return 'Checkpoint KX-500 (NA-KB-1001)'; }
export function Publisher() { return 'RedFenix Estudio'; }
export function VendorId() { return VID; }
export function ProductId() { return [PID]; }

// v2.5.0 - TRANSPORT: rawusb
// The WinUsb API is unavailable (err=6, device on HidUsb.sys), but
// SignalRGB rawusb uses libusb, which is a different mechanism and is
// therefore still the type under test.
export function Type() { return 'rawusb'; }

export function DeviceType() { return 'keyboard'; }
export function Size() { return SIZE; }
export function LedNames() { return LED_NAMES.slice(); }
export function LedPositions() { return LED_POSITIONS.map((p) => p.slice()); }
export function Documentation() { return 'https://github.com/RedFenix-Estudio/KX-500-Plugin'; }

// rawusb: match by interface
export function Validate(endpoint) {
    return endpoint.interface === 1;
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

// ==================================================================
// INITIALIZE - 4 step sequence
// ==================================================================
export function Initialize() {
    try {
        device.setName('Checkpoint KX-500 (NA-KB-1001)');
        device.setSize(SIZE);
        device.setControllableLeds(LED_NAMES.slice(), LED_POSITIONS.map((p) => p.slice()));
        device.log('[KX500] v2.5.0 - init: handshake > brightness > static effect > test color');
    } catch (err) {
        try { device.log(`[KX500] init error: ${err.message}`); } catch (_) {}
    }

    _seq = 0x08;

    // Step 1: handshake - opens the conversation with the firmware
    try { device.log('[KX500] Step 1/4: Handshake...'); } catch (_) {}
    writeOutput(HANDSHAKE);
    try { device.pause(100); } catch (_) {}

    // Step 2: brightness MAX - without this the firmware stays at 0
    try { device.log('[KX500] Step 2/4: Brightness MAX...'); } catch (_) {}
    writeRGBPacket(buildBrightness(4), 100);

    // Step 3: animation ID #1 (static) - CRITICAL
    // Tells the firmware to stop animating and accept software colors
    try { device.log('[KX500] Step 3/4: Setting effect #1 (static) - taking software control...'); } catch (_) {}
    writeRGBPacket(buildEffect(1), 100);

    // Step 4: color test
    try { device.log('[KX500] Step 4/4: Test color (blue)...'); } catch (_) {}
    writeRGBPacket(buildSolidColor(0, 0, 0xFF), 100);

    try { device.log('[KX500] Init complete - firmware should now be in software control mode'); } catch (_) {}
}

// ==================================================================
// RENDER - only writes when the color actually changes
// ==================================================================
// The previous version resent the same color 20x/second. That multiplied
// the chance of a write colliding with SignalRGB's own device reads.
// Dirty-check means: at rest, zero writes per second.
let _lastRenderTime = 0;
let _lastSentRGB = [-1, -1, -1];   // sentinel: never matches
let _consecutiveFailures = 0;

const RENDER_INTERVAL_MS = 60;  // ceiling (~16 fps)

export function Render() {
    const now = Date.now();
    if (now - _lastRenderTime < RENDER_INTERVAL_MS) return;

    let r, g, b;
    if (typeof LightingMode !== 'undefined' && LightingMode === 'Forced') {
        [r, g, b] = hexToRgb(forcedColor || '#009bde');
    } else {
        [r, g, b] = getAverageColor();
    }
    r &= 0xFF; g &= 0xFF; b &= 0xFF;

    // dirty-check: do not resend an unchanged color
    if (r === _lastSentRGB[0] && g === _lastSentRGB[1] && b === _lastSentRGB[2]) {
        return;
    }

    // exponential backoff after failures
    if (_consecutiveFailures > 0) {
        const backoff = Math.min(2000, RENDER_INTERVAL_MS * Math.pow(2, _consecutiveFailures));
        if (now - _lastRenderTime < backoff) return;
    }

    _lastRenderTime = now;
    writeRGBPacket(buildSolidColor(r, g, b), 5);

    _lastSentRGB = [r, g, b];
}

export function Shutdown(suspending) {
    // shutdownColor is injected by SignalRGB from ControllableParameters();
    // guard it the same way Render guards LightingMode / forcedColor.
    const cfg = (typeof shutdownColor !== 'undefined' && shutdownColor) ? shutdownColor : '#000000';
    const hex = suspending ? '#000000' : cfg;
    const [r, g, b] = hexToRgb(hex);
    writeRGBPacket((r + g + b < 30) ? buildOff() : buildSolidColor(r, g, b));
}