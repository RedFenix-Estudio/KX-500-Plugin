#!/usr/bin/env node
/**
 * KX-500 Plugin Validator (offline, ESM) — minimalist version
 * ─────────────────────────────────────────────────────────────────
 * Verifica que KX500_Lite.js está bien formado y listo para SignalRGB.
 * Versión minimalista — valida lo mínimo indispensable.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_PATH = path.join(__dirname, '..', 'KX500_Lite.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  KX-500 SignalRGB Plugin Lite — Minimalist Validator       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ─── 1. Cargar ──────────────────────────────────────────────────────
console.log('1. Cargando plugin...');
const src = fs.readFileSync(PLUGIN_PATH, 'utf8');
check('Archivo existe', src.length > 0, `${src.length} bytes`);

// ─── 2. Sintaxis ────────────────────────────────────────────────────
console.log('\n2. Sintaxis ES module...');
try {
    const tmpFile = path.join(__dirname, '__tmp_check.mjs');
    fs.writeFileSync(tmpFile, src);
    execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
    fs.unlinkSync(tmpFile);
    check('Sintaxis ES module válida', true);
} catch (err) {
    check('Sintaxis ES module válida', false, err.message);
    process.exit(1);
}

// ─── 3. Sandbox ─────────────────────────────────────────────────────
console.log('\n3. Cargando plugin en sandbox...');

const callLog = [];
const deviceStub = {
    log: (...args) => callLog.push(['log', args]),
    send_report: (...args) => callLog.push(['send_report', args[0]?.length || 0]),
    write: (...args) => callLog.push(['write', args[0]?.length || 0]),
    color: (x, y) => [0, 0, 0],
    audioLevel: 0,
    notify: (...args) => callLog.push(['notify', args]),
    pause: (ms) => callLog.push(['pause', ms]),
    setName: (name) => callLog.push(['setName', name]),
    setSize: (size) => callLog.push(['setSize', size]),
    setControllableLeds: (names, positions) => callLog.push(['setControllableLeds', names.length]),
    setImageFromUrl: (url) => callLog.push(['setImageFromUrl', url]),
    productId: () => 0x5008,
    vendorId: () => 0x320F,
};

globalThis.device = deviceStub;
// Inyectar las globals que SignalRGB provee en runtime
globalThis.shutdownColor = "#000000";
globalThis.LightingMode = "Canvas";
globalThis.forcedColor = "#009bde";

let plugin;
try {
    const url = pathToFileURL(PLUGIN_PATH).href;
    plugin = await import(url);
    check('Plugin cargado como ES module', true);
} catch (err) {
    check('Plugin cargado como ES module', false, err.message);
    process.exit(1);
}

// ─── 4. Exports individuales ────────────────────────────────────────
console.log('\n4. Exports individuales...');
check('Name() string', typeof plugin.Name() === 'string', `"${plugin.Name()}"`);
check('Publisher() string', typeof plugin.Publisher() === 'string', `"${plugin.Publisher()}"`);
check('VendorId() = 0x320F', plugin.VendorId() === 0x320F);
check('ProductId() retorna array', Array.isArray(plugin.ProductId()), `[${plugin.ProductId()}]`);
check('ProductId()[0] = 0x5008', plugin.ProductId()[0] === 0x5008);
check('Type() = "hid"', plugin.Type() === 'hid');
check('DeviceType() = "keyboard"', plugin.DeviceType() === 'keyboard');
check('Documentation() URL', plugin.Documentation()?.includes('github.com/RedFenix-Estudio/KX-500-Plugin'),
    plugin.Documentation());

const [sw, sh] = plugin.Size();
check('Size() devuelve [w,h]', Array.isArray(plugin.Size()) && plugin.Size().length === 2, `${sw}×${sh}`);

const ledNames = plugin.LedNames();
const ledPositions = plugin.LedPositions();
check('LedNames() array', Array.isArray(ledNames));
check('LedPositions() array', Array.isArray(ledPositions));
check('LedNames y LedPositions paralelos',
    ledNames.length === ledPositions.length && ledNames.length === 104,
    `${ledNames.length} keys`);

// ─── 5. Validate ───────────────────────────────────────────────────
console.log('\n5. Validate()...');
check('Validate(1, FF1C:0092) = true',
    plugin.Validate({ interface: 1, usage_page: 0xFF1C, usage: 0x0092 }));
check('Validate(interface=0) = false',
    !plugin.Validate({ interface: 0, usage_page: 0xFF1C, usage: 0x0092 }));
check('Validate(usage_page=0x0001) = false',
    !plugin.Validate({ interface: 1, usage_page: 0x0001, usage: 0x0092 }));
check('Validate(usage=0x0006) = false',
    !plugin.Validate({ interface: 1, usage_page: 0xFF1C, usage: 0x0006 }));

// ─── 6. ConflictingProcesses ────────────────────────────────────────
console.log('\n6. ConflictingProcesses...');
const conflicts = plugin.ConflictingProcesses();
check('ConflictingProcesses array', Array.isArray(conflicts));
check('Bloquea Mechanical Keyboard.exe',
    conflicts.some(p => p.toLowerCase().includes('mechanical')));

// ─── 7. ControllableParameters ──────────────────────────────────────
console.log('\n7. ControllableParameters...');
const params = plugin.ControllableParameters();
check('ControllableParameters array', Array.isArray(params));
check('Tiene "LightingMode"',
    params.some(p => p.property === 'LightingMode'));
check('Tiene "forcedColor"',
    params.some(p => p.property === 'forcedColor'));
check('Tiene "shutdownColor"',
    params.some(p => p.property === 'shutdownColor'));

// ─── 8. Lifecycle ───────────────────────────────────────────────────
console.log('\n8. Lifecycle (v2 requirements)...');

callLog.length = 0;
plugin.Initialize();
check('Initialize() llama device.setName',
    !!callLog.find(c => c[0] === 'setName'),
    callLog.find(c => c[0] === 'setName')?.[1]);
check('Initialize() llama device.setSize',
    !!callLog.find(c => c[0] === 'setSize'),
    JSON.stringify(callLog.find(c => c[0] === 'setSize')?.[1]));
check('Initialize() llama device.setControllableLeds(104)',
    callLog.find(c => c[0] === 'setControllableLeds')?.[1] === 104);

callLog.length = 0;
plugin.Render();
check('Render() llama send_report', !!callLog.find(c => c[0] === 'send_report'));
check('Render() llama pause(1)', !!callLog.find(c => c[0] === 'pause' && c[1] === 1));

callLog.length = 0;
plugin.Shutdown(false);
check('Shutdown(false) llama send_report', !!callLog.find(c => c[0] === 'send_report'));

callLog.length = 0;
plugin.Shutdown(true);
check('Shutdown(true) llama send_report', !!callLog.find(c => c[0] === 'send_report'));

// ─── 9. No exports innecesarios ────────────────────────────────────
console.log('\n9. No exports innecesarios...');
const expectedExports = ['Name', 'Publisher', 'VendorId', 'ProductId', 'Type',
    'DeviceType', 'Size', 'LedNames', 'LedPositions', 'Documentation',
    'ImageUrl', 'Validate', 'ControllableParameters', 'ConflictingProcesses',
    'Initialize', 'Render', 'Shutdown'];
const actualExports = Object.keys(plugin).filter(k => typeof plugin[k] === 'function');
const extraExports = actualExports.filter(e => !expectedExports.includes(e));
check('No hay exports extra', extraExports.length === 0,
    extraExports.length > 0 ? `extras: ${extraExports.join(', ')}` : `${actualExports.length} exports limpios`);

// ─── Resumen ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  Resultado: ${pass} ✅ / ${fail} ❌`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);