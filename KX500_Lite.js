/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Plugin — Lite v2                               ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v2 fixes (2026-08-25):                                          ║
 * ║    - ProductId ahora retorna [0x5008] (array, no single value)   ║
 * ║    - Initialize() llama device.setName/setSize/setControllableLeds║
 * ║    - device.pause(1) después de cada send_report                 ║
 * ║    - Validate() más permisivo (interface + usage_page + usage)   ║
 * ║    - globals inyectadas (shutdownColor, LightingMode, forcedColor)║
 * ║    - device.notify() en errores                                  ║
 * ║    - Packet pad a 520 bytes (estándar SinoWealth)                ║
 * ║                                                                  ║
 * ║  Repo: https://github.com/RedFenix-Estudio/KX-500-Plugin         ║
 * ║  Basado en: Hydra 10, Redragon K626, PMO Wave75 Pro plugins      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

// NOTA: DeviceDiscovery solo se usa para fallback de modelos no encontrados.
// Como el KX-500 es nuestro único modelo, no lo necesitamos. SignalRGB
// provee este módulo automáticamente cuando carga el plugin, pero no es
// necesario para el caso normal.
// import DeviceDiscovery from "@SignalRGB/DeviceDiscovery";

// ════════════════════════════════════════════════════════════════════
// METADATA
// ════════════════════════════════════════════════════════════════════
const AUTHOR = "RedFenix Estudio";
const AUTHOR_GITHUB_URL = "https://github.com/RedFenix-Estudio";
const DOCUMENTATION_URL = "https://github.com/RedFenix-Estudio/KX-500-Plugin";
const DEVICE_NAME = "Checkpoint KX-500 (NA-KB-1001)";

// ════════════════════════════════════════════════════════════════════
// HID — VID/PID + descriptor del KX-500
// ════════════════════════════════════════════════════════════════════
const KX500_VID = 0x320F;
const KX500_PID = 0x5008;
const USAGE_PAGE_RGB = 0xFF1C;   // MI_01 Col04 — Vendor Defined
const USAGE_RGB = 0x0092;
const HID_REPORT_SIZE = 520;      // Estándar SinoWealth (Hydra 10 / Redragon)

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// (x,y) en unidades (1u = 1 slot), w=ancho, h=alto.
// Bounding box: 23 cols × 6 filas.
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

// Calcular bounding box para Size()
const LAYOUT_SIZE = (function () {
    let maxX = 0, maxY = 0;
    for (const k of KX500_KEYS) {
        if (k.x + k.w > maxX) maxX = k.x + k.w;
        if (k.y + k.h > maxY) maxY = k.y + k.h;
    }
    return [Math.ceil(maxX), Math.ceil(maxY)];
})();

// ════════════════════════════════════════════════════════════════════
// PROTOCOLO BEST-EFFORT — presets seleccionables desde SignalRGB
//
// El KX-500 usa HID Vendor Defined (FF1C:0092). El header HID exacto
// de los feature reports aún no está confirmado con captura USBPcap.
// Mientras tanto, el usuario puede probar varios presets comunes.
//
// Para confirmar el header real:
//   1. Cerrar SignalRGB
//   2. Iniciar driver oficial CHECKPOINT_KX_500.exe
//   3. Wireshark + USBPcap capturando (filtro: usb.transfer_type == 0x01)
//   4. Aplicar un color desde el driver oficial
//   5. Capturar el primer byte del paquete y completar este preset
// ════════════════════════════════════════════════════════════════════
const PROTOCOL_PRESETS = {
    // SinoWealth 8-byte header + 520 bytes report (Hydra 10, Redragon)
    "sinowealth_8b": {
        label: "SinoWealth 8B + 520B (Hydra 10 / Redragon K626)",
        header: [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01],
        reportSize: 520,
    },
    // SinoWealth sin el 0x06 inicial
    "sinowealth_7b": {
        label: "SinoWealth 7B + 520B (sin 0x06 prefix)",
        header: [0x00, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01],
        reportSize: 520,
    },
    // Vendor Defined minimal 4-byte + 64 bytes
    "vendor_4b_64": {
        label: "Generic Vendor 4B + 64B (minimal)",
        header: [0x00, 0x00, 0x00, 0x01],
        reportSize: 64,
    },
    // Vendor Defined minimal 4-byte + 520 bytes
    "vendor_4b_520": {
        label: "Generic Vendor 4B + 520B (minimal large)",
        header: [0x00, 0x00, 0x00, 0x01],
        reportSize: 520,
    },
    // Sin header, solo RGB (104 keys × 3 bytes = 312 bytes)
    "rgb_no_header": {
        label: "Pure RGB (no header, 320B raw)",
        header: [],
        reportSize: 320,
    },
    // Sin header, 64 bytes
    "rgb_64": {
        label: "Pure RGB + 64B (no header)",
        header: [],
        reportSize: 64,
    },
    // Sin header, 520 bytes
    "rgb_520": {
        label: "Pure RGB + 520B (no header)",
        header: [],
        reportSize: 520,
    },
};

