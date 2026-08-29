/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  KX-500 SignalRGB Add-on v2.0.3                                 ║
 * ║  Checkpoint KX-500 (NA-KB-1001) — Full-size US ANSI, 104 keys    ║
 * ║                                                                  ║
 * ║  v2.0.3 — FIX: device.pause(100) en Initialize() + quitar         ║
 * ║           set_endpoint (firma incorrecta)                        ║
 * ║                                                                  ║
 * ║  HISTORIA del journey:                                           ║
 * ║    v0.5.1: device.write(64B) + device.pause(5/10) -> CONTROLABA   ║
 * ║           (firmware apagaba con brightness 0)                     ║
 * ║    v0.5.2: pad HANDSHAKE a 64 bytes (HID handle disconnects)     ║
 * ║    v0.6.1: QUITAR heartbeat (causaba ERROR_OPERATION_ABORTED)    ║
 * ║    v1.0.0: rewrite mio - HID pero sin device.pause -> 0x57     ║
 * ║    v1.2.0-1.7.0: intentos de control_transfer / rawusb -> NADA    ║
 * ║    v2.0.0: REVERT a v0.5.1 + fix byte 2 = 0x01                  ║
 * ║    v2.0.1: agregar handshake de 16 paquetes (CAUSO ERROR_OP_ABORTED)║
 * ║    v2.0.2: revertir a 1 solo handshake (v0.5.1)                  ║
 * ║    v2.0.3: device.pause(100) en Initialize + quitar set_endpoint  ║
 * ║                                                                  ║
 * ║  DIAGNOSTICO FINAL (2026-08-29 11:16):                          ║
 * ║    - El primer write (handshake) SIEMPRE funciona.                ║
 * ║    - El segundo write (brightness) falla con 0x3E3                ║
 * ║      ERROR_OPERATION_ABORTED.                                    ║
 * ║    - Causa: timing. Sin pausa entre writes, el dispositivo se    ║
 * ║      "desconecta" del bus USB (Windows cancela la operacion).    ║
 * ║    - Solucion: device.pause(100) entre writes en Initialize().   ║
 * ║    - En Render() (continuo) se mantiene pause(5) porque el        ║
 * ║      dispositivo ya esta "en sync" despues del Initialize.       ║
 * ║    - set_endpoint(0x03) QUITADO: la firma espera QJSValue, no    ║
 * ║      int. SignalRGB SDK ya configura el endpoint correcto         ║
 * ║      via el Validate() (FF1C:0092).                             ║
 * ║                                                                  ║
 * ║  Protocolo (confirmado por 16 capturas USBPcap + test Python):   ║
 * ║    - Type: "hid" (no rawusb)                                    ║
 * ║    - device.write(64B) a Output Report (Report ID 0x04)         ║
 * ║    - device.pause(100ms) en Initialize (warmup)                  ║
 * ║    - device.pause(5ms) en Render (continuo)                       ║
 * ║    - 1 HANDSHAKE + 1 brightness + 1 test color (3 paquetes)     ║
 * ║    - Sin heartbeat wrapper (causa ERROR_OPERATION_ABORTED)       ║
 * ║                                                                  ║
 * ║  Estructura del paquete (todos los 64B):                         ║
 * ║    [04] [SEQ] [CMD/DATA...] [pad 0x00]                           ║
 * ║                                                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ════════════════════════════════════════════════════════════════════
// HID
// ════════════════════════════════════════════════════════════════════
const VID = 0x320F;
const PID = 0x5008;
const REPORT_SIZE = 64;
const REPORT_ID = 0x04;

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════
// CRITICO: retornar REGULAR ARRAY, no Uint8Array.
// La SDK de SignalRGB hace marshaling a .NET que no acepta typed arrays.
// Si le pasas Uint8Array, device.write() falla con 0x57 ERROR_INVALID_PARAMETER
// porque el .NET wrapper no sabe cómo convertirlo a byte[].
function pad64(arr) {
    const out = Array.from(arr);  // copia como regular Array
    while (out.length < REPORT_SIZE) out.push(0x00);
    return out.slice(0, REPORT_SIZE);
}

