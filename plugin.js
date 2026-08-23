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
const Effects = require('./effects');

class KX500SignalRGBPlugin {
    constructor() {
        this.device = null;
        this.protocol = null;
        this.lastFrameTime = 0;
        this.activeEffect = null;
        this.activeEffectParams = {};
        this.keyboardInputDevice = null;
        // Buffer de key presses del frame actual (consumido por typing_reactive)
        this._pendingKeyPresses = [];
    }

    /**
     * SignalRGB llama esto una vez al cargar el plugin.
     * Acá deberíamos:
     *   1. Abrir el dispositivo HID RGB (canal FF1C:0092, OUT)
     *   2. (Opcional) Abrir el dispositivo HID Keyboard (canal standard, IN)
     *      para detectar key presses en tiempo real
     *   3. Registrar el layout del teclado
     *   4. Devolver el objeto device a SignalRGB
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

            // (Opcional, después del RE) leer key presses desde el canal HID Keyboard
            // y empujarlos al effect typing_reactive.
            this._startKeyboardInputListener();

            // Devolvemos el "device" que SignalRGB va a manejar
            return this.device;
        } catch (err) {
            console.error('[KX500] initialize() failed:', err);
            throw err;
        }
    }

    /**
     * Intenta abrir el canal HID Keyboard (Usage Page 0x07) para leer
     * key presses en tiempo real. Si falla (driver ya abrió el canal),
     * se loguea y se continúa sin esta funcionalidad.
     *
     * ⚠️ Pendiente del RE: confirmar si el driver permite acceso compartido
     * o si necesitamos un HID sniffer de bajo nivel (USBPcap-based listener).
     */
    _startKeyboardInputListener() {
        try {
            const HID = require('node-hid');
            const devices = HID.devices(0x320F, 0x5008);
            const kbdDev = devices.find(d =>
                (d.usagePage === 0x07 || d.usagePage === 0x01) && d.usage === 0x06
            );
            if (!kbdDev) {
                console.log('[KX500] HID Keyboard channel no encontrado (puede que el driver lo esté usando).');
                return;
            }
            this.keyboardInputDevice = new HID.HID(kbdDev.path);
            this.keyboardInputDevice.on('data', (buf) => this._onKeyboardReport(buf));
            this.keyboardInputDevice.on('error', (err) => {
                console.warn('[KX500] HID Keyboard input error:', err.message);
            });
            console.log('[KX500] HID Keyboard listener activo ✅');
        } catch (err) {
            console.warn('[KX500] No pude abrir HID Keyboard input:', err.message);
        }
    }

    /**
     * Parsea un HID Keyboard report (8 bytes, formato boot) y empuja los
     * key IDs al buffer de key presses.
     *
     * Estructura del report (boot keyboard):
     *   Byte 0: modifiers (bit 0=LCTRL, 1=LSHIFT, 2=LALT, 3=LGUI, 4=RCTRL, ...)
     *   Byte 1: reserved
     *   Byte 2..7: hasta 6 keycodes simultáneos (HID Usage IDs)
     */
    _onKeyboardReport(buf) {
        if (!buf || buf.length < 3) return;
        // Por ahora solo marcamos "hubo keypress" — el effect typing_reactive
        // puede recibir ctx.keyPresses = ['A', 'Space', ...] cuando esté listo.
        // Mapeo HID Usage → keyId de nuestro device se hace en una tabla aparte
        // (ver device.js#_buildHidUsageMap).
        const pressed = [];
        for (let i = 2; i < Math.min(buf.length, 8); i++) {
            if (buf[i] > 0) pressed.push(buf[i]);
        }
        if (pressed.length > 0) {
            // TODO: traducir HID Usage → nuestro keyId con _buildHidUsageMap
            // Por ahora, empujamos los raw usage IDs al buffer.
            this._pendingKeyPresses.push(...pressed);
        }
    }

    /**
     * SignalRGB llama esto en cada frame (~60fps).
     * Acá leemos el estado actual del framebuffer del device
     * y lo mandamos al teclado por HID.
     */
    render() {
        if (!this.device || !this.protocol) return;

        const now = Date.now();
        const dt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : (1 / 60);
        this.lastFrameTime = now;

        // 1. Limpiar framebuffer
        this.device.clear();

        // 2. Correr el effect activo sobre el framebuffer
        if (this.activeEffect) {
            const ctx = {
                time: now / 1000,
                dt,
                keyPresses: this._pendingKeyPresses,
            };
            this.activeEffect(this.device, this.activeEffectParams, ctx);
        }

        // 3. Limpiar el buffer de key presses del frame
        this._pendingKeyPresses = [];

        // 4. Snapshot del framebuffer y mandar al teclado vía HID
        const frame = this.device.getFrame();
        this.protocol.sendFrame(frame);
    }

    /**
     * Cambia el effect activo. Llamar cuando el usuario selecciona otro
     * effect en la UI de SignalRGB.
     */
    setActiveEffect(name, params = {}) {
        if (Effects[name]) {
            // Reset state si el effect lo necesita
            if (Effects[name].reset) Effects[name].reset();
            this.activeEffect = Effects[name];
            this.activeEffectParams = params;
            console.log(`[KX500] Effect activo: ${name}`);
        } else {
            console.warn(`[KX500] Effect desconocido: ${name}`);
        }
    }

    /**
     * SignalRGB llama esto al apagar / cambiar de plugin.
     */
    shutdown() {
        try {
            if (this.keyboardInputDevice) {
                try { this.keyboardInputDevice.close(); } catch (_) {}
                this.keyboardInputDevice = null;
            }
            if (this.protocol) {
                this.protocol.close();
                this.protocol = null;
            }
            this.device = null;
            this.activeEffect = null;
        } catch (err) {
            console.error('[KX500] shutdown() failed:', err);
        }
    }
}

module.exports = KX500SignalRGBPlugin;
