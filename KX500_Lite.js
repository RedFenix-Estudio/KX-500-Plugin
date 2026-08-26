/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Plugin — Lite v0.2.0                          ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v0.2.0 (2026-08-26) — protocolo real basado en USBPcap:         ║
 * ║    - send_report (Feature) → write (Output Report)               ║
 * ║    - 520B → 64B (paquete HID real)                              ║
 * ║    - Header 06 08 00 00 01 00 7A 01 → Report ID 0x04 + comando    ║
 * ║    - Heartbeat wrapper: 04 01 00 01 ... 04 02 00 02              ║
 * ║    - Handshake 04 A2 03 04 2C 00 00 00 55 AA FF ... en Initialize║
 * ║    - Settings: brightness, effect, effectColor, LightingMode     ║
 * ║                                                                  ║
 * ║  ⚠️  Los comandos exactos de "solid color", "per-key", "effect"  ║
 * ║  son BEST-GUESS basados en una captura mixta. Pendiente          ║
 * ║  confirmación con capturas individuales (ver PROTOCOL.md).       ║
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
// HID — VID/PID + protocolo RGB confirmado por USBPcap
// ════════════════════════════════════════════════════════════════════
const KX500_VID = 0x320F;
const KX500_PID = 0x5008;

// Endpoint HID RGB: interface 1, endpoint 0x03 OUT (Interrupt)
// (declarado como "HID Mouse" por el fabricante — quirk de KX-500)
const KX500_RGB_INTERFACE = 1;
const RGB_EP_OUT = 0x03;       // OUT endpoint para comandos RGB
const HID_REPORT_SIZE = 64;    // tamaño fijo del paquete HID RGB
const RGB_REPORT_ID = 0x04;    // primer byte de TODO paquete RGB

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI (sin cambios)
// ════════════════════════════════════════════════════════════════════
const KX500_KEYS = [
    // Fila 0: Function row
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

    // Fila 1: Number row + nav cluster
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

    // Fila 2: QWERTY
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

    // Fila 3: Home row
    { name: 'Caps Lock', x: 0, y: 3, w: 1.75, h: 1 },
    { name: 'A', x: 1.75, y: 3, w: 1, h: 1 }, { name: 'S', x: 2.75, y: 3, w: 1, h: 1 },
    { name: 'D', x: 3.75, y: 3, w: 1, h: 1 }, { name: 'F', x: 4.75, y: 3, w: 1, h: 1 },
    { name: 'G', x: 5.75, y: 3, w: 1, h: 1 }, { name: 'H', x: 6.75, y: 3, w: 1, h: 1 },
    { name: 'J', x: 7.75, y: 3, w: 1, h: 1 }, { name: 'K', x: 8.75, y: 3, w: 1, h: 1 },
    { name: 'L', x: 9.75, y: 3, w: 1, h: 1 },
    { name: ';', x: 10.75, y: 3, w: 1, h: 1 }, { name: '\u2019', x: 11.75, y: 3, w: 1, h: 1 },
    { name: 'Enter', x: 12.75, y: 3, w: 2.25, h: 1 },

    // Fila 4: Bottom row
    { name: 'Left Shift', x: 0, y: 4, w: 2.25, h: 1 },
    { name: 'Z', x: 2.25, y: 4, w: 1, h: 1 }, { name: 'X', x: 3.25, y: 4, w: 1, h: 1 },
    { name: 'C', x: 4.25, y: 4, w: 1, h: 1 }, { name: 'V', x: 5.25, y: 4, w: 1, h: 1 },
    { name: 'B', x: 6.25, y: 4, w: 1, h: 1 }, { name: 'N', x: 7.25, y: 4, w: 1, h: 1 },
    { name: 'M', x: 8.25, y: 4, w: 1, h: 1 },
    { name: ',', x: 9.25, y: 4, w: 1, h: 1 }, { name: '.', x: 10.25, y: 4, w: 1, h: 1 },
    { name: '/', x: 11.25, y: 4, w: 1, h: 1 },
    { name: 'Right Shift', x: 12.25, y: 4, w: 2.75, h: 1 },
    { name: 'Up Arrow', x: 16.5, y: 4, w: 1, h: 1 },

    // Fila 5: Space row
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

    // Numpad
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
// PROTOCOLO REAL KX-500 (confirmado por USBPcap 2026-08-26)
//
// Estructura universal:
//   [0x04] [CMD] [PARAMS...] [pad 0x00 hasta 64 bytes]
//
// Heartbeat wrapper (siempre antes y después de cada comando):
//   [04 01 00 01 ... pad]   ← START
//   [comando real]
//   [04 02 00 02 ... pad]   ← END
// ════════════════════════════════════════════════════════════════════

// Heartbeat packets (vistos 46x en captura mixta)
const HB_START = [0x04, 0x01, 0x00, 0x01];
const HB_END = [0x04, 0x02, 0x00, 0x02];

// Handshake / init packet (visto 3x en captura mixta — se manda al abrir el driver)
const HANDSHAKE = [
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14
];

// Comandos identificados en captura mixta (best-effort, no 100% confirmados)
const COMMANDS = {
    // 04 22 = "set solid color" probable (visto con RGB packed)
    // header: [04 22 12 11 36 00 00 00 00] + RGB data
    SOLID_COLOR: 0x22,

    // 04 A2 = handshake (ver HANDSHAKE)
    HANDSHAKE: 0xA2,

    // 04 17 = "set reactive/brightness pattern" (probable, visto con packed bytes)
    PATTERN: 0x17,

    // 04 01 = START heartbeat
    HB_START_CMD: 0x01,

    // 04 02 = END heartbeat
    HB_END_CMD: 0x02,
};

/**
 * Construye un paquete HID RGB de 64 bytes con Report ID 0x04.
 * @param {number} cmd - byte de comando (0x01..0xFF)
 * @param {number[]} params - bytes de parámetros (sin Report ID)
 * @returns {number[]} paquete de exactamente 64 bytes
 */
function buildRgbPacket(cmd, params = []) {
    const packet = [RGB_REPORT_ID, cmd & 0xFF, ...params];
    while (packet.length < HID_REPORT_SIZE) {
        packet.push(0x00);
    }
    return packet.slice(0, HID_REPORT_SIZE);
}

/**
 * Construye un comando de "solid color" (todos los keys del mismo color).
 *
 * Best-effort basado en `04 22 12 11 36 00 00 00 00 FF 00 00 FF 00 00 ...`
 * visto en captura mixta. Estructura:
 *
 *   [04] [22] [12] [11] [36] [00 00 00 00] [RGB triplets repetidos N veces]
 *
 * El `12` después de `22` puede ser un parámetro (length? brightness? count?).
 * Los `11 36` parecen fijos (magic constant del protocolo).
 *
 * @param {number} r,g,b - color 0..255
 * @param {number} [zoneCount=16] - cantidad de zonas/keys a setear (16 visto en captura)
 * @param {number} [param=0x12] - byte de parámetro (default visto en captura)
 */
function buildSolidColorPacket(r, g, b, zoneCount = 16, param = 0x12) {
    const params = [
        param & 0xFF,
        0x11,    // magic constant
        0x36,    // magic constant
        0x00, 0x00, 0x00, 0x00,    // 4 bytes de padding fijo
    ];
    // Empaquetar color RGB repetido zoneCount veces
    for (let i = 0; i < zoneCount; i++) {
        params.push(r & 0xFF);
        params.push(g & 0xFF);
        params.push(b & 0xFF);
    }
    return buildRgbPacket(COMMANDS.SOLID_COLOR, params);
}

/**
 * Construye un comando "shutdown" (todos los LEDs apagados).
 */
function buildShutdownPacket() {
    return buildRgbPacket(COMMANDS.SOLID_COLOR, [
        0x00,    // param = 0 (todos apagados)
        0x11, 0x36,
        0x00, 0x00, 0x00, 0x00,
    ]);
}

/**
 * Envía un paquete con heartbeat wrapper (START + cmd + END).
 * @param {number[]} cmdPacket - paquete de 64 bytes con el comando real
 */
function sendWithHeartbeat(cmdPacket) {
    try {
        device.write(HB_START);
        device.pause(1);
        device.write(cmdPacket);
        device.pause(1);
        device.write(HB_END);
        device.pause(1);
    } catch (err) {
        device.log(`[KX500] sendWithHeartbeat error: ${err.message}`);
    }
}

// ════════════════════════════════════════════════════════════════════
// EFFECTS — Override de canvas para LightingMode=Forced
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
            // 'static' y fallback — color sólido
            for (const led of ledsArr) { led.r = r; led.g = g; led.b = b; }
        }
    }
}