// Preset por defecto (el más probable para SinoWealth)
const DEFAULT_PRESET = "sinowealth_8b";
const PROTOCOL_MODE = DEFAULT_PRESET;

function buildFrame(leds, presetName) {
    const preset = PROTOCOL_PRESETS[presetName || DEFAULT_PRESET]
        || PROTOCOL_PRESETS[DEFAULT_PRESET];
    const packet = preset.header.slice();
    for (const led of leds) {
        packet.push(led.r & 0xFF);
        packet.push(led.g & 0xFF);
        packet.push(led.b & 0xFF);
    }
    while (packet.length < preset.reportSize) packet.push(0x00);
    return packet;
}

// ════════════════════════════════════════════════════════════════════
// EFFECTS — Override de canvas si el usuario quiere efectos propios
// (en modo Canvas, SignalRGB ya aplica effects — solo usamos este
// override cuando el usuario fuerza "LightingMode: Forced" o el
// effect "typing")
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
// SignalRGB llama a Render() cada ~30ms; nosotros consultamos
// device.color(x,y) por key (modo Canvas) o usamos forcedColor (Forced).
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
protocolPreset:readonly
*/

export function Name() { return DEVICE_NAME; }

export function Publisher() { return AUTHOR; }

export function VendorId() { return KX500_VID; }

/**
 * ProductId como ARRAY (no single value).
 * Esto es crítico — SignalRGB valida con Array.includes() internamente.
 * Verificado contra Redragon K626 plugin (mismo formato).
 */
export function ProductId() { return [KX500_PID]; }

export function Type() { return "hid"; }

export function DeviceType() { return "keyboard"; }

export function Size() { return LAYOUT_SIZE; }

export function LedNames() {
    return KX500_KEYS.map(k => k.name);
}

export function LedPositions() {
    return KX500_KEYS.map(k => [k.x, k.y]);
}

export function Documentation() {
    return DOCUMENTATION_URL;
}

export function ImageUrl() {
    // SignalRGB carga la imagen via HTTP, así que necesita raw.githubusercontent.com
    return "https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png";
}

/**
 * Valida qué endpoints HID abrir.
 * El KX-500 expone 5 colecciones HID (ver PROTOCOL.md):
 *
 *   MI_00          UP=0x0001  U=0x0006  Keyboard (BIOS)
 *   MI_01 Col01    UP=0x0001  U=0x0006  Keyboard (NKRO)
 *   MI_01 Col02    UP=0x0001  U=0x000C  Wireless Radio Controls
 *   MI_01 Col03    UP=0x000C  U=0x0001  Consumer Control
 *   MI_01 Col04    UP=0xFF1C  U=0x0092  Vendor Defined (RGB) ← NOSOTROS
 *
 * Filtro triple: interface + usage_page + usage.
 * Si SignalRGB no matchea con usage_page/usage, el plugin no carga.
 */
export function Validate(endpoint) {
    return endpoint.interface === 1
        && endpoint.usage_page === USAGE_PAGE_RGB
        && endpoint.usage === USAGE_RGB;
}

/**
 * Settings UI que el usuario puede tocar desde SignalRGB.
 *  - effect:          qué effect correr (static/breathing/wave/typing)
 *  - effectColor:     color base del effect
 *  - brightness:      multiplicador global (0..100%)
 *  - LightingMode:    Canvas (SignalRGB controla) o Forced (color fijo)
 *  - forcedColor:     color fijo cuando LightingMode=Forced
 *  - shutdownColor:   color al apagar SignalRGB
 */
