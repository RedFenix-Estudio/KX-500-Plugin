/**
 * Smoke test — verifica que el plugin carga y el device se puede instanciar.
 * No toca hardware real (no abre HID).
 *
 * Uso:
 *   node test/smoke.js
 */

'use strict';

console.log('[smoke] Cargando KX500SignalRGBPlugin...');

try {
    const Plugin = require('../plugin');
    const Device = require('../device');
    const Protocol = require('../protocol/kx500');
    const Effects = require('../effects');

    console.log('[smoke] ✓ plugin.js carga OK');
    console.log('[smoke] ✓ device.js carga OK');
    console.log('[smoke] ✓ protocol/kx500.js carga OK');
    console.log('[smoke] ✓ effects/index.js carga OK');

    const device = new Device(null);
    console.log(`[smoke] ✓ Device instanciado: ${device.name}`);
    console.log(`[smoke] ✓ Layout: ${device.layout.rows}x${device.layout.cols}`);

    // Test setPixel + getFrame
    device.setPixel(2, 5, 255, 128, 64);
    const frame = device.getFrame();
    const pix = frame[2][5];
    if (pix[0] !== 255 || pix[1] !== 128 || pix[2] !== 64) {
        throw new Error('setPixel/getFrame mismatch');
    }
    console.log('[smoke] ✓ setPixel/getFrame funciona');

    // Test effect static
    device.clear();
    Effects.static(device, { r: 10, g: 20, b: 30 });
    const f2 = device.getFrame();
    if (f2[0][0][0] !== 10 || f2[0][0][1] !== 20 || f2[0][0][2] !== 30) {
        throw new Error('static effect failed');
    }
    console.log('[smoke] ✓ effect "static" funciona');

    // Test effect breathing (necesita ctx con time)
    device.clear();
    Effects.breathing(device, { r: 255, g: 0, b: 0 }, { time: 0 });
    Effects.breathing(device, { r: 255, g: 0, b: 0 }, { time: Math.PI / 2 });
    console.log('[smoke] ✓ effect "breathing" funciona');

    console.log('\n[smoke] ✅ Todo OK. El plugin carga y los effects funcionan.');
    process.exit(0);
} catch (err) {
    console.error('\n[smoke] ❌ FAIL:', err.message);
    console.error(err.stack);
    process.exit(1);
}
