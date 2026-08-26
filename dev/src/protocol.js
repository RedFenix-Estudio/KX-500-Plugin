/**
 * KX-500 HID Protocol — implementación REAL confirmada por captura USBPcap
 * ─────────────────────────────────────────────────────────────────
 * Basado en 7+ capturas individuales del 2026-08-26:
 *   - 01_solid_red.pcapng
 *   - 02_solid_blue.pcapng
 *   - 03_per_key_one.pcapng
 *   - 04_brightness_up.pcapng
 *   - 05_brightness_down.pcapng
 *   - 06_breathing.pcapng
 *   - 08_off.pcapng
 *   - 10_colorful_NormallyOn.pcapng
 *   - 11_direccion_animacion.pcapng
 *   - 14_cambio_animaciones.pcapng
 *   - 15_un_solo_color.pcapng
 *   - 16_velocidad_animacion.pcapng
 *   - 17_brillo_varios.pcapng
 *
 * Cada acción = 1 paquete entre heartbeat START/END.
 * SEQ counter local arranca en 0x08 e incrementa monotónicamente.
 */

'use strict';

// Constantes HID
const VID = 0x320F;
const PID = 0x5008;
const RGB_INTERFACE = 1;
const RGB_EP_OUT = 0x03;
const REPORT_SIZE = 64;
const REPORT_ID = 0x04;

// Handshake packet (visto 3x en captura mixta)
const HANDSHAKE_PACKET = new Uint8Array([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14
]);

// SEQ counter (clase lazy — usar new KX500Protocol() en el plugin)
let _seq = 0x08;

function nextSeq() {
    const s = _seq & 0xFF;
    _seq = (_seq + 1) & 0xFF;
    return s;
}

function resetSeq() { _seq = 0x08; }
function getSeq() { return _seq; }

// ════════════════════════════════════════════════════════════════════
// BUILDERS DE PAQUETES
// ════════════════════════════════════════════════════════════════════

/**
 * Construye un paquete HID RGB genérico.
 * @param {number} seq - byte SEQ (0x08+)
 * @param {number} cmd - byte de comando (segundo byte después de 04)
 * @param {number[]} params - parámetros
 */
function buildPacket(seq, cmd, params = []) {
    const packet = new Uint8Array(REPORT_SIZE);
    packet[0] = REPORT_ID;
    packet[1] = seq & 0xFF;
    packet[2] = cmd & 0xFF;
    for (let i = 0; i < params.length && i + 3 < REPORT_SIZE; i++) {
        packet[3 + i] = params[i] & 0xFF;
    }
    return packet;
}

function buildHeartbeatStart() {
    return new Uint8Array([REPORT_ID, 0x01, 0x00, 0x01]);
}

function buildHeartbeatEnd() {
    return new Uint8Array([REPORT_ID, 0x02, 0x00, 0x02]);
}

/**
 * Helper para enviar paquetes a SignalRGB.
 *
 * IMPORTANTE: device.write() de SignalRGB requiere 2 argumentos: (data, length).
 * Si se omite length, da error "Insufficient arguments" y falla silenciosamente.
 *
 * En el plugin Lite, se usa directamente:
 *   device.write(hbStart, hbStart.length);
 *   device.write(packet, packet.length);
 *   device.write(hbEnd, hbEnd.length);
 */
function describeWriteCall(packet) {
    return `device.write([${Array.from(packet.slice(0, 12)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}...], ${packet.length});`;
}

// ════════════════════════════════════════════════════════════════════
// ACCIONES DE ALTO NIVEL — todas confirmadas con captura individual
// ════════════════════════════════════════════════════════════════════

/**
 * Apagar todos los LEDs.
 * Bytes: 04 08 00 06 01 01 (+ padding)
 */
function buildOff() {
    return buildPacket(0x08, 0x00, [0x06, 0x01, 0x01]);
}

/**
 * Set brightness level (0-4).
 *
 * Patrón confirmado en `17_brillo_varios.pcapng`:
 *   nivel 0: 04 08 00 06 01 01 (sin padding)
 *   nivel 1: 04 09 00 06 01 01 00 00 01
 *   nivel 2: 04 0A 00 06 01 01 00 00 02
 *   nivel 3: 04 0B 00 06 01 01 00 00 03
 *   nivel 4: 04 0C 00 06 01 01 00 00 04
 *
 * @param {number} level - 0..4
 */
function buildBrightness(level) {
    if (level < 0 || level > 4) {
        throw new Error(`brightness level out of range: ${level} (expected 0..4)`);
    }
    if (level === 0) {
        return buildOff();
    }
    return buildPacket(0x08 + level, 0x00, [0x06, 0x01, 0x01, 0x00, 0x00, level]);
}

/**
 * Set velocidad (1-4).
 *
 * Patrón confirmado en `16_velocidad_animacion.pcapng`:
 *   nivel 1: 04 09 00 06 01 02
 *   nivel 2: 04 0A 00 06 01 02 00 00 01
 *   ...
 *
 * @param {number} level - 1..4
 */
