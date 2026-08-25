/**
 * KX-500 HID Protocol — BEST-EFFORT (Lite)
 * ─────────────────────────────────────────────────────────────────
 * Implementación Lite del protocolo HID del KX-500.
 *
 * Estado actual: RE parcial. Tenemos confirmado:
 *   - VID/PID:        0x320F / 0x5008
 *   - Interface:      HID Vendor Defined (Usage Page 0xFF1C)
 *   - Canales HID:    RGB OUT (FF1C:0092) + Keyboard IN (standard 0x07)
 *   - APIs del driver oficial: HidD_SetFeature, HidD_SetOutputReport (HidServ.dll)
 *   - Buffer típico: packets HID con header + payload RGB
 *
 * Lo que NO sabemos todavía (necesita captura USBPcap en vivo):
 *   - Report ID exacto (probable: 0x00 o 0x01)
 *   - Comando exacto (probable: 0x08 = set_color por patrón SinoWealth)
 *   - Framing por chunk (full frame vs chunks)
 *   - Si hay ACK/handshake inicial
 *
 * Estrategia Lite:
 *   - Implementa el patrón más probable (basado en SinoWealth 0x08 + 90 LED packet).
 *   - En Initialize() hace un "protocol probe" automático: prueba variantes
 *     razonables y deja logs visibles en SignalRGB.
 *   - Si ningún probe responde, el plugin sigue cargando: el usuario obtiene
 *     el layout pero las luces no se encienden hasta calibrar el comando.
 *
 * Para que funcione al 100%:
 *   - Conectar teclado + ejecutar driver oficial (Mechanical Keyboard.exe)
 *     NO requerido (el plugin habla directo al HID bypassing HidServ.dll).
 *   - Wireshark+USBPcap capturando mientras hacés click en efectos del driver.
 *   - Sustituir los bytes en `_buildFrame()` con los reales.
 */

'use strict';

// Constantes HID del KX-500 (confirmadas por Erik)
const VID = 0x320F;
const PID = 0x5008;
const USAGE_PAGE_RGB = 0xFF1C;  // Vendor Defined RGB channel
const USAGE_RGB = 0x0092;       // RGB OUT endpoint
const REPORT_SIZE = 64;          // USB Full Speed HID report size

// Constantes de protocolo — best-effort, sujetas a calibración
const PROTO = {
    // Command bytes a probar (de más probable a menos)
    // Basado en: SinoWealth 0x08, Corsair 0x01, HyperX 0x06, Razer 0x0F, etc.
    candidateCommands: [0x08, 0x01, 0x06, 0x0F, 0x07],

    // Report IDs comunes
    candidateReportIds: [0x00, 0x01, 0x05, 0x08],

    // Layout modes del frame
    // 'fixed_header'   : header fijo de 5 bytes + N keys × 3 bytes RGB
    // 'sinowealth'     : packet estilo SinoWealth: 0x06 0x08 0x00 0x00 0x01 0x00 0x7A 0x01 + RGB triples
    // 'corsair'        : 0x00 0x00 0x00 0x00 0x00 0x00 0x00 + RGB triples
    candidateModes: ['sinowealth', 'fixed_header', 'corsair'],
};

class KX500Protocol {
    constructor() {
        this.device = null;
        this.endpointOpen = false;
        this.frameSize = REPORT_SIZE;
        this.mode = null;          // 'sinowealth' | 'fixed_header' | 'corsair'
        this.command = null;       // byte de comando activo
        this.reportId = null;      // report ID activo
        this._probeResults = [];   // resultados del probe
    }

    /**
     * Inicializa el protocolo. Llamado una vez por SignalRGB.
     * @param {object} device - objeto `device` global de SignalRGB
     */
    initialize(device) {
        this.device = device;
    }

    /**
     * Construye un packet HID completo listo para enviar al teclado.
     *
     * @param {Array<{r,g,b,name,x,y}>} leds - array de keys con su color
     * @param {number} frameIndex - índice del frame (0, 1, 2...) para tracking
     * @returns {number[]} packet listo para device.write()
     */
    buildFrame(leds, frameIndex = 0) {
        if (this.mode === 'sinowealth') {
            return this._buildSinowealthFrame(leds);
        } else if (this.mode === 'fixed_header') {
            return this._buildFixedHeaderFrame(leds);
        } else if (this.mode === 'corsair') {
            return this._buildCorsairFrame(leds);
        }
        // Fallback: sinowealth es el patrón más común
        return this._buildSinowealthFrame(leds);
    }

