/**
 * KX500_Plugin.js — v3.0.0
 *
 * Plugin SignalRGB para el teclado Checkpoint KX-500 (NA-KB-1001).
 * VID 0x320F / PID 0x5008 — el RGB vive en la collection vendor-defined
 * MI_01&Col04 (endpoint 0x03, Output Report de 64 bytes).
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROTOCOLO (verificado contra las 18 capturas USBPcap del driver oficial)
 * ─────────────────────────────────────────────────────────────────────
 * Formato general de 64 bytes:
 *
 *   [0]=0x04  [1]=SEQ  [2]=B2  [3]=TIPO  [4]=C1  [5]=C2  [6..7]=00
 *   [8]=VALOR   (o [8..10] = R,G,B)   [11..63]=00
 *
 * TIPO (byte 3):
 *   0x01 = START de transacción   -> 04 01 00 01
 *   0x02 = END de transacción     -> 04 02 00 02
 *   0x06 = comando                -> 06 C1 C2
 *   0x11 = comando per-key        -> 11 03 idx  /  11 36 off_lo off_hi
 *
 * CADA cambio del driver oficial va envuelto entre START y END. Eso es lo
 * que faltaba en las versiones anteriores del plugin: sin el END la imagen
 * no se "commitea" y el firmware sigue mostrando su animación (parpadeo)
 * con el color viejo.
 *
 * Comandos que usa este plugin (los mismos que el driver):
 *   06 01 01  BRILLO ............ [8] = 0..4
 *   06 01 04  KEY_NORMALLY_ON ... [8] = 0
 *   06 03 05  COLOR GLOBAL ...... [8..10] = R,G,B   (B2 = 0x01)
 *
 * Medido en las capturas: START/END, brillo, ANIM_ID y KEY_NORMALLY_ON
 * usan B2 = 0x00; COLOR GLOBAL usa B2 = 0x01 en 8 de 11 casos.
 *
 * Secuencia real de "un solo color" (teclado_un_solo_color.pcapng):
 *   START / KEY_NORMALLY_ON=0 / COLOR_GLOBAL / END
 *
 * Secuencia real de cambio de efecto (NO se usa para color sólido):
 *   START / 06 01 00 = id_animacion / END
 *
 * ─────────────────────────────────────────────────────────────────────
 * PER-KEY (descubierto, aún no implementado)
 * ─────────────────────────────────────────────────────────────────────
 *   Una tecla:   04 SEQ B2 11 03 IDX 00 00 R G B
 *   Frame entero: 04 SEQ B2 11 36 OFF_LO OFF_HI 00 + 54 bytes de RGB
 *                 (7 paquetes, OFF = 0,54,108,162,216,270,324
 *                  => 378 bytes = 126 LEDs RGB)
 *   Falta mapear IDX/LED -> tecla física.
 */
'use strict';

// ════════════════════════════════════════════════════════════════════
// HID
// ════════════════════════════════════════════════════════════════════
const VID = 0x320F;
const PID = 0x5008;
const REPORT_SIZE = 64;

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
function pad64(arr) {
    const out = Array.from(arr);
    while (out.length < REPORT_SIZE) out.push(0x00);
    return out.slice(0, REPORT_SIZE);
}

let _seq = 0x08;
function nextSeq() {
    const s = _seq;
    _seq = (_seq + 1) & 0xFF;
    return s;
}

// ════════════════════════════════════════════════════════════════════
// HANDSHAKE (primer Output Report al conectar; NO va envuelto)
// ════════════════════════════════════════════════════════════════════
const HANDSHAKE = pad64([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
]);

// ════════════════════════════════════════════════════════════════════
// BUILDERS
// ════════════════════════════════════════════════════════════════════
// 04 01 00 01 — abre transacción
function buildStart() {
    return pad64([0x04, 0x01, 0x00, 0x01]);
}

// 04 02 00 02 — cierra y aplica la transacción
function buildEnd() {
    return pad64([0x04, 0x02, 0x00, 0x02]);
}

// 04 SEQ 00 06 01 01 00 00 nivel   (nivel 0..4)
function buildBrightness(level) {
    level = Math.max(0, Math.min(4, level | 0));
    return pad64([0x04, nextSeq(), 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, level]);
}

