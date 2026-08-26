/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Plugin v1.0.0                                 ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v1.0.0 — REESCRITURA: conectado al módulo protocol.js          ║
 * ║  - HID Output Reports de 64 bytes (no feature reports)            ║
 * ║  - Heartbeat START/END envolviendo cada comando                   ║
 * ║  - Handshake al Initialize                                        ║
 * ║  - Comandos confirmados por captura USBPcap (2026-08-26)           ║
 * ║  - 37/37 tests del módulo protocol.js pasando                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * PROTOCOLO REAL (capturado con USBPcap2 en Windows, endpoint
 * interrupt OUT 0x03 de la interfaz "Mouse" del KX-500):
 *
 *   Heartbeat (siempre alrededor de cada comando):
 *     04 01 00 01 [pad 0x00 hasta 64B]    START
 *     04 02 00 02 [pad 0x00 hasta 64B]    END
 *
 *   Handshake (una vez al Initialize, antes de cualquier color):
 *     04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 ...
 *     (los bytes 0F 32 08 50 codifican el VID 0x320F + PID 0x5008)
 *
 *   Solid color RGB (lo que usa SignalRGB en modo Canvas):
 *     04 [SEQ] 03 06 03 05 00 00 R G B
 *
 *   Brightness 0..4:
 *     04 08 00 06 01 01                 nivel 0 (apagado)
 *     04 09 00 06 01 01 00 00 01       nivel 1
 *     04 0A 00 06 01 01 00 00 02       nivel 2
 *     04 0B 00 06 01 01 00 00 03       nivel 3
 *     04 0C 00 06 01 01 00 00 04       nivel 4
 *
 *   Effect 1..19 (firmware nativo, ex: breathing = #5):
 *     04 [SEQ] 00 06 01 00 00 00 N     para N = 1..15
 *     04 [SEQ] 00 06 01 11 00 00 N-16  para N = 16..19
 *
 *   Speed 1..4:
 *     04 09 00 06 01 02                 nivel 1
 *     04 0B 00 06 01 02 00 00 02       nivel 2
 *     04 0C 00 06 01 02 00 00 03       nivel 3
 *     04 0D 00 06 01 02 00 00 04       nivel 4
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// IMPORTS — protocolo y layout, ya validados con 37 tests
// ════════════════════════════════════════════════════════════════════
import {
    VID,
    PID,
    REPORT_SIZE,
    REPORT_ID,
    HANDSHAKE_PACKET,
    buildOff,
    buildBrightness,
    buildSpeed,
    buildEffect,
    buildSolidColor,
    buildColorfulNormallyOn,
    buildDirection,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    resetSeq,
} from './dev/src/protocol.js';
import { KX500_KEYS, LAYOUT_SIZE } from './dev/src/layout.js';

// ════════════════════════════════════════════════════════════════════
// METADATA
// ════════════════════════════════════════════════════════════════════
const AUTHOR = 'RedFenix Estudio';
const DOCUMENTATION_URL = 'https://github.com/RedFenix-Estudio/KX-500-Plugin';
const DEVICE_NAME = 'Checkpoint KX-500 (NA-KB-1001)';

// Centros de cada key (SignalRGB necesita [x, y] como punto de control)
const LED_POSITIONS = KX500_KEYS.map((k) => [k.x + k.w / 2, k.y + k.h / 2]);
const LED_NAMES = KX500_KEYS.map((k) => k.name);

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

/**
 * Normaliza un paquete a REPORT_SIZE bytes.
 * Los heartbeats vienen en 4 bytes; los comandos de protocol.js ya
 * vienen en 64. Esto evita problemas con la longitud de HID reports.
 */
function ensureSize(pkt) {
    if (!pkt) return new Uint8Array(REPORT_SIZE);
    if (pkt.length === REPORT_SIZE) return pkt;
    const out = new Uint8Array(REPORT_SIZE);
    out.set(pkt.slice(0, Math.min(pkt.length, REPORT_SIZE)), 0);
    return out;
}

/**
 * Envía un paquete HID RGB envuelto en heartbeat START/END.
 */
function sendWrapped(packet) {
    try {
        device.write(ensureSize(buildHeartbeatStart()), REPORT_SIZE);
        device.write(ensureSize(packet), REPORT_SIZE);
        device.write(ensureSize(buildHeartbeatEnd()), REPORT_SIZE);
    } catch (err) {
        try { device.log(`[KX500] write error: ${err.message}`); } catch (_) { /* ignore */ }
    }
}

/**
 * Envía el handshake de inicialización.
 * El firmware del KX-500 espera este paquete antes de aceptar colores.
 */
function sendHandshake() {
    try {
        device.write(ensureSize(buildHeartbeatStart()), REPORT_SIZE);
        device.write(HANDSHAKE_PACKET, HANDSHAKE_PACKET.length);
        device.write(ensureSize(buildHeartbeatEnd()), REPORT_SIZE);
    } catch (err) {
        try { device.log(`[KX500] handshake error: ${err.message}`); } catch (_) { /* ignore */ }
    }
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return [0, 0, 0];
    return [
        parseInt(m[1], 16),
        parseInt(m[2], 16),
        parseInt(m[3], 16),
    ];
}

/**
 * Promedia el color de todos los LEDs del framebuffer de SignalRGB.
 * El KX-500 no expone per-key RGB directo (parece tener ~19 zonas
 * con blending interno), así que mandamos el promedio como solid color.
 */
function getAverageColor() {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (const pos of LED_POSITIONS) {
        try {
            const c = device.color(pos[0], pos[1]);
            r += c[0];
            g += c[1];
            b += c[2];
            n += 1;
        } catch (_) {
            // device.color puede fallar si la posición está fuera del canvas
        }
    }
    if (n === 0) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB SDK EXPORTS
// ════════════════════════════════════════════════════════════════════

/* global
device:readonly
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function Name() { return DEVICE_NAME; }
export function Publisher() { return AUTHOR; }
export function VendorId() { return VID; }
export function ProductId() { return [PID]; }
export function Type() { return 'hid'; }
export function DeviceType() { return 'keyboard'; }
export function Size() { return LAYOUT_SIZE; }
export function LedNames() { return LED_NAMES.slice(); }
export function LedPositions() { return LED_POSITIONS.map((p) => p.slice()); }
export function Documentation() { return DOCUMENTATION_URL; }
export function ImageUrl() {
    return 'https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png';
}

/**
 * Validación de endpoints. El KX-500 declara la interfaz RGB como
 * "HID Mouse" (bInterfaceProtocol = 0x02) para evitar problemas con
 * Windows, así que validamos por la combinación interface + endpoint.
 */
export function Validate(endpoint) {
    if (endpoint.usage_page === 0xFF1C && endpoint.usage === 0x0092) return true;
    if (endpoint.collection === 0x0004) return true;
    if (endpoint.interface === 1 && endpoint.endpoint === 0x03) return true;
    if (endpoint.interface === 1 && endpoint.endpoint_address === 0x03) return true;
    return false;
}

export function ControllableParameters() {
    return [
        {
            property: 'shutdownColor',
            group: 'lighting',
            label: 'Shutdown Color',
            type: 'color',
            default: '#000000',
        },
        {
            property: 'LightingMode',
            group: 'lighting',
            label: 'Lighting Mode',
            type: 'combobox',
            values: ['Canvas', 'Forced'],
            default: 'Canvas',
        },
        {
            property: 'forcedColor',
            group: 'lighting',
            label: 'Forced Color',
            type: 'color',
            default: '#009bde',
        },
    ];
}

export function ConflictingProcesses() {
    return ['Mechanical Keyboard.exe', 'HidServ.exe', 'CHECKPOINT_KX_500.exe'];
}

/**
 * Initialize se llama una vez cuando SignalRGB activa el plugin.
 * 1. Registra layout, nombre y dimensiones del teclado
 * 2. Resetea el SEQ counter
 * 3. Envía el handshake para que el firmware acepte comandos
 */
export function Initialize() {
    try {
        device.setName(DEVICE_NAME);
        device.setSize(LAYOUT_SIZE);
        device.setControllableLeds(LED_NAMES.slice(), LED_POSITIONS.map((p) => p.slice()));
        device.log(`[KX500] Registered: ${LED_NAMES.length} keys (${LAYOUT_SIZE[0]}x${LAYOUT_SIZE[1]})`);
        device.log(`[KX500] VID=0x${VID.toString(16)} PID=0x${PID.toString(16)} ReportSize=${REPORT_SIZE} ReportId=0x${REPORT_ID.toString(16)}`);
    } catch (err) {
        try { device.log(`[KX500] init setup error: ${err.message}`); } catch (_) { /* ignore */ }
    }

    // Resetear SEQ counter para que el firmware vea el handshake
    // desde el primer byte.
    resetSeq();

    // Handshake: el firmware lo necesita antes de aceptar cualquier
    // otro comando. Sin esto, ignora los output reports y sigue con
    // su animación por defecto (eso es exactamente lo que ves ahora).
    sendHandshake();

    try { device.log('[KX500] Handshake sent, ready for RGB commands'); } catch (_) { /* ignore */ }
}

/**
 * Render se llama periódicamente (SignalRGB suele llamar a 60fps).
 * Manda el color actual del framebuffer como solid color al KX-500.
 */
export function Render() {
    let r;
    let g;
    let b;

    if (typeof LightingMode !== 'undefined' && LightingMode === 'Forced') {
        const c = hexToRgb(forcedColor || '#009bde');
        r = c[0]; g = c[1]; b = c[2];
    } else {
        const avg = getAverageColor();
        r = avg[0]; g = avg[1]; b = avg[2];
    }

    sendWrapped(buildSolidColor(r, g, b));
}

/**
 * Shutdown se llama cuando SignalRGB se cierra o el sistema entra
 * en suspensión. Apagamos los LEDs (brightness 0) o seteamos el
 * color configurado por el usuario.
 */
export function Shutdown(SystemSuspending) {
    const hex = SystemSuspending ? '#000000' : (shutdownColor || '#000000');
    const [r, g, b] = hexToRgb(hex);

    // Negro puro → comando OFF (brightness 0). Para otros colores,
    // mandamos solid color (que en la práctica también los apaga
    // si la zona está en 0,0,0; pero OFF es más limpio y rápido).
    if (r + g + b < 30) {
        sendWrapped(buildOff());
    } else {
        sendWrapped(buildSolidColor(r, g, b));
    }
}

// ════════════════════════════════════════════════════════════════════
// RE-EXPORTS — para que tests u otras herramientas puedan usar
// el plugin como punto de entrada.
// ════════════════════════════════════════════════════════════════════
export {
    KX500_KEYS,
    LAYOUT_SIZE,
    VID,
    PID,
    REPORT_SIZE,
    REPORT_ID,
    HANDSHAKE_PACKET,
    buildOff,
    buildBrightness,
    buildSpeed,
    buildEffect,
    buildSolidColor,
    buildColorfulNormallyOn,
    buildDirection,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    sendWrapped,
    sendHandshake,
};
