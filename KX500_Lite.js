/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Plugin — Lite v0.3.0                          ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v0.3.0 (2026-08-26) — comandos REALES confirmados con           ║
 * ║    capturas USBPcap individuales:                                ║
 * ║    - OFF:        04 08 00 06 01 01                                ║
 * ║    - Brightness: 04 [8+N] 00 06 01 01 00 00 N                   ║
 * ║    - Speed:      04 [8+N] 00 06 01 02 00 00 N                   ║
 * ║    - Effect:     04 [8+N] 00 06 01 00 00 00 N                   ║
 * ║    - Solid RGB:  04 [SEQ] [VAR] 06 03 05 00 00 R G B            ║
 * ║    - Handshake:  04 A2 03 04 2C 00 00 00 55 AA ...               ║
 * ║                                                                  ║
 * ║  Cada acción entre heartbeat START/END (04 01 00 01 / 04 02 00 02)║
 * ║  SEQ counter local (arranca en 0x08, incrementa por acción)      ║
 * ║                                                                  ║
 * ║  Repo: https://github.com/RedFenix-Estudio/KX-500-Plugin         ║
 * ║  Protocolo: ver PROTOCOL.md                                      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// METADATA
// ════════════════════════════════════════════════════════════════════
const AUTHOR = "RedFenix Estudio";
const AUTHOR_GITHUB_URL = "https://github.com/RedFenix-Estudio";
const DOCUMENTATION_URL = "https://github.com/RedFenix-Estudio/KX-500-Plugin";
const DEVICE_NAME = "Checkpoint KX-500 (NA-KB-1001)";

// ════════════════════════════════════════════════════════════════════
// HID
// ════════════════════════════════════════════════════════════════════
const KX500_VID = 0x320F;
const KX500_PID = 0x5008;
const KX500_RGB_INTERFACE = 1;
const HID_REPORT_SIZE = 64;
const RGB_REPORT_ID = 0x04;

// ════════════════════════════════════════════════════════════════════
// PROTOCOLO REAL KX-500 (v0.3.0 — confirmado por 7 capturas individuales)
//
// Heartbeat (siempre antes y después de cada acción):
//   START: [04 01 00 01]
//   END:   [04 02 00 02]
//
// Estructura acción:
//   [04] [SEQ] [CMD] [PARAMETROS...] [pad 0x00]
//
// SEQ arranca en 0x08 y se incrementa monotónicamente por cada acción.
// ════════════════════════════════════════════════════════════════════

// Handshake packet — visto en captura mixta al abrir el driver oficial
const HANDSHAKE = [
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14
];

// SEQ counter local (arranca en 0x08 después de handshake)
let _seqCounter = 0x08;

function nextSeq() {
    const s = _seqCounter & 0xFF;
    _seqCounter = (_seqCounter + 1) & 0xFF;
    return s;
}

function resetSeq() {
    _seqCounter = 0x08;
}

/**
 * Construye un paquete HID RGB de 64 bytes.
 * @param {number} seq - byte SEQ (0x08+)
 * @param {number} cmd - byte de comando
 * @param {number[]} params - parámetros
 */
function buildPacket(seq, cmd, params = []) {
    const packet = [RGB_REPORT_ID, seq & 0xFF, cmd & 0xFF, ...params];
    while (packet.length < HID_REPORT_SIZE) {
        packet.push(0x00);
    }
    return packet.slice(0, HID_REPORT_SIZE);
}

/**
 * Envía una acción envuelta en heartbeat START/END.
 *
 * NOTA: device.write() de SignalRGB requiere 2 argumentos: (data, length).
 *
 * Devuelve true si todos los writes fueron exitosos.
 */
function sendAction(seq, cmd, params = []) {
    try {
        const packet = buildPacket(seq, cmd, params);
        const hbStart = [RGB_REPORT_ID, 0x01, 0x00, 0x01];
        const hbEnd = [RGB_REPORT_ID, 0x02, 0x00, 0x02];
        device.log(`[KX500] write HB_START (${hbStart.length}B)`);
        device.write(hbStart, hbStart.length);
        device.pause(10);
        device.log(`[KX500] write CMD (${packet.length}B): ${Array.from(packet.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}...`);
        device.write(packet, packet.length);
        device.pause(10);
        device.log(`[KX500] write HB_END (${hbEnd.length}B)`);
        device.write(hbEnd, hbEnd.length);
        device.pause(10);
        return true;
    } catch (err) {
        device.log(`[KX500] sendAction error: ${err.message}`);
        return false;
    }
}

