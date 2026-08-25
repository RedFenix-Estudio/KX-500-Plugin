#!/usr/bin/env node
/**
 * KX-500 Plugin Validator (offline, ESM) — v2
 * ─────────────────────────────────────────────────────────────────
 * Verifica que KX500_Lite.js está bien formado y listo para SignalRGB.
 *
 * Cambios v2:
 *   - Valida que ProductId() retorne [array]
 *   - Valida que Initialize() llame setName/setSize/setControllableLeds
 *   - Valida que se llame device.pause() después de send_report
 *   - Valida que Validate filtre por interface + usage_page + usage
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// PLUGIN_PATH = ../KX500_Lite.js (raíz del repo)
const PLUGIN_PATH = path.resolve(__dirname, '..', '..', 'KX500_Lite.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  KX-500 SignalRGB Plugin Lite v2 — Offline Validator      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ─── 1. Cargar archivo ──────────────────────────────────────────────
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

// ─── 3. Sandbox con device stub completo ────────────────────────────
console.log('\n3. Cargando plugin en sandbox (device stub v2)...');

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
globalThis.shutdownColor = "#000000";
globalThis.LightingMode = "Canvas";
globalThis.forcedColor = "#009bde";
globalThis.brightness = 100;
globalThis.effect = "static";
globalThis.effectColor = "#009bde";
globalThis.protocolPreset = "sinowealth_8b";

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
console.log('\n4. Exports individuales (v2 requirements)...');
check('Name() devuelve string', typeof plugin.Name() === 'string', `"${plugin.Name()}"`);
check('Publisher() definido', typeof plugin.Publisher() === 'string', `"${plugin.Publisher()}"`);
check('VendorId() = 0x320F', plugin.VendorId() === 0x320F, `0x${plugin.VendorId().toString(16)}`);
check('ProductId() retorna ARRAY', Array.isArray(plugin.ProductId()), `tipo: ${typeof plugin.ProductId()}`);
check('ProductId()[0] = 0x5008', plugin.ProductId()[0] === 0x5008, `0x${plugin.ProductId()[0].toString(16)}`);
check('Type() = "hid"', plugin.Type() === 'hid');
check('DeviceType() = "keyboard"', plugin.DeviceType() === 'keyboard');
check('Documentation() definida', typeof plugin.Documentation() === 'string' && plugin.Documentation().includes('github.com'));
check('ImageUrl() retorna raw.githubusercontent.com',
    typeof plugin.ImageUrl() === 'string' && plugin.ImageUrl().includes('raw.githubusercontent.com'),
    plugin.ImageUrl());

const [sw, sh] = plugin.Size();
check('Size() devuelve [w,h]', Array.isArray(plugin.Size()) && plugin.Size().length === 2, `${sw}×${sh}`);

const ledNames = plugin.LedNames();
const ledPositions = plugin.LedPositions();
check('LedNames() es array', Array.isArray(ledNames));
check('LedPositions() es array', Array.isArray(ledPositions));
check('LedNames y LedPositions paralelos', ledNames.length === ledPositions.length, `${ledNames.length} keys`);

// ─── 5. 104 keys ───────────────────────────────────────────────────
console.log('\n5. Layout (104 keys esperado)...');
check('Cantidad exacta de keys = 104', plugin.KX500_KEYS.length === 104, `${plugin.KX500_KEYS.length} declaradas`);

let maxX = 0, maxY = 0;
for (const k of plugin.KX500_KEYS) {
    if (k.x + k.w > maxX) maxX = k.x + k.w;
    if (k.y + k.h > maxY) maxY = k.y + k.h;
}
check('Bounding box coherente', Math.ceil(maxX) === sw && Math.ceil(maxY) === sh,
    `calc ${Math.ceil(maxX)}×${Math.ceil(maxY)} vs Size() ${sw}×${sh}`);

// ─── 6. Nombres oficiales ──────────────────────────────────────────
console.log('\n6. Nombres vs lista oficial SignalRGB...');
const KNOWN_NAMES = new Set([
    'Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Print Screen', 'Scroll Lock', 'Pause Break',
    '`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace',
    'Insert', 'Home', 'Page Up',
    'Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\',
    'Del', 'End', 'Page Down',
    'Caps Lock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', '\u2019', 'Enter',
    'Left Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Right Shift',
    'Up Arrow',
    'Left Ctrl', 'Left Win', 'Left Alt', 'Space', 'Right Alt', 'Fn', 'Menu', 'Right Ctrl',
    'Left Arrow', 'Down Arrow', 'Right Arrow',
    'NumLock', 'Num /', 'Num *', 'Num -', 'Num 7', 'Num 8', 'Num 9', 'Num +',
    'Num 4', 'Num 5', 'Num 6', 'Num 1', 'Num 2', 'Num 3', 'Num Enter',
    'Num 0', 'Num .',
]);

const unknownNames = ledNames.filter(n => !KNOWN_NAMES.has(n));
check('Todos los nombres son oficiales', unknownNames.length === 0,
    unknownNames.length > 0 ? `desconocidos: ${unknownNames.join(', ')}` : '');

// ─── 7. ConflictingProcesses ────────────────────────────────────────
console.log('\n7. ConflictingProcesses...');
const conflicts = plugin.ConflictingProcesses();
check('ConflictingProcesses devuelve array', Array.isArray(conflicts));
check('Bloquea Mechanical Keyboard.exe', conflicts.some(p => p.toLowerCase().includes('mechanical')));

// ─── 8. ControllableParameters ──────────────────────────────────────
console.log('\n8. ControllableParameters...');
const params = plugin.ControllableParameters();
check('ControllableParameters devuelve array', Array.isArray(params));
check('Tiene setting "LightingMode"', params.some(p => p.property === 'LightingMode'));
check('Tiene setting "forcedColor"', params.some(p => p.property === 'forcedColor'));
check('Tiene setting "shutdownColor"', params.some(p => p.property === 'shutdownColor'));

// ─── 9. Validate — versión v2 ───────────────────────────────────────
console.log('\n9. Validate() — v2 (interface + usage_page + usage)...');
const rgbEndpoint = {
    interface: 1,
    usage_page: 0xFF1C,
    usage: 0x0092,
    collection: 0x0004,
};
check('Validate(1, FF1C:0092) = true', plugin.Validate(rgbEndpoint) === true);

const wrongInterface = { interface: 0, usage_page: 0xFF1C, usage: 0x0092 };
check('Validate(interface=0) = false', plugin.Validate(wrongInterface) === false);

const wrongUsagePage = { interface: 1, usage_page: 0x0001, usage: 0x0092 };
check('Validate(usage_page=0x0001) = false', plugin.Validate(wrongUsagePage) === false);

const wrongUsage = { interface: 1, usage_page: 0xFF1C, usage: 0x0006 };
check('Validate(usage=0x0006) = false', plugin.Validate(wrongUsage) === false);

// ─── 10. Lifecycle + device.* calls ────────────────────────────────
console.log('\n10. Lifecycle + device API calls (v2 requirements)...');

callLog.length = 0;
plugin.Initialize();

const setNameCall = callLog.find(c => c[0] === 'setName');
const setSizeCall = callLog.find(c => c[0] === 'setSize');
const setLedsCall = callLog.find(c => c[0] === 'setControllableLeds');
const probeLog = callLog.find(c => c[0] === 'log' && c[1][0]?.includes?.('Protocol probe'));

check('Initialize() llama device.setName', !!setNameCall, setNameCall ? `"${setNameCall[1]}"` : 'NO LLAMA');
check('Initialize() llama device.setSize', !!setSizeCall, setSizeCall ? `${JSON.stringify(setSizeCall[1])}` : 'NO LLAMA');
check('Initialize() llama device.setControllableLeds', !!setLedsCall, setLedsCall ? `${setLedsCall[1]} keys` : 'NO LLAMA');
check('Initialize() llama device.send_report (probe)', !!callLog.find(c => c[0] === 'send_report'));
check('Initialize() llama device.pause(1)', !!callLog.find(c => c[0] === 'pause' && c[1] === 1));
check('Initialize() log "Protocol probe OK"', !!probeLog);

callLog.length = 0;
plugin.Render();
check('Render() llama send_report', !!callLog.find(c => c[0] === 'send_report'));
check('Render() llama pause(1)', !!callLog.find(c => c[0] === 'pause' && c[1] === 1));

callLog.length = 0;
plugin.Shutdown(false);
check('Shutdown(false) llama send_report', !!callLog.find(c => c[0] === 'send_report'));
check('Shutdown(false) llama pause(1)', !!callLog.find(c => c[0] === 'pause' && c[1] === 1));

callLog.length = 0;
plugin.Shutdown(true);
check('Shutdown(true) llama send_report', !!callLog.find(c => c[0] === 'send_report'));

// ─── 11. Frame HID sanity ──────────────────────────────────────────
console.log('\n11. Frame HID sanity...');
check('PROTOCOL_PRESETS existe',
    plugin.PROTOCOL_PRESETS && typeof plugin.PROTOCOL_PRESETS === 'object');
check('7 presets disponibles',
    Object.keys(plugin.PROTOCOL_PRESETS).length === 7,
    Object.keys(plugin.PROTOCOL_PRESETS).join(', '));
check('DEFAULT_PRESET = "sinowealth_8b"',
    plugin.DEFAULT_PRESET === 'sinowealth_8b');
check('Preset sinowealth_8b tiene header correcto',
    plugin.PROTOCOL_PRESETS.sinowealth_8b.header.join(',') === '6,8,0,0,1,0,122,1');
check('Preset sinowealth_8b tiene reportSize=520',
    plugin.PROTOCOL_PRESETS.sinowealth_8b.reportSize === 520);

// ─── Resumen ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  Resultado: ${pass} ✅ / ${fail} ❌`);
console.log('══════════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);