// ════════════════════════════════════════════════════════════════════
// FRAMEBUFFER INTERNO
// ════════════════════════════════════════════════════════════════════
let ledBuffer = [];
let lastRenderTime = 0;

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
 * Validate() — matchear la interface 1 (HID Mouse) donde está el canal RGB.
 * El KX-500 declara el canal RGB como "HID Mouse" (bInterfaceProtocol=0x02)
 * pero con bInterfaceClass=0x03 (HID). Filtramos por interface number.
 *
 * Si SignalRGB te pide "no encuentra el device", quizás el uso es FF1C:0092
 * o 0x0001:0x0006. Probar comentar/descomentar líneas.
 */
export function Validate(endpoint) {
    return endpoint.interface === KX500_RGB_INTERFACE
        && endpoint.usage_page === 0x0001   // HID Mouse interface
        && endpoint.usage === 0x0002;       // Mouse
    // Alternativa si no matchea: probar
    //   return endpoint.interface === 1 && endpoint.vendor_id === KX500_VID;
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
            label: "Brightness",
            type: "number",
            min: "0",
            max: "100",
            default: "100",
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

    // 1. Mandar handshake (visto en captura mixta al abrir el driver)
    try {
        device.write(HANDSHAKE);
        device.pause(5);
        device.log(`[KX500] Handshake sent (${HANDSHAKE.length} bytes)`);
    } catch (err) {
        device.log(`[KX500] Handshake failed: ${err.message}`);
    }

    // 2. Apagar LEDs al iniciar (para limpiar estado)
    try {
        sendWithHeartbeat(buildShutdownPacket());
        device.log(`[KX500] Initial shutdown packet sent`);
    } catch (err) {
        device.log(`[KX500] Initial shutdown failed: ${err.message}`);
    }

    device.log(`[KX500] Author: ${AUTHOR} (${AUTHOR_GITHUB_URL})`);
    device.log(`[KX500] Docs: ${DOCUMENTATION_URL}`);
    device.log(`[KX500] Protocol: HID Output Report, 64B, Report ID 0x04 (ver PROTOCOL.md)`);
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
        // Modo Forced — usar effect interno
        const effectId = (typeof effect !== "undefined" && effect) ? effect : "static";
        applyForcedEffect(ledBuffer, time, useColor, effectId);
    } else {
        // Modo Canvas — leer device.color(x,y) por key
        for (let i = 0; i < ledBuffer.length; i++) {
            const led = ledBuffer[i];
            const c = device.color(led.x, led.y);
            led.r = c[0];
            led.g = c[1];
            led.b = c[2];
        }
    }

    // Aplicar brightness
    const bright = (typeof brightness !== "undefined" ? brightness : 100) / 100;
    let avgR = 0, avgG = 0, avgB = 0;
    if (bright < 1.0) {
        for (const led of ledBuffer) {
            led.r = Math.round(led.r * bright);
            led.g = Math.round(led.g * bright);
            led.b = Math.round(led.b * bright);
            avgR += led.r; avgG += led.g; avgB += led.b;
        }
        avgR = Math.round(avgR / ledBuffer.length);
        avgG = Math.round(avgG / ledBuffer.length);
        avgB = Math.round(avgB / ledBuffer.length);
    } else {
        for (const led of ledBuffer) {
            avgR += led.r; avgG += led.g; avgB += led.b;
        }
        avgR = Math.round(avgR / ledBuffer.length);
        avgG = Math.round(avgG / ledBuffer.length);
        avgB = Math.round(avgB / ledBuffer.length);
    }

    // Enviar comando solid color con el promedio (best-effort hasta tener per-zone)
    try {
        const packet = buildSolidColorPacket(avgR, avgG, avgB);
        sendWithHeartbeat(packet);
    } catch (err) {
        // Silenciar errores intermitentes
    }
}

export function Shutdown(SystemSuspending) {
    const color = SystemSuspending
        ? "#000000"
        : (typeof shutdownColor !== "undefined" ? shutdownColor : "#000000");

    try {
        sendWithHeartbeat(buildShutdownPacket());
        device.log(`[KX500] Shutdown: ${color}`);
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

// ════════════════════════════════════════════════════════════════════
// EXPORTS INTERNOS (para tests offline)
// ════════════════════════════════════════════════════════════════════
export {
    KX500_KEYS,
    LAYOUT_SIZE,
    HID_REPORT_SIZE,
    RGB_REPORT_ID,
    HB_START,
    HB_END,
    HANDSHAKE,
    COMMANDS,
    buildRgbPacket,
    buildSolidColorPacket,
    buildShutdownPacket,
    sendWithHeartbeat,
};