export function ControllableParameters() {
    return [
        {
            property: "protocolPreset",
            group: "advanced",
            label: "HID Protocol Preset",
            description: "Best-effort header HID. Probar varias opciones si las luces no encienden. Para calibrar definitivamente: usar USBPcap+Wireshark con el driver oficial abierto.",
            type: "combobox",
            values: [
                "sinowealth_8b",
                "sinowealth_7b",
                "vendor_4b_64",
                "vendor_4b_520",
                "rgb_no_header",
                "rgb_64",
                "rgb_520",
            ],
            default: "sinowealth_8b",
        },
        {
            property: "effect",
            group: "lighting",
            label: "Effect",
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

/**
 * Procesos que NO deben estar corriendo cuando el plugin controla el teclado.
 * El driver oficial monopoliza el HID RGB.
 */
export function ConflictingProcesses() {
    return ["Mechanical Keyboard.exe", "HidServ.exe"];
}

/**
 * Inicialización.
 *
 * Crítico (v2 fix): SignalRGB requiere que llamemos
 *   - device.setName(name)
 *   - device.setSize([w, h])
 *   - device.setControllableLeds(names, positions)
 * dentro de Initialize() para que registre el dispositivo en su UI.
 * Sin esto, el device aparece pero no se puede usar.
 */
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

    // Probe inicial: enviar un clear packet para verificar que el canal HID responde
    try {
        const preset = (typeof protocolPreset !== "undefined" && protocolPreset)
            ? protocolPreset
            : DEFAULT_PRESET;
        const clearPacket = buildFrame(ledBuffer, preset);
        device.send_report(clearPacket, clearPacket.length);
        device.pause(1);
        device.log(`[KX500] Protocol probe OK (preset=${preset}, ${PROTOCOL_PRESETS[preset].reportSize}B)`);
    } catch (err) {
        device.notify("KX-500 probe failed", err.message, 0);
        device.log(`[KX500] Protocol probe failed: ${err.message} — plugin will load anyway`);
    }

    device.log(`[KX500] Author: ${AUTHOR} (${AUTHOR_GITHUB_URL})`);
    device.log(`[KX500] Docs: ${DOCUMENTATION_URL}`);
}

/**
 * Render loop — llamado cada ~30ms por SignalRGB.
 *
 * Estrategia:
 *   - LightingMode=Canvas: leemos device.color(x,y) por key desde el canvas
 *   - LightingMode=Forced: aplicamos effect interno sobre el forcedColor
 *
 * En ambos casos, enviamos el resultado al teclado via device.send_report()
 * con device.pause(1) para no saturar el MCU.
 */
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
        const effect = (typeof effect !== "undefined" && effect) ? effect : "static";
        applyForcedEffect(ledBuffer, time, useColor, effect);
    } else {
        // Modo Canvas — leer device.color(x,y) por key (estilo SignalRGB estándar)
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
    if (bright < 1.0) {
        for (const led of ledBuffer) {
            led.r = Math.round(led.r * bright);
            led.g = Math.round(led.g * bright);
            led.b = Math.round(led.b * bright);
        }
    }

    // Construir y enviar packet HID
    try {
        const preset = (typeof protocolPreset !== "undefined" && protocolPreset)
            ? protocolPreset
            : DEFAULT_PRESET;
        const packet = buildFrame(ledBuffer, preset);
        device.send_report(packet, packet.length);
        // Pausa entre reportes — sin esto, el firmware puede ignorar frames
        device.pause(1);
    } catch (err) {
        // Silenciar — SignalRGB puede desconectar device intermitentemente
    }
}

/**
 * Shutdown — llamado cuando SignalRGB se apaga o se desactiva el plugin.
 */
export function Shutdown(SystemSuspending) {
    const color = SystemSuspending
        ? "#000000"
        : (typeof shutdownColor !== "undefined" ? shutdownColor : "#000000");

    try {
        for (const led of ledBuffer) {
            led.r = 0; led.g = 0; led.b = 0;
        }
        const preset = (typeof protocolPreset !== "undefined" && protocolPreset)
            ? protocolPreset
            : DEFAULT_PRESET;
        const packet = buildFrame(ledBuffer, preset);
        device.send_report(packet, packet.length);
        device.pause(1);
        device.log(`[KX500] Shutdown: ${color}`);
    } catch (err) {
        device.log(`[KX500] Shutdown error: ${err.message}`);
    }
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
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
// EXPORTS INTERNOS (para tests offline; SignalRGB los ignora)
// ════════════════════════════════════════════════════════════════════
export { KX500_KEYS, LAYOUT_SIZE, PROTOCOL_MODE, PROTOCOL_PRESETS, DEFAULT_PRESET, HID_REPORT_SIZE };