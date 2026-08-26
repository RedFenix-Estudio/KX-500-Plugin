/**
 * KX-500 HID Protocol — Real implementation
 * ─────────────────────────────────────────────────────────────────
 * Basado en captura USBPcap+Wireshark del 2026-08-26.
 *
 * Hallazgos confirmados:
 *   - Transporte: HID Output Reports (NO Feature Reports)
 *   - Endpoint: 0x03 OUT (Interrupt), interface 1 (declarado "HID Mouse")
 *   - Tamaño: 64 bytes por paquete
 *   - Report ID: 0x04 (fijo, primer byte)
 *   - Estructura: [0x04] [CMD] [PARAMS...] [pad 0x00]
 *   - Heartbeat: [04 01 00 01] START ... [04 02 00 02] END alrededor de cada cmd
 *   - Magic: 0x55AA en handshake (con VID/PID embedded)
 *
 * Lo que NO está confirmado aún (necesita capturas individuales):
 *   - Comando exacto para "per-key color"
 *   - Comando exacto para "brightness up/down"
 *   - Formato exacto del RGB data packed (16 triplets vs otros)
 *   - Comandos para efectos (breathing/wave/etc.)
 */

'use strict';

// Constantes HID
const VID = 0x320F;
const PID = 0x5008;
const RGB_INTERFACE = 1;
const RGB_EP_OUT = 0x03;
const REPORT_SIZE = 64;
const REPORT_ID = 0x04;

// Comandos identificados
const CMD = {
    HB_START: 0x01,        // START heartbeat
    HB_END: 0x02,          // END heartbeat
    SOLID_COLOR: 0x22,     // set solid color (best-guess)
    PATTERN: 0x17,         // pattern/brightness (best-guess)
    HANDSHAKE: 0xA2,       // device init
};

// Magic constants dentro del payload
const MAGIC = {
    HB_START_PARAMS: [0x00, 0x01],
    HB_END_PARAMS: [0x00, 0x02],
    COLOR_PREFIX: [0x12, 0x11, 0x36, 0x00, 0x00, 0x00, 0x00],  // [param=0x12, 0x11, 0x36, padding]
};

// Handshake packet (visto 3x en captura inicial)
const HANDSHAKE_PACKET = new Uint8Array([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14
]);

/**
 * Construye un paquete HID RGB de 64 bytes.
 * @param {number} cmd - byte de comando
 * @param {number[]} params - parámetros (sin Report ID)
 * @returns {Uint8Array} paquete de 64 bytes
 */
function buildPacket(cmd, params = []) {
    const packet = new Uint8Array(REPORT_SIZE);
    packet[0] = REPORT_ID;
    packet[1] = cmd & 0xFF;
    for (let i = 0; i < params.length && i + 2 < REPORT_SIZE; i++) {
        packet[2 + i] = params[i] & 0xFF;
    }
    // Padding con 0x00 (ya está por defecto)
    return packet;
}

/**
 * Construye heartbeat START packet.
 */
function buildHeartbeatStart() {
    return new Uint8Array([REPORT_ID, CMD.HB_START, 0x00, 0x01]);
}

/**
 * Construye heartbeat END packet.
 */
function buildHeartbeatEnd() {
    return new Uint8Array([REPORT_ID, CMD.HB_END, 0x00, 0x02]);
}

/**
 * Construye un paquete de "solid color" (todos los keys del mismo color).
 *
 * Basado en captura mixta: `04 22 12 11 36 00 00 00 00 FF 00 00 FF 00 00 ...`
 * Estructura probable:
 *   [04 22 12 11 36 00 00 00 00] [RGB triplets × zoneCount]
 *
 * @param {number} r,g,b - color 0..255
 * @param {Object} [opts]
 * @param {number} [opts.zoneCount=16] - cantidad de zonas (16 visto en captura)
 * @param {number} [opts.param=0x12] - byte de parámetro
 * @returns {Uint8Array}
 */
function buildSolidColor(r, g, b, opts = {}) {
    const { zoneCount = 16, param = 0x12 } = opts;
    const packet = new Uint8Array(REPORT_SIZE);
    packet[0] = REPORT_ID;
    packet[1] = CMD.SOLID_COLOR;
    packet[2] = param & 0xFF;
    packet[3] = 0x11;
    packet[4] = 0x36;
    // packet[5..8] = 0x00 (padding)
    for (let i = 0; i < zoneCount; i++) {
        const offset = 9 + i * 3;
        if (offset + 2 < REPORT_SIZE) {
            packet[offset] = r & 0xFF;
            packet[offset + 1] = g & 0xFF;
            packet[offset + 2] = b & 0xFF;
        }
    }
    return packet;
}

/**
 * Construye paquete de shutdown (todos los LEDs apagados).
 */
function buildShutdown() {
    return buildSolidColor(0, 0, 0, { param: 0x00 });
}

/**
 * Codifica un color RGB (r,g,b 0..255) en triplet packed (3 bytes).
 */
function colorToTriplet(r, g, b) {
    return [r & 0xFF, g & 0xFF, b & 0xFF];
}

/**
 * Verifica que un paquete tenga estructura válida (Report ID 0x04).
 * Acepta paquetes cortos (heartbeat de 4 bytes) o completos (64 bytes).
 */
function isValidPacket(packet) {
    if (!(packet instanceof Uint8Array)) return false;
    if (packet.length < 2) return false;
    if (packet[0] !== REPORT_ID) return false;
    return true;
}

/**
 * Verifica que un paquete sea de tamaño completo (64 bytes).
 */
function isFullPacket(packet) {
    return packet instanceof Uint8Array && packet.length === REPORT_SIZE;
}

/**
 * Extrae metadata de un paquete (cmd + params).
 * Acepta paquetes cortos (heartbeat) o completos.
 */
function parsePacket(packet) {
    if (!isValidPacket(packet)) return null;
    const cmd = packet[1];
    const params = Array.from(packet.slice(2));
    return {
        cmd,
        params,
        isHeartbeatStart: cmd === CMD.HB_START,
        isHeartbeatEnd: cmd === CMD.HB_END,
        isFullPacket: isFullPacket(packet),
    };
}

export {
    VID,
    PID,
    RGB_INTERFACE,
    RGB_EP_OUT,
    REPORT_SIZE,
    REPORT_ID,
    CMD,
    MAGIC,
    HANDSHAKE_PACKET,
    buildPacket,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    buildSolidColor,
    buildShutdown,
    colorToTriplet,
    isValidPacket,
    isFullPacket,
    parsePacket,
};
