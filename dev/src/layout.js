/**
 * KX-500 Layout — 104 keys full-size US ANSI
 *
 * Layout estándar full-size con numpad, F-row, navigation cluster, Win/Fn/Menu.
 * Bounding box: 23 cols × 6 filas.
 *
 * Re-exportado desde KX500_Lite.js (single source of truth).
 */

'use strict';

// Keys del KX-500 en orden físico (F0 → Space → Arrow → Numpad)
// Cada key: { name, x, y, w, h } en unidades (1u = 1 slot)
export const KX500_KEYS = [
    // Fila 0: Function row (Esc + F1-F12 + Print Screen + Scroll Lock + Pause)
    { name: 'Esc', x: 0, y: 0, w: 1, h: 1 },
    { name: 'F1', x: 2, y: 0, w: 1, h: 1 }, { name: 'F2', x: 3, y: 0, w: 1, h: 1 },
    { name: 'F3', x: 4, y: 0, w: 1, h: 1 }, { name: 'F4', x: 5, y: 0, w: 1, h: 1 },
    { name: 'F5', x: 6.5, y: 0, w: 1, h: 1 }, { name: 'F6', x: 7.5, y: 0, w: 1, h: 1 },
    { name: 'F7', x: 8.5, y: 0, w: 1, h: 1 }, { name: 'F8', x: 9.5, y: 0, w: 1, h: 1 },
    { name: 'F9', x: 11, y: 0, w: 1, h: 1 }, { name: 'F10', x: 12, y: 0, w: 1, h: 1 },
    { name: 'F11', x: 13, y: 0, w: 1, h: 1 }, { name: 'F12', x: 14, y: 0, w: 1, h: 1 },
    { name: 'Print Screen', x: 15.5, y: 0, w: 1, h: 1 },
    { name: 'Scroll Lock', x: 16.5, y: 0, w: 1, h: 1 },
    { name: 'Pause Break', x: 17.5, y: 0, w: 1, h: 1 },

    // Fila 1: Number row + nav cluster
    { name: '`', x: 0, y: 1, w: 1, h: 1 },
    { name: '1', x: 1, y: 1, w: 1, h: 1 }, { name: '2', x: 2, y: 1, w: 1, h: 1 },
    { name: '3', x: 3, y: 1, w: 1, h: 1 }, { name: '4', x: 4, y: 1, w: 1, h: 1 },
    { name: '5', x: 5, y: 1, w: 1, h: 1 }, { name: '6', x: 6, y: 1, w: 1, h: 1 },
    { name: '7', x: 7, y: 1, w: 1, h: 1 }, { name: '8', x: 8, y: 1, w: 1, h: 1 },
    { name: '9', x: 9, y: 1, w: 1, h: 1 }, { name: '0', x: 10, y: 1, w: 1, h: 1 },
    { name: '-', x: 11, y: 1, w: 1, h: 1 }, { name: '=', x: 12, y: 1, w: 1, h: 1 },
    { name: 'Backspace', x: 13, y: 1, w: 2, h: 1 },
    { name: 'Insert', x: 15.5, y: 1, w: 1, h: 1 },
    { name: 'Home', x: 16.5, y: 1, w: 1, h: 1 },
    { name: 'Page Up', x: 17.5, y: 1, w: 1, h: 1 },

    // Fila 2: QWERTY
    { name: 'Tab', x: 0, y: 2, w: 1.5, h: 1 },
    { name: 'Q', x: 1.5, y: 2, w: 1, h: 1 }, { name: 'W', x: 2.5, y: 2, w: 1, h: 1 },
    { name: 'E', x: 3.5, y: 2, w: 1, h: 1 }, { name: 'R', x: 4.5, y: 2, w: 1, h: 1 },
    { name: 'T', x: 5.5, y: 2, w: 1, h: 1 }, { name: 'Y', x: 6.5, y: 2, w: 1, h: 1 },
    { name: 'U', x: 7.5, y: 2, w: 1, h: 1 }, { name: 'I', x: 8.5, y: 2, w: 1, h: 1 },
    { name: 'O', x: 9.5, y: 2, w: 1, h: 1 }, { name: 'P', x: 10.5, y: 2, w: 1, h: 1 },
    { name: '[', x: 11.5, y: 2, w: 1, h: 1 }, { name: ']', x: 12.5, y: 2, w: 1, h: 1 },
    { name: '\\', x: 13.5, y: 2, w: 1.5, h: 1 },
    { name: 'Del', x: 15.5, y: 2, w: 1, h: 1 },
    { name: 'End', x: 16.5, y: 2, w: 1, h: 1 },
    { name: 'Page Down', x: 17.5, y: 2, w: 1, h: 1 },

    // Fila 3: Home row
    { name: 'Caps Lock', x: 0, y: 3, w: 1.75, h: 1 },
    { name: 'A', x: 1.75, y: 3, w: 1, h: 1 }, { name: 'S', x: 2.75, y: 3, w: 1, h: 1 },
    { name: 'D', x: 3.75, y: 3, w: 1, h: 1 }, { name: 'F', x: 4.75, y: 3, w: 1, h: 1 },
    { name: 'G', x: 5.75, y: 3, w: 1, h: 1 }, { name: 'H', x: 6.75, y: 3, w: 1, h: 1 },
    { name: 'J', x: 7.75, y: 3, w: 1, h: 1 }, { name: 'K', x: 8.75, y: 3, w: 1, h: 1 },
    { name: 'L', x: 9.75, y: 3, w: 1, h: 1 },
    { name: ';', x: 10.75, y: 3, w: 1, h: 1 }, { name: '\u2019', x: 11.75, y: 3, w: 1, h: 1 },
    { name: 'Enter', x: 12.75, y: 3, w: 2.25, h: 1 },

    // Fila 4: Bottom row
    { name: 'Left Shift', x: 0, y: 4, w: 2.25, h: 1 },
    { name: 'Z', x: 2.25, y: 4, w: 1, h: 1 }, { name: 'X', x: 3.25, y: 4, w: 1, h: 1 },
    { name: 'C', x: 4.25, y: 4, w: 1, h: 1 }, { name: 'V', x: 5.25, y: 4, w: 1, h: 1 },
    { name: 'B', x: 6.25, y: 4, w: 1, h: 1 }, { name: 'N', x: 7.25, y: 4, w: 1, h: 1 },
    { name: 'M', x: 8.25, y: 4, w: 1, h: 1 },
    { name: ',', x: 9.25, y: 4, w: 1, h: 1 }, { name: '.', x: 10.25, y: 4, w: 1, h: 1 },
    { name: '/', x: 11.25, y: 4, w: 1, h: 1 },
    { name: 'Right Shift', x: 12.25, y: 4, w: 2.75, h: 1 },
    { name: 'Up Arrow', x: 16.5, y: 4, w: 1, h: 1 },

    // Fila 5: Space row
    { name: 'Left Ctrl', x: 0, y: 5, w: 1.25, h: 1 },
    { name: 'Left Win', x: 1.25, y: 5, w: 1.25, h: 1 },
    { name: 'Left Alt', x: 2.5, y: 5, w: 1.25, h: 1 },
    { name: 'Space', x: 3.75, y: 5, w: 6.25, h: 1 },
    { name: 'Right Alt', x: 10, y: 5, w: 1.25, h: 1 },
    { name: 'Fn', x: 11.25, y: 5, w: 1.25, h: 1 },
    { name: 'Menu', x: 12.5, y: 5, w: 1.25, h: 1 },
    { name: 'Right Ctrl', x: 13.75, y: 5, w: 1.25, h: 1 },
    { name: 'Left Arrow', x: 15.5, y: 5, w: 1, h: 1 },
    { name: 'Down Arrow', x: 16.5, y: 5, w: 1, h: 1 },
    { name: 'Right Arrow', x: 17.5, y: 5, w: 1, h: 1 },

    // Numpad
    { name: 'NumLock', x: 19, y: 1, w: 1, h: 1 },
    { name: 'Num /', x: 20, y: 1, w: 1, h: 1 },
    { name: 'Num *', x: 21, y: 1, w: 1, h: 1 },
    { name: 'Num -', x: 22, y: 1, w: 1, h: 1 },
    { name: 'Num 7', x: 19, y: 2, w: 1, h: 1 },
    { name: 'Num 8', x: 20, y: 2, w: 1, h: 1 },
    { name: 'Num 9', x: 21, y: 2, w: 1, h: 1 },
    { name: 'Num +', x: 22, y: 2, w: 1, h: 2 },
    { name: 'Num 4', x: 19, y: 3, w: 1, h: 1 },
    { name: 'Num 5', x: 20, y: 3, w: 1, h: 1 },
    { name: 'Num 6', x: 21, y: 3, w: 1, h: 1 },
    { name: 'Num 1', x: 19, y: 4, w: 1, h: 1 },
    { name: 'Num 2', x: 20, y: 4, w: 1, h: 1 },
    { name: 'Num 3', x: 21, y: 4, w: 1, h: 1 },
    { name: 'Num Enter', x: 22, y: 4, w: 1, h: 2 },
    { name: 'Num 0', x: 19, y: 5, w: 2, h: 1 },
    { name: 'Num .', x: 21, y: 5, w: 1, h: 1 },
];

export const LAYOUT_SIZE = (function () {
    let maxX = 0, maxY = 0;
    for (const k of KX500_KEYS) {
        if (k.x + k.w > maxX) maxX = k.x + k.w;
        if (k.y + k.h > maxY) maxY = k.y + k.h;
    }
    return [Math.ceil(maxX), Math.ceil(maxY)];
})();

// Helpers
export function getKeyByName(name) {
    return KX500_KEYS.find(k => k.name === name);
}

export function getKeyIndex(name) {
    return KX500_KEYS.findIndex(k => k.name === name);
}

export function getKeyCount() {
    return KX500_KEYS.length;
}
