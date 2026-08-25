# KX-500 SignalRGB Plugin — Lite

> Plugin open-source para el teclado **Checkpoint Gaming KX-500 (NA-KB-1001, Naruto Edition)** en **SignalRGB**. Single-file JS, 104 keys full-size US ANSI, 7 presets HID configurables.

---

## 🎯 Quick Start (usuarios)

### Instalar desde SignalRGB

```
1. SignalRGB → Settings → User Plugins → Add Plugin
2. Pegá esta URL del repo:
   https://github.com/RedFenix-Estudio/KX-500-Plugin
3. Enable Streaming en el device detectado "Checkpoint KX-500 (NA-KB-1001)"
```

Si SignalRGB no acepta la URL del repo, instalá manualmente:

```
1. Descargá KX500_Lite.js (click derecho → Save link as)
   URL: https://raw.githubusercontent.com/RedFenix-Estudio/KX-500-Plugin/main/KX500_Lite.js
2. Copialo a: %LOCALAPPDATA%\VortxEngine\app-*\Signal-x64\Plugins\
3. Reiniciá SignalRGB
```

---

## 🛠️ Cambios recientes

| Versión | Fecha | Cambio |
|---|---|---|
| **v0.1.0** | 2026-08-25 | Plugin Lite con 7 presets HID configurables desde la UI |

### Qué hace el plugin (versión actual)

- ✅ **Detecta** el KX-500 en SignalRGB (verificado por Erik)
- ✅ **104 keys** declaradas con nombres oficiales de SignalRGB
- ✅ **Modo Canvas**: lee `device.color(x,y)` por key, SignalRGB aplica los effects
- ✅ **Modo Forced**: aplica color fijo configurable
- ✅ **7 presets HID** seleccionables desde la UI
- ⚠️ **Las luces NO encienden todavía** — depende del header HID real del KX-500

---

## 📂 Estructura del repo

```
KX-500-Plugin/
├── KX500_Lite.js          ← ÚNICO archivo que SignalRGB carga
├── LICENSE
├── package.json
│
├── dev/                   ← Desarrollo (no se usa en runtime)
│   ├── src/                  módulos ES para devs (layout, protocol, effects)
│   └── test/                 tests offline del plugin
│
├── examples/              ← Guías para devs
│   └── wireshark-capture-guide.md
│
└── tools/                 ← USBPcap + Wireshark (para calibrar el HID)
    ├── README.md
    ├── USBPcapSetup-1.5.4.0.exe
    └── Wireshark-4.6.8-x64.exe
```

**`KX500_Lite.js`** es el único archivo que SignalRGB necesita.
**Todo lo demás** es opcional — para devs (modular) o para la calibración HID.

---

## 🎮 Probar las luces en el teclado (settings UI)

En SignalRGB → Devices → Checkpoint KX-500 → vas a ver:

| Setting | Default | Para qué sirve |
|---|---|---|
| **HID Protocol Preset** | `sinowealth_8b` | **Probar las 7 variantes HID** si las luces no encienden |
| Effect | `static` | Internal effect para modo Forced |
| Effect Color | `#009bde` | Color base del effect |
| Brightness | `100` | Multiplicador global 0–100% |
| Lighting Mode | `Canvas` | `Canvas` = SignalRGB controla; `Forced` = color fijo |
| Forced Color | `#009bde` | Color cuando LightingMode=Forced |
| Shutdown Color | `#000000` | Color al apagar SignalRGB |

### 7 Presets HID disponibles

| Preset | Header | Report Size | Comentario |
|---|---|---|---|
| `sinowealth_8b` (default) | `06 08 00 00 01 00 7A 01` | 520B | Hydra 10 / Redragon K626 (probable) |
| `sinowealth_7b` | `00 08 00 00 01 00 7A 01` | 520B | sin 0x06 prefix |
| `vendor_4b_64` | `00 00 00 01` | 64B | Vendor minimal |
| `vendor_4b_520` | `00 00 00 01` | 520B | Vendor minimal large |
| `rgb_no_header` | (vacío) | 320B | Solo RGB raw |
| `rgb_64` | (vacío) | 64B | Solo RGB + 64B |
| `rgb_520` | (vacío) | 520B | Solo RGB + 520B |

Para probar: cambiá el preset, esperá unos segundos, mirá si las luces encienden. Si encontrás uno que funcione, decime cuál → lo pongo como default.

---

## 🔬 Calibración del header HID

El header HID exacto del KX-500 está oculto en el driver oficial. Para encontrarlo:

1. Cerrar SignalRGB
2. Iniciar driver oficial `CHECKPOINT_KX_500.exe` (en `C:\Program Files (x86)\CHECKPOINT KX-500\`)
3. Wireshark + USBPcap (instaladores en `tools/`)
4. Aplicar un color desde el driver oficial
5. Capturar el primer byte del paquete HID OUT
6. Editar `KX500_Lite.js` con los bytes reales (en `PROTOCOL_PRESETS`)
7. Reiniciar SignalRGB

Alternativas:
- **xperf** (built-in Windows) para ETW tracing USB
- **API Monitor** (gratis, rohitab.com) para capturar llamadas a HID.dll
- **WinDbg** con breakpoints condicionales en HidD_SetFeature

Ver `examples/wireshark-capture-guide.md` para la guía completa.

---

## 💻 Desarrollo (opcional)

```powershell
# Clonar
git clone https://github.com/RedFenix-Estudio/KX-500-Plugin.git
cd KX-500-Plugin

# Tests offline (sin teclado)
npm install
npm test
```

Salida esperada:
```
KX-500 SignalRGB Plugin Lite v2 — Offline Validator
...
Resultado: 45 ✅ / 0 ❌
```

---

## 🙏 Créditos

- **Arquitectura SignalRGB SDK** según [docs.signalrgb.com](https://docs.signalrgb.com/developer/plugins/)
- **Patrón SinoWealth HID** basado en [MRtojisan/portronics-hydra-10-SignalRGB-Plugin](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin)
- **Best practices** de [Redragon K626 plugin](https://github.com/lucas-hochmann-rosa/signalrgb-redragon-k626-plugin)
- 🐾 por [RedFenix Estudio](https://github.com/RedFenix-Estudio)

---

## 📜 Licencia

MIT — ver `LICENSE`.