# KX-500 SignalRGB Plugin — Lite

> Plugin open-source para usar el teclado **Checkpoint Gaming KX-500** (NA-KB-1001, Naruto Edition) en **SignalRGB** (Free / Pro / Light Points — **NO** Community Edition). Habla directo al canal HID Vendor Defined del teclado, bypassing el driver oficial.

---

## 🚀 Quick Start (usuarios)

```
1. Descargá KX500_Lite.js de la última release
2. SignalRGB → Settings → User Plugins → Open Plugins Folder
3. Copiá KX500_Lite.js a esa carpeta
4. Reiniciá SignalRGB
5. Devices → "Checkpoint KX-500 (NA-KB-1001) — Lite" → Enable Streaming
6. Cerrá "Mechanical Keyboard.exe" si estaba corriendo
```

→ Detalles en [`INSTALL.md`](./INSTALL.md)

---

## 🎯 Lo que hace este plugin Lite

| Feature | Estado | Notas |
|---|---|---|
| Layout 104 keys declarado | ✅ | Full-size US ANSI, todos los nombres oficiales de SignalRGB |
| Validación de endpoint HID | ✅ | Filtra correctamente FF1C:0092 (excluye keyboard 07:06) |
| Effect: Static | ✅ | Color sólido |
| Effect: Breathing | ✅ | Pulso lento |
| Effect: Wave | ✅ | Ola horizontal HSV |
| Effect: Reactive | ✅ | Audio-reactive (usa el audio engine de SignalRGB) |
| Effect: Typing | ✅ | Pulso desde el centro (placeholder hasta tener canal HID IN) |
| Lighting Mode Canvas | ✅ | Lee `device.color(x,y)` per key |
| Lighting Mode Forced | ✅ | Color fijo ignorando el canvas |
| Brightness slider | ✅ | Multiplicador 0-100% |
| Shutdown color | ✅ | Color al apagar SignalRGB |
| Conflicting processes | ✅ | Bloquea `Mechanical Keyboard.exe` y `HidServ.exe` |
| Plugin Analytics | ✅ | `usesAudio: true` para reactive |
| Sintaxis ESM válida | ✅ | `node --check` pasa |
| **HID frames al teclado** | ⚠️ **Best-effort** | Patrón SinoWealth (Hydra 10). Necesita calibración con USBPcap para el KX-500 real. |

El plugin **carga y declara todo el layout correctamente** incluso si el protocolo HID best-effort no matchea al teclado físico. Cuando se calibra el comando HID con la captura USBPcap, las luces empiezan a responder.

---

## 🔌 Hardware soportado

| Campo | Valor |
|---|---|
| Marca | Checkpoint Gaming (cpgaming.com) |
| Modelo | KX-500 / NA-KB-1001 (Naruto Edition) |
| USB VID:PID | `320F:5008` |
| Canal HID RGB | Vendor Defined `FF1C:0092` |
| Layout | Full-size US English ANSI 104 keys (con numpad, F1-F12, nav cluster, Win/Fn/Menu, dos Ctrl/Alt/Shift) |
| Driver oficial | `CHECKPOINT KX-500 Keyboard Driver.exe` (instalado en el sistema, **cerrarlo** antes de usar el plugin) |

---

## 📦 Estado del proyecto

**Versión actual: 0.1.0 Lite (skeleton funcional)**

Esta es una versión Lite — carga correctamente en SignalRGB, declara el layout, expone todos los effects, pero el protocolo HID es **best-effort** (basado en el patrón SinoWealth 0x08 que es el más común en teclados HID Vendor Defined). Necesita calibración con captura USBPcap para funcionar al 100% con el KX-500 físico.

### Por qué Lite

El RE completo del protocolo HID requiere:
1. USBPcap + Wireshark corriendo en Windows
2. Driver oficial del KX-500 abierto (para tener tráfico RGB)
3. Capturar cada efecto/color mientras el driver oficial lo aplica
4. Diffear entre capturas para encontrar el patrón de bytes
5. Implementar el protocolo real en `protocol/kx500.js`

Erik está haciendo este RE. Mientras tanto, esta versión Lite permite:
- ✅ Verificar que SignalRGB reconoce el dispositivo
- ✅ Ver el layout 104 keys en el canvas
- ✅ Probar todos los effects desde la UI
- ✅ Cuando se calibre el HID, las luces funcionan sin tocar nada más

### Próximos pasos

1. **Captura USBPcap** — Erik corre Wireshark con USBPcap mientras aplica colores desde el driver oficial
2. **Análisis del protocolo** — diffing entre capturas, mapeo de bytes a comandos
3. **Calibración del Lite** — sustituir los bytes del header en `buildFrame()` con los reales
4. **Canal HID Keyboard IN** — confirmar si podemos leer keypresses para `typing_reactive` real
5. **Release 1.0** — protocolo cerrado, efectos nativos completos

