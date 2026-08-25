#!/usr/bin/env node
/**
 * Smoke test para src/ modular.
 * Verifica que los módulos independientes funcionan sin HID.
 *
 * Usage: node test/smoke.js
 */

import { buildLayout, buildKeyMap } from '../src/layout.js';
import { KX500Protocol, VID, PID } from '../src/protocol.js';
import { getEffectsList, effectStatic, effectBreathing, effectWave, hsvToRgb } from '../src/effects.js';

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
    else    { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  KX-500 src/ — Smoke Test                                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ── Layout ───────────────────────────────────────────────────────
console.log('1. src/layout.js');
const layout = buildLayout();
check('buildLayout() OK', !!layout);
check('104 keys', layout.count === 104, `${layout.count} keys`);
check('Size coherente', Array.isArray(layout.size) && layout.size.length === 2, `${layout.size.join('×')}`);
check('LedNames.length === count', layout.ledNames.length === layout.count);
check('LedPositions.length === count', layout.ledPositions.length === layout.count);

const km = buildKeyMap();
check('buildKeyMap() OK', Object.keys(km).length === layout.count);
check('Esc key existe en map', !!km['Esc']);
check('Space key existe en map', !!km['Space']);
check('Space key tiene w=6.25', km['Space']?.w === 6.25);

// ── Protocol ─────────────────────────────────────────────────────
console.log('\n2. src/protocol.js');
check('VID = 0x320F', VID === 0x320F, `0x${VID.toString(16)}`);
check('PID = 0x5008', PID === 0x5008, `0x${PID.toString(16)}`);

const proto = new KX500Protocol();
check('KX500Protocol instance', !!proto);

// Test buildFrame sinowealth (default)
const mockLeds = layout.ledNames.map((name, i) => ({
    r: i * 2, g: 128, b: 255 - i * 2, name,
    x: layout.ledPositions[i][0], y: layout.ledPositions[i][1],
}));

proto.mode = 'sinowealth';
const sinowealthFrame = proto.buildFrame(mockLeds);
check('buildFrame(sinowealth) header correcto',
    sinowealthFrame[0] === 0x06 && sinowealthFrame[1] === 0x08,
    `header: ${sinowealthFrame.slice(0, 8).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
check('buildFrame(sinowealth) size coherente',
    sinowealthFrame.length >= 320,
    `${sinowealthFrame.length} bytes`);

proto.mode = 'fixed_header';
proto.command = 0x08;
proto.reportId = 0x00;
const fixedFrame = proto.buildFrame(mockLeds);
check('buildFrame(fixed_header) header correcto',
    fixedFrame[0] === 0x00 && fixedFrame[1] === 0x08,
    `header: ${fixedFrame.slice(0, 4).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);

proto.mode = 'corsair';
const corsairFrame = proto.buildFrame(mockLeds);
check('buildFrame(corsair) header OK (padding 7 bytes 0)',
    corsairFrame.slice(0, 7).every(b => b === 0x00),
    `header: ${corsairFrame.slice(0, 7).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);

// ── Effects ──────────────────────────────────────────────────────
console.log('\n3. src/effects.js');
const effects = getEffectsList();
check('getEffectsList() >= 5 effects', effects.length >= 5, `${effects.length} effects`);
check('Effect IDs únicos', new Set(effects.map(e => e.id)).size === effects.length);

const staticLeds = mockLeds.map(l => ({ ...l }));
effectStatic(staticLeds, { color: [255, 0, 0] });
check('effectStatic aplica rojo', staticLeds.every(l => l.r === 255 && l.g === 0 && l.b === 0));

const breathingLeds = mockLeds.map(l => ({ ...l }));
effectBreathing(breathingLeds, { color: [0, 255, 0], time: 0.5 });
check('effectBreathing no crashea', breathingLeds.every(l => l.r >= 0 && l.r <= 255));

const waveLeds = mockLeds.map(l => ({ ...l }));
effectWave(waveLeds, { time: 1.0 });
check('effectWave no crashea', waveLeds.every(l => l.r >= 0 && l.r <= 255));

// HSV helper
const [r, g, b] = hsvToRgb(0, 1, 1); // pure red
check('hsvToRgb(0,1,1) = rojo', r === 255 && g === 0 && b === 0);

// Resumen
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  Resultado: ${pass} ✅ / ${fail} ❌`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);