// ════════════════════════════════════════════════════════════════════
// RAWUSB + bulk_transfer(endpoint=0x03, packet, 64)
// ════════════════════════════════════════════════════════════════════
// v1.8.0 — REAL FIX basado en análisis exhaustivo de las 16 capturas:
//
// CONFIRMADO por análisis de las capturas USBPcap del directorio
// "Captura de Wirseshark del teclado":
//   - NO hay SET_REPORT (bRequest=0x09) en NINGUNA captura
//   - NO hay control transfers HID (bmRequestType 0x21)
//   - El KX-500 habla EXCLUSIVAMENTE vía Output Reports en endpoint 0x03
//
// El "handshake" no es HID SET_REPORT — es simplemente el primer
// Output Report que el driver manda. El firmware espera ese primer
// paquete (04 A2 03 04 2C 00 00 00 55 AA ...) y DESPUÉS acepta los
// RGB data como Output Reports normales.
//
// v0.6.1 (commit del usuario) confirmó que el HEARTBEAT WRAPPER causa
// ERROR_OPERATION_ABORTED. Por eso este plugin NO usa heartbeat.
//
// v1.7.0 usaba control_transfer para hacer SET_REPORT — INCORRECTO.
// El device rechaza el control transfer (LIBUSB_ERROR_IO) porque el
// KX-500 no acepta HID SET_REPORT, solo Output Reports en bulk.
//
// v1.6.0 (rawusb + bulk_transfer) era el approach correcto en transporte,
// pero le faltaba eliminar el heartbeat wrapper y verificar que el
// handshake sea solo un Output Report más.
// ════════════════════════════════════════════════════════════════════

const KX500_OUT_ENDPOINT = 0x03;  // Interrupt OUT, 64B max (USBPcap confirmed)

// "Handshake" = primer Output Report. Visto en:
//   teclado_captura_todo.pcapng frame 1669
//   teclado_perfiles_guardados.pcapng frame 172
// 64 bytes exactos (43 bytes de data + 21 bytes padding 0x00)
// CRITICO: regular Array, no Uint8Array (mismo motivo que pad64)
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

// v2.0.2: NO incluir heartbeat. El driver oficial HidServ.dll lo hace
// internamente desde su worker thread, pero el plugin SignalRGB con
// HID overlapped I/O (async) satura el dispositivo y causa
// ERROR_OPERATION_ABORTED (995) + handle disconnect.
//
// v0.6.1 (commit del usuario) ya habia confirmado esto:
// "QUITAR heartbeat (causaba ERROR_OPERATION_ABORTED)"
//
// El handshake es SOLO el primer paquete. Los 15 START/END que veíamos
// en USBPcap los genera HidServ.dll desde su thread, no el firmware
// ni SignalRGB. Por eso NO debemos replicarlos desde el plugin.
// Sin el heartbeat, algunos firmwares quedan en estado "no inicializado" y descartan RGB data.
function buildHeartbeatPair(seq) {
    // seq debe ser par: 0=START, 1=END, 2=START, 3=END, ...
    const cmd = (seq % 2 === 0) ? 0x01 : 0x02;
    return pad64([REPORT_ID, cmd, 0x00, cmd]);
}

// ════════════════════════════════════════════════════════════════════
// COMANDOS — todos confirmados por captura individual
// ════════════════════════════════════════════════════════════════════

// Apagar todos los LEDs. Confirmado en 08_off.pcapng.
function buildOff() {
    return pad64([REPORT_ID, 0x08, 0x00, 0x06, 0x01, 0x01]);
}

// Brightness 0..4. SEQ = 0x08 + nivel. Nivel 0 = igual a buildOff().
function buildBrightness(level) {
    level = Math.max(0, Math.min(4, level | 0));
    if (level === 0) return buildOff();
    return pad64([REPORT_ID, 0x08 + level, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, level]);
}

