// validate_v3.js — verifica el plugin v3 contra las capturas del driver oficial
// Uso: node dev/test/validate_v3.js
'use strict';

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(here, '..', '..', 'KX500_Plugin.js');

// Stub del SDK de SignalRGB
globalThis.device = {
    log: () => {},
    pause: () => {},
    write: (pkt) => { globalThis.__writes.push(pkt.slice()); },
    setName: () => {},
    setSize: () => {},
    setControllableLeds: () => {},
    color: () => [0, 0, 0],
};
globalThis.__writes = [];

// Importar el plugin + un export extra para poder probar los builders internos
const src = readFileSync(pluginPath, 'utf8');
const tmp = join(here, '_tmp_kx500_under_test.mjs');
writeFileSync(tmp, src + `\nexport {
    buildStart as __tStart, buildEnd as __tEnd, buildGlobalColor as __tColor,
    buildKeyNormallyOn as __tKno, buildBrightness as __tBright,
    sendTransaction as __tSendTx, Initialize as __tInit,
};\n`);

const hex = (a) => Array.from(a.slice(0, 11)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
const hex4 = (a) => Array.from(a.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  [OK]   ${name}`); }
    else { fail++; console.log(`  [FAIL] ${name}${detail ? ' -> ' + detail : ''}`); }
}

let mod;
try {
    mod = await import('file://' + tmp.replace(/\\/g, '/'));
} catch (e) {
    console.error('No se pudo importar el plugin:', e.message);
    process.exit(1);
}

console.log('\n🧩 Layout');
const names = mod.LedNames();
const pos = mod.LedPositions();
const size = mod.Size();
check('104 teclas', names.length === 104, `${names.length}`);
check('104 posiciones', pos.length === 104, `${pos.length}`);
check('sin nombres duplicados', new Set(names).size === names.length);
check('todas dentro de Size', pos.every(([x, y]) => x >= 0 && x < size[0] && y >= 0 && y < size[1]), JSON.stringify(size));

const seen = new Map();
const repeated = [];
for (let i = 0; i < pos.length; i++) {
    const k = pos[i].join(',');
    if (seen.has(k)) repeated.push(`${k}: ${names[seen.get(k)]}/${names[i]}`);
    else seen.set(k, i);
}
check('sin posiciones repetidas', repeated.length === 0, repeated.join(' '));

console.log('\n📐 Filas');
for (let row = 0; row < size[1]; row++) {
    const xs = pos.filter((p) => p[1] === row).map((p) => p[0]).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(+(xs[i] - xs[i - 1]).toFixed(2));
    const bad = gaps.filter((g) => g < 0.9);
    console.log(`  y=${row}: ${String(xs.length).padStart(2)} teclas  x=[${xs[0]}..${xs[xs.length - 1]}]` +
        (bad.length ? `  ⚠ solapadas: ${bad.join(',')}` : '  ok'));
}

console.log('\n📦 Paquetes');
const start = mod.__tStart();
const end = mod.__tEnd();
const color = mod.__tColor(0x80, 0x00, 0x00);
const kno = mod.__tKno(0);
const bright = mod.__tBright(4);

check('START = 04 01 00 01', hex4(start) === '04 01 00 01', hex4(start));
check('END   = 04 02 00 02', hex4(end) === '04 02 00 02', hex4(end));
check('COLOR = 04 xx 01 06 03 05 00 00 80 00 00',
    color[0] === 0x04 && color[2] === 0x01 && color[3] === 0x06 &&
    color[4] === 0x03 && color[5] === 0x05 && color[8] === 0x80,
    hex(color));
check('KNO   = 04 xx 00 06 01 04 00 00 00',
    kno[2] === 0x00 && kno[3] === 0x06 && kno[4] === 0x01 && kno[5] === 0x04 && kno[8] === 0x00,
    hex(kno));
check('BRIGHT= 04 xx 00 06 01 01 00 00 04',
    bright[2] === 0x00 && bright[3] === 0x06 && bright[5] === 0x01 && bright[8] === 0x04,
    hex(bright));
check('todos miden 64 bytes', [start, end, color, kno, bright].every((p) => p.length === 64));

globalThis.__writes.length = 0;
mod.__tSendTx([mod.__tKno(0), mod.__tColor(0, 0, 0xFF)]);
check('transacción = 4 writes', globalThis.__writes.length === 4, `${globalThis.__writes.length}`);
check('orden START,KNO,COLOR,END',
    globalThis.__writes[0][3] === 0x01 &&
    globalThis.__writes[1][5] === 0x04 &&
    globalThis.__writes[2][5] === 0x05 &&
    globalThis.__writes[3][3] === 0x02,
    globalThis.__writes.map((w) => w[3].toString(16)).join(','));

console.log('\n🚀 Initialize');
globalThis.__writes.length = 0;
mod.__tInit();
const shapes = globalThis.__writes.map((w) => hex(w));
console.log('  writes: ' + shapes.join(' | '));
check('Initialize = handshake + START + BRIGHT + END', globalThis.__writes.length === 4, `${globalThis.__writes.length}`);
check('primer write es el handshake', globalThis.__writes[0][1] === 0xA2 && globalThis.__writes[0][2] === 0x03);
check('no manda ANIM_ID (06 01 00)',
    !globalThis.__writes.some((p) => p[3] === 0x06 && p[4] === 0x01 && p[5] === 0x00));

unlinkSync(tmp);

console.log(`\n${'═'.repeat(56)}\n  Total: ${pass + fail} | OK: ${pass} | FAIL: ${fail}\n${'═'.repeat(56)}`);
process.exit(fail === 0 ? 0 : 1);
