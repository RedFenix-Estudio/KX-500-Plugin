// Validates that the plugin passes REGULAR ARRAY (not Uint8Array) to device.write()
global.device = {
    log: (m) => console.log('[log]', m),
    setName: () => {},
    setSize: () => {},
    setControllableLeds: () => {},
    write: (data, len) => {
        const isUint8 = data instanceof Uint8Array;
        const isRegular = Array.isArray(data);
        console.log(`  write() called: Array.isArray=${isRegular} Uint8Array=${isUint8} length=${data.length} len_param=${len}`);
    },
    pause: () => {},
    color: () => [128, 64, 32],
};

const m = await import('../../KX500_Plugin.js');

console.log('=== Initialize ===');
m.Initialize();

console.log('\n=== Render ===');
m.Render();
