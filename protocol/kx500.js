/**
 * KX-500 HID Protocol Implementation
 *
 * Encapsula toda la comunicación con el canal HID Vendor Defined (FF1C:0092)
 * del KX-500. Esta capa es la ÚNICA que conoce los bytes crudos del protocolo;
 * el resto del plugin habla en términos de pixeles (RGB triples).
 *
 * ⚠️ ESTADO: vacío. Se llena cuando terminemos el RE con USBPcap.
 * Ver examples/wireshark-capture-guide.md para el procedimiento.
 */

'use strict';

// Lazy-load de node-hid para que el plugin pueda cargarse aunque no esté
// instalado (ej: smoke test, o entornos sin teclado conectado).
let _HID = null;
function getHID() {
    if (!_HID) {
        _HID = require('node-hid');
    }
    return _HID;
}

class KX500Protocol {
    constructor({ vendorId, productId, usagePage, usage }) {
        this.vendorId = vendorId;
        this.productId = productId;
        this.usagePage = usagePage;
        this.usage = usage;
        this.device = null;
    }

    /**
     * Abre el dispositivo HID. Lanza si no se encuentra.
     */
    open() {
        const HID = getHID();
        const devices = HID.devices(this.vendorId, this.productId);
        if (!devices || devices.length === 0) {
            throw new Error(
                `KX-500 not found (VID=0x${this.vendorId.toString(16)}, ` +
                `PID=0x${this.productId.toString(16)}). ` +
                `¿Está conectado y el driver oficial cargado?`
            );
        }

        // Buscamos el device que matchea usagePage/usage del canal RGB
        const target = devices.find(d => d.usagePage === this.usagePage && d.usage === this.usage)
            || devices[0]; // fallback: el primero

        this.device = new HID.HID(target.path);
        console.log(`[KX500] Opened HID device: ${target.path}`);
    }

    /**
     * Cierra el dispositivo HID.
     */
    close() {
        if (this.device) {
            try {
                this.device.close();
            } catch (err) {
                console.warn('[KX500] close() warning:', err.message);
            }
            this.device = null;
        }
    }

    /**
     * Envía un frame completo al teclado.
     * @param {number[][][]} frame - frame[row][col] = [r, g, b]
     *
     * TODO: implementar después del RE.
     * Por ahora: stub que no hace nada.
     */
    sendFrame(frame) {
        if (!this.device) return;

        // PLACEHOLDER: no sabemos aún cómo el driver empaqueta el frame.
        // Probablemente hay que:
        //   1. Convertir el frame a un buffer lineal de bytes
        //   2. Partirlo en chunks del tamaño del report HID (típico 64 bytes)
        //   3. Enviar cada chunk con un header específico
        //
        // Esto se llena con la info de la captura USBPcap.

        // this.device.write(buffer);
    }

    /**
     * Envía un comando crudo (para efectos especiales, save to memory, etc).
     * PLACEHOLDER.
     */
    sendCommand(bytes) {
        if (!this.device) return;
        // PLACEHOLDER
        // this.device.write(bytes);
    }
}

module.exports = KX500Protocol;
