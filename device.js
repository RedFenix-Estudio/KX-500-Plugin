/**
 * KX-500 Device Definition
 *
 * Define el layout del teclado: cantidad de keys, zonas RGB, mapeo a coordenadas
 * del canvas virtual de SignalRGB, y el framebuffer que los effects escriben.
 *
 * Layout: full-size US English ANSI 104 keys (con numpad, F1-F12, nav cluster,
 * Windows key, Fn key, Menu key, dos Ctrl/Alt/Shift). Confirmado por Erik el
 * 2026-08-23 contra el KX-500 Naruto Edition físico.
 *
 * Modelo de coordenadas:
 *   - Cada key tiene una posición (x, y) en "units" (1u = 1 slot en el grid).
 *   - Keys anchas (Space, Backspace, Shift, Enter, etc.) tienen width > 1.
 *   - El canvas virtual de SignalRGB se dimensiona en base al bounding box del layout.
 *
 * Si tu KX-500 tiene un layout distinto (ej: ANSI ISO con tecla L adicional
 * a la derecha del LShift, o un layout regional no-inglés), este archivo es
 * el único punto a tocar.
 */

'use strict';

const KEY_UNIT_PX = 40; // tamaño lógico de cada "unit" en el canvas SignalRGB

class KX500Device {
    constructor(protocol) {
        this.protocol = protocol;
        this.name = 'Checkpoint KX-500 (NA-KB-1001) — Full Size US';

        // ────────────────────────────────────────────────────────────
        // Layout: array de keys con { id, label, x, y, width }
        //  - x, y en unidades (1u = 1 slot)
        //  - width en unidades (default 1)
        //  - id único por key, usado por el RE y los effects
        // ────────────────────────────────────────────────────────────
        this.keys = this._buildKeys();

        // Bounding box del layout (calculado)
        const bbox = this._computeBoundingBox(this.keys);
        this.layout = {
            rows: bbox.rows,
            cols: bbox.cols,
            minX: bbox.minX,
            maxX: bbox.maxX,
            minY: bbox.minY,
            maxY: bbox.maxY,
            pixelWidth: bbox.cols * KEY_UNIT_PX,
            pixelHeight: bbox.rows * KEY_UNIT_PX,
        };

        // Framebuffer: grid[fila][col] = [r, g, b]
        // Cada slot tiene un LED (per-key RGB confirmado por Erik).
        this.framebuffer = this._createFramebuffer();

        // Mapa rápido: id → {row, col} (para los effects que llaman setKeyById)
        this.keyMap = this._buildKeyMap(this.keys, bbox);
    }