// 04 SEQ 00 06 01 04 00 00 valor   (0 = no encender teclas al pulsar)
function buildKeyNormallyOn(value) {
    return pad64([0x04, nextSeq(), 0x00, 0x06, 0x01, 0x04, 0x00, 0x00, value ? 1 : 0]);
}

// 04 SEQ 01 06 03 05 00 00 R G B
function buildGlobalColor(r, g, b) {
    return pad64([0x04, nextSeq(), 0x01, 0x06, 0x03, 0x05, 0x00, 0x00,
        r & 0xFF, g & 0xFF, b & 0xFF]);
}

// ════════════════════════════════════════════════════════════════════
// TRANSPORTE
// ════════════════════════════════════════════════════════════════════
function sendRaw(packet) {
    try {
        device.write(packet, REPORT_SIZE);
    } catch (err) {
        try { device.log(`[KX500] write error: ${err.message}`); } catch (_) {}
    }
}

// START -> paquetes -> END, igual que el driver oficial.
function sendTransaction(packets) {
    sendRaw(buildStart());
    try { device.pause(1); } catch (_) {}
    for (const p of packets) {
        sendRaw(p);
        try { device.pause(1); } catch (_) {}
    }
    sendRaw(buildEnd());
    try { device.pause(1); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 teclas, ANSI 100% (US), coordenadas = centro de la tecla
// en unidades de 1u. Filas y=0..5; main 0..15, nav 15.25..18.25,
// numpad 18.5..22.5.
// ════════════════════════════════════════════════════════════════════
const LAYOUT = [
    // ── fila 0: función ────────────────────────────────────────────
    ['Esc', 0.5, 0], ['F1', 2.5, 0], ['F2', 3.5, 0], ['F3', 4.5, 0], ['F4', 5.5, 0],
    ['F5', 7, 0], ['F6', 8, 0], ['F7', 9, 0], ['F8', 10, 0],
    ['F9', 11.5, 0], ['F10', 12.5, 0], ['F11', 13.5, 0], ['F12', 14.5, 0],
    ['Print Screen', 15.75, 0], ['Scroll Lock', 16.75, 0], ['Pause Break', 17.75, 0],

    // ── fila 1: números + Insert/Home/PgUp + NumLock ───────────────
    ['`', 0.5, 1], ['1', 1.5, 1], ['2', 2.5, 1], ['3', 3.5, 1], ['4', 4.5, 1],
    ['5', 5.5, 1], ['6', 6.5, 1], ['7', 7.5, 1], ['8', 8.5, 1], ['9', 9.5, 1],
    ['0', 10.5, 1], ['-', 11.5, 1], ['=', 12.5, 1], ['Backspace', 14, 1],
    ['Insert', 15.75, 1], ['Home', 16.75, 1], ['Page Up', 17.75, 1],
    ['NumLock', 19, 1], ['Num /', 20, 1], ['Num *', 21, 1], ['Num -', 22, 1],

    // ── fila 2: QWERTY + Del/End/PgDn + numpad 7-8-9 ──────────────
    ['Tab', 0.75, 2], ['Q', 2, 2], ['W', 3, 2], ['E', 4, 2], ['R', 5, 2], ['T', 6, 2],
    ['Y', 7, 2], ['U', 8, 2], ['I', 9, 2], ['O', 10, 2], ['P', 11, 2],
    ['[', 12, 2], [']', 13, 2], ['\\', 14.25, 2],
    ['Del', 15.75, 2], ['End', 16.75, 2], ['Page Down', 17.75, 2],
    ['Num 7', 19, 2], ['Num 8', 20, 2], ['Num 9', 21, 2], ['Num +', 22, 2],

    // ── fila 3: ASDF + numpad 4-5-6 ────────────────────────────────
    ['Caps Lock', 0.875, 3], ['A', 2.25, 3], ['S', 3.25, 3], ['D', 4.25, 3],
    ['F', 5.25, 3], ['G', 6.25, 3], ['H', 7.25, 3], ['J', 8.25, 3],
    ['K', 9.25, 3], ['L', 10.25, 3], [';', 11.25, 3], ["'", 12.25, 3],
    ['Enter', 13.875, 3],
    ['Num 4', 19, 3], ['Num 5', 20, 3], ['Num 6', 21, 3],

    // ── fila 4: ZXCV + flecha arriba + numpad 1-2-3-Enter ──────────
    ['Left Shift', 1.125, 4], ['Z', 2.75, 4], ['X', 3.75, 4], ['C', 4.75, 4],
    ['V', 5.75, 4], ['B', 6.75, 4], ['N', 7.75, 4], ['M', 8.75, 4],
    [',', 9.75, 4], ['.', 10.75, 4], ['/', 11.75, 4], ['Right Shift', 13.75, 4],
    ['Up Arrow', 16.75, 4],
    ['Num 1', 19, 4], ['Num 2', 20, 4], ['Num 3', 21, 4], ['Num Enter', 22, 4],

    // ── fila 5: bottom row + flechas + numpad 0 / . ────────────────
    ['Left Ctrl', 0.625, 5], ['Left Win', 1.875, 5], ['Left Alt', 3.125, 5],
    ['Space', 6.875, 5],
    ['Right Alt', 10.625, 5], ['Fn', 11.875, 5], ['Menu', 13.125, 5],
    ['Right Ctrl', 14.375, 5],
    ['Left Arrow', 15.75, 5], ['Down Arrow', 16.75, 5], ['Right Arrow', 17.75, 5],
    ['Num 0', 19.5, 5], ['Num .', 21, 5],
];

const LED_NAMES = LAYOUT.map((k) => k[0]);
const LED_POSITIONS = LAYOUT.map((k) => [k[1], k[2]]);
const SIZE = [23, 6];

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
        } catch (_) {}
    }
    if (n === 0) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB EXPORTS