// Solid color RGB. SEQ se mantiene entre 0x08 y 0xFF.
//
// FORMATO CORRECTO del driver real (visto en 01_solid_red, 02_solid_blue,
// 15_un_solo_color capturas):
//   04 [SEQ] 01 06 03 05 00 00 R G B
//
// BYTE 2 debe ser 0x01 (no 0x03 como tenia v0.5.1 por error).
// Eso era el bug del protocolo: el firmware ignoraba el solid color
// porque el byte 2 era incorrecto.
function buildSolidColor(r, g, b, seq) {
    const s = ((seq == null ? 0x08 : seq) & 0xFF);
    return pad64([REPORT_ID, s, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r & 0xFF, g & 0xFF, b & 0xFF]);
}

// Efecto nativo 1..19 (1-15 formato A, 16-19 formato B).
// SEQ = 0x08 + (effect - 1). Confirmado en 14_cambio_animaciones.
function buildEffect(n) {
    n = Math.max(1, Math.min(19, n | 0));
    const seq = 0x08 + (n - 1);
    if (n <= 15) return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, n]);
    return pad64([REPORT_ID, seq, 0x00, 0x06, 0x01, 0x11, 0x00, 0x00, n - 16]);
}

// SEQ counter local para buildSolidColor.
let _seq = 0x08;
function nextSeq() { const s = _seq; _seq = (_seq + 1) & 0xFF; return s; }

// ════════════════════════════════════════════════════════════════════
// WRITES con device.pause() — CLAVE para que el firmware responda
// ════════════════════════════════════════════════════════════════════
// v0.5.1+v0.5.2+v0.6.1 usaba device.pause(5-10ms) entre writes.
// Sin esto, el firmware del KX-500 se desconecta / ignora comandos.
// v1.0.0 mio quito los pauses -> HID handle 0x57
// v1.5.0+ con rawusb NO se enviaba nada (libusb OK pero firmware no respondia)

function writeOutput(packet) {
    try {
        device.write(packet, REPORT_SIZE);
    } catch (err) {
        try { device.log(`[KX500] write error: ${err.message}`); } catch (_) {}
    }
}

function writeHandshake() {
    try { device.log('[KX500] Sending handshake (1 packet)...'); } catch (_) {}
    // v2.0.2: SOLO 1 paquete. NO hacer heartbeat (causa ERROR_OPERATION_ABORTED).
    // v0.5.1 con un solo HANDSHAKE SÍ controlaba el teclado.
    writeOutput(HANDSHAKE);
    try { device.pause(100); } catch (_) {}  // v2.0.3: 100ms para warmup
    try { device.log('[KX500] Handshake sent'); } catch (_) {}
}

function writeRGBPacket(packet, pauseMs = 5) {
    writeOutput(packet);
    try { device.pause(pauseMs); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════
// LAYOUT — 104 keys full-size US ANSI
// ════════════════════════════════════════════════════════════════════
const LAYOUT = [
    // F0: Esc + F1-F12 + Print Screen + Scroll Lock + Pause
    ['Esc', 0, 0], ['F1', 2, 0], ['F2', 3, 0], ['F3', 4, 0], ['F4', 5, 0],
    ['F5', 6.5, 0], ['F6', 7.5, 0], ['F7', 8.5, 0], ['F8', 9.5, 0],
    ['F9', 11, 0], ['F10', 12, 0], ['F11', 13, 0], ['F12', 14, 0],
    ['Print Screen', 15.5, 0], ['Scroll Lock', 16.5, 0], ['Pause Break', 17.5, 0],
    // F1: ` 1-0 - = Backspace + Insert Home PgUp
    ['`', 0.5, 1], ['1', 1.5, 1], ['2', 2.5, 1], ['3', 3.5, 1], ['4', 4.5, 1],
    ['5', 5.5, 1], ['6', 6.5, 1], ['7', 7.5, 1], ['8', 8.5, 1], ['9', 9.5, 1],
    ['0', 10.5, 1], ['-', 11.5, 1], ['=', 12.5, 1], ['Backspace', 14, 1],
    ['Insert', 16, 1], ['Home', 17, 1], ['Page Up', 18, 1],
    // F2: Tab QWERTY [ ] \ + Del End PgDn
    ['Tab', 0.75, 2], ['Q', 2, 2], ['W', 3, 2], ['E', 4, 2], ['R', 5, 2], ['T', 6, 2],
    ['Y', 7, 2], ['U', 8, 2], ['I', 9, 2], ['O', 10, 2], ['P', 11, 2],
    ['[', 12, 2], [']', 13, 2], ['\\', 14.25, 2],
    ['Del', 16, 2], ['End', 17, 2], ['Page Down', 18, 2],
    // F3: Caps ASDFGHJKL ; ' Enter
    ['Caps Lock', 1.25, 3], ['A', 2.75, 3], ['S', 3.75, 3], ['D', 4.75, 3],
    ['F', 5.75, 3], ['G', 6.75, 3], ['H', 7.75, 3], ['J', 8.75, 3],
    ['K', 9.75, 3], ['L', 10.75, 3], [';', 11.75, 3], ["'", 12.75, 3],
    ['Enter', 14.25, 3],
    // F4: LShift ZXCVBNM , . / RShift + Up
    ['Left Shift', 1.5, 4], ['Z', 3.5, 4], ['X', 4.5, 4], ['C', 5.5, 4], ['V', 6.5, 4],
    ['B', 7.5, 4], ['N', 8.5, 4], ['M', 9.5, 4], [',', 10.5, 4], ['.', 11.5, 4],
    ['/', 12.5, 4], ['Right Shift', 14.75, 4], ['Up Arrow', 17, 4],
    // F5: Ctrl Win Alt Space Alt Win Menu Ctrl + Left Down Right
    ['Left Ctrl', 1.25, 5], ['Left Win', 2.5, 5], ['Left Alt', 3.75, 5],
    ['Space', 7, 5], ['Right Alt', 10.25, 5], ['Fn', 11.5, 5],
    ['Menu', 12.75, 5], ['Right Ctrl', 14.25, 5],
    ['Left Arrow', 16, 5], ['Down Arrow', 17, 5], ['Right Arrow', 18, 5],
    // Numpad
    ['NumLock', 20, 1], ['Num /', 21, 1], ['Num *', 22, 1], ['Num -', 23, 1],
    ['Num 7', 20, 2], ['Num 8', 21, 2], ['Num 9', 22, 2], ['Num +', 23, 2],
    ['Num 4', 20, 3], ['Num 5', 21, 3], ['Num 6', 22, 3],
    ['Num 1', 20, 4], ['Num 2', 21, 4], ['Num 3', 22, 4], ['Num Enter', 23, 4],
    ['Num 0', 20.5, 5], ['Num .', 22, 5],
];

const LED_NAMES = LAYOUT.map((k) => k[0]);
const LED_POSITIONS = LAYOUT.map((k) => [k[1], k[2]]);
const SIZE = [24, 6];

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
        } catch (_) { /* fuera de canvas */ }
    }
    if (n === 0) return [0, 0, 0];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// ════════════════════════════════════════════════════════════════════
// SIGNALRGB EXPORTS
// ════════════════════════════════════════════════════════════════════

/* global
device:readonly
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function Name() { return 'Checkpoint KX-500 (NA-KB-1001)'; }
export function Publisher() { return 'RedFenix Estudio'; }
export function VendorId() { return VID; }
export function ProductId() { return [PID]; }
export function Type() { return 'hid'; }  // <- REVERTIDO a "hid" (no rawusb)
export function DeviceType() { return 'keyboard'; }
export function Size() { return SIZE; }
export function LedNames() { return LED_NAMES.slice(); }
export function LedPositions() { return LED_POSITIONS.map((p) => p.slice()); }
export function Documentation() { return 'https://github.com/RedFenix-Estudio/KX-500-Plugin'; }
export function ImageUrl() {
    return 'https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/assets/KX-500.png';
}

/**
 * Validate — confirmado con log real de SignalRGB.
 *
 * El RGB del KX-500 está en la TLC Vendor Defined (FF1C:0092) en
 * la interface 1, collection 0x0004. La interface está declarada
 * por el fabricante como "Mouse" (bInterfaceProtocol=0x02) pero
 * internamente tiene los endpoints 0x82 IN y 0x03 OUT.
 */