    /**
     * Construye el array completo de keys del KX-500 full-size US.
     * Estructura en filas:
     *   y=0: function row (Esc + F1-F12 + PrtSc/ScrLk/Pause)
     *   y=1: number row (` 1 2 ... 0 - = Backspace + Insert/Home/PgUp + Numpad top)
     *   y=2: qwerty row (Tab Q-W ... [ ] \ + Delete/End/PgDn + Numpad)
     *   y=3: home row (Caps A ... ; ' Enter + Numpad)
     *   y=4: bottom row (LShift Z ... / RShift + Up + Numpad)
     *   y=5: space row (Ctrl Win Alt Space Alt Fn Menu Ctrl + Left/Down/Right + Numpad)
     */
    _buildKeys() {
        const k = (id, label, x, y, width = 1) => ({ id, label, x, y, width });

        return [
            // ───── Fila 0: Function row ─────
            k('Esc', 'Esc', 0, 0),
            k('F1', 'F1', 1.5, 0), k('F2', 'F2', 2.5, 0), k('F3', 'F3', 3.5, 0), k('F4', 'F4', 4.5, 0),
            k('F5', 'F5', 6, 0), k('F6', 'F6', 7, 0), k('F7', 'F7', 8, 0), k('F8', 'F8', 9, 0),
            k('F9', 'F9', 10.5, 0), k('F10', 'F10', 11.5, 0), k('F11', 'F11', 12.5, 0), k('F12', 'F12', 13.5, 0),
            k('PrtSc', 'PrtSc', 15, 0), k('ScrLk', 'ScrLk', 16, 0), k('Pause', 'Pause', 17, 0),

            // ───── Fila 1: Number row ─────
            k('Backtick', '`', 0, 1),
            k('1', '1', 1, 1), k('2', '2', 2, 1), k('3', '3', 3, 1), k('4', '4', 4, 1),
            k('5', '5', 5, 1), k('6', '6', 6, 1), k('7', '7', 7, 1), k('8', '8', 8, 1),
            k('9', '9', 9, 1), k('0', '0', 10, 1),
            k('Minus', '-', 11, 1), k('Equal', '=', 12, 1),
            k('Backspace', 'Backspace', 13, 1, 2),
            k('Insert', 'Insert', 15, 1), k('Home', 'Home', 16, 1), k('PgUp', 'PgUp', 17, 1),

            // ───── Fila 2: QWERTY row ─────
            k('Tab', 'Tab', 0, 2, 1.5),
            k('Q', 'Q', 1.5, 2), k('W', 'W', 2.5, 2), k('E', 'E', 3.5, 2), k('R', 'R', 4.5, 2),
            k('T', 'T', 5.5, 2), k('Y', 'Y', 6.5, 2), k('U', 'U', 7.5, 2), k('I', 'I', 8.5, 2),
            k('O', 'O', 9.5, 2), k('P', 'P', 10.5, 2),
            k('LBracket', '[', 11.5, 2), k('RBracket', ']', 12.5, 2),
            k('Backslash', '\\', 13.5, 2, 1.5),
            k('Delete', 'Delete', 15, 2), k('End', 'End', 16, 2), k('PgDn', 'PgDn', 17, 2),

            // ───── Fila 3: Home row ─────
            k('CapsLock', 'CapsLock', 0, 3, 1.75),
            k('A', 'A', 1.75, 3), k('S', 'S', 2.75, 3), k('D', 'D', 3.75, 3), k('F', 'F', 4.75, 3),
            k('G', 'G', 5.75, 3), k('H', 'H', 6.75, 3), k('J', 'J', 7.75, 3), k('K', 'K', 8.75, 3),
            k('L', 'L', 9.75, 3),
            k('Semicolon', ';', 10.75, 3), k('Quote', "'", 11.75, 3),
            k('Enter', 'Enter', 12.75, 3, 2.25),

            // ───── Fila 4: Bottom row ─────
            k('LShift', 'Shift', 0, 4, 2.25),
            k('Z', 'Z', 2.25, 4), k('X', 'X', 3.25, 4), k('C', 'C', 4.25, 4), k('V', 'V', 5.25, 4),
            k('B', 'B', 6.25, 4), k('N', 'N', 7.25, 4), k('M', 'M', 8.25, 4),
            k('Comma', ',', 9.25, 4), k('Period', '.', 10.25, 4), k('Slash', '/', 11.25, 4),
            k('RShift', 'Shift', 12.25, 4, 2.75),
            k('Up', '↑', 16, 4),

            // ───── Fila 5: Space row ─────
            k('LCtrl', 'Ctrl', 0, 5, 1.25),
            k('LWin', 'Win', 1.25, 5, 1.25),
            k('LAlt', 'Alt', 2.5, 5, 1.25),
            k('Space', 'Space', 3.75, 5, 6.25),
            k('RAlt', 'Alt', 10, 5, 1.25),
            k('Fn', 'Fn', 11.25, 5, 1.25),
            k('Menu', 'Menu', 12.5, 5, 1.25),
            k('RCtrl', 'Ctrl', 13.75, 5, 1.25),
            k('Left', '←', 15, 5), k('Down', '↓', 16, 5), k('Right', '→', 17, 5),

            // ───── Numpad (4 cols, x=18.5..22) ─────
            k('NumLock', 'NumLk', 18.5, 1),
            k('NumSlash', '/', 19.5, 1),
            k('NumStar', '*', 20.5, 1),
            k('NumMinus', '-', 21.5, 1),

            k('Num7', '7', 18.5, 2),
            k('Num8', '8', 19.5, 2),
            k('Num9', '9', 20.5, 2),
            k('NumPlus', '+', 21.5, 2, 1, 2), // double-height

            k('Num4', '4', 18.5, 3),
            k('Num5', '5', 19.5, 3),
            k('Num6', '6', 20.5, 3),
            // NumPlus continues into y=3

            k('Num1', '1', 18.5, 4),
            k('Num2', '2', 19.5, 4),
            k('Num3', '3', 20.5, 4),
            k('NumEnter', 'Enter', 21.5, 4, 1, 2), // double-height

            k('Num0', '0', 18.5, 5, 2),
            k('NumPeriod', '.', 20.5, 5),
            // NumEnter continues into y=5
        ];
    }

