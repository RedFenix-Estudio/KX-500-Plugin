/**
 * Tests offline del plugin KX-500 v0.3.0
 *
 * Cubre:
 *   1. Layout: 104 keys, todas con name/x/y/w/h válidos
 *   2. Protocolo: buildOff, buildBrightness, buildSpeed, buildEffect, buildSolidColor
 *   3. SEQ counter: arranca en 0x08, incrementa monotónicamente
 *   4. Handshake packet: estructura conocida
 *   5. Validaciones (isValidPacket, parsePacket)
 */

'use strict';

import { KX500_KEYS, LAYOUT_SIZE, getKeyCount } from '../src/layout.js';
import {
    VID,
    PID,
    REPORT_SIZE,
    REPORT_ID,
    HANDSHAKE_PACKET,
    buildPacket,
    buildHeartbeatStart,
    buildHeartbeatEnd,
    buildOff,
    buildBrightness,
    buildSpeed,
    buildEffect,
    buildSolidColor,
    buildEffectMode,
    buildDirection,
    buildBreathing,
    buildColorfulNormallyOn,
    buildSetZonesBulk,
    buildSetSingleZone,
    nextSeq,
    resetSeq,
    getSeq,
    isValidPacket,
    isFullPacket,
    parsePacket,
} from '../src/protocol.js';

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

function assertBytes(actual, expected, msg) {
    if (actual.length !== expected.length) {
        throw new Error(`${msg || 'length differ'}: expected ${expected.length}, got ${actual.length}`);
    }
    for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(`${msg || 'byte differ'} at ${i}: expected 0x${expected[i].toString(16)}, got 0x${actual[i].toString(16)}`);
        }
    }
}

// ════════════════════════════════════════════════════════════════════
// 1. TESTS DE LAYOUT
// ════════════════════════════════════════════════════════════════════
console.log('\n📐 Layout:');

test('KX500_KEYS tiene 104 keys', () => {
    assertEq(getKeyCount(), 104);
});

test('LAYOUT_SIZE es [23, 6]', () => {
    assertDeepEq(LAYOUT_SIZE, [23, 6]);
});

test('Todas las keys tienen name/x/y/w/h válidos', () => {
    for (const k of KX500_KEYS) {
        assert(typeof k.name === 'string' && k.name.length > 0);
        assert(typeof k.x === 'number');
        assert(typeof k.y === 'number');
        assert(typeof k.w === 'number' && k.w > 0);
        assert(typeof k.h === 'number' && k.h > 0);
    }
});

// ════════════════════════════════════════════════════════════════════
// 2. TESTS DE PROTOCOLO — ACCIONES REALES CONFIRMADAS
// ════════════════════════════════════════════════════════════════════
console.log('\n🔌 Protocolo (comandos reales USBPcap-verified):');

test('VID/PID correctos', () => {
    assertEq(VID, 0x320F);
    assertEq(PID, 0x5008);
});

test('buildOff genera [04 08 00 06 01 01 + padding]', () => {
    const pkt = buildOff();
    assertEq(pkt.length, REPORT_SIZE);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], 0x08);
    assertEq(pkt[2], 0x00);
    assertEq(pkt[3], 0x06);
    assertEq(pkt[4], 0x01);
    assertEq(pkt[5], 0x01);
    // resto padding 0x00
});

test('buildBrightness(1) genera [04 09 00 06 01 01 00 00 01]', () => {
    const pkt = buildBrightness(1);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], 0x09);
    assertEq(pkt[2], 0x00);
    assertEq(pkt[3], 0x06);
    assertEq(pkt[4], 0x01);
    assertEq(pkt[5], 0x01);
    assertEq(pkt[6], 0x00);
    assertEq(pkt[7], 0x00);
    assertEq(pkt[8], 0x01);
});

test('buildBrightness(4) genera [04 0C 00 06 01 01 00 00 04]', () => {
    const pkt = buildBrightness(4);
    assertEq(pkt[1], 0x0C);
    assertEq(pkt[8], 0x04);
});

test('buildBrightness(0) = buildOff()', () => {
    const a = buildBrightness(0);
    const b = buildOff();
    assertBytes(a, b);
});

test('buildBrightness rechaza valores fuera de rango', () => {
    let threw = false;
    try { buildBrightness(5); } catch { threw = true; }
    assert(threw, 'expected exception for level=5');
    threw = false;
    try { buildBrightness(-1); } catch { threw = true; }
    assert(threw, 'expected exception for level=-1');
});

test('buildSpeed(1) genera [04 09 00 06 01 02]', () => {
    const pkt = buildSpeed(1);
    assertEq(pkt[1], 0x09);
    assertEq(pkt[3], 0x06);
    assertEq(pkt[4], 0x01);
    assertEq(pkt[5], 0x02);  // sub-cmd = 0x02 (speed)
});