// ════════════════════════════════════════════════════════════════════
export function Name() { return 'Checkpoint KX-500 (NA-KB-1001)'; }
export function Publisher() { return 'RedFenix Estudio'; }
export function Version() { return '3.0.0'; }
export function VendorId() { return VID; }
export function ProductId() { return [PID]; }
export function Type() { return 'hid'; }
export function DeviceType() { return 'keyboard'; }
export function Size() { return SIZE; }
export function LedNames() { return LED_NAMES.slice(); }
export function LedPositions() { return LED_POSITIONS.map((p) => p.slice()); }
export function Documentation() { return 'https://github.com/RedFenix-Estudio/KX-500-Plugin'; }

// El canal RGB es la interface 1 (MI_01&Col04).
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

// ════════════════════════════════════════════════════════════════════
// INITIALIZE
// ════════════════════════════════════════════════════════════════════
export function Initialize() {
    try {
        device.setName('Checkpoint KX-500 (NA-KB-1001)');
        device.setSize(SIZE);
        device.setControllableLeds(LED_NAMES.slice(), LED_POSITIONS.map((p) => p.slice()));
    } catch (err) {
        try { device.log(`[KX500] init error: ${err.message}`); } catch (_) {}
    }

    _seq = 0x08;

    // 1) Handshake — abre la conversación con el firmware (no va envuelto)
    sendRaw(HANDSHAKE);
    try { device.pause(100); } catch (_) {}

    // 2) Brillo al máximo, dentro de una transacción como hace el driver
    sendTransaction([buildBrightness(4)]);
}

// ════════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════════
let _lastRenderTime = 0;
let _lastSentRGB = [-1, -1, -1];

const RENDER_INTERVAL_MS = 40;   // ~25 fps como máximo

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

    // Solo escribir si el color cambió (el firmware no necesita spam)
    if (r === _lastSentRGB[0] && g === _lastSentRGB[1] && b === _lastSentRGB[2]) {
        return;
    }

    _lastRenderTime = now;
    _lastSentRGB = [r, g, b];

    // Transacción idéntica a la del driver oficial para color sólido
    sendTransaction([buildKeyNormallyOn(0), buildGlobalColor(r, g, b)]);
}

// ════════════════════════════════════════════════════════════════════
// SHUTDOWN
// ════════════════════════════════════════════════════════════════════
export function Shutdown(suspending) {
    const hex = suspending ? '#000000' : (shutdownColor || '#000000');
    const [r, g, b] = hexToRgb(hex);

    if (r + g + b < 30) {
        // Apagado: el driver baja el brillo a 0
        sendTransaction([buildBrightness(0)]);
    } else {
        sendTransaction([buildKeyNormallyOn(0), buildGlobalColor(r, g, b)]);
    }
}
