# KX-500 SignalRGB Plugin

> Plugin SignalRGB para el teclado **Checkpoint KX-500** (NA-KB-1001) — Leaf Ninja Naruto Edition.
>
> Estado actual: **v0.2.0-dev** — protocolo HID **confirmado por captura USBPcap+Wireshark** (2026-08-26).

---

## 🎯 ¿Qué hace este plugin?

Permite que SignalRGB controle las luces RGB del KX-500, incluyendo:

- ✅ **Color sólido** por toda la superficie del teclado
- ✅ **Modo Canvas** — SignalRGB pinta cualquier efecto sobre el framebuffer y lo manda al teclado
- ✅ **Modo Forced** — color fijo con effect interno (static / breathing / wave / typing)
- ✅ **Brightness** global (0-100%)
- ✅ **Shutdown color** al apagar SignalRGB

**Lo que aún NO funciona (pendiente capturas individuales):**
- ⏳ Per-key RGB preciso (actualmente envía color promedio)
- ⏳ Detección exacta de zonas RGB (sospechamos ~16-19, no 104)
- ⏳ Efectos nativos del KX-500 (breathing/wave del firmware)

---

## 🚀 Instalación rápida

1. **Cerrar SignalRGB**
2. **Cerrar** el driver oficial de Checkpoint (`CHECKPOINT_KX_500.exe`, `HidServ.exe`)
3. **Copiar** `KX500_Lite.js` a tu carpeta de plugins SignalRGB
   - Default Windows: `%LOCALAPPDATA%\WhirlwindFX\SignalRGB\Plugins\`
4. **Abrir** SignalRGB
5. **Activar** el plugin → el KX-500 debería aparecer como "Checkpoint KX-500"
6. **Probar** con un effect básico (rainbow, static color, etc.)

Ver [INSTALL.md](./INSTALL.md) para troubleshooting detallado.

---

## 🧬 Protocolo HID (resumen técnico)

| Campo | Valor |
|---|---|
| VID | `0x320F` |
| PID | `0x5008` |
| Endpoint RGB | interface 1, endpoint `0x03 OUT` (Interrupt) |
| Report ID | `0x04` |
| Tamaño paquete | `64 bytes` |
| Transporte | HID Output Report (`device.write()`) |
| Layout | 104 keys full-size US ANSI |

**Estructura de paquete:**
```
[0x04] [CMD] [PARAMETROS...] [padding 0x00 hasta 64 bytes]
```

**Heartbeat wrapper** (cada comando real va envuelto):
```
[04 01 00 01 ... pad]  ← START
[ ... comando real ...]
[04 02 00 02 ... pad]  ← END
```

Ver [PROTOCOL.md](./PROTOCOL.md) para el análisis completo con captura USBPcap.

---

## 🗂️ Estructura del repo

```
kx500-signalrgb-plugin/
├── KX500_Lite.js              ← single-file plugin para SignalRGB
├── PROTOCOL.md                ← análisis del protocolo HID
├── README.md                  ← este archivo
├── INSTALL.md                 ← guía de instalación
├── ANALYSIS.md                ← análisis previo (Ghidra, Procmon, etc.)
├── LICENSE                    ← MIT
├── package.json               ← npm scripts (test, smoke)
├── dev/
│   ├── src/
│   │   ├── protocol.js        ← módulo de protocolo (buildPacket, etc.)
│   │   ├── layout.js          ← 104 keys del KX-500
│   │   ├── effects.js         ← effects internos (static, breathing, etc.)
│   │   └── usb/               ← (reservado para futuros helpers USB)
│   ├── test/
│   │   ├── validate.js        ← tests completos (35 tests)
│   │   └── smoke.js           ← smoke test rápido
│   └── captures/              ← capturas USBPcap del KX-500
│       ├── teclado_captura_mixta.pcapng   ← captura inicial (mezcla de acciones)
│       ├── extract_rgb_packets.ps1        ← script de extracción
│       ├── inspect_basico.ps1
│       ├── inspect_deep.ps1
│       ├── inspect_interrupts.ps1
│       ├── inspect_rgb_hex.ps1            ← análisis principal de comandos
│       ├── inspect_rgb_out.ps1
│       ├── inspect_descriptors.ps1
│       └── kx500_analyze_pcap.py          ← parser standalone
```

---

## 🧪 Tests

```bash
# Desde la raíz del repo
npm test            # 35 tests del layout, protocolo, effects
npm run test:smoke  # smoke test rápido
npm run inspect     # ver paquetes RGB de la captura USBPcap
npm run extract     # extraer paquetes HID RGB del pcap
```

**Estado actual: 35/35 ✅**

---

## 🤝 Contribuir

El proyecto está en RE activo. Las áreas donde más ayuda necesitamos:

1. **Capturas individuales** — Si tenés el KX-500, hacé capturas separadas para cada acción (ver [PROTOCOL.md#checklist](./PROTOCOL.md))
2. **Validación de comandos** — Probar los efectos nativos del firmware desde SignalRGB
3. **Refinamiento del protocolo** — Ayudar a mapear bytes → acciones

---

## 📜 Licencia

MIT © RedFenix Estudio

---

## 🔗 Links

- Repo: https://github.com/RedFenix-Estudio/KX-500-Plugin
- Documentación SignalRGB: https://docs.signalrgb.com/
- USBPcap: https://desowin.org/usbpcap/
- Protocolo similar (Sinowealth 258a:0049): https://github.com/kn4oqw-clint/redragon-ks82b-rgb
