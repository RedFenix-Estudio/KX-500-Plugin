// Test offline: carga el plugin y simula el ciclo de vida.
// Verifica exports, Validate, Initialize, Render y Shutdown.
global.device = {
    log: (m) => console.log('[device.log]', m),
    setName: () => {},
    setSize: () => {},
    setControllableLeds: () => {},
    write: (data, len) => { writes.push({ method: 'write', data: Array.from(data).slice(0, 16), len }); },
    send_report: (data, len) => { writes.push({ method: 'send_report', data: Array.from(data).slice(0, 16), len }); },
    control_transfer: (bmReqType, bReq, wVal, wIdx, data, wLen) => {
        writes.push({
            method: 'control_transfer',
            bmReqType,
            bReq,
            wVal: '0x' + wVal.toString(16).padStart(4, '0'),
            wIdx,
            data: Array.from(data).slice(0, 16),
            len: wLen,
        });
    },
    bulk_transfer: (endpoint, data, len) => {
        writes.push({
            method: 'bulk_transfer',
            endpoint: '0x' + endpoint.toString(16),
            data: Array.from(data).slice(0, 16),
            len,
        });
    },
    control_transfer: (bmReqType, bReq, wVal, wIdx, data, wLen, timeout) => {
        writes.push({
            method: 'control_transfer',
            bmReqType: '0x' + bmReqType.toString(16),
            bReq: '0x' + bReq.toString(16),
            wVal: '0x' + wVal.toString(16).padStart(4, '0'),
            wIdx,
            data: Array.from(data).slice(0, 16),
            len: wLen,
            timeout,
        });
    },
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
console.log('Type():', m.Type(), '<-- debe ser "rawusb"');
console.log('Size():', m.Size());
console.log('LedNames().length:', m.LedNames().length);
console.log('LedPositions().length:', m.LedPositions().length);
console.log('ControllableParameters().length:', m.ControllableParameters().length);
console.log('ConflictingProcesses():', m.ConflictingProcesses().join(', '));

console.log('\n=== Validate() — los 5 endpoints reales del KX-500 (de tu log) ===');
// Endpoints copiados EXACTAMENTE del log de SignalRGB del usuario.
// Formato del log: endpoint.interface, endpoint.usage, endpoint.usage_page, endpoint.collection
const endpoints = [
    { name: 'intf 1 col2 Consumer      ', e: { interface: 1, usage: 0x000c, usage_page: 0x0001, collection: 0x0002 } },
    { name: 'intf 1 col3 Consumer swap ', e: { interface: 1, usage: 0x0001, usage_page: 0x000c, collection: 0x0003 } },
    { name: 'intf 1 col4 Vendor RGB    ', e: { interface: 1, usage: 0x0092, usage_page: 0xff1c, collection: 0x0004 } },
    { name: 'intf 1 col1 Keyboard NKRO ', e: { interface: 1, usage: 0x0006, usage_page: 0x0001, collection: 0x0001 } },
    { name: 'intf 0 col0 BIOS Keyboard ', e: { interface: 0, usage: 0x0006, usage_page: 0x0001, collection: 0x0000 } },
];
for (const t of endpoints) {
    const matches = m.Validate(t.e);
    const flag = matches ? 'TAKE ' : 'skip ';
    console.log(`  ${flag} | ${t.name}`);
}

// Asercion dura
const rgb = endpoints.find(t => t.name.includes('RGB'));
if (!m.Validate(rgb.e)) {
    console.error('[FAIL] El RGB endpoint (FF1C:0092) no matchea! Validate esta rota.');
    process.exit(1);
}
const otros = endpoints.filter(t => !t.name.includes('RGB'));
for (const t of otros) {
    if (m.Validate(t.e)) {
        console.error(`[FAIL] ${t.name} matchea cuando NO deberia`);
        process.exit(1);
    }
}
console.log('[OK] Solo el RGB endpoint matchea, los otros 4 son ignorados');

console.log('\n=== Initialize() ===');
m.Initialize();
console.log('Writes despues de Initialize:', writes.length, '(esperaba 3: HB_START + HANDSHAKE + HB_END)');
writes.forEach((w, i) => {
    if (w.method === 'control_transfer') {
        console.log(`  [${i}] control_transfer(reqType=${w.bmReqType} req=${w.bReq} val=${w.wVal} idx=${w.wIdx} len=${w.len} timeout=${w.timeout}): ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
    } else if (w.method === 'bulk_transfer') {
        console.log(`  [${i}] bulk_transfer(endpoint=${w.endpoint} len=${w.len}): ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
    } else {
        console.log(`  [${i}] ${w.method}: ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`);
    }
});
writes.length = 0;

console.log('\n=== Render() — modo Canvas (promedio) ===');
global.LightingMode = 'Canvas';
m.Render();
console.log('Writes:', writes.length, '(esperaba 3)');
writes.forEach((w, i) => console.log(`  [${i}] ${w.method}: ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Render() — modo Forced (#ff8800) ===');
global.LightingMode = 'Forced';
global.forcedColor = '#ff8800';
m.Render();
console.log('Writes:', writes.length);
writes.forEach((w, i) => console.log(`  [${i}] ${w.method}: ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Shutdown() con shutdownColor #000000 ===');
global.shutdownColor = '#000000';
m.Shutdown(false);
console.log('Writes:', writes.length, '(esperaba 3, comando OFF 04 08 00 06 01 01)');
writes.forEach((w, i) => console.log(`  [${i}] ${w.method}: ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
writes.length = 0;

console.log('\n=== Shutdown(true) — sistema suspendiendo ===');
m.Shutdown(true);
console.log('Writes:', writes.length);
writes.forEach((w, i) => console.log(`  [${i}] ${w.method}: ${w.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}...`));