test('buildSpeed(3) genera [04 0B 00 06 01 02 00 00 03]', () => {
    const pkt = buildSpeed(3);
    assertEq(pkt[1], 0x0B);
    assertEq(pkt[5], 0x02);
    assertEq(pkt[8], 0x03);
});

test('buildSpeed rechaza level=0', () => {
    let threw = false;
    try { buildSpeed(0); } catch { threw = true; }
    assert(threw);
});

test('buildEffect(5) = "breathing" genera [04 0C 00 06 01 00 00 00 05]', () => {
    const pkt = buildEffect(5);
    assertEq(pkt[1], 0x0C);
    assertEq(pkt[3], 0x06);
    assertEq(pkt[4], 0x01);
    assertEq(pkt[5], 0x00);  // sub-cmd 0x00 (effect select)
    assertEq(pkt[6], 0x00);
    assertEq(pkt[7], 0x00);
    assertEq(pkt[8], 0x05);
});

test('buildEffect(19) genera formato con flag 0x11', () => {
    // Effect 19 usa formato diferente (flag 0x11) — confirmado en captura.
    // SEQ exacto depende de cuántas acciones previas, pero formato sí es fijo.
    const pkt = buildEffect(19);
    assertEq(pkt[5], 0x11);  // flag para effects 16+
    assertEq(pkt[8], 0x03);  // 19 - 16 = 3
    assert(pkt[1] >= 0x08 + 18 && pkt[1] <= 0x08 + 20, `SEQ fuera de rango: 0x${pkt[1].toString(16)}`);
});

test('buildEffect rechaza effect=0 o 20', () => {
    let threw = false;
    try { buildEffect(0); } catch { threw = true; }
    assert(threw);
    threw = false;
    try { buildEffect(20); } catch { threw = true; }
    assert(threw);
});

test('buildSolidColor RGB triplets al final', () => {
    resetSeq();
    const pkt = buildSolidColor(255, 128, 64);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[2], 0x03);  // cmd = 0x03 (solid color)
    assertEq(pkt[3], 0x06);  // magic 06 03 05 00 00
    assertEq(pkt[4], 0x03);
    assertEq(pkt[5], 0x05);
    assertEq(pkt[6], 0x00);
    assertEq(pkt[7], 0x00);
    assertEq(pkt[8], 255);  // R
    assertEq(pkt[9], 128);  // G
    assertEq(pkt[10], 64);  // B
});

test('buildColorfulNormallyOn genera [04 0C 00 06 01 04 00 00 01]', () => {
    const pkt = buildColorfulNormallyOn();
    assertEq(pkt[1], 0x0C);
    assertEq(pkt[5], 0x04);
    assertEq(pkt[8], 0x01);
});

test('buildDirection genera paquete con magic 06 01 03', () => {
    const pkt = buildDirection(false);
    assertEq(pkt[3], 0x06);
    assertEq(pkt[4], 0x01);
    assertEq(pkt[5], 0x03);  // sub-cmd direction
    assertEq(pkt[8], 0xFF);  // reverse=false → 0xFF
});

// Per-zone builders (v0.5.0)

test('buildSetSingleZone genera paquete con magic 11 03', () => {
    const pkt = buildSetSingleZone(0xB7, 0xFF, 0x00, 0x00, 0x10);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], 0x10);
    assertEq(pkt[2], 0x01);
    assertEq(pkt[3], 0x11);
    assertEq(pkt[4], 0x03);
    assertEq(pkt[5], 0xB7);
    assertEq(pkt[6], 0x00);
    assertEq(pkt[7], 0x00);
    assertEq(pkt[8], 0xFF);
});

test('buildSetSingleZone acepta state 0x00 (off)', () => {
    const pkt = buildSetSingleZone(0xB7, 0x00, 0x00, 0x00, 0x10);
    assertEq(pkt[8], 0x00);
});

test('buildSetZonesBulk genera paquete con magic 11 36', () => {
    const zones = [0xFF, 0xFF, 0xFF, 0x00, 0x00, 0xFF];
    const pkt = buildSetZonesBulk(zones, 0x00, 0x00, 0x10);
    assertEq(pkt[0], REPORT_ID);
    assertEq(pkt[1], 0x10);
    assertEq(pkt[2], 6);
    assertEq(pkt[3], 0x11);
    assertEq(pkt[4], 0x36);
    assertEq(pkt[5], 0x00);
    assertEq(pkt[6], 0x00);
    assertEq(pkt[7], 0x00);
    assertEq(pkt[8], 0xFF);
    assertEq(pkt[9], 0xFF);
    assertEq(pkt[10], 0xFF);
    assertEq(pkt[11], 0x00);
    assertEq(pkt[12], 0x00);
    assertEq(pkt[13], 0xFF);
    assertEq(pkt[14], 0x00);  // padding
});

