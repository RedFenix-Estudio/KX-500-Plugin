/**
 * KX-500 Effects — internal effects for LightingMode=Forced
 *
 * Implementa los effects que SignalRGB puede aplicar sobre el forcedColor
 * cuando el usuario está en modo Forced. En modo Canvas, SignalRGB maneja
 * los effects directamente y estos no se usan.
 */

'use strict';

import { KX500_KEYS } from './layout.js';

/**
 * HSV → RGB conversion (h, s, v ∈ [0, 1])
 */
export function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Effect: static (color sólido)
 */
export function staticEffect(ledsArr, _time, color) {
    const [r, g, b] = color;
    for (const led of ledsArr) {
        led.r = r;
        led.g = g;
        led.b = b;
    }
}

/**
 * Effect: breathing (sube y baja el brightness con sine)
 */
export function breathingEffect(ledsArr, time, color) {
    const [r, g, b] = color;
    const phase = Math.sin(time * 2 * Math.PI * 0.5); // 0.5 Hz = 2s por ciclo
    const factor = 0.3 + 0.7 * (phase * 0.5 + 0.5);   // 0.3..1.0
    for (const led of ledsArr) {
        led.r = Math.round(r * factor);
        led.g = Math.round(g * factor);
        led.b = Math.round(b * factor);
    }
}

/**
 * Effect: wave (ola horizontal multicolor)
 */
export function waveEffect(ledsArr, time, _color) {
    const baseX = time * 5;
    for (const led of ledsArr) {
        const dist = Math.abs(led.x - baseX);
        const t = Math.max(0, 1 - dist / 5);
        const [wr, wg, wb] = hsvToRgb((0.5 + led.x * 0.02) % 1, 1, t);
        led.r = wr;
        led.g = wg;
        led.b = wb;
    }
}

/**
 * Effect: typing (pulse reactivo al centro del teclado)
 */
export function typingEffect(ledsArr, time, _color) {
    const pulse = (Math.sin(time * 4) + 1) * 0.5;
    for (const led of ledsArr) {
        const dist = Math.sqrt(Math.pow(led.x - 9, 2) + Math.pow(led.y - 2.5, 2));
        const t = Math.max(0, 1 - dist / 8) * (0.3 + pulse * 0.7);
        led.r = Math.round(255 * t);
        led.g = Math.round(100 * t);
        led.b = Math.round(200 * t);
    }
}

/**
 * Registry de effects disponibles.
 */
export const EFFECTS = {
    static: { label: 'Static', fn: staticEffect },
    breathing: { label: 'Breathing', fn: breathingEffect },
    wave: { label: 'Wave', fn: waveEffect },
    typing: { label: 'Typing', fn: typingEffect },
};

/**
 * Aplica un effect al array de LEDs.
 */
export function applyEffect(ledsArr, time, color, effectId) {
    const effect = EFFECTS[effectId] || EFFECTS.static;
    effect.fn(ledsArr, time, color);
}

/**
 * Devuelve la lista de IDs de effects disponibles.
 */
export function listEffects() {
    return Object.keys(EFFECTS);
}
