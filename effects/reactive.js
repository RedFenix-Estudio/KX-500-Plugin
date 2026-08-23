/**
 * Effect: Reactive (audio)
 *
 * Requiere que SignalRGB provea un contexto de audio en ctx.audio.
 * Cada columna reacciona a la energía de su banda de frecuencia.
 */

'use strict';

module.exports = function reactiveEffect(device, params, ctx) {
    const baseColor = params.color || [0, 120, 255];
    const sensitivity = params.sensitivity ?? 1.0;

    const audio = ctx.audio || [];
    const bins = audio.length;

    for (let col = 0; col < device.layout.cols; col++) {
        const band = bins > 0 ? audio[Math.floor((col / device.layout.cols) * bins)] : 0;
        const intensity = Math.min(1, band * sensitivity);

        for (let row = 0; row < device.layout.rows; row++) {
            // Fade vertical: las filas superiores brillan más
            const rowFade = 1 - (row / device.layout.rows) * 0.6;
            device.setPixel(
                row,
                col,
                baseColor[0] * intensity * rowFade,
                baseColor[1] * intensity * rowFade,
                baseColor[2] * intensity * rowFade,
            );
        }
    }
};