test('buildSetZonesBulk rechaza más de 56 zonas', () => {
    const zones = new Array(57).fill(0xFF);
    let threw = false;
    try { buildSetZonesBulk(zones); } catch { threw = true; }
    assert(threw);
});

test('buildSetZonesBulk acepta exactamente 56 zonas', () => {
    const zones = new Array(56).fill(0xFF);
    const pkt = buildSetZonesBulk(zones, 0x00, 0x00, 0x10);
    assertEq(pkt[2], 56);
});

test('buildSetZonesBulk permite param1 custom', () => {
    const pkt = buildSetZonesBulk([0xFF], 0x36, 0x00, 0x10);
    assertEq(pkt[5], 0x36);
});

test('buildSetZonesBulk permite flag custom', () => {
    const pkt = buildSetZonesBulk([0xFF], 0x00, 0x01, 0x10);
    assertEq(pkt[7], 0x01);
});

// ════════════════════════════════════════════════════════════════════
// 3. SEQ COUNTER
// ════════════════════════════════════════════════════════════════════
console.log('\n🔢 SEQ Counter:');

test('resetSeq() pone SEQ en 0x08', () => {
    resetSeq();
    assertEq(getSeq(), 0x08);
});

test('nextSeq() incrementa monotónicamente', () => {
    resetSeq();
    const a = nextSeq();
    const b = nextSeq();
    const c = nextSeq();
    assertEq(a, 0x08);
    assertEq(b, 0x09);
    assertEq(c, 0x0A);
});

test('SEQ se mantiene entre llamadas', () => {
    resetSeq();
    nextSeq();
    nextSeq();
    const before = getSeq();
    nextSeq();
    const after = getSeq();
    assertEq(after - before, 1);
});

// ════════════════════════════════════════════════════════════════════
// 4. HANDSHAKE
// ════════════════════════════════════════════════════════════════════
console.log('\n🤝 Handshake:');

test('HANDSHAKE_PACKET empieza con Report ID 0x04', () => {
    assertEq(HANDSHAKE_PACKET[0], REPORT_ID);
});

test('HANDSHAKE_PACKET contiene magic 0x55AA', () => {
    let found = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x55 && HANDSHAKE_PACKET[i + 1] === 0xAA) {
            found = true;
            break;
        }
    }
    assert(found);
});

test('HANDSHAKE_PACKET contiene VID y PID del KX-500', () => {
    // VID 0x320F little-endian = [0x0F, 0x32]
    let foundVid = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x0F && HANDSHAKE_PACKET[i + 1] === 0x32) {
            foundVid = true;
            break;
        }
    }
    assert(foundVid);
    // PID 0x5008 little-endian = [0x08, 0x50]
    let foundPid = false;
    for (let i = 0; i < HANDSHAKE_PACKET.length - 1; i++) {
        if (HANDSHAKE_PACKET[i] === 0x08 && HANDSHAKE_PACKET[i + 1] === 0x50) {
            foundPid = true;
            break;
        }
    }
    assert(foundPid);
});

// ════════════════════════════════════════════════════════════════════
// 5. VALIDACIONES
// ════════════════════════════════════════════════════════════════════
console.log('\n✅ Validaciones:');

test('buildHeartbeatStart genera [04 01 00 01]', () => {
    const hb = buildHeartbeatStart();
    assertEq(hb[0], REPORT_ID);
    assertEq(hb[1], 0x01);
    assertEq(hb[2], 0x00);
    assertEq(hb[3], 0x01);
});

test('buildHeartbeatEnd genera [04 02 00 02]', () => {
    const hb = buildHeartbeatEnd();
    assertEq(hb[0], REPORT_ID);
    assertEq(hb[1], 0x02);
    assertEq(hb[2], 0x00);
    assertEq(hb[3], 0x02);
});

test('isValidPacket acepta paquetes RGB', () => {
    const pkt = buildSolidColor(255, 0, 0);
    assert(isValidPacket(pkt));
});

test('isValidPacket rechaza paquetes con Report ID incorrecto', () => {
    const pkt = buildSolidColor(255, 0, 0);
    pkt[0] = 0x00;
    assert(!isValidPacket(pkt));
});

test('parsePacket extrae metadata correctamente', () => {
    resetSeq();
    const pkt = buildSolidColor(100, 200, 50);
    const parsed = parsePacket(pkt);
    assertEq(parsed.cmd, 0x03);
    assertEq(parsed.params[5], 100);
    assertEq(parsed.params[6], 200);
    assertEq(parsed.params[7], 50);
    assert(!parsed.isHeartbeatStart);
    assert(!parsed.isHeartbeatEnd);
});

test('parsePacket reconoce heartbeat START/END', () => {
    const hbS = buildHeartbeatStart();
    const hbE = buildHeartbeatEnd();
    assert(parsePacket(hbS).isHeartbeatStart);
    assert(parsePacket(hbE).isHeartbeatEnd);
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

function assertDeepEq(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg || 'deep differ'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}
