// Carga el plugin y verifica que los exports existen
global.device = {
    log: (m) => console.log('[device.log]', m),
    setName: () => {},
    setSize: () => {},
    setControllableLeds: () => {},
    write: (data, len) => { writes.push({ data: Array.from(data), len }); },
    notify: () => {},
    color: (x, y) => [128, 64, 32],
};
const writes = [];

await import('../../KX500_Plugin.js').then((m) => {
    console.log('[OK] Plugin loaded, exports:', Object.keys(m).length);
    console.log('     Name():', m.Name());
    console.log('     Size():', m.Size());
    console.log('     VendorId():', '0x' + m.VendorId().toString(16));
    console.log('     ProductId():', m.ProductId().map(p => '0x' + p.toString(16)));
    console.log('     Type():', m.Type());
    console.log('     DeviceType():', m.DeviceType());
    console.log('     LedNames().length:', m.LedNames().length);
    console.log('     LedPositions().length:', m.LedPositions().length);
    console.log('     ControllableParameters().length:', m.ControllableParameters().length);
    console.log('     ConflictingProcesses():', m.ConflictingProcesses());
    console.log('     Validate({usage_page:0xFF1C,usage:0x92}):', m.Validate({ usage_page: 0xFF1C, usage: 0x92 }));
    console.log('     Validate({interface:1,endpoint:0x03}):', m.Validate({ interface: 1, endpoint: 0x03 }));
    console.log('     Validate({}):', m.Validate({}));

    // Llamar Initialize
    m.Initialize();
    console.log('[OK] Initialize() corrio sin errores. Writes:', writes.length);
    writes.length = 0;

    // Llamar Render (necesita globals LightingMode y forcedColor)
    global.LightingMode = 'Forced';
    global.forcedColor = '#ff8800';
    m.Render();
    console.log('[OK] Render() corrio. Writes:', writes.length, 'paquetes (esperaba 3: START + cmd + END)');
    writes.forEach((w, i) => {
        const d = w.data.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`     write[${i}] len=${w.len}: ${d}...`);
    });
    writes.length = 0;

    // Llamar Shutdown
    global.shutdownColor = '#000000';
    m.Shutdown(false);
    console.log('[OK] Shutdown(false) corrio. Writes:', writes.length);
    writes.length = 0;

    m.Shutdown(true);
    console.log('[OK] Shutdown(true) corrio. Writes:', writes.length);

    // Comparar un paquete con la captura
    console.log('');
    console.log('=== Validacion contra captura 01_solid_red.pcapng ===');
    console.log('Captura:    04 13 01 11 03 00 00 00 ff 00 00 00 00 00 00 00');
    console.log('Plugin rojo:', Array.from(m.buildSolidColor(255, 0, 0)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
}).catch((err) => {
    console.error('[FAIL]', err);
    process.exit(1);
});
