// Test offline: carga el plugin y simula el ciclo de vida.
// Verifica exports, Validate, Initialize, Render y Shutdown.
global.device = {
    log: (m) => console.log('[device.log]', m),
    setName: () => {},
    setSize: () => {},
    setControllableLeds: () => {},
    write: (data, len) => { writes.push({ data: Array.from(data).slice(0, 16), len }); },
    notify: () => {},
    color: (x, y) => [128, 64, 32],
};
const writes = [];

const m = await import('../../KX500_Plugin.js');

console.log('=== Plugin cargado ===');
console.log('Exports:', Object.keys(m).length);
console.log('Name():', m.Name());
console.log('VendorId():', '0x' + m.VendorId().toString(16));
console.log('ProductId():', m.ProductId().map(p => '0x' + p.toString(16)));
console.log('Type():', m.Type());
console.log('Size():', m.Size());
console.log('LedNames().length:', m.LedNames().length);
console.log('LedPositions().length:', m.LedPositions().length);
console.log('ControllableParameters().length:', m.ControllableParameters().length);
console.log('ConflictingProcesses():', m.ConflictingProcesses().join(', '));

console.log('\n=== Validate() ===');
// Endpoints que el KX-500 expone (segun el README):
const endpoints = [
    // Interface 0 — BIOS Keyboard (NO tiene endpoint OUT, escribir falla)
    { name: 'BIOS Keyboard (intf 0, Keyboard TLC)', e: { interface: 0, usage_page: 0x01, usage: 0x06, collection: 0 } },
    { name: 'NKRO Keyboard  (intf 0, Keyboard TLC)', e: { interface: 0, usage_page: 0x01, usage: 0x06, collection: 1 } },
    { name: 'Vendor Defined (intf 0, FF1C:0092)   ', e: { interface: 0, usage_page: 0xFF1C, usage: 0x0092, collection: 4 } },
    // Interface 1 — RGB Mouse (TIENE endpoints 0x82 IN + 0x03 OUT, este es el bueno)
    { name: 'RGB Mouse      (intf 1, Generic Mouse)', e: { interface: 1, usage_page: 0x01, usage: 0x02, collection: 0 } },
    // Endpoint suelto sin matchear
    { name: 'Random HID     (intf 0, Consumer)     ', e: { interface: 0, usage_page: 0x0C, usage: 0x01, collection: 0 } },
];
for (const t of endpoints) {
    console.log(`  Validate() = ${String(m.Validate(t.e)).padEnd(5)} | ${t.name}`);
}

console.log('\n=== Initialize() ===');
m.Initialize();
console.log('Writes despues de Initialize:', writes.length, '(esperaba 3: HB_START + HANDSHAKE + HB_END)');
writes.forEach((w, i) => console.log(`  [${i}] ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Render() — modo Canvas (promedio) ===');
global.LightingMode = 'Canvas';
m.Render();
console.log('Writes:', writes.length, '(esperaba 3)');
writes.forEach((w, i) => console.log(`  [${i}] ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Render() — modo Forced (#ff8800) ===');
global.LightingMode = 'Forced';
global.forcedColor = '#ff8800';
m.Render();
console.log('Writes:', writes.length);
writes.forEach((w, i) => console.log(`  [${i}] ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Shutdown() con shutdownColor #000000 ===');
global.shutdownColor = '#000000';
m.Shutdown(false);
console.log('Writes:', writes.length, '(esperaba 3, comando OFF 04 08 00 06 01 01)');
writes.forEach((w, i) => console.log(`  [${i}] ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Shutdown(true) — sistema suspendiendo ===');
m.Shutdown(true);
console.log('Writes:', writes.length);
writes.forEach((w, i) => console.log(`  [${i}] ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
