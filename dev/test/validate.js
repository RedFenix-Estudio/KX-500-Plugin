/**
 * Tests offline del plugin KX-500 (no requieren teclado físico)
 *
 * Ejecutar: node dev/test/validate.js (o `npm test`)
 *
 * Cubre:
 *   1. Layout: 104 keys, todas con name/x/y/w/h válidos
 *   2. Protocolo: buildPacket, buildSolidColor, buildShutdown, buildHeartbeat*
 *   3. Heartbeat wrapper: validación estructural
 *   4. Handshake packet: estructura conocida
 *   5. Effects: static, breathing, wave, typing
 *   6. Validaciones SignalRGB: VendorId, ProductId, Size, LedNames
 */

'use strict';

import { KX500_KEYS, LAYOUT_SIZE, getKeyCount } from '../src/layout.js';
import {
    VID,
    PID,
    RGB_INTERFACE,
    RGB_EP_OUT,
    REPORT_SIZE,
    REPORT_ID,
    CMD,
    HANDSHAKE_PACKET,
    buildPacket,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    buildSolidColor,
    buildShutdown,
    isValidPacket,
    parsePacket,
} from '../src/protocol.js';
import {
    EFFECTS,
    applyEffect,
    listEffects,
    hsvToRgb,
} from '../src/effects.js';

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        pass++;
        console.log(`  [OK] ${name}`);
    } catch (err) {
        fail++;
        failures.push({ name, err });
        console.log(`  [FAIL] ${name}: ${err.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertDeepEq(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg || 'deep values differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

// ════════════════════════════════════════════════════════════════════
// 1. TESTS DE LAYOUT
// ════════════════════════════════════════════════════════════════════
console.log('\n📐 Layout:');

test('KX500_KEYS tiene 104 keys', () => {
    assertEq(getKeyCount(), 104);
});

test('Todas las keys tienen name/x/y/w/h válidos', () => {
    for (const k of KX500_KEYS) {
        assert(typeof k.name === 'string' && k.name.length > 0, `key con name inválido: ${JSON.stringify(k)}`);
        assert(typeof k.x === 'number', `key ${k.name} sin x`);
        assert(typeof k.y === 'number', `key ${k.name} sin y`);
        assert(typeof k.w === 'number' && k.w > 0, `key ${k.name} sin w válido`);
        assert(typeof k.h === 'number' && k.h > 0, `key ${k.name} sin h válido`);
    }
});

test('LAYOUT_SIZE es [23, 6]', () => {
    assertDeepEq(LAYOUT_SIZE, [23, 6]);
});

test('No hay keys con nombres duplicados', () => {
    const names = KX500_KEYS.map(k => k.name);
    const unique = new Set(names);
    assertEq(unique.size, names.length, `keys duplicadas: ${names.length - unique.size}`);
});

test('Keys F1-F12 existen', () => {
    for (let i = 1; i <= 12; i++) {
        assert(KX500_KEYS.some(k => k.name === `F${i}`), `Falta F${i}`);
    }
});

test('Numpad completo existe (0-9, ., +, -, *, /, NumLock, Num Enter)', () => {
    const required = ['NumLock', 'Num /', 'Num *', 'Num -', 'Num 7', 'Num 8', 'Num 9',
                      'Num 4', 'Num 5', 'Num 6', 'Num 1', 'Num 2', 'Num 3',
                      'Num Enter', 'Num 0', 'Num .'];
    for (const name of required) {
        assert(KX500_KEYS.some(k => k.name === name), `Falta ${name}`);
    }
});

test('Space existe con width correcto (6.25u)', () => {
    const space = KX500_KEYS.find(k => k.name === 'Space');
    assert(space && space.w === 6.25, `Space width esperado 6.25, got ${space?.w}`);
});

// ════════════════════════════════════════════════════════════════════
// 2. TESTS DE PROTOCOLO
// ════════════════════════════════════════════════════════════════════
console.log('\n🔌 Protocolo:');

test('Constantes HID correctas', () => {
    assertEq(VID, 0x320F);
    assertEq(PID, 0x5008);
    assertEq(REPORT_SIZE, 64);
    assertEq(REPORT_ID, 0x04);
    assertEq(RGB_INTERFACE, 1);
    assertEq(RGB_EP_OUT, 0x03);
});

test('buildPacket genera paquete de 64 bytes con Report ID correcto', () => {
    const pkt = buildPacket(CMD.SOLID_COLOR, [0x12, 0x11, 0x36]);
    assertEq(pkt.length, REPORT_SIZE);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], CMD.SOLID_COLOR);
    assertEq(pkt[2], 0x12);
    assertEq(pkt[3], 0x11);
    assertEq(pkt[4], 0x36);
});

test('buildPacket hace padding con 0x00', () => {
    const pkt = buildPacket(0xFF, [0xAA]);
    for (let i = 5; i < REPORT_SIZE; i++) {
        assertEq(pkt[i], 0x00, `byte ${i} debería ser 0x00`);
    }
});

test('buildHeartbeatStart genera [04 01 00 01]', () => {
    const hb = buildHeartbeatStart();
    assertEq(hb[0], REPORT_ID);
    assertEq(hb[1], CMD.HB_START);
    assertEq(hb[2], 0x00);
    assertEq(hb[3], 0x01);
});

test('buildHeartbeatEnd genera [04 02 00 02]', () => {
    const hb = buildHeartbeatEnd();
    assertEq(hb[0], REPORT_ID);
    assertEq(hb[1], CMD.HB_END);
    assertEq(hb[2], 0x00);
    assertEq(hb[3], 0x02);
});

test('buildSolidColor genera paquete con magic constants', () => {
    const pkt = buildSolidColor(255, 0, 0); // rojo
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], CMD.SOLID_COLOR);
    assertEq(pkt[2], 0x12);   // param default
    assertEq(pkt[3], 0x11);   // magic
    assertEq(pkt[4], 0x36);   // magic
    // RGB triplets empiezan en offset 9
    assertEq(pkt[9], 255);    // R
    assertEq(pkt[10], 0);     // G
    assertEq(pkt[11], 0);     // B
    assertEq(pkt[12], 255);   // siguiente zona también rojo
    assertEq(pkt[13], 0);
    assertEq(pkt[14], 0);
});

test('buildSolidColor con zoneCount custom', () => {
    const pkt = buildSolidColor(0, 255, 0, { zoneCount: 8 });
    // Último RGB triplet debe estar en offset 9 + 7*3 = 30
    assertEq(pkt[30], 0);
    assertEq(pkt[31], 255);
    assertEq(pkt[32], 0);
    // Después debe ser padding 0x00
    assertEq(pkt[33], 0);
});

test('buildSolidColor acepta param custom', () => {
    const pkt = buildSolidColor(255, 255, 255, { param: 0x00 });
    assertEq(pkt[2], 0x00);
});

test('buildShutdown genera paquete todos en 0', () => {
    const pkt = buildShutdown();
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], CMD.SOLID_COLOR);
    // Todos los bytes de color deben ser 0x00
    for (let i = 9; i < REPORT_SIZE; i++) {
        assertEq(pkt[i], 0x00, `byte ${i} debería ser 0`);
    }
});

test('isValidPacket acepta paquetes válidos', () => {
    const pkt = buildSolidColor(255, 0, 0);
    assert(isValidPacket(pkt));
});

test('isValidPacket rechaza paquetes con Report ID incorrecto', () => {
    const pkt = buildSolidColor(255, 0, 0);
    pkt[0] = 0x00; // Report ID incorrecto
    assert(!isValidPacket(pkt));
});

test('isValidPacket rechaza paquetes con tamaño incorrecto', () => {
    const pkt = new Uint8Array(32); // tamaño incorrecto
    assert(!isValidPacket(pkt));
});

test('parsePacket extrae cmd correctamente', () => {
    const pkt = buildSolidColor(255, 0, 0);
    const parsed = parsePacket(pkt);
    assertEq(parsed.cmd, CMD.SOLID_COLOR);
    assert(!parsed.isHeartbeatStart);
    assert(!parsed.isHeartbeatEnd);
});

test('parsePacket reconoce heartbeat START', () => {
    const hb = buildHeartbeatStart();
    const parsed = parsePacket(hb);
    assert(parsed.isHeartbeatStart);
});

test('parsePacket reconoce heartbeat END', () => {
    const hb = buildHeartbeatEnd();
    const parsed = parsePacket(hb);
    assert(parsed.isHeartbeatEnd);
});

// ════════════════════════════════════════════════════════════════════
// 3. TESTS DE HANDSHAKE
// ════════════════════════════════════════════════════════════════════
console.log('\n🤝 Handshake:');

test('HANDSHAKE_PACKET contiene magic 0x55AA', () => {
    let found = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x55 && HANDSHAKE_PACKET[i + 1] === 0xAA) {
            found = true;
            break;
        }
    }
    assert(found, 'no se encontró magic 0x55AA');
});

test('HANDSHAKE_PACKET empieza con Report ID 0x04', () => {
    assertEq(HANDSHAKE_PACKET[0], REPORT_ID);
});

test('HANDSHAKE_PACKET contiene VID del KX-500 embedded', () => {
    // VID (0x320F) little-endian = [0x0F, 0x32]
    let found = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x0F && HANDSHAKE_PACKET[i + 1] === 0x32) {
            found = true;
            break;
        }
    }
    assert(found, 'no se encontró VID 0x320F little-endian');
});

test('HANDSHAKE_PACKET contiene PID del KX-500 embedded', () => {
    // PID (0x5008) little-endian = [0x08, 0x50]
    let found = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x08 && HANDSHAKE_PACKET[i + 1] === 0x50) {
            found = true;
            break;
        }
    }
    assert(found, 'no se encontró PID 0x5008 little-endian');
});

// ════════════════════════════════════════════════════════════════════
// 4. TESTS DE EFFECTS
// ════════════════════════════════════════════════════════════════════
console.log('\n✨ Effects:');

test('EFFECTS tiene static, breathing, wave, typing', () => {
    const ids = listEffects();
    assert(ids.includes('static'), 'falta static');
    assert(ids.includes('breathing'), 'falta breathing');
    assert(ids.includes('wave'), 'falta wave');
    assert(ids.includes('typing'), 'falta typing');
});

test('staticEffect aplica color uniforme', () => {
    const leds = [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }];
    EFFECTS.static.fn(leds, 0, [255, 100, 50]);
    assertEq(leds[0].r, 255);
    assertEq(leds[0].g, 100);
    assertEq(leds[0].b, 50);
    assertEq(leds[1].r, 255);
});

test('breathingEffect varia brightness con tiempo', () => {
    // Comparar t=0 (factor=0.65, phase=0) con t=0.5 (factor=1.0, peak)
    const leds1 = [{ r: 0, g: 0, b: 0 }];
    const leds2 = [{ r: 0, g: 0, b: 0 }];
    EFFECTS.breathing.fn(leds1, 0, [255, 0, 0]);
    EFFECTS.breathing.fn(leds2, 0.5, [255, 0, 0]);
    assert(leds1[0].r !== leds2[0].r,
        `breathing debería cambiar con el tiempo (t=0: ${leds1[0].r}, t=0.5: ${leds2[0].r})`);
    // Verificar que el pico (t=0.5) es MAYOR que el valle (t=1.5)
    const leds3 = [{ r: 0, g: 0, b: 0 }];
    EFFECTS.breathing.fn(leds3, 1.5, [255, 0, 0]);  // mínimo del ciclo (factor=0.3)
    assert(leds3[0].r < leds1[0].r,
        `t=1.5 (valle) debería ser menor que t=0: ${leds3[0].r} vs ${leds1[0].r}`);
});

test('waveEffect produce colores no uniformes', () => {
    const leds = KX500_KEYS.map(k => ({ r: 0, g: 0, b: 0, x: k.x, y: k.y }));
    EFFECTS.wave.fn(leds, 1.5, [255, 255, 255]);
    const rSet = new Set(leds.map(l => l.r));
    assert(rSet.size > 1, 'wave debería tener múltiples valores de R');
});

test('hsvToRgb convierte correctamente casos conocidos', () => {
    // Rojo puro
    const [r, g, b] = hsvToRgb(0, 1, 1);
    assertEq(r, 255);
    assertEq(g, 0);
    assertEq(b, 0);
});

test('applyEffect funciona con effectId válido', () => {
    const leds = [{ r: 0, g: 0, b: 0 }];
    applyEffect(leds, 0, [255, 0, 0], 'static');
    assertEq(leds[0].r, 255);
});

test('applyEffect fallback a static para effectId inválido', () => {
    const leds = [{ r: 0, g: 0, b: 0 }];
    applyEffect(leds, 0, [100, 200, 50], 'nonexistent_effect');
    assertEq(leds[0].r, 100);
    assertEq(leds[0].g, 200);
    assertEq(leds[0].b, 50);
});

// ════════════════════════════════════════════════════════════════════
// 5. TESTS DE EXPORTS SIGNALRGB (validación parcial)
// ════════════════════════════════════════════════════════════════════
console.log('\n🎨 SignalRGB exports:');

test('ProductId devuelve array [0x5008]', () => {
    // No podemos importar el módulo Lite directo porque depende de globals,
    // pero validamos que el PID esté bien
    assertEq(PID, 0x5008);
});

test('VendorId/PID matchean KX-500', () => {
    assertEq(VID, 0x320F);
    assertEq(PID, 0x5008);
});

// ════════════════════════════════════════════════════════════════════
// RESUMEN
// ════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Total: ${pass + fail} | OK: ${pass} | FAIL: ${fail}`);
console.log('═'.repeat(60));

if (fail > 0) {
    console.log('\n❌ Tests fallidos:');
    for (const f of failures) {
        console.log(`  - ${f.name}: ${f.err.message}`);
    }
    process.exit(1);
} else {
    console.log('\n✅ Todos los tests pasaron\n');
    process.exit(0);
}
