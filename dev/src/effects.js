/**
 * KX-500 Effects — Lite set
 * ─────────────────────────────────────────────────────────────────
 * Effects que el plugin KX-500 Lite expone a SignalRGB.
 *
 * Cada effect recibe el array `leds` (key-by-key con {r,g,b,name,x,y}) y
 * debe mutar los RGB in-place. El Render loop de SignalRGB se encarga de
 * llamar a cada effect en secuencia (si hubiera chaining).
 *
 * Incluidos:
 *   - static:       un color sólido para todas las keys
 *   - breathing:    pulsado lento de un color
 *   - wave:         ola horizontal de color (basado en tiempo + posición)
 *   - reactive:     audio-reactive (basado en Sinowealth/HyperX pattern)
 *   - typing:       efecto basado en typing speed (placeholder — el KX-500
 *                   detecta WPM pero no lo exponemos vía plugin hasta tener
 *                   el canal IN confirmado)
 *
 * El set es mínimo pero funcional. Effects más complejos (rainbow spiral,
 * ripple, audio spectrum) los podemos agregar cuando el RE esté cerrado.
 */

'use strict';

// HSV → RGB helper
function hsvToRgb(h, s, v) {
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
    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
    ];
}

/**
 * Helper: aplica un color sólido a todas las keys.
 */
function applySolidColor(leds, r, g, b) {
    for (const led of leds) {
        led.r = r;
        led.g = g;
        led.b = b;
    }
}

/**
 * Effect: Static
 * Pinta todas las keys del color configurado.
 * @param {Array} leds
 * @param {object} ctx - { color: [r,g,b] }
 */
function effectStatic(leds, ctx) {
    const [r, g, b] = ctx.color || [255, 0, 0];
    applySolidColor(leds, r, g, b);
}

/**
 * Effect: Breathing
 * Pulsado lento del color (sin/cos wave).
 * @param {Array} leds
 * @param {object} ctx - { color: [r,g,b], speed: 1.0 }
 */
function effectBreathing(leds, ctx) {
    const [r, g, b] = ctx.color || [255, 0, 0];
    const speed = ctx.speed || 1.0;
    const phase = Math.sin(ctx.time * speed * 2 * Math.PI * 0.5); // 1 ciclo cada 2 segundos
    const factor = 0.3 + 0.7 * (phase * 0.5 + 0.5); // 0.3..1.0
    applySolidColor(leds,
        Math.round(r * factor),
        Math.round(g * factor),
        Math.round(b * factor),
    );
}

/**
 * Effect: Wave
 * Ola de color que viaja horizontalmente.
 * @param {Array} leds
 * @param {object} ctx - { speed: 1.0, hue: 0.5, width: 0.3 }
 */
function effectWave(leds, ctx) {
    const speed = ctx.speed || 1.0;
    const hue = ctx.hue || 0.5;
    const width = ctx.width || 0.3;
    const baseX = ctx.time * speed * 0.5; // velocidad de la ola (unidades/segundo)

    for (const led of leds) {
        // Distancia desde el frente de la ola
        const dist = Math.abs(led.x - baseX);
        // Intensidad según la cercanía al frente
        const t = Math.max(0, 1 - dist / width);
        const [r, g, b] = hsvToRgb((hue + led.x * 0.02) % 1, 1.0, t);
        led.r = r;
        led.g = g;
        led.b = b;
    }
}

/**
 * Effect: Reactive (audio)
 * Cambia la intensidad según ctx.audioLevel (0..1).
 * En SignalRGB esto se alimenta del audio-reactive del engine.
 * @param {Array} leds
 * @param {object} ctx - { color: [r,g,b], audioLevel: 0..1 }
 */
function effectReactive(leds, ctx) {
    const [r, g, b] = ctx.color || [0, 200, 255];
    const audio = ctx.audioLevel || 0;
    // Mezcla color base con blanco según audio
    const factor = audio; // 0..1
    applySolidColor(leds,
        Math.round(r + (255 - r) * factor),
        Math.round(g + (255 - g) * factor),
        Math.round(b + (255 - b) * factor),
    );
}

/**
 * Effect: Typing Reactive (placeholder)
 * Cuando el HID Keyboard IN esté implementado, este effect pintará
 * keys individuales según los keypress events.
 * Por ahora hace un pulso global estilo "ripple from center".
 */
function effectTyping(leds, ctx) {
    const speed = ctx.speed || 1.0;
    const pulse = (Math.sin(ctx.time * speed * 4) + 1) * 0.5; // 0..1

    for (const led of leds) {
        const dist = Math.sqrt(
            Math.pow(led.x - 9, 2) +
            Math.pow(led.y - 2.5, 2)
        );
        const t = Math.max(0, 1 - dist / 8) * (0.5 + pulse * 0.5);
        led.r = Math.round(255 * t);
        led.g = Math.round(100 * t);
        led.b = Math.round(200 * t);
    }
}

/**
 * Devuelve la lista de effects disponibles para el plugin.
 */
function getEffectsList() {
    return [
        { id: 'static', name: 'Static Color', fn: effectStatic },
        { id: 'breathing', name: 'Breathing', fn: effectBreathing },
        { id: 'wave', name: 'Color Wave', fn: effectWave },
        { id: 'reactive', name: 'Audio Reactive', fn: effectReactive },
        { id: 'typing', name: 'Typing Reactive (experimental)', fn: effectTyping },
    ];
}

export {
    effectStatic,
    effectBreathing,
    effectWave,
    effectReactive,
    effectTyping,
    getEffectsList,
    hsvToRgb,
    applySolidColor,
};