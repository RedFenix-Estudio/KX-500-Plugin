/*
 * KX-500 SignalRGB Plugin — Lite (minimalista)
 *
 * Single-file plugin para SignalRGB.
 * Checkpoint Gaming KX-500 (NA-KB-1001), full-size US ANSI, 104 keys.
 *
 * Lo único que hace:
 *   1. Declara el dispositivo (VID 0x320F, PID 0x5008, interface HID RGB 0xFF1C:0x0092)
 *   2. Cada ~30ms lee device.color(x,y) por key y manda el frame al HID del teclado
 *   3. Apaga el teclado limpio al salir
 *
 * Lo que NO hace (todavía):
 *   - Effects propios: SignalRGB los aplica sobre el canvas antes de llamar Render.
 *   - typing_reactive real: no abrimos el canal Keyboard HID IN.
 *   - Luces funcionando: depende del comando HID exacto (header best-effort abajo).
 *
 * Repo: https://github.com/RedFenix-Estudio/KX-500-Plugin
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// HID — descriptor del KX-500 (confirmado en registry el 2026-08-25)
// ════════════════════════════════════════════════════════════════════
const VID              = 0x320F;
const PID              = 0x5008;
const RGB_USAGE_PAGE   = 0xFF1C;   // Vendor Defined
const RGB_USAGE        = 0x0092;

// Header HID best-effort (estilo SinoWealth, hidr 10 / Redragon KS82B).
// Si las luces no encienden: capturar con USBPcap y editar esta línea.
const HID_HEADER = [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01];
const HID_REPORT_SIZE = 520;       // estándar SinoWealth (Hydra 10)

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// x,y en unidades (1u = 1 slot). Bounding box 23×6.
// ════════════════════════════════════════════════════════════════════
const KEYS = [
    // Fila 0: function row
    ['Esc', 0, 0], ['F1', 2, 0], ['F2', 3, 0], ['F3', 4, 0], ['F4', 5, 0],
    ['F5', 6.5, 0], ['F6', 7.5, 0], ['F7', 8.5, 0], ['F8', 9.5, 0],
    ['F9', 11, 0], ['F10', 12, 0], ['F11', 13, 0], ['F12', 14, 0],
    ['Print Screen', 15.5, 0], ['Scroll Lock', 16.5, 0], ['Pause Break', 17.5, 0],
    // Fila 1: number row + nav
    ['`', 0, 1],
    ['1', 1, 1], ['2', 2, 1], ['3', 3, 1], ['4', 4, 1], ['5', 5, 1],
    ['6', 6, 1], ['7', 7, 1], ['8', 8, 1], ['9', 9, 1], ['0', 10, 1],
    ['-', 11, 1], ['=', 12, 1], ['Backspace', 13, 1],
    ['Insert', 15.5, 1], ['Home', 16.5, 1], ['Page Up', 17.5, 1],
    // Fila 2: QWERTY
    ['Tab', 0, 2],
    ['Q', 1.5, 2], ['W', 2.5, 2], ['E', 3.5, 2], ['R', 4.5, 2],
    ['T', 5.5, 2], ['Y', 6.5, 2], ['U', 7.5, 2], ['I', 8.5, 2],
    ['O', 9.5, 2], ['P', 10.5, 2],
    ['[', 11.5, 2], [']', 12.5, 2], ['\\', 13.5, 2],
    ['Del', 15.5, 2], ['End', 16.5, 2], ['Page Down', 17.5, 2],
    // Fila 3: home row
    ['Caps Lock', 0, 3],
    ['A', 1.75, 3], ['S', 2.75, 3], ['D', 3.75, 3], ['F', 4.75, 3],
    ['G', 5.75, 3], ['H', 6.75, 3], ['J', 7.75, 3], ['K', 8.75, 3], ['L', 9.75, 3],
    [';', 10.75, 3], ['\u2019', 11.75, 3], ['Enter', 12.75, 3],
    // Fila 4: bottom row
    ['Left Shift', 0, 4],
    ['Z', 2.25, 4], ['X', 3.25, 4], ['C', 4.25, 4], ['V', 5.25, 4],
    ['B', 6.25, 4], ['N', 7.25, 4], ['M', 8.25, 4],
    [',', 9.25, 4], ['.', 10.25, 4], ['/', 11.25, 4],
    ['Right Shift', 12.25, 4], ['Up Arrow', 16.5, 4],
    // Fila 5: space row
    ['Left Ctrl', 0, 5], ['Left Win', 1.25, 5], ['Left Alt', 2.5, 5],
    ['Space', 3.75, 5],
    ['Right Alt', 10, 5], ['Fn', 11.25, 5], ['Menu', 12.5, 5], ['Right Ctrl', 13.75, 5],
    ['Left Arrow', 15.5, 5], ['Down Arrow', 16.5, 5], ['Right Arrow', 17.5, 5],
    // Numpad
    ['NumLock', 19, 1], ['Num /', 20, 1], ['Num *', 21, 1], ['Num -', 22, 1],
    ['Num 7', 19, 2], ['Num 8', 20, 2], ['Num 9', 21, 2], ['Num +', 22, 2],
    ['Num 4', 19, 3], ['Num 5', 20, 3], ['Num 6', 21, 3],
    ['Num 1', 19, 4], ['Num 2', 20, 4], ['Num 3', 21, 4], ['Num Enter', 22, 4],
    ['Num 0', 19, 5], ['Num .', 21, 5],
];

// Bounding box para Size() — recalculado del array KEYS
const LAYOUT_W = (function () {
    let m = 0;
    for (const k of KEYS) if (k[1] > m) m = k[1];
    return Math.ceil(m) + 1;
})();
const LAYOUT_H = (function () {
    let m = 0;
    for (const k of KEYS) if (k[2] > m) m = k[2];
    return Math.ceil(m) + 1;
})();

// ════════════════════════════════════════════════════════════════════
// SignalRGB SDK — exports obligatorios
// ════════════════════════════════════════════════════════════════════

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function Name() {
    return "Checkpoint KX-500 (NA-KB-1001)";
}

export function Publisher() {
    return "RedFenix Estudio";
}

export function VendorId() {
    return VID;
}

// ProductId debe ser array (no single value)
export function ProductId() {
    return [PID];
}

export function Type() {
    return "hid";
}

export function DeviceType() {
    return "keyboard";
}

export function Size() {
    return [LAYOUT_W, LAYOUT_H];
}

export function LedNames() {
    return KEYS.map(k => k[0]);
}

export function LedPositions() {
    return KEYS.map(k => [k[1], k[2]]);
}

export function Documentation() {
    return "https://github.com/RedFenix-Estudio/KX-500-Plugin";
}

export function ImageUrl() {
    return "https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png";
}

// Filtra el endpoint HID del RGB (MI_01 Col04, Usage Page 0xFF1C)
export function Validate(endpoint) {
    return endpoint.interface === 1
        && endpoint.usage_page === RGB_USAGE_PAGE
        && endpoint.usage === RGB_USAGE;
}

// Settings UI (estos globals los inyecta SignalRGB en runtime)
export function ControllableParameters() {
    return [
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

// Procesos que monopolizan el HID RGB — SignalRGB espera que se cierren
export function ConflictingProcesses() {
    return ["Mechanical Keyboard.exe", "HidServ.exe"];
}

// ════════════════════════════════════════════════════════════════════
// Lifecycle
// ════════════════════════════════════════════════════════════════════

// Llamado una vez por SignalRGB al activar el plugin
export function Initialize() {
    device.setName("Checkpoint KX-500 (NA-KB-1001)");
    device.setSize([LAYOUT_W, LAYOUT_H]);
    device.setControllableLeds(
        KEYS.map(k => k[0]),
        KEYS.map(k => [k[1], k[2]]),
    );
    device.log("[KX500] Initialized: " + KEYS.length + " keys, " + LAYOUT_W + "x" + LAYOUT_H);
}

// Llamado cada ~30ms por SignalRGB — el corazón del plugin
export function Render() {
    // Decidir color base según LightingMode
    let r = 0, g = 0, b = 0;
    if (typeof LightingMode !== "undefined" && LightingMode === "Forced") {
        // Modo Forced: usar forcedColor (hex string)
        const hex = (typeof forcedColor !== "undefined") ? forcedColor : "#009bde";
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (m) {
            r = parseInt(m[1], 16);
            g = parseInt(m[2], 16);
            b = parseInt(m[3], 16);
        }
    }

    // Construir packet HID: header + RGB por key
    const packet = HID_HEADER.slice();
    for (let i = 0; i < KEYS.length; i++) {
        let cr, cg, cb;
        if (LightingMode === "Forced") {
            cr = r; cg = g; cb = b;
        } else {
            // Modo Canvas: leer color del canvas en la posición de la key
            const key = KEYS[i];
            const c = device.color(key[1], key[2]);
            cr = c[0]; cg = c[1]; cb = c[2];
        }
        packet.push(cr & 0xFF, cg & 0xFF, cb & 0xFF);
    }

    // Pad a HID_REPORT_SIZE
    while (packet.length < HID_REPORT_SIZE) packet.push(0x00);

    // Enviar al teclado
    try {
        device.send_report(packet, packet.length);
        device.pause(1);
    } catch (err) {
        // Silenciar — SignalRGB puede desconectar el device intermitentemente
    }
}

// Llamado al apagar / suspender
export function Shutdown(SystemSuspending) {
    const hex = SystemSuspending
        ? "#000000"
        : (typeof shutdownColor !== "undefined" ? shutdownColor : "#000000");
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const r = m ? parseInt(m[1], 16) : 0;
    const g = m ? parseInt(m[2], 16) : 0;
    const b = m ? parseInt(m[3], 16) : 0;

    const packet = HID_HEADER.slice();
    for (let i = 0; i < KEYS.length; i++) {
        packet.push(r, g, b);
    }
    while (packet.length < HID_REPORT_SIZE) packet.push(0x00);

    try {
        device.send_report(packet, packet.length);
        device.pause(1);
    } catch (err) {}
}