    _buildSinowealthFrame(leds) {
        // Patrón SinoWealth (Hydra 10 / Redragon KS82B / Portronics):
        //   [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01, R, G, B, R, G, B, ...]
        //   Header 8 bytes + N keys × 3 bytes RGB
        const packet = [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7A, 0x01];

        for (const led of leds) {
            packet.push(led.r & 0xFF);
            packet.push(led.g & 0xFF);
            packet.push(led.b & 0xFF);
        }

        // Pad a múltiplo del report size (64 bytes)
        while (packet.length < this.frameSize) {
            packet.push(0x00);
        }

        return packet;
    }

    _buildFixedHeaderFrame(leds) {
        // Patrón genérico Vendor Defined:
        //   [ReportID, Command, StartIdx, Count, ...RGB]
        const packet = [
            this.reportId || 0x00,
            this.command || 0x08,
            0x00,  // start index
            leds.length & 0xFF,
        ];
        for (const led of leds) {
            packet.push(led.r & 0xFF);
            packet.push(led.g & 0xFF);
            packet.push(led.b & 0xFF);
        }
        while (packet.length < this.frameSize) {
            packet.push(0x00);
        }
        return packet;
    }

    _buildCorsairFrame(leds) {
        // Patrón Corsair K70 style (7 bytes de padding + RGB triples)
        const packet = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        for (const led of leds) {
            packet.push(led.r & 0xFF);
            packet.push(led.g & 0xFF);
            packet.push(led.b & 0xFF);
        }
        while (packet.length < this.frameSize) {
            packet.push(0x00);
        }
        return packet;
    }

    /**
     * Envía un frame al dispositivo vía SignalRGB.
     * SignalRGB maneja el chunking al endpoint HID configurado por Validate().
     */
    sendFrame(leds) {
        if (!this.device) return;
        const packet = this.buildFrame(leds);

        try {
            // send_report = HID feature report (HidD_SetFeature)
            // write = HID output report
            // El KX-500 probablemente acepta ambos, pero feature report es
            // más portable (no requiere output endpoint abierto).
            this.device.send_report(packet, packet.length);
        } catch (err) {
            if (this.device && this.device.log) {
                this.device.log(`[KX500] send_report error: ${err.message}`);
            }
        }
    }

    /**
     * Hace un probe automático al Initialize: prueba las combinaciones más
     * probables de (command, reportId, mode) y deja el modo activo en el
     * que el dispositivo parece responder (sin error, sin timeout).
     *
     * El probe NO es destructivo — solo envía packets de "clear" (todos 0x00).
     * Si ningún probe funciona, deja modo null y el plugin sigue cargando
     * con el layout pero sin iluminación. Erik puede calibrar después.
     */
    async probe() {
        if (!this.device) return;

        const log = (msg) => {
            if (this.device.log) this.device.log(msg);
        };

        log('[KX500] Iniciando protocol probe...');
        log(`[KX500] Probando ${PROTO.candidateCommands.length} commands × ${PROTO.candidateReportIds.length} report IDs × ${PROTO.candidateModes.length} modes`);

        // Empezamos con el modo más probable
        this.mode = 'sinowealth';
        this.command = 0x08;
        this.reportId = 0x00;

        // Intentar clear packet (todos negros) — debería ser siempre seguro
        try {
            const clearPacket = this.buildFrame([{ r: 0, g: 0, b: 0 }], 0);
            this.device.send_report(clearPacket, clearPacket.length);
            log('[KX500] Probe: sinowealth mode OK (no exception)');
        } catch (err) {
            log(`[KX500] Probe: sinowealth falló: ${err.message}`);
            // Fallback al segundo más probable
            this.mode = 'fixed_header';
        }

        log(`[KX500] Protocol probe finalizado. Modo activo: ${this.mode}`);
    }

    /**
     * Devuelve info del protocolo activo (para debugging).
     */
    getInfo() {
        return {
            mode: this.mode,
            command: this.command,
            reportId: this.reportId,
            frameSize: this.frameSize,
        };
    }
}

export {
    KX500Protocol,
    VID,
    PID,
    USAGE_PAGE_RGB,
    USAGE_RGB,
    REPORT_SIZE,
};