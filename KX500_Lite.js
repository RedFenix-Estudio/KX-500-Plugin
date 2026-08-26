/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Plugin — Lite v0.7.1                          ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v0.7.1 (2026-08-26) — USAR device.write() NO send_report     ║
 * ║                                                                  ║
 * ║  Bug encontrado: KX-500 HID endpoint NO soporta Feature Reports. ║
 * ║  Error: HidD_SetFeature: ERROR_INVALID_FUNCTION                 ║
 * ║                                                                  ║
 * ║  Por eso send_report (Feature Report) falla.                     ║
 * ║  Hay que usar write() que es HID Output Report via WriteFile.    ║
 * ║                                                                  ║
 * ║  También reduje a UN SOLO write por frame (antes 7 writes,      ║
 * ║  el driver HID no aguantaba el thrash).                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// METADATA
// ════════════════════════════════════════════════════════════════════
const AUTHOR = "RedFenix Estudio";
const DOCUMENTATION_URL = "https://github.com/RedFenix-Estudio/KX-500-Plugin";
const DEVICE_NAME = "Checkpoint KX-500 (NA-KB-1001)";

// ════════════════════════════════════════════════════════════════════
// HID — VID/PID + protocolo Sinowealth-style (Output Report)
// ════════════════════════════════════════════════════════════════════
const KX500_VID = 0x320F;
const KX500_PID = 0x5008;
const HID_REPORT_ID = 0x04;       // HID Report ID del KX-500 (USBPcap-verified)
const PACKET_SIZE = 520;           // Tamaño fijo del paquete

// Header Sinowealth — primer byte es el HID Report ID
// KX-500 usa 0x04 en lugar de 0x06 (Sinowealth original)
const SINOWEALTH_HEADER = [
    0x04,                    // HID Report ID (KX-500)
    0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01   // Protocolo header
];

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// ════════════════════════════════════════════════════════════════════
const vLedNames = [
    // Fila 0: F-row (16 keys)
    "Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
    "Print Screen", "Scroll Lock", "Pause Break",
    // Fila 1: Number row + nav (17 keys)
    "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace",
    "Insert", "Home", "Page Up",
    // Fila 2: QWERTY + nav (17 keys)
    "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",
    "Del", "End", "Page Down",
    // Fila 3: Home row (14 keys)
    "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter",
    // Fila 4: Z row (14 keys)
    "Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow",
    // Fila 5: Space row (11 keys)
    "Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",
    "Left Arrow", "Down Arrow", "Right Arrow",
    // Numpad (17 keys)
    "NumLock", "Num /", "Num *", "Num -",
    "Num 7", "Num 8", "Num 9", "Num +",
    "Num 4", "Num 5", "Num 6",
    "Num 1", "Num 2", "Num 3", "Num Enter",
    "Num 0", "Num ."
];

const vLedPositions = [
    [0, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6.5, 0], [7.5, 0], [8.5, 0], [9.5, 0], [11, 0], [12, 0], [13, 0], [14, 0],
    [15.5, 0], [16.5, 0], [17.5, 0],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
    [15.5, 1], [16.5, 1], [17.5, 1],
    [0, 2], [1.5, 2], [2.5, 2], [3.5, 2], [4.5, 2], [5.5, 2], [6.5, 2], [7.5, 2], [8.5, 2], [9.5, 2], [10.5, 2], [11.5, 2], [12.5, 2], [13.5, 2],
    [15.5, 2], [16.5, 2], [17.5, 2],
    [0, 3], [1.75, 3], [2.75, 3], [3.75, 3], [4.75, 3], [5.75, 3], [6.75, 3], [7.75, 3], [8.75, 3], [9.75, 3], [10.75, 3], [11.75, 3], [12.75, 3],
    [0, 4], [2.25, 4], [3.25, 4], [4.25, 4], [5.25, 4], [6.25, 4], [7.25, 4], [8.25, 4], [9.25, 4], [10.25, 4], [11.25, 4], [12.25, 4], [16.5, 4],
    [0, 5], [1.25, 5], [2.5, 5], [3.75, 5], [10, 5], [11.25, 5], [12.5, 5], [13.75, 5], [15.5, 5], [16.5, 5], [17.5, 5],
    [19, 1], [20, 1], [21, 1], [22, 1],
    [19, 2], [20, 2], [21, 2], [22, 2],
    [19, 3], [20, 3], [21, 3],
    [19, 4], [20, 4], [21, 4], [22, 4],
    [19, 5], [21, 5]
];

const vLeds = (function() {
    const arr = new Array(vLedNames.length);
    for (let i = 0; i < vLedNames.length; i++) arr[i] = i;
    return arr;
})();

const LAYOUT_SIZE = (function () {
    let maxX = 0, maxY = 0;
    for (const pos of vLedPositions) {
        if (pos[0] + 1 > maxX) maxX = pos[0] + 1;
        if (pos[1] + 1 > maxY) maxY = pos[1] + 1;
    }
    return [Math.ceil(maxX), Math.ceil(maxY)];
})();

// ════════════════════════════════════════════════════════════════════
// SEND COLORS — UN solo write() por frame
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

function sendColors(overrideColor) {
    if (!vLeds || !vLeds.length) return;

    // Construir RGBData packed (3 bytes por LED)
    const RGBData = new Array(vLeds.length * 3).fill(0);

    for (let iIdx = 0; iIdx < vLeds.length; iIdx++) {
        const pos = vLedPositions[iIdx];
        let color;
        if (overrideColor) {
            color = hexToRgb(overrideColor);
        } else if (LightingMode === "Forced") {
            color = hexToRgb(forcedColor || "#009bde");
        } else {
            // Canvas mode
            try {
                color = device.color(pos[0], pos[1]);
            } catch (err) {
                color = [0, 0, 0];
            }
        }
        const idx = vLeds[iIdx] * 3;
        RGBData[idx] = color[0];
        RGBData[idx + 1] = color[1];
        RGBData[idx + 2] = color[2];
    }

    // Construir packet: header + RGBData + padding
    const packet = SINOWEALTH_HEADER.concat(RGBData);
    while (packet.length < PACKET_SIZE) packet.push(0x00);
    const finalPacket = packet.slice(0, PACKET_SIZE);

    // UN SOLO write por frame (NO send_report porque KX-500 no soporta Feature Reports)
    try {
        device.write(finalPacket, PACKET_SIZE);
        device.pause(1);
    } catch (err) {
        // Silenciar
    }
}

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB SDK EXPORTS
// ════════════════════════════════════════════════════════════════════

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function Name() { return DEVICE_NAME; }
export function Publisher() { return AUTHOR; }
export function VendorId() { return KX500_VID; }
export function ProductId() { return [KX500_PID]; }
export function Type() { return "hid"; }
export function DeviceType() { return "keyboard"; }
export function Size() { return LAYOUT_SIZE; }
export function LedNames() { return vLedNames.slice(); }
export function LedPositions() { return vLedPositions.map(p => p.slice()); }
export function Documentation() { return DOCUMENTATION_URL; }
export function ImageUrl() {
    return "https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png";
}

export function Validate(endpoint) {
    if (endpoint.usage_page === 0xFF1C && endpoint.usage === 0x0092) {
        return true;
    }
    if (endpoint.collection === 0x0004) {
        return true;
    }
    return false;
}

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

export function ConflictingProcesses() {
    return ["Mechanical Keyboard.exe", "HidServ.exe", "CHECKPOINT_KX_500.exe"];
}

export function Initialize() {
    try {
        device.setName(DEVICE_NAME);
        device.setSize(LAYOUT_SIZE);
        device.setControllableLeds(vLedNames.slice(), vLedPositions.map(p => p.slice()));
        device.log(`[KX500] Registered: ${DEVICE_NAME} (${vLedNames.length} keys, ${LAYOUT_SIZE[0]}×${LAYOUT_SIZE[1]})`);
        device.log(`[KX500] Protocol: HID Output Report, 520B, Report ID 0x04`);
    } catch (err) {
        device.notify("KX-500 init error", err.message, 1);
        device.log(`[KX500] init failed: ${err.message}`);
    }
}

export function Render() {
    sendColors();
}

export function Shutdown(SystemSuspending) {
    const color = SystemSuspending ? "#000000" : (shutdownColor || "#000000");
    sendColors(color);
}

export {
    vLedNames,
    vLeds,
    vLedPositions,
    LAYOUT_SIZE,
    KX500_VID,
    KX500_PID,
    HID_REPORT_ID,
    PACKET_SIZE,
    SINOWEALTH_HEADER,
    sendColors,
    hexToRgb,
};
