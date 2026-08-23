/**
 * Effect: Static Color
 *
 * Pinta todo el teclado de un solo color.
 */

'use strict';

module.exports = function staticEffect(device, params) {
    const r = params.r ?? 255;
    const g = params.g ?? 0;
    const b = params.b ?? 0;

    for (let row = 0; row < device.layout.rows; row++) {
        for (let col = 0; col < device.layout.cols; col++) {
            device.setPixel(row, col, r, g, b);
        }
    }
};
