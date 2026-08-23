/**
 * Effect: Typing-Reactive
 *
 * Reacciona a teclas presionadas en tiempo real. Cuando se presiona una key,
 * se enciende brevemente con un color, y propaga la luz a las keys vecinas
 * con un fade-out.
 *
 * Esto aprovecha la capacidad del KX-500 de detectar tipeo (reportada por
 * Erik el 2026-08-23). El plugin lee los HID input reports y emite
 * "key press" events al effect loop.
 *
 * Para SignalRGB puro, esto se simula visualmente en el framebuffer:
 *   - Las keys presionadas aparecen brillantes
 *   - Las keys adyacentes se desvanecen suavemente
 *
 * Si más adelante implementamos lectura real de HID input reports
 * (ver plugin.js#initialize), este effect puede usar los eventos reales.
 */

'use strict';

// Estado interno entre frames: { keyId: intensity (0..1) }
const _keyIntensity = {};
const _lastPressTime = {};

const DECAY = 4.0;  // intensity por segundo que cae
const ADJACENT_FALLOFF = 0.5; // keys adyacentes a la press reciben X de intensidad

// Pre-calculamos keys adyacentes una vez. Como el layout no cambia,
// lo cacheamos en una variable estática al primer uso.
let _adjacencyCache = null;

function buildAdjacency(keys) {
    const adj = {};
    for (const k of keys) {
        adj[k.id] = [];
    }
    for (let i = 0; i < keys.length; i++) {
        const a = keys[i];
        for (let j = 0; j < keys.length; j++) {
            if (i === j) continue;
            const b = keys[j];
            // Adyacente = misma fila y a ≤ 1.5u de distancia (considera keys anchas)
            if (Math.abs(a.y - b.y) < 0.5 && Math.abs((a.x + a.width / 2) - (b.x + b.width / 2)) <= 1.5) {
                adj[a.id].push(b.id);
            }
        }
    }
    return adj;
}

module.exports = function typingReactiveEffect(device, params, ctx) {
    const color = params.color || [255, 200, 100];
    const intensityMul = params.intensity ?? 1.0;
    const dt = ctx.dt ?? (1 / 60); // delta time (s)

    // Construir cache de adyacencia la primera vez
    if (!_adjacencyCache) {
        _adjacencyCache = buildAdjacency(device.keys);
    }

    // 1. Aplicar decay a todas las intensidades existentes
    for (const keyId in _keyIntensity) {
        _keyIntensity[keyId] -= DECAY * dt;
        if (_keyIntensity[keyId] <= 0) {
            delete _keyIntensity[keyId];
        }
    }

    // 2. Procesar key presses nuevos (si los hay)
    //    `ctx.keyPresses` es un array de key IDs que se acaban de presionar
    //    en el frame actual. Si SignalRGB no provee esto, queda undefined y
    //    el effect solo decae (modo pasivo / background).
    const presses = ctx.keyPresses || [];
    for (const keyId of presses) {
        if (!_keyIntensity[keyId]) _keyIntensity[keyId] = 0;
        _keyIntensity[keyId] = Math.min(1, _keyIntensity[keyId] + 1.0);

        // Propagar a adyacentes
        const adj = _adjacencyCache[keyId] || [];
        for (const neighborId of adj) {
            if (!_keyIntensity[neighborId]) _keyIntensity[neighborId] = 0;
            _keyIntensity[neighborId] = Math.min(1, _keyIntensity[neighborId] + ADJACENT_FALLOFF);
        }
    }

    // 3. Pintar el framebuffer con las intensidades
    for (const keyId in _keyIntensity) {
        const intensity = _keyIntensity[keyId] * intensityMul;
        device.setKeyById(
            keyId,
            color[0] * intensity,
            color[1] * intensity,
            color[2] * intensity,
        );
    }
};

/**
 * Helper para que el plugin "empuje" un key press desde el HID input listener.
 * Llamar desde plugin.js cuando llega un HID report con una tecla nueva.
 */
module.exports.notifyPress = function notifyPress(keyId) {
    if (!_lastPressTime[keyId]) _lastPressTime[keyId] = 0;
    _lastPressTime[keyId] = Date.now();
    if (!_keyIntensity[keyId]) _keyIntensity[keyId] = 0;
    _keyIntensity[keyId] = 1.0;
};

/**
 * Resetea el estado del effect (útil al cambiar de effect).
 */
module.exports.reset = function reset() {
    for (const k in _keyIntensity) delete _keyIntensity[k];
    for (const k in _lastPressTime) delete _lastPressTime[k];
};
