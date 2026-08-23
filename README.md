# KX-500 SignalRGB Plugin

> Plugin open-source para usar el teclado **Checkpoint Gaming KX-500** (NA-KB-1001, Naruto Edition) en **SignalRGB** (y en el futuro, otros entornos RGB), vía ingeniería inversa del protocolo HID del driver oficial. 100% portable: instalás el plugin, SignalRGB habla directo al canal HID del teclado.

---

## 🎮 Compatibilidad (scope)

| Estado | Entorno |
|---|---|
| ✅ **Ahora** | SignalRGB (este plugin) |
| 🔜 **Futuro** | OpenRGB, Aurora, KeyboardVisualizer, Razer Chroma SDK, iCUE, etc. |

La capa de protocolo (`protocol/kx500.js`) está **aislada** del binding con el SDK. Cuando agreguemos soporte para otro entorno (ej: OpenRGB), solo cambia el binding con su SDK — el RE del HID del teclado ya queda hecho.

Si alguien de la comunidad pide compatibilidad para otro RGB software, abrir un issue y se prioriza.

---

## 🔀 Sobre este proyecto (fork / basado en)

Este plugin es una **implementación nueva**, basada en arquitectura de referencia de:

- **[MRtojisan/portronics-hydra-10-SignalRGB-Plugin](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin)** — plantilla de plugin SignalRGB por device, open-source.

Arquitectura Hydra 10-style (`plugin.js` + `device.js` + `protocol/` + `effects/`). Toda la lógica específica del KX-500 (parseo de HID, layout, capabilities) es código nuevo escrito desde cero por el equipo de RedFenix Estudio.

**Créditos al autor del plugin original** por hacer pública la plantilla que usamos como referencia.

---

## 🎯 El problema que resolvemos

El KX-500 es un teclado RGB per-key con muchas capacidades, pero **el fabricante no provee SDK, plugin ni documentación del protocolo HID**. Eso lo deja fuera de SignalRGB, OpenRGB y otros ecosistemas abiertos.

Como usuario, te quedás usando solo el driver oficial de Checkpoint, con efectos limitados y sin sincronización con el resto de tu setup RGB.

**Este plugin es el puente**: aprende el idioma del teclado (vía USBPcap + Wireshark → reverse engineering) y lo expone como un device SignalRGB estándar.

---

## ✨ Capacidades del KX-500 (confirmadas con el teclado físico)

Estas son las capacidades del KX-500 que descubrió el dueño del teclado mientras experimentaba con el driver oficial. **El plugin está diseñado para aprovecharlas todas**:

### Per-key RGB con color mixing completo
> Cada tecla tiene su propio LED con R, G, B independientes. Las luces combinan entre sí formando cualquier color del espectro RGB — no es por zonas. Esto significa que **podemos pintar cualquier key de cualquier color** desde el plugin.

### Efectos fluidos sin lag
> El MCU del teclado interpola animaciones a alta frecuencia, así que los efectos se ven fluidos sin sentirse lageados. Esto sugiere que el driver probablemente **manda comandos de efecto** (no frames raw a 60fps) — el teclado corre la animación en hardware.

### Detección de velocidad de tipeo
> Cuando escribís, el teclado detecta la velocidad y acelera la animación. Eso significa que **el firmware reporta las teclas presionadas al host** vía HID Input reports (Usage Page 0x07 estándar). Podemos leer esos reports desde el plugin y usar la velocidad para modular efectos.

### Animación triggered por posición de tecla
> Al presionar una tecla, el teclado sabe **qué key se presionó** (por su HID Usage ID) y dispara la animación desde ahí — puede iluminar solo esa key o propagar hacia las vecinas. Eso lo hace el firmware on-board, pero nosotros podemos hacer lo mismo desde el plugin.

### Brightness control (en driver y en atajos de teclado)
> La intensidad RGB se puede modificar tanto desde el driver oficial como con atajos en el propio teclado. La captura USBPcap tiene que revelar la estructura del comando de brightness para que el plugin pueda exponerla.

### Resumen de implicaciones técnicas

| Capacidad | Implicación |
|---|---|
| Per-key RGB | Necesitamos un comando HID que setee color por key individual. |
| Efectos fluidos on-board | Probablemente hay dos modos: **raw frame** (host manda pixeles) y **effect command** (host manda "ejecuta X"). El RE tiene que descubrirlos. |
| Key press detection | Necesitamos abrir **dos canales HID a la vez**: RGB OUT (FF1C:0092) + Keyboard IN (Usage Page 0x07). |
| Brightness | Hay un comando HID dedicado (a descubrir) que setea brillo 0–100%. |

Toda esta info vive en [`PROTOCOL.md`](./PROTOCOL.md), que se actualiza a medida que avanza el RE.

---

## 🔌 Hardware soportado

| Campo | Valor |
|---|---|
| Marca | Checkpoint Gaming (cpgaming.com) |
| Modelo | KX-500 / NA-KB-1001 (Naruto Edition) |
| USB VID:PID | `320F:5008` |
| Canal HID RGB | Vendor Defined `FF1C:0092` |
| Layout | Full-size US English ANSI 104 keys (con numpad, F1-F12, nav cluster, Win/Fn/Menu, dos Ctrl/Alt/Shift) |
| Driver oficial | `CHECKPOINT KX-500 Keyboard Driver.exe` (instalado y funcional) |

---

## 📦 Instalación (usuarios)

1. Asegurate de tener SignalRGB instalado (Windows).
2. Descargá el `.zip` de la release más reciente desde [Releases](../../releases).
3. SignalRGB → `Settings` → `Plugins` → `Import Plugin` → seleccioná el `.zip`.
4. El KX-500 debería aparecer como dispositivo detectado.

---

## 🛠️ Desarrollo

```powershell
git clone https://github.com/RedFenix-Estudio/kx500-signalrgb-plugin.git
cd kx500-signalrgb-plugin
npm install
```

### Dependencias

- **node-hid**: habla directo con el HID Vendor Defined del KX-500.
- **SignalRGB Plugin SDK**: viene con SignalRGB, no se instala aparte.

### Herramientas para el RE (reverse engineering)

Las herramientas de captura USB están en [`tools/`](./tools/) — instaladores de USBPcap y Wireshark con guía de uso paso a paso.

---

## 🗂️ Estructura del proyecto

```
kx500-signalrgb-plugin/
├── plugin.js              # Entry point: clase que SignalRGB instancia
├── device.js              # Layout del teclado (104 keys, full-size US ANSI)
├── protocol/
│   └── kx500.js           # Implementación del protocolo HID (RE'd)
├── effects/               # Effects que el plugin expone
│   ├── static.js
│   ├── breathing.js
│   ├── wave.js
│   ├── reactive.js        # Audio-reactive
│   └── typing_reactive.js # Reacciona a teclas presionadas
├── tools/                 # USBPcap + Wireshark installers (ver tools/README.md)
├── examples/
│   └── wireshark-capture-guide.md   # Cómo hacer las capturas para el RE
├── test/
│   └── smoke.js           # Tests sin hardware
├── PROTOCOL.md            # Estado vivo del RE del protocolo HID
├── README.md              # Este archivo
├── LICENSE                # MIT
└── package.json
```

---

## 🔬 Estado del proyecto

**Fase actual:** skeleton + RE del protocolo HID en preparación.

Ver [`PROTOCOL.md`](./PROTOCOL.md) para el estado del RE (se va llenando a medida que avanzamos con las capturas USBPcap).

Timeline estimado:
1. **Setup**: instalar USBPcap + Wireshark (tools/README.md) ✅
2. **Capturas Parte A** (RGB OUT): 7 sesiones con el driver oficial cambiando colores / efectos.
3. **Capturas Parte B** (Keyboard IN): 4 sesiones para entender el reporte de key presses.
4. **Análisis**: diffs entre capturas, mapeo de bytes a comandos.
5. **Implementación `protocol/kx500.js`**.
6. **Tests con `node-hid`** contra el teclado real.
7. **Beta SignalRGB**.
8. **Release pública**.

---

## 🤝 Contribuir

PRs bienvenidos. Si querés sumar:

- Soporte para otro RGB software (OpenRGB, Aurora, etc.) — la capa `protocol/` está aislada para eso.
- Nuevos effects.
- Otros layouts del KX-500 (si hay variantes regionales).
- Reportes de issues / bugs / capturas.

Abrí un issue primero para coordinarlo si es algo grande.

---

## 🙏 Créditos

- **Arquitectura del plugin** basada en [MRtojisan/portronics-hydra-10-SignalRGB-Plugin](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin) — usado como referencia de plantilla. Toda la lógica específica del KX-500 es código nuevo.
- **Driver oficial analizado**: `CHECKPOINT KX-500 Keyboard Driver.exe` (instalado en el sistema para el RE).
- **Hardware info**: comunidad de Reddit / forums de KX-500 (a expandir cuando publiquemos).
- Hecho con 🐾 por [RedFenix Estudio](https://github.com/RedFenix-Estudio).

---

## 📜 Licencia

MIT — ver [`LICENSE`](./LICENSE).
