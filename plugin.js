/**
 * KX-500 SignalRGB Plugin — Entry Point
 *
 * SignalRGB instancia esta clase cuando el usuario carga el plugin.
 * El ciclo de vida es: initialize() → render() (loop) → shutdown().
 *
 * Basado en arquitectura de Hydra 10 plugin (MRtojisan/portronics-hydra-10-SignalRGB-Plugin).
 */

'use strict';

const KX500Device = require('./device');
const KX500Protocol = require('./protocol/kx500');

class KX500SignalRGBPlugin {
    constructor() {
        this.device = null;
        this.protocol = null;
    }

    /**
     * SignalRGB llama esto una vez al cargar el plugin.
     * Acá deberíamos:
     *   1. Abrir el dispositivo HID
     *   2. Registrar el layout del teclado
     *   3. Devolver el objeto device a SignalRGB
     */
    initialize() {
        try {
            this.protocol = new KX500Protocol({
                vendorId: 0x320F,
                productId: 0x5008,
                usagePage: 0xFF1C,
                usage: 0x0092,
            });

            this.protocol.open();

            this.device = new KX500Device(this.protocol);

            // Devolvemos el "device" que SignalRGB va a manejar
            return this.device;
        } catch (err) {
            // Log + throw para que SignalRGB muestre el error en la UI
            console.error('[KX500] initialize() failed:', err);
            throw err;
        }
    }

    /**
     * SignalRGB llama esto en cada frame (~60fps).
     * Acá leemos el estado actual del framebuffer del device
     * y lo mandamos al teclado por HID.
     */
    render() {
        if (!this.device || !this.protocol) return;

        // Snapshot del framebuffer actual (lo que el effect activo escribió)
        const frame = this.device.getFrame();

        // Mandar al teclado vía HID
        this.protocol.sendFrame(frame);
    }

    /**
     * SignalRGB llama esto al apagar / cambiar de plugin.
     */
    shutdown() {
        try {
            if (this.protocol) {
                this.protocol.close();
                this.protocol = null;
            }
            this.device = null;
        } catch (err) {
            console.error('[KX500] shutdown() failed:', err);
        }
    }
}

module.exports = KX500SignalRGBPlugin;
