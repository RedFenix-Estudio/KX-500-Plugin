/**
 * Effect: Breathing
 *
 * Fade in/out del color base. El effect corre en el render loop,
 * así que cada frame actualizamos la intensidad con la fase actual.
 */

'use strict';

module.exports = function breathingEffect(device, params, ctx) {
    const r = params.r ?? 0;
    const g = params.g ?? 200;
    const b = params.b ?? 255;
    const speed = params.speed ?? 1.0; // 0.1 - 5.0

    const phase = (ctx.time * speed) % (Math.PI * 2);
    const intensity = (Math.sin(phase) + 1) / 2; // 0..1

    for (let row = 0; row < device.layout.rows; row++) {
        for (let col = 0; col < device.layout.cols; col++) {
            device.setPixel(
                row,
                col,
                r * intensity,
                g * intensity,
                b * intensity,
            );
        }
    }
};