Ver [`PROTOCOL.md`](./PROTOCOL.md) para el estado vivo del RE.

---

## 🗂️ Estructura del proyecto

```
kx500-signalrgb-plugin/
├── KX500_Lite.js           # ← Single file que SignalRGB carga (LO ÚNICO NECESARIO)
├── INSTALL.md              # Guía de instalación para usuarios
├── README.md               # Este archivo
├── PROTOCOL.md             # Estado vivo del RE del HID
├── LICENSE                 # MIT
│
├── src/                    # Módulos ES (para desarrollo/tests)
│   ├── layout.js           # Layout 104 keys (export buildLayout, buildKeyMap)
│   ├── protocol.js         # KX500Protocol class con buildFrame() + probe()
│   └── effects.js          # Effects: static, breathing, wave, reactive, typing
│
├── test/
│   ├── validate.js         # Validador offline del plugin (30 checks)
│   └── smoke.js            # Smoke test de src/ (22 checks)
│
├── plugin.js               # [LEGACY] Entry point original (Hydra 10 style)
├── device.js               # [LEGACY] Layout (mantenido por compatibilidad)
├── protocol/
│   └── kx500.js            # [LEGACY] Stub del protocolo (mantenido)
├── effects/                # [LEGACY] Effects modulares antiguos
│
├── examples/
│   └── wireshark-capture-guide.md  # Cómo hacer capturas USBPcap
├── tools/                  # USBPcap + Wireshark installers
└── package.json
```

**Lo que importa para SignalRGB:** solo `KX500_Lite.js`. Lo demás es para devs y el RE.

---

## 🧪 Tests

```bash
npm install     # no requiere deps (node-hid es opcional)
npm test        # corre validate.js + smoke.js → 52 checks ✅
```

```
> node test/validate.js
  30 ✅ / 0 ❌  — Plugin SignalRGB Lite OK

> node test/smoke.js
  22 ✅ / 0 ❌  — src/ modular OK
```

Los tests son **offline** — no requieren el teclado conectado ni SignalRGB corriendo. Validan:
- Sintaxis ES module
- Exports del SDK SignalRGB (Name, VendorId, ProductId, Size, Validate, ControllableParameters, etc.)
- Layout completo (104 keys, bounding box coherente, nombres oficiales)
- Lifecycle (Initialize, Render, Shutdown sin crashear)
- Frame HID sanity (header + 320 bytes)

---

## 🛠️ Desarrollo / calibración

### Para devs

```bash
git clone https://github.com/RedFenix-Estudio/kx500-signalrgb-plugin.git
cd kx500-signalrgb-plugin
npm install
npm test
```

### Para calibrar el HID del KX-500

1. Conectá el teclado
2. Iniciá `Mechanical Keyboard.exe` (driver oficial)
3. Iniciá Wireshark con USBPcap (`tools/USBPcapSetup-1.5.4.0.exe` ya está en el repo)
4. Filtro: `usb.transfer_type == 0x01 && usb.src == "host"`
5. Aplicá un color sólido desde el driver oficial
6. La captura muestra los bytes exactos
7. Editá `KX500_Lite.js` → `buildFrame()` con los bytes reales
8. `npm test` para verificar
9. Reiniciá SignalRGB

Más detalle en [`examples/wireshark-capture-guide.md`](./examples/wireshark-capture-guide.md).

### Estructura del RE

Toda la info del RE (Ghidra project, procmon captures, pcap files, HidServ.dll decompilado) está en `E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\driver_RE\` (no está en este repo — es muy pesado).

---

## 🤝 Contribuir

PRs bienvenidos. Issues / capturas / protocolos nuevos: [GitHub Issues](../../issues).

Para sumarse:
- Otros layouts del KX-500 (ISO, TKL si existen)
- Soporte para OpenRGB / Aurora / KeyboardVisualizer (la capa `protocol/` está aislada)
- Nuevos effects
- Calibración del HID con capturas reales

---

## 🙏 Créditos

- **Arquitectura** del plugin SDK SignalRGB según [docs.signalrgb.com/developer/plugins/](https://docs.signalrgb.com/developer/plugins/).
- **Patrón SinoWealth** del frame HID basado en [MRtojisan/portronics-hydra-10-SignalRGB-Plugin](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin) (CC0).
- **Driver oficial analizado**: `CHECKPOINT KX-500 Keyboard Driver.exe` + `HidServ.dll` (decompilados en `driver_RE/`).
- 🐾 por [RedFenix Estudio](https://github.com/RedFenix-Estudio).

---

## 📜 Licencia

MIT — ver [`LICENSE`](./LICENSE).