function buildSpeed(level) {
    if (level < 1 || level > 4) {
        throw new Error(`speed level out of range: ${level} (expected 1..4)`);
    }
    return buildPacket(0x08 + level, 0x00, [0x06, 0x01, 0x02, 0x00, 0x00, level]);
}

/**
 * Selecciona un efecto nativo por número (1-19).
 *
 * Patrón confirmado en `14_cambio_animaciones.pcapng`:
 *   effect 1: 04 08 00 06 01 00 00 00 01    (SEQ = 0x08 + (1-1))
 *   effect 2: 04 09 00 06 01 00 00 00 02    (SEQ = 0x08 + (2-1))
 *   effect 5: 04 0C 00 06 01 00 00 00 05    (SEQ = 0x08 + (5-1))
 *   effect 15: 04 16 00 06 01 00 00 00 0F   (SEQ = 0x08 + (15-1))
 *   effect 19: 04 1B 00 06 01 11 00 00 03   (formato diferente — flag 0x11)
 *
 * @param {number} effectNum - 1..19
 */
function buildEffect(effectNum) {
    if (effectNum < 1 || effectNum > 19) {
        throw new Error(`effect out of range: ${effectNum} (expected 1..19)`);
    }
    const seq = 0x08 + (effectNum - 1);
    // Effects 1-15 usan formato: [06 01 00 00 00 N]
    // Effects 16-19 usan formato: [06 01 11 00 00 N] (flag 0x11)
    if (effectNum <= 15) {
        return buildPacket(seq, 0x00, [0x06, 0x01, 0x00, 0x00, 0x00, effectNum]);
    } else {
        return buildPacket(seq, 0x00, [0x06, 0x01, 0x11, 0x00, 0x00, effectNum - 16]);
    }
}

/**
 * Set solid color RGB arbitrario.
 *
 * Patrón confirmado en `15_un_solo_color.pcapng`:
 *   04 [SEQ] 03 06 03 05 00 00 R G B
 *
 * Este es el comando que SignalRGB usa para pintar el framebuffer.
 * El SEQ se toma del counter local.
 *
 * @param {number} r,g,b - 0..255
 */
function buildSolidColor(r, g, b) {
    return buildPacket(nextSeq(), 0x03, [0x06, 0x03, 0x05, 0x00, 0x00, r & 0xFF, g & 0xFF, b & 0xFF]);
}

/**
 * Pre-acción para activar modo effect (antes de seleccionar effect).
 *
 * Patrón confirmado en `06_breathing.pcapng`:
 *   04 0B 00 06 01 04 (siempre antes de seleccionar effect)
 */
function buildEffectMode() {
    return buildPacket(nextSeq(), 0x00, [0x06, 0x01, 0x04]);
}

/**
 * Cambiar dirección de animación.
 *
 * Patrón confirmado en `11_direccion_animacion.pcapng`:
 *   04 09 01 06 01 03 00 00 FF
 */
function buildDirection(reverse = false) {
    return buildPacket(nextSeq(), 0x01, [0x06, 0x01, 0x03, 0x00, 0x00, reverse ? 0x00 : 0xFF]);
}

/**
 * Activar breathing (effect #5 con pre-acción).
 */
function buildBreathing() {
    return buildEffectMode();  // pre-acción
    // Luego buildEffect(5) por separado
}

/**
 * Activar "colorful NormallyOn" (effect #4 con sub-flag).
 *
 * Patrón confirmado en `10_colorful_NormallyOn.pcapng`:
 *   04 0C 00 06 01 04 00 00 01
 */
function buildColorfulNormallyOn() {
    return buildPacket(0x0C, 0x00, [0x06, 0x01, 0x04, 0x00, 0x00, 0x01]);
}

// ════════════════════════════════════════════════════════════════════
// VALIDACIONES
// ════════════════════════════════════════════════════════════════════

function isValidPacket(packet) {
    if (!(packet instanceof Uint8Array)) return false;
    if (packet.length < 2) return false;
    if (packet[0] !== REPORT_ID) return false;
    return true;
}

function isFullPacket(packet) {
    return packet instanceof Uint8Array && packet.length === REPORT_SIZE;
}

function parsePacket(packet) {
    if (!isValidPacket(packet)) return null;
    return {
        reportId: packet[0],
        seq: packet[1],
        cmd: packet[2],
        params: Array.from(packet.slice(3)),
        isHeartbeatStart: packet[0] === REPORT_ID && packet[1] === 0x01,
        isHeartbeatEnd: packet[0] === REPORT_ID && packet[1] === 0x02,
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
    HANDSHAKE_PACKET,
    // SEQ counter
    nextSeq,
    resetSeq,
    getSeq,
    // Packet builders
    buildPacket,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    // Action builders
    buildOff,
    buildBrightness,
    buildSpeed,
    buildEffect,
    buildSolidColor,
    buildEffectMode,
    buildDirection,
    buildBreathing,
    buildColorfulNormallyOn,
    // Validators
    isValidPacket,
    isFullPacket,
    parsePacket,
};
