/**
 * KX-500 Device Definition
 *
 * Define el layout del teclado: cantidad de keys, zonas RGB, mapeo a coordenadas
 * del canvas virtual de SignalRGB, y el framebuffer que los effects escriben.
 *
 * �️ PENDIENTE: el layout real del KX-500 (TKL Naruto edition) hay que confirmar
 * con una foto / inspección del teclado. Mientras tanto, layout TKL estándar de
 * 87 keys con zonas por fila.
 */

'use strict';

class KX500Device {
    constructor(protocol) {
        this.protocol = protocol;
        this.name = 'Checkpoint KX-500 (NA-KB-1001)';

        // Layout TKL (87 keys) - PLACEHOLDER, ajustar al KX-500 real
        this.layout = {
            rows: 6,
            cols: 18,
            keys: this._buildTKLLayout(),
        };

        // Framebuffer: [row][col] = [r, g, b]
        this.framebuffer = this._createFramebuffer();
    }

    /**
     * Construye el layout TKL estándar. PLACEHOLDER.
     * Cada key tiene: { id, label, x, y, row, col }
     */
    _buildTKLLayout() {
        // Estructura base de filas de un TKL estándar
        // Fila 0: Esc, F1-F12, PrtSc, ScrLk, Pause (15 keys)
        // Fila 1: `, 1-9, 0, -, =, Backspace, Insert, Home, PgUp (16)
        // Fila 2: Tab, Q-P, [, ], \, Delete, End, PgDn (15)
        // Fila 3: Caps, A-L, ;, ', Enter (13)
        // Fila 4: LShift, Z-M, ,, ., /, RShift, Up (12)
        // Fila 5: LCtrl, LWin, LAlt, Space, RAlt, Fn, RCtrl, Left, Down, Right (10)

        // TODO: confirmar layout exacto contra foto del KX-500
        return {
            placeholder: true,
            note: 'Layout TKL placeholder. Rellenar con mapa real del KX-500.',
        };
    }

    _createFramebuffer() {
        const fb = [];
        for (let r = 0; r < this.layout.rows; r++) {
            const row = [];
            for (let c = 0; c < this.layout.cols; c++) {
                row.push([0, 0, 0]);
            }
            fb.push(row);
        }
        return fb;
    }

    /**
     * Devuelve una copia del framebuffer actual.
     * Los effects llaman a setPixel() y al final del frame leemos con getFrame().
     */
    getFrame() {
        return this.framebuffer.map(row => row.map(pixel => [...pixel]));
    }

    /**
     * Set un pixel del framebuffer (lo llaman los effects).
     */
    setPixel(row, col, r, g, b) {
        if (row < 0 || row >= this.layout.rows) return;
        if (col < 0 || col >= this.layout.cols) return;
        this.framebuffer[row][col] = [
            Math.max(0, Math.min(255, r | 0)),
            Math.max(0, Math.min(255, g | 0)),
            Math.max(0, Math.min(255, b | 0)),
        ];
    }

    /**
     * Limpia el framebuffer (todos los pixeles a negro).
     */
    clear() {
        for (let r = 0; r < this.layout.rows; r++) {
            for (let c = 0; c < this.layout.cols; c++) {
                this.framebuffer[r][c] = [0, 0, 0];
            }
        }
    }
}

module.exports = KX500Device;