/**
 * Versión simplificada sin heartbeat: manda solo el comando directo.
 * Útil para diagnóstico — si esto funciona pero sendAction no, el problema
 * es el heartbeat wrapper. Si ninguno funciona, el problema es el comando.
 */
function sendDirect(seq, cmd, params = []) {
    try {
        const packet = buildPacket(seq, cmd, params);
        device.log(`[KX500] write DIRECT (${packet.length}B): ${Array.from(packet.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        device.write(packet, packet.length);
        device.pause(10);
        return true;
    } catch (err) {
        device.log(`[KX500] sendDirect error: ${err.message}`);
        return false;
    }
}

// ════════════════════════════════════════════════════════════════════
// ACCIONES DE ALTO NIVEL (mapeo a bytes del firmware)
// ════════════════════════════════════════════════════════════════════

/** Apagar todos los LEDs */
function actionOff() {
    sendAction(nextSeq(), 0x00, [0x06, 0x01, 0x01]);
}

/** Set brightness (0-4) */
function actionBrightness(level) {
    if (level < 0 || level > 4) return;
    if (level === 0) {
        // Caso especial: sin padding
        sendAction(0x08, 0x00, [0x06, 0x01, 0x01]);
    } else {
        sendAction(0x08 + level, 0x00, [0x06, 0x01, 0x01, 0x00, 0x00, level]);
    }
}

/** Set velocidad (1-4) */
function actionSpeed(level) {
    if (level < 1 || level > 4) return;
    sendAction(0x08 + level, 0x00, [0x06, 0x01, 0x02, 0x00, 0x00, level]);
}

/** Seleccionar effect por número (1-19) */
function actionEffect(effectNum) {
    if (effectNum < 1 || effectNum > 19) return;
    sendAction(0x08 + effectNum, 0x00, [0x06, 0x01, 0x00, 0x00, 0x00, effectNum]);
}

/** Set solid color RGB arbitrario (cualquier color) */
function actionSolidColor(r, g, b) {
    const seq = nextSeq();
    sendAction(seq, 0x03, [0x06, 0x03, 0x05, 0x00, 0x00, r & 0xFF, g & 0xFF, b & 0xFF]);
}

/** Activar efecto breathing (effect #5) */
function actionBreathing() {
    sendAction(nextSeq(), 0x00, [0x06, 0x01, 0x04]);  // Pre-action (cambiar a effect mode)
    sendAction(nextSeq(), 0x00, [0x06, 0x01, 0x00, 0x00, 0x00, 0x05]);  // Select effect 5
}

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// ════════════════════════════════════════════════════════════════════
const KX500_KEYS = [
    { name: 'Esc', x: 0, y: 0, w: 1, h: 1 },
    { name: 'F1', x: 2, y: 0, w: 1, h: 1 }, { name: 'F2', x: 3, y: 0, w: 1, h: 1 },
    { name: 'F3', x: 4, y: 0, w: 1, h: 1 }, { name: 'F4', x: 5, y: 0, w: 1, h: 1 },
    { name: 'F5', x: 6.5, y: 0, w: 1, h: 1 }, { name: 'F6', x: 7.5, y: 0, w: 1, h: 1 },
    { name: 'F7', x: 8.5, y: 0, w: 1, h: 1 }, { name: 'F8', x: 9.5, y: 0, w: 1, h: 1 },
    { name: 'F9', x: 11, y: 0, w: 1, h: 1 }, { name: 'F10', x: 12, y: 0, w: 1, h: 1 },
    { name: 'F11', x: 13, y: 0, w: 1, h: 1 }, { name: 'F12', x: 14, y: 0, w: 1, h: 1 },
    { name: 'Print Screen', x: 15.5, y: 0, w: 1, h: 1 },
    { name: 'Scroll Lock', x: 16.5, y: 0, w: 1, h: 1 },
    { name: 'Pause Break', x: 17.5, y: 0, w: 1, h: 1 },
    { name: '`', x: 0, y: 1, w: 1, h: 1 },
    { name: '1', x: 1, y: 1, w: 1, h: 1 }, { name: '2', x: 2, y: 1, w: 1, h: 1 },
    { name: '3', x: 3, y: 1, w: 1, h: 1 }, { name: '4', x: 4, y: 1, w: 1, h: 1 },
    { name: '5', x: 5, y: 1, w: 1, h: 1 }, { name: '6', x: 6, y: 1, w: 1, h: 1 },
    { name: '7', x: 7, y: 1, w: 1, h: 1 }, { name: '8', x: 8, y: 1, w: 1, h: 1 },
    { name: '9', x: 9, y: 1, w: 1, h: 1 }, { name: '0', x: 10, y: 1, w: 1, h: 1 },
    { name: '-', x: 11, y: 1, w: 1, h: 1 }, { name: '=', x: 12, y: 1, w: 1, h: 1 },
    { name: 'Backspace', x: 13, y: 1, w: 2, h: 1 },
    { name: 'Insert', x: 15.5, y: 1, w: 1, h: 1 },
    { name: 'Home', x: 16.5, y: 1, w: 1, h: 1 },
    { name: 'Page Up', x: 17.5, y: 1, w: 1, h: 1 },
    { name: 'Tab', x: 0, y: 2, w: 1.5, h: 1 },
    { name: 'Q', x: 1.5, y: 2, w: 1, h: 1 }, { name: 'W', x: 2.5, y: 2, w: 1, h: 1 },
    { name: 'E', x: 3.5, y: 2, w: 1, h: 1 }, { name: 'R', x: 4.5, y: 2, w: 1, h: 1 },
    { name: 'T', x: 5.5, y: 2, w: 1, h: 1 }, { name: 'Y', x: 6.5, y: 2, w: 1, h: 1 },
    { name: 'U', x: 7.5, y: 2, w: 1, h: 1 }, { name: 'I', x: 8.5, y: 2, w: 1, h: 1 },
    { name: 'O', x: 9.5, y: 2, w: 1, h: 1 }, { name: 'P', x: 10.5, y: 2, w: 1, h: 1 },
    { name: '[', x: 11.5, y: 2, w: 1, h: 1 }, { name: ']', x: 12.5, y: 2, w: 1, h: 1 },
    { name: '\\', x: 13.5, y: 2, w: 1.5, h: 1 },
    { name: 'Del', x: 15.5, y: 2, w: 1, h: 1 },
    { name: 'End', x: 16.5, y: 2, w: 1, h: 1 },
    { name: 'Page Down', x: 17.5, y: 2, w: 1, h: 1 },
    { name: 'Caps Lock', x: 0, y: 3, w: 1.75, h: 1 },
    { name: 'A', x: 1.75, y: 3, w: 1, h: 1 }, { name: 'S', x: 2.75, y: 3, w: 1, h: 1 },
    { name: 'D', x: 3.75, y: 3, w: 1, h: 1 }, { name: 'F', x: 4.75, y: 3, w: 1, h: 1 },
    { name: 'G', x: 5.75, y: 3, w: 1, h: 1 }, { name: 'H', x: 6.75, y: 3, w: 1, h: 1 },
    { name: 'J', x: 7.75, y: 3, w: 1, h: 1 }, { name: 'K', x: 8.75, y: 3, w: 1, h: 1 },
    { name: 'L', x: 9.75, y: 3, w: 1, h: 1 },
    { name: ';', x: 10.75, y: 3, w: 1, h: 1 }, { name: '\u2019', x: 11.75, y: 3, w: 1, h: 1 },
    { name: 'Enter', x: 12.75, y: 3, w: 2.25, h: 1 },
    { name: 'Left Shift', x: 0, y: 4, w: 2.25, h: 1 },
    { name: 'Z', x: 2.25, y: 4, w: 1, h: 1 }, { name: 'X', x: 3.25, y: 4, w: 1, h: 1 },
    { name: 'C', x: 4.25, y: 4, w: 1, h: 1 }, { name: 'V', x: 5.25, y: 4, w: 1, h: 1 },
    { name: 'B', x: 6.25, y: 4, w: 1, h: 1 }, { name: 'N', x: 7.25, y: 4, w: 1, h: 1 },
    { name: 'M', x: 8.25, y: 4, w: 1, h: 1 },
    { name: ',', x: 9.25, y: 4, w: 1, h: 1 }, { name: '.', x: 10.25, y: 4, w: 1, h: 1 },
    { name: '/', x: 11.25, y: 4, w: 1, h: 1 },
    { name: 'Right Shift', x: 12.25, y: 4, w: 2.75, h: 1 },
    { name: 'Up Arrow', x: 16.5, y: 4, w: 1, h: 1 },
    { name: 'Left Ctrl', x: 0, y: 5, w: 1.25, h: 1 },
    { name: 'Left Win', x: 1.25, y: 5, w: 1.25, h: 1 },
    { name: 'Left Alt', x: 2.5, y: 5, w: 1.25, h: 1 },
    { name: 'Space', x: 3.75, y: 5, w: 6.25, h: 1 },
    { name: 'Right Alt', x: 10, y: 5, w: 1.25, h: 1 },
    { name: 'Fn', x: 11.25, y: 5, w: 1.25, h: 1 },
    { name: 'Menu', x: 12.5, y: 5, w: 1.25, h: 1 },
    { name: 'Right Ctrl', x: 13.75, y: 5, w: 1.25, h: 1 },
    { name: 'Left Arrow', x: 15.5, y: 5, w: 1, h: 1 },
    { name: 'Down Arrow', x: 16.5, y: 5, w: 1, h: 1 },
    { name: 'Right Arrow', x: 17.5, y: 5, w: 1, h: 1 },
    { name: 'NumLock', x: 19, y: 1, w: 1, h: 1 },
    { name: 'Num /', x: 20, y: 1, w: 1, h: 1 },
    { name: 'Num *', x: 21, y: 1, w: 1, h: 1 },
    { name: 'Num -', x: 22, y: 1, w: 1, h: 1 },
    { name: 'Num 7', x: 19, y: 2, w: 1, h: 1 },
    { name: 'Num 8', x: 20, y: 2, w: 1, h: 1 },
    { name: 'Num 9', x: 21, y: 2, w: 1, h: 1 },
    { name: 'Num +', x: 22, y: 2, w: 1, h: 2 },
    { name: 'Num 4', x: 19, y: 3, w: 1, h: 1 },
    { name: 'Num 5', x: 20, y: 3, w: 1, h: 1 },
    { name: 'Num 6', x: 21, y: 3, w: 1, h: 1 },
    { name: 'Num 1', x: 19, y: 4, w: 1, h: 1 },
    { name: 'Num 2', x: 20, y: 4, w: 1, h: 1 },
    { name: 'Num 3', x: 21, y: 4, w: 1, h: 1 },
    { name: 'Num Enter', x: 22, y: 4, w: 1, h: 2 },
    { name: 'Num 0', x: 19, y: 5, w: 2, h: 1 },
    { name: 'Num .', x: 21, y: 5, w: 1, h: 1 },
];

const LAYOUT_SIZE = (function () {
    let maxX = 0, maxY = 0;
    for (const k of KX500_KEYS) {
        if (k.x + k.w > maxX) maxX = k.x + k.w;
        if (k.y + k.h > maxY) maxY = k.y + k.h;
    }
    return [Math.ceil(maxX), Math.ceil(maxY)];
})();

// ════════════════════════════════════════════════════════════════════
// EFFECTS
// ════════════════════════════════════════════════════════════════════
function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function applyForcedEffect(ledsArr, time, color, effectId) {
    const [r, g, b] = color || [255, 0, 0];
    switch (effectId) {
        case 'breathing': {
            const phase = Math.sin(time * 2 * Math.PI * 0.5);
            const factor = 0.3 + 0.7 * (phase * 0.5 + 0.5);
            for (const led of ledsArr) {
                led.r = Math.round(r * factor);
                led.g = Math.round(g * factor);
                led.b = Math.round(b * factor);
            }
            break;
        }
        case 'wave': {
            const baseX = time * 5;
            for (const led of ledsArr) {
                const dist = Math.abs(led.x - baseX);
                const t = Math.max(0, 1 - dist / 5);
                const [wr, wg, wb] = hsvToRgb((0.5 + led.x * 0.02) % 1, 1, t);
                led.r = wr; led.g = wg; led.b = wb;
            }
            break;
        }
        case 'typing': {
            const pulse = (Math.sin(time * 4) + 1) * 0.5;
            for (const led of ledsArr) {
                const dist = Math.sqrt(Math.pow(led.x - 9, 2) + Math.pow(led.y - 2.5, 2));
                const t = Math.max(0, 1 - dist / 8) * (0.3 + pulse * 0.7);
                led.r = Math.round(255 * t);
                led.g = Math.round(100 * t);
                led.b = Math.round(200 * t);
            }
            break;
        }
        default: {
            for (const led of ledsArr) { led.r = r; led.g = g; led.b = b; }
        }
    }
}

// ════════════════════════════════════════════════════════════════════
// FRAMEBUFFER + throttling
//
// Render() de SignalRGB corre cada ~30ms (~33 fps).
// Si mandamos 3 paquetes (HB_START + cmd + HB_END) por cada frame = 99 pkts/seg
// que pueden saturar el MCU del KX-500.
// Throttle: solo enviar 1 de cada N frames (~11 comandos/seg).
// ════════════════════════════════════════════════════════════════════
let ledBuffer = [];
let lastRenderTime = 0;
let renderFrameCounter = 0;
const RENDER_THROTTLE = 3;  // enviar cada 3 frames = ~11 comandos/seg

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB SDK EXPORTS
// ════════════════════════════════════════════════════════════════════

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
brightness:readonly
effect:readonly
effectColor:readonly
*/

export function Name() { return DEVICE_NAME; }
export function Publisher() { return AUTHOR; }
export function VendorId() { return KX500_VID; }
export function ProductId() { return [KX500_PID]; }
export function Type() { return "hid"; }
export function DeviceType() { return "keyboard"; }
export function Size() { return LAYOUT_SIZE; }
export function LedNames() { return KX500_KEYS.map(k => k.name); }
export function LedPositions() { return KX500_KEYS.map(k => [k.x, k.y]); }
export function Documentation() { return DOCUMENTATION_URL; }
export function ImageUrl() {
    return "https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png";
}

/**
 * Validate() — matchear el canal Vendor Defined RGB (FF1C:0092).
 *
 * El KX-500 expone 5 colecciones HID. El canal RGB está en MI_01 Col04
 * (collection 0x0004) con Usage Page 0xFF1C (Vendor Defined) y Usage 0x0092.
 *
 * Confirmado con SignalRGB SDK enumeration log:
 *   [IGNORE] endpoint.interface: 1, endpoint.usage: 0x0092,
 *            endpoint.usage_page: 0xff1c, endpoint.collection: 0x0004
 *
 * Sin este match correcto, NO hay HID handle válido y device.write() falla
 * con "HID handle is invalid".
 */
export function Validate(endpoint) {
    // Match principal: Vendor Defined RGB channel (FF1C:0092)
    if (endpoint.usage_page === 0xFF1C && endpoint.usage === 0x0092) {
        return true;
    }
    // Fallback: collection 0x0004 (MI_01 Col04)
    if (endpoint.collection === 0x0004) {
        return true;
    }
    return false;
}

export function ControllableParameters() {
    return [
        {
            property: "effect",
            group: "lighting",
            label: "Effect (Forced mode)",
            description: "Internal effect applied when LightingMode is Forced.",
            type: "combobox",
            values: ["static", "breathing", "wave", "typing"],
            default: "static",
        },
        {
            property: "effectColor",
            group: "lighting",
            label: "Effect Color",
            type: "color",
            default: "#009bde",
        },
        {
            property: "brightness",
            group: "lighting",
            label: "Brightness (0-4)",
            description: "Nivel de brillo (0 = apagado, 4 = máximo). Solo aplica cuando cambia; no reenvía continuamente.",
            type: "number",
            min: "0",
            max: "4",
            default: "4",
        },
        {
            property: "shutdownColor",
            group: "lighting",
            label: "Shutdown Color",
            type: "color",
            default: "#000000",
        },
        {
            property: "LightingMode",
            group: "lighting",
            label: "Lighting Mode",
            type: "combobox",
            values: ["Canvas", "Forced"],
            default: "Canvas",
        },
        {
            property: "forcedColor",
            group: "lighting",
            label: "Forced Color",
            type: "color",
            default: "#009bde",
        },
    ];
}

export function ConflictingProcesses() {
    return ["Mechanical Keyboard.exe", "HidServ.exe", "CHECKPOINT_KX_500.exe"];
}

export function Initialize() {
    ledBuffer = KX500_KEYS.map(k => ({
        r: 0, g: 0, b: 0,
        name: k.name,
        x: k.x, y: k.y, w: k.w, h: k.h,
    }));
    lastRenderTime = Date.now();
    resetSeq();

    try {
        device.setName(DEVICE_NAME);
        device.setSize(LAYOUT_SIZE);
        device.setControllableLeds(
            KX500_KEYS.map(k => k.name),
            KX500_KEYS.map(k => [k.x, k.y]),
        );
        device.log(`[KX500] Registered: ${DEVICE_NAME} (${KX500_KEYS.length} keys, ${LAYOUT_SIZE[0]}×${LAYOUT_SIZE[1]})`);
    } catch (err) {
        device.notify("KX-500 init error", err.message, 1);
        device.log(`[KX500] setName/setSize/setControllableLeds failed: ${err.message}`);
    }

    // Mandar handshake
    try {
        device.write(HANDSHAKE, HANDSHAKE.length);
        device.pause(5);
        device.log(`[KX500] Handshake sent (${HANDSHAKE.length} bytes)`);
    } catch (err) {
        device.log(`[KX500] Handshake failed: ${err.message}`);
    }

    // Apagar LEDs al iniciar
    if (sendAction(nextSeq(), 0x00, [0x06, 0x01, 0x01])) {
        device.log(`[KX500] Initial OFF sent OK`);
    } else {
        device.log(`[KX500] Initial OFF FAILED — chequea que Validate() matchee el endpoint RGB (FF1C:0092)`);
    }

    // DEBUG v0.4.0: mandar un color de prueba (azul brillante) al iniciar
    // para confirmar que el firmware responde a solid color.
    device.log(`[KX500] DEBUG: enviando color test (azul)`);
    sendAction(nextSeq(), 0x03, [0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF]);

    device.log(`[KX500] Author: ${AUTHOR}`);
    device.log(`[KX500] Protocol: HID Output Report, 64B, Report ID 0x04`);
    device.log(`[KX500] Comandos confirmados: OFF, Brightness(0-4), Speed(1-4), Effect(1-19), SolidColor(RGB)`);
}

export function Render() {
    if (!ledBuffer.length) return;

    const now = Date.now();
    lastRenderTime = now;
    const time = now / 1000;

    let useColor = null;
    if (typeof LightingMode !== "undefined" && LightingMode === "Forced") {
        useColor = hexToRgb(forcedColor || "#009bde");
    }

    if (useColor) {
        const effectId = (typeof effect !== "undefined" && effect) ? effect : "static";
        applyForcedEffect(ledBuffer, time, useColor, effectId);
    } else {
        // Canvas — leer color por key
        for (let i = 0; i < ledBuffer.length; i++) {
            const led = ledBuffer[i];
            const c = device.color(led.x, led.y);
            led.r = c[0];
            led.g = c[1];
            led.b = c[2];
        }
    }

    // Throttle: solo enviar cada N frames para no saturar el USB
    renderFrameCounter++;
    if (renderFrameCounter < RENDER_THROTTLE) return;
    renderFrameCounter = 0;

    // Promedio de color (el KX-500 parece tener zones, no per-key)
    let avgR = 0, avgG = 0, avgB = 0;
    for (const led of ledBuffer) {
        avgR += led.r;
        avgG += led.g;
        avgB += led.b;
    }
    avgR = Math.round(avgR / ledBuffer.length);
    avgG = Math.round(avgG / ledBuffer.length);
    avgB = Math.round(avgB / ledBuffer.length);

    // DEBUG v0.4.0: loguear color que se está mandando para diagnóstico
    device.log(`[KX500] Render: avgR=${avgR} avgG=${avgG} avgB=${avgB}`);

    // Enviar solid color con el promedio
    try {
        actionSolidColor(avgR, avgG, avgB);
    } catch (err) {
        // Silenciar errores intermitentes
    }
}

export function Shutdown(SystemSuspending) {
    try {
        actionOff();
        device.log(`[KX500] Shutdown`);
    } catch (err) {
        device.log(`[KX500] Shutdown error: ${err.message}`);
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!result) return [0, 0, 0];
    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
    ];
}

export {
    KX500_KEYS,
    LAYOUT_SIZE,
    HID_REPORT_SIZE,
    RGB_REPORT_ID,
    HANDSHAKE,
    buildPacket,
    sendAction,
    nextSeq,
    resetSeq,
    actionOff,
    actionBrightness,
    actionSpeed,
    actionEffect,
    actionSolidColor,
    actionBreathing,
};