export function Validate(endpoint) {
    if (endpoint.interface === 1
        && endpoint.usage_page === 0xFF1C
        && endpoint.usage === 0x0092) {
        return true;
    }
    return false;
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

/**
 * Initialize — v2.0.2: revert a handshake simple (como v0.5.1)
 *
 * Secuencia:
 * 1. set_endpoint(0x03)                   — explícitamente seleccionar el OUT
 * 2. handshake (1 Output Report 64B)      — abre la "conversacion" con firmware
 * 3. pause(10)
 * 4. brightness MAX (level 4)             — fundamental, sino firmware queda en 0
 * 5. pause(10)
 * 6. color test (azul)                    — opcional, confirma que responde
 *
 * v2.0.2: NO hacer heartbeat de 15 paquetes. Causa ERROR_OPERATION_ABORTED (995)
 * en SignalRGB SDK que usa HID overlapped I/O. v0.5.1 con 1 solo handshake
 * SÍ controlaba el teclado.
 */
export function Initialize() {
    try {
        device.setName('Checkpoint KX-500 (NA-KB-1001)');
        device.setSize(SIZE);
        device.setControllableLeds(LED_NAMES.slice(), LED_POSITIONS.map((p) => p.slice()));
        device.log(`[KX500] Registered ${LED_NAMES.length} keys (${SIZE[0]}x${SIZE[1]})`);
        device.log(`[KX500] Protocol: HID Output Report 64B + device.pause() between writes`);
    } catch (err) {
        try { device.log(`[KX500] init error: ${err.message}`); } catch (_) {}
    }

    // v2.0.3: set_endpoint(0x03) QUITADO. La firma espera QJSValue, no int.
    // SignalRGB SDK ya configura el endpoint correcto via el Validate() (FF1C:0092).
    // La llamada incorrecta causaba "Unable to determine callable overload" y
    // probablemente contribua a los errores 995.

    _seq = 0x08;

    // 1) Handshake (con pausa 100ms para warmup del dispositivo)
    writeHandshake();

    // 2) Brightness MAX (sin esto el firmware se queda en brightness 0 = apagado)
    try { device.log('[KX500] Setting brightness MAX (level 4)...'); } catch (_) {}
    writeRGBPacket(buildBrightness(4), 100);  // v2.0.3: 100ms entre writes en init

    // 3) Color test (azul) — confirma que el firmware responde
    try { device.log('[KX500] Sending test color (blue)...'); } catch (_) {}
    writeRGBPacket(buildSolidColor(0, 0, 0xFF, nextSeq()), 100);

    try { device.log('[KX500] Init complete'); } catch (_) {}
}

/**
 * Render — manda el color actual del framebuffer
 * v0.5.1/v0.6.1: throttle opcional cada N frames para no saturar USB
 */
let _renderCounter = 0;
let _lastLogTs = 0;
function throttledLog(msg) {
    const now = Date.now();
    if (now - _lastLogTs > 2000) {
        _lastLogTs = now;
        try { device.log(`[KX500] ${msg}`); } catch (_) {}
    }
}

export function Render() {
    _renderCounter++;
    let r, g, b;
    if (typeof LightingMode !== 'undefined' && LightingMode === 'Forced') {
        [r, g, b] = hexToRgb(forcedColor || '#009bde');
    } else {
        [r, g, b] = getAverageColor();
    }
    throttledLog(`Render #${_renderCounter}: RGB=(${r},${g},${b})`);
    writeRGBPacket(buildSolidColor(r, g, b, nextSeq()));
}

export function Shutdown(suspending) {
    const hex = suspending ? '#000000' : (shutdownColor || '#000000');
    const [r, g, b] = hexToRgb(hex);
    writeRGBPacket((r + g + b < 30) ? buildOff() : buildSolidColor(r, g, b, nextSeq()));
}
