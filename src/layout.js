/**
 * KX-500 Full-Size US ANSI 104-Key Layout
 * ─────────────────────────────────────────────────────────────────
 * Devuelve los nombres y posiciones de las 104 keys del teclado
 * Checkpoint KX-500 Naruto Edition (NA-KB-1001), full-size US English.
 *
 * Coordenadas (x, y):
 *   - x = columna en el bounding box del layout (cada unidad = 1 slot)
 *   - y = fila desde arriba (0 = function row, 5 = space row)
 *   - Los nombres siguen la lista oficial de SignalRGB para keypress effects.
 *
 * Esta función es la única fuente de verdad para el layout. Si Erik cambia
 * de teclado (TKL, ISO, etc.), solo hay que tocar esto.
 */

'use strict';

// Genera el layout 104 keys. Devuelve { size, ledNames, ledPositions }.
// Las posiciones se calculan en unidades (1u) sobre un bounding box de
// 23 columnas × 6 filas (full-size US ANSI con numpad).
function buildLayout() {
    const k = (name, x, y, w = 1, h = 1) => ({ name, x, y, w, h });

    const keys = [
        // ───── Fila 0: Function row ─────
        k('Esc', 0, 0),
        k('F1', 2, 0), k('F2', 3, 0), k('F3', 4, 0), k('F4', 5, 0),
        k('F5', 6.5, 0), k('F6', 7.5, 0), k('F7', 8.5, 0), k('F8', 9.5, 0),
        k('F9', 11, 0), k('F10', 12, 0), k('F11', 13, 0), k('F12', 14, 0),
        k('Print Screen', 15.5, 0), k('Scroll Lock', 16.5, 0), k('Pause Break', 17.5, 0),

        // ───── Fila 1: Number row + nav cluster ─────
        k('`', 0, 1),
        k('1', 1, 1), k('2', 2, 1), k('3', 3, 1), k('4', 4, 1),
        k('5', 5, 1), k('6', 6, 1), k('7', 7, 1), k('8', 8, 1),
        k('9', 9, 1), k('0', 10, 1),
        k('-', 11, 1), k('=', 12, 1),
        k('Backspace', 13, 1, 2),
        k('Insert', 15.5, 1), k('Home', 16.5, 1), k('Page Up', 17.5, 1),

        // ───── Fila 2: QWERTY + nav cluster ─────
        k('Tab', 0, 2, 1.5),
        k('Q', 1.5, 2), k('W', 2.5, 2), k('E', 3.5, 2), k('R', 4.5, 2),
        k('T', 5.5, 2), k('Y', 6.5, 2), k('U', 7.5, 2), k('I', 8.5, 2),
        k('O', 9.5, 2), k('P', 10.5, 2),
        k('[', 11.5, 2), k(']', 12.5, 2),
        k('\\', 13.5, 2, 1.5),
        k('Del', 15.5, 2), k('End', 16.5, 2), k('Page Down', 17.5, 2),

        // ───── Fila 3: Home row ─────
        k('Caps Lock', 0, 3, 1.75),
        k('A', 1.75, 3), k('S', 2.75, 3), k('D', 3.75, 3), k('F', 4.75, 3),
        k('G', 5.75, 3), k('H', 6.75, 3), k('J', 7.75, 3), k('K', 8.75, 3),
        k('L', 9.75, 3),
        k(';', 10.75, 3), k('’', 11.75, 3),
        k('Enter', 12.75, 3, 2.25),

        // ───── Fila 4: Bottom row ─────
        k('Left Shift', 0, 4, 2.25),
        k('Z', 2.25, 4), k('X', 3.25, 4), k('C', 4.25, 4), k('V', 5.25, 4),
        k('B', 6.25, 4), k('N', 7.25, 4), k('M', 8.25, 4),
        k(',', 9.25, 4), k('.', 10.25, 4), k('/', 11.25, 4),
        k('Right Shift', 12.25, 4, 2.75),
        k('Up Arrow', 16.5, 4),

        // ───── Fila 5: Space row ─────
        k('Left Ctrl', 0, 5, 1.25),
        k('Left Win', 1.25, 5, 1.25),
        k('Left Alt', 2.5, 5, 1.25),
        k('Space', 3.75, 5, 6.25),
        k('Right Alt', 10, 5, 1.25),
        k('Fn', 11.25, 5, 1.25),
        k('Menu', 12.5, 5, 1.25),
        k('Right Ctrl', 13.75, 5, 1.25),
        k('Left Arrow', 15.5, 5), k('Down Arrow', 16.5, 5), k('Right Arrow', 17.5, 5),

        // ───── Numpad (4 cols, x=19..22) ─────
        k('NumLock', 19, 1),
        k('Num /', 20, 1),
        k('Num *', 21, 1),
        k('Num -', 22, 1),

        k('Num 7', 19, 2),
        k('Num 8', 20, 2),
        k('Num 9', 21, 2),
        k('Num +', 22, 2, 1, 2), // double-height

        k('Num 4', 19, 3),
        k('Num 5', 20, 3),
        k('Num 6', 21, 3),
        // Num + continua a y=3

        k('Num 1', 19, 4),
        k('Num 2', 20, 4),
        k('Num 3', 21, 4),
        k('Num Enter', 22, 4, 1, 2), // double-height

        k('Num 0', 19, 5, 2),
        k('Num .', 21, 5),
        // Num Enter continua a y=5
    ];

    // Calcular bounding box (necesario para Size())
    let maxX = 0, maxY = 0;
    for (const key of keys) {
        if (key.x + key.w > maxX) maxX = key.x + key.w;
        if (key.y + key.h > maxY) maxY = key.y + key.h;
    }
    const size = [Math.ceil(maxX), Math.ceil(maxY)];

    // LedNames y LedPositions son paralelos
    const ledNames = keys.map(k => k.name);
    const ledPositions = keys.map(k => [k.x, k.y]);

    return { size, ledNames, ledPositions, keys, count: keys.length };
}

/**
 * Devuelve un mapa nombre → key object (con x, y, w, h).
 * Útil para los effects que necesitan coordenadas o dimensiones.
 */
function buildKeyMap() {
    const layout = buildLayout();
    const map = {};
    for (const key of layout.keys) {
        map[key.name] = key;
    }
    return map;
}

export { buildLayout, buildKeyMap };