    _computeBoundingBox(keys) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const key of keys) {
            minX = Math.min(minX, key.x);
            maxX = Math.max(maxX, key.x + key.width);
            minY = Math.min(minY, key.y);
            maxY = Math.max(maxY, key.y + (key.height || 1));
        }
        return {
            minX, maxX, minY, maxY,
            // Redondeo para que cols/rows sean enteros (el framebuffer es [rows][cols])
            cols: Math.ceil(maxX - minX),
            rows: Math.ceil(maxY - minY),
        };
    }

    _createFramebuffer() {
        const fb = [];
        for (let y = 0; y < this.layout.rows; y++) {
            const row = [];
            for (let x = 0; x < this.layout.cols; x++) {
                row.push([0, 0, 0]);
            }
            fb.push(row);
        }
        return fb;
    }

    _buildKeyMap(keys, bbox) {
        const map = {};
        for (const key of keys) {
            // Snap a índices enteros del framebuffer.
            // Las keys anchas (Space 6.25u, Shifts 2.25/2.75u, etc.) se redondean
            // al entero más cercano en su width. Esto da una representación
            // visual razonable del layout físico.
            map[key.id] = {
                col: Math.round(key.x - bbox.minX),
                row: Math.round(key.y - bbox.minY),
                width: Math.max(1, Math.round(key.width)),
                height: Math.max(1, Math.round(key.height || 1)),
            };
        }
        return map;
    }

    // ─── API pública usada por los effects ───

    getFrame() {
        return this.framebuffer.map(row => row.map(pixel => [...pixel]));
    }

    /**
     * Set un slot del framebuffer (no key-aware).
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
     * Set todos los slots que ocupa una key (key-aware, maneja keys anchas).
     * @param {string} keyId - ej: 'A', 'Space', 'LShift'
     */
    setKeyById(keyId, r, g, b) {
        const k = this.keyMap[keyId];
        if (!k) return;
        const r2 = Math.max(0, Math.min(255, r | 0));
        const g2 = Math.max(0, Math.min(255, g | 0));
        const b2 = Math.max(0, Math.min(255, b | 0));
        for (let dy = 0; dy < k.height; dy++) {
            for (let dx = 0; dx < k.width; dx++) {
                this.setPixel(k.row + dy, k.col + dx, r2, g2, b2);
            }
        }
    }

    /**
     * Helper: devuelve la posición de una key en el framebuffer.
     * Útil para tests y para effects que quieran posicion relativa.
     */
    getKeyPosition(keyId) {
        return this.keyMap[keyId] || null;
    }

    /**
     * Devuelve el total de keys en el layout.
     */
    getKeyCount() {
        return this.keys.length;
    }

    /**
     * Set todos los slots de una key con un valor por slot (útil para gradients).
     */
    setKeyByIdMulti(keyId, pixels) {
        const k = this.keyMap[keyId];
        if (!k) return;
        let i = 0;
        for (let dy = 0; dy < k.height; dy++) {
            for (let dx = 0; dx < k.width; dx++) {
                const px = pixels[i++];
                if (px) this.setPixel(k.row + dy, k.col + dx, px[0], px[1], px[2]);
            }
        }
    }

    clear() {
        for (let y = 0; y < this.layout.rows; y++) {
            for (let x = 0; x < this.layout.cols; x++) {
                this.framebuffer[y][x] = [0, 0, 0];
            }
        }
    }
}

module.exports = KX500Device;
