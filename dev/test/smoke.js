/**
 * Smoke test rápido del plugin KX-500
 *
 * Ejecutar: node dev/test/smoke.js
 *
 * Es un subset mínimo del validate.js, orientado a CI/CD rápido.
 */

'use strict';

import { KX500_KEYS, LAYOUT_SIZE } from '../src/layout.js';
import {
    VID, PID, REPORT_SIZE, REPORT_ID,
    buildSolidColor, buildOff, buildHeartbeatStart, buildHeartbeatEnd,
} from '../src/protocol.js';

console.log('🩺 KX-500 Smoke Test\n');

// Layout básico
console.log(`📐 Layout: ${KX500_KEYS.length} keys, size ${LAYOUT_SIZE[0]}×${LAYOUT_SIZE[1]}`);
if (KX500_KEYS.length !== 104) {
    console.error(`❌ Expected 104 keys, got ${KX500_KEYS.length}`);
    process.exit(1);
}

// HID básico
console.log(`🔌 HID: VID=0x${VID.toString(16)}, PID=0x${PID.toString(16)}, report=${REPORT_SIZE}B, id=0x${REPORT_ID.toString(16)}`);

// Build packets
const red = buildSolidColor(255, 0, 0);
const off = buildOff();
const hbS = buildHeartbeatStart();
const hbE = buildHeartbeatEnd();

console.log(`📦 Paquetes:`);
console.log(`   Solid Red:  ${Array.from(red.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
console.log(`   Shutdown:   ${Array.from(off.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
console.log(`   HB Start:   ${Array.from(hbS).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`   HB End:     ${Array.from(hbE).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

// Validar tamaños
const sizes = [red.length, off.length, hbS.length, hbE.length];
if (!sizes.every(s => s === REPORT_SIZE)) {
    console.error(`❌ Tamaños inconsistentes: ${sizes.join(', ')}`);
    process.exit(1);
}

console.log('\n✅ Smoke test passed\n');
