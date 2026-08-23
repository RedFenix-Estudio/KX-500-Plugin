# KX-500 SignalRGB Plugin

> Plugin open-source para usar el teclado **Checkpoint Gaming KX-500** (NA-KB-1001, Naruto Edition) en **SignalRGB**, vía ingeniería inversa del protocolo HID del driver oficial.

## 🎯 Objetivo

Hacer el KX-500 compatible con el ecosistema SignalRGB (efectos, sincronización con otros devices, audio-reactive, etc.) sin tocar el firmware del teclado. 100% portable: instalás el plugin, SignalRGB habla directo al canal HID RGB del teclado.

> Las animaciones por-imagen (Doom, sprites, Bad Apple) son **out of scope** de este plugin. Eso va aparte, en otra capa que se apoyará en este plugin ya hecho.

## 🔌 Hardware soportado

| Campo | Valor |
|---|---|
| Marca | Checkpoint Gaming (cpgaming.com) |
| Modelo | KX-500 / NA-KB-1001 (Naruto edition) |
| USB VID:PID | `320F:5008` |
| Canal HID RGB | Vendor Defined `FF1C:0092` |
| Layout | TKL (ver [`device.js`](./device.js)) |

## 📦 Instalación (usuarios)

1. Asegurate de tener SignalRGB instalado (Windows).
2. Descargá el `.zip` de la release más reciente desde [Releases](../../releases).
3. SignalRGB → `Settings` → `Plugins` → `Import Plugin` → seleccioná el `.zip`.
4. El KX-500 debería aparecer como dispositivo detectado.

## 🛠️ Desarrollo

```powershell
git clone https://github.com/RedFenix-Estudio/kx500-signalrgb-plugin.git
cd kx500-signalrgb-plugin
npm install
# El RE del protocolo se documenta en /examples/wireshark-capture-guide.md
```

### Dependencias

- **node-hid**: habla directo con el HID Vendor Defined del KX-500.
- **SignalRGB Plugin SDK**: viene con SignalRGB, no se instala aparte.

## 🗂️ Estructura

```
kx500-signalrgb-plugin/
├── plugin.js              # Entry point: clase que SignalRGB instancia
├── device.js              # Layout del teclado (mapa de keys → zonas RGB)
├── protocol/
│   └── kx500.js           # Implementación del protocolo HID (RE'd)
├── effects/               # Efectos SignalRGB que el plugin expone
│   ├── static.js
│   ├── breathing.js
│   ├── wave.js
│   └── reactive.js
├── examples/
│   └── wireshark-capture-guide.md
├── test/
│   └── smoke.js
├── README.md
├── LICENSE
└── package.json
```

## 🔬 Estado del proyecto

**Fase actual:** skeleton + captura RE del protocolo HID.

Ver [`PROTOCOL.md`](./PROTOCOL.md) para el estado del RE (se va llenando a medida que avanzamos).

## 🤝 Contribuir

PRs bienvenidos. Si querés sumar layouts (full-size, 60%, etc.) o efectos nuevos, abrí un issue primero para coordinarlo.

## 📜 Licencia

MIT — ver [`LICENSE`](./LICENSE).

## 🙏 Créditos

- Arquitectura inspirada en [MRtojisan/portronics-hydra-10-SignalRGB-Plugin](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin).
- Driver oficial analizado: `CHECKPOINT KX-500 Keyboard Driver.exe`.
- Hecho con 🐾 por RedFenix Estudio.
