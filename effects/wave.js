/**
 * Effect: Wave
 *
 * Onda de color que viaja de izquierda a derecha.
 * Combina N colores en gradiente.
 */

'use strict';

function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

module.exports = function waveEffect(device, params, ctx) {
    const colors = (params.colors || ['#ff0000', '#00ff00', '#0000ff'])
        .map(hexToRgb);
    const speed = params.speed ?? 1.0;

    const t = ctx.time * speed;

    for (let col = 0; col < device.layout.cols; col++) {
        // Posición normalizada del pixel en el gradiente
        const pos = ((col / device.layout.cols) + t * 0.1) % 1;
        const scaled = pos * colors.length;
        const idx = Math.floor(scaled) % colors.length;
        const frac = scaled - Math.floor(scaled);
        const next = (idx + 1) % colors.length;

        const r = colors[idx][0] * (1 - frac) + colors[next][0] * frac;
        const g = colors[idx][1] * (1 - frac) + colors[next][1] * frac;
        const b = colors[idx][2] * (1 - frac) + colors[next][2] * frac;

        for (let row = 0; row < device.layout.rows; row++) {
            device.setPixel(row, col, r, g, b);
        }
    }
};
