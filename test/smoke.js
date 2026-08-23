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

    // Test setKeyById (key-aware) - calculamos la posición esperada con
    // la misma lógica de redondeo que usa device.js.
    device.clear();
    device.setKeyById('A', 255, 0, 0);
    device.setKeyById('Space', 0, 255, 0);
    const fm = device.getFrame();
    const posA = device.getKeyPosition('A');
    const posSpace = device.getKeyPosition('Space');
    if (fm[posA.row][posA.col][0] !== 255) throw new Error('setKeyById "A" failed');
    if (fm[posSpace.row][posSpace.col][1] !== 255) throw new Error('setKeyById "Space" failed');
    console.log(`[smoke] ✓ setKeyById (key-aware) funciona — A en [${posA.row},${posA.col}], Space en [${posSpace.row},${posSpace.col}]`);

    // Test que tenemos 104 keys (full-size US ANSI)
    const keyCount = device.getKeyCount();
    if (keyCount !== 104) throw new Error(`Esperaba 104 keys, hay ${keyCount}`);
    console.log(`[smoke] ✓ Layout: ${keyCount} keys (full-size US ANSI)`);

    // Test effect typing_reactive
    device.clear();
    Effects.typing_reactive.reset();
    Effects.typing_reactive(device, { color: [255, 200, 100] }, { time: 0, dt: 0.016, keyPresses: ['A', 'Space'] });
    const fm2 = device.getFrame();
    let litKeys = 0;
    for (let r = 0; r < fm2.length; r++) {
        for (let c = 0; c < fm2[r].length; c++) {
            if (fm2[r][c][0] > 0 || fm2[r][c][1] > 0 || fm2[r][c][2] > 0) litKeys++;
        }
    }
    if (litKeys === 0) throw new Error('typing_reactive no prendió nada');
    console.log(`[smoke] ✓ effect "typing_reactive" prendió ${litKeys} slots`);

    console.log('\n[smoke] ✅ Todo OK. El plugin carga y los effects funcionan.');
    process.exit(0);
} catch (err) {
    console.error('\n[smoke] ❌ FAIL:', err.message);
    console.error(err.stack);
    process.exit(1);
}
