# KX-500 HID Protocol — Estado del RE

> Documento vivo. Se actualiza cada vez que descubrimos un comando nuevo del driver oficial.
>
> **Última actualización:** 2026-08-26 — Hallazgos confirmados vía **USBPcap + Wireshark** (captura real del driver oficial en acción).

---

## 🟢 Lo que está CONFIRMADO (con captura USBPcap)

### Dispositivo y endpoints

| Campo | Valor | Fuente |
|---|---|---|
| USB VID | `0x320F` | descriptor |
| USB PID | `0x5008` | descriptor |
| Versión firmware | `0x0101` | `bcdDevice` |
| Driver oficial path | `C:\Program Files (x86)\CHECKPOINT KX-500\CHECKPOINT_KX_500.exe` | registry |

**Interfaces HID que expone el KX-500** (leído del Configuration Descriptor en la captura):

| # | Interface | bInterfaceClass | Protocol | Endpoints | Función |
|---|---|---|---|---|---|
| 0 | 0 | HID (0x03) | Keyboard (0x01) | `0x81 IN` (8B, int) | BIOS Keyboard input |
| 1 | 1 | HID (0x03) | **Mouse (0x02)** ⚠️ | `0x82 IN` (64B, int) + `0x03 OUT` (64B, int) | **🎨 Canal RGB** (declarado Mouse como truco) |

⚠️ **Detalle clave:** El canal RGB está declarado como **HID Mouse** (`bInterfaceProtocol = 0x02`), NO como Vendor Defined. Esto es un patrón común en teclados chinos para evitar problemas con Windows.

### 🎨 Protocolo RGB — HID Output Reports a `endpoint 0x03 OUT`

**Estructura universal confirmada** (todos los paquetes del driver oficial cumplen):

```
[0x04] [CMD] [PARAMETROS...] [padding 0x00 hasta 64 bytes]
^^^^^^  ^^^^^  ^^^^^^^^^^^^^
│       │      └─ 1-N bytes según el comando
│       └─ byte de comando (0x00–0xFF)
└─ Report ID HID = 0x04 (fijo en TODOS los paquetes RGB)
```

**Tamaño fijo: 64 bytes** (cada paquete).

**Transporte:** `device.write()` (HID Output Report), NO `device.send_report()` (Feature Report). Esto es crítico — el plugin v0.1.0 usaba feature reports, los cuales NO eran interceptados por la captura porque el KX-500 no responde a feature reports, solo a output reports.

### Heartbeat / framing (CONFIRMADO)

Antes y después de cada comando real, el driver oficial manda un par fijo:

```
[04 01 00 01]   ← START (46 veces en la captura mixta)
[ ... comando real ... ]
[04 02 00 02]   ← END (46 veces en la captura mixta)
```

**Implicación para el plugin:** cada comando RGB debe ir envuelto en este par `START ... END`.

### Comandos identificados (55 únicos)

Resumen por familia (ver `dev/captures/inspect_rgb_hex.ps1` para extraer todos):

| Familia | Patrón | Ejemplo | Frecuencia | Interpretación probable |
|---|---|---|---|---|
| **Heartbeat** | `[04] [01] [00 01]` | `04 01 00 01` | 46x | START frame |
| **Heartbeat** | `[04] [02] [00 02]` | `04 02 00 02` | 46x | END frame |
| **Setup corto** | `[04] [CMD] [VAL] [11 03] [XX] [00 00 8]` | `04 0F 01 11 03 7B 00 00 8` | 1-3x | Activar/seleccionar efecto/brightness |
| **Single zone set** | `[04] [SEQ] [01] [11 03] [ZONE_ID] [00] [FLAG] [STATE]` | `04 CA 01 11 03 B7 00 00 FF` | 10+ x | Set estado individual de zona |
| **Bulk zones set** | `[04] [SEQ] [LEN] [11 36] [PARAM] [00] [FLAG] [DATA 56B]` | `04 19 2E 11 36 00 00 00 [packed]` | 7+ x | Set estado de todas las zonas (1B/zone) |
| **Solid color (single RGB)** | `[04] [SEQ] [03] [06 03 05 00 00 R G B]` | `04 09 03 06 03 05 00 00 00 00 FF` | varios | Set solid color RGB (todos LEDs mismo color) |
| **Solid color (preestablecido)** | `[04] [SEQ] [01] [11 03] [XX 00] [FLAG]` | `04 13 01 11 03 00 00 00 FF` | 2x | RED — color preestablecido por el driver |
| **Handshake** | `[04] [A2 03 04 2C 00 00 00 55 AA FF ...]` | `04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00 01 02 ...` | 3x | Inicialización dispositivo |

### 📊 Per-zone (descubierto en `12_coastal_perkey.pcapng` — 2026-08-26)

Dos variantes confirmadas con captura individual:

#### `11 03 [ZONE_ID]` — Single zone set
```
04 CA 01 11 03 B7 00 00 FF   <- zone 0xB7 = FF (on)
04 CB 00 11 03 B7 00 00      <- zone 0xB7 = 00 (off)
04 28 01 11 03 15 00 00 FF   <- zone 0x15 = FF
```
- LEN = 1 (1 byte de state)
- ZONE_ID: HID usage ID o zone ID interno (0xB7, 0x15 vistos)
- STATE: 0x00 (off), 0xFF (on), o valores intermedios para brightness

#### `11 36 [PARAM]` — Bulk zones set
```
04 19 2E 11 36 00 00 00 [56 bytes packed data]   <- todas zonas
04 54 29 11 36 36 00 00 [56 bytes packed data]   <- todas zonas (param1=0x36)
04 81 32 11 36 6C 00 00 [56 bytes packed data]   <- todas zonas (param1=0x6C)
04 28 2E 11 36 0E 01 00 [56 bytes packed data]   <- todas zonas (param1=0x0E, flag=0x01)
```
- LEN: longitud del payload (varía)
- PARAM1: byte variable (startFlag o zone count)
- DATA: 56 bytes packed, 1 byte per zone (max 56 zonas)

**Análisis de data packed** (frame 164 con 41 FF + 15 ceros = 56 bytes):
```
FF FF FF FF  00 00  FF 00 00  FF 00 00  FF 00 00  00 00 00  FF FF FF FF FF FF FF ...
[4 blanco] [sep] [1rojo] [1rojo] [1rojo] [sep][???] [más blanco]
```

**Hipótesis actual:** 1 byte per zone, max 56 zones. Cada byte controla on/off (FF=on, 00=off), o quizás brightness level.

**Lo que falta:** mapeo exacto de zone ID → key física del teclado. Sin eso no podemos hacer per-key RGB desde SignalRGB.

### Zona format — single RGB vs packed bulk

Mirando las dos formas de "set color":
- **`06 03 05 00 00 R G B`** (single solid) → setea TODAS las zonas al mismo RGB (3 bytes)
- **`11 36 [56 bytes packed]`** (bulk) → setea cada zona individualmente (1 byte/zone)

Para per-key real con color arbitrario, habría que combinar ambos formatos (RGB per zone = 3 bytes per zone en lugar de 1 byte). Esto requiere más capturas del comando coastal con diferentes colores RGB.

### Magic 0x55AA (CONFIRMADO)

El handshake `04 A2 03 04 2C 00 00 00 55 AA ...` contiene:
- Magic: `55 AA FF` (posible versión 0x02 0x0F 0x32 0x08 0x50 0x01 ...)
- **Lo interesante:** `0F 32 08 50` decodificado como little-endian podría ser VID/PID del dispositivo:
  - `0F 32` → bytes 0x0F y 0x32 → little-endian uint16 = `0x320F` = **VID KX-500** ✓
  - `08 50` → bytes 0x08 y 0x50 → little-endian uint16 = `0x5008` = **PID KX-500** ✓
  - Confirmado: el handshake se identifica a sí mismo
- Bitmap de keys (después del header): `01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14` = **19 IDs de keys** consecutivos con gap (0x13 faltante)

⚠️ **Implicación:** El KX-500 podría tener **~19 zonas RGB** (no 104 LEDs individuales). El driver permite "pintar per-key" pero internamente puede mapear a zonas.

### Color data packed (HALLAZGO NUEVO)

Mirando el contenido de los comandos "tipo B" (RGB data):

```
04 22 12 11 36 00 00 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 
FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 
FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 00 FF 00 FF 
FB F0 00 FF
```

**Patrón `FF 00 00` repetido 16 veces** después del header. Esto es muy probablemente **16 LEDs/keys con color rojo (R=255, G=0, B=0) en formato packed**.

Otra variante vista (`04 17 ...`):
```
... 00 00 FF 00 00 00 FF FF 00 FF FF 00 FF FF 00 ...
```
Patrón distinto: pares de bytes `FF 00` / `00 00` / `FF FF` — probablemente **brightness por zona** (no RGB triplets).

**Conclusión:** El formato de los datos RGB aún no está 100% claro. Necesitamos capturas individuales (1 acción por captura) para mapear correctamente.

---

## 🟡 Lo que está PARCIALMENTE confirmado

### Capacidades del KX-500 (confirmadas por Erik)

Erik reportó el 2026-08-26:

> - ✅ Cambio de color per-key con color picker arbitrario (RGB completo, no colores fijos)
> - ✅ Efectos multicolores fluidos (mezclan colores suavemente en tiempo real)
> - ✅ Prende en magenta, violeta, cyan, cualquier color del picker
> - ✅ Efectos arcoiris con desvanecido

→ **El KX-500 ES RGB programable** (mi análisis previo del packed data era incorrecto por la captura mixta).

### USB Audio IN (endpoint 0x82, 64 bytes)

Capturamos transferencias periódicas (~16ms, ~60Hz) en endpoint 0x82 IN desde device 2. Probablemente:
- Micrófono pasante (algunos teclados gaming lo traen)
- O audio output pasante (headphone jack)

→ **No relacionado con RGB**, ignorar para el plugin.

---

## 🔴 Lo que FALTA confirmar (necesita capturas individuales)

Erik va a hacer capturas individuales de cada acción:

| # | Acción | Nombre sugerido |
|---|---|---|
| 1 | Color sólido (un color para todo el teclado) | `01_solid_color.pcapng` |
| 2 | Cambio de un único color (key individual) | `02_per_key_single.pcapng` |
| 3 | Brightness up/down | `03_brightness.pcapng` |
| 4 | Efecto breathing | `04_breathing.pcapng` |
| 5 | Efecto wave/rainbow | `05_wave.pcapng` |
| 6 | Velocidad de efecto | `06_speed.pcapng` |
| 7 | Apagar LEDs | `07_off.pcapng` |
| 8 | Re-encender LEDs | `08_on.pcapng` |
| 9 | Restore defaults | `09_defaults.pcapng` |
| 10 | Cambiar entre perfiles | `10_profile_switch.pcapng` |

Guardar en `dev/captures/`. El script `inspect_rgb_hex.ps1` los analiza automáticamente.

### Preguntas abiertas

1. **¿Cuántas zonas RGB tiene realmente el KX-500?**
   - Handshake sugiere 19 IDs (con gap)
   - RGB data sugiere 16 triplets (packed RGB)
   - Erik reporta per-key arbitrary → ¿driver hace blending interno?

2. **¿Cuál es el comando exacto para "set solid color"?**
   - Captura mixta tenía `04 22 12 11 36 ...` con `FF 00 00 × 16` → probable
   - Pero podría ser `04 22 13 11 36 ...` o similar para otros colores

3. **¿Hay un comando "set brightness"?**
   - No identificado claro en captura mixta
   - Probablemente uno de los "tipo A" (header `04 CMD XX 11 03 XX 00 00 8`)

4. **¿Cómo se apagan los LEDs?**
   - Probablemente `04 22 00 11 36 00 00 00 00 00 00 00 ...` (todos en 0)
   - O un comando dedicado `04 XX 00 ...`

5. **¿Hay frame para cada "render" o solo cuando cambia el estado?**
   - Si solo cambia → SignalRGB debe detectar cambios y mandar solo cuando hay diff
   - Si cada frame → SignalRGB debe mandar continuamente

---

## 🛠️ Implementación actual del plugin (v0.2.0-dev)

**Versión Lite actual** (`KX500_Lite.js`):

✅ **Correcto:**
- VID/PID (`0x320F`/`0x5008`)
- Layout de 104 keys
- Validate() con interface + usage_page (aunque el canal real es "Mouse" HID, mantenemos el fallback FF1C:0092 por compatibilidad)

🔄 **Mejorado en esta versión:**
- `send_report` → **`device.write`** (output report, lo que realmente usa el driver)
- 520 bytes → **64 bytes** (tamaño real del paquete)
- Header `06 08 00 00 01 00 7A 01` → **Report ID 0x04 + comando**
- Sin heartbeat → **wrapper START/END** alrededor de cada comando
- 1 comando best-guess → **múltiples comandos organizados por familia**

⚠️ **Limitaciones conocidas:**
- Sin captura individual por acción, los comandos exactos son **best-guess**
- El plugin intentará los comandos más probables basados en patrones vistos
- Erik debe iterar con las capturas individuales para refinar

---

## 📂 Archivos del RE

```
dev/captures/
├── teclado_captura_mixta.pcapng       # captura inicial (mezcla de acciones)
├── extract_rgb_packets.ps1            # extraer paquetes HID RGB del pcap
├── inspect_basico.ps1                 # tshark básico
├── inspect_deep.ps1                   # tshark deep: tipos transferencia
├── inspect_interrupts.ps1             # tshark: setup packets + interrupts
├── inspect_rgb_hex.ps1                # extraer HID Data en hex formateado
├── inspect_rgb_out.ps1                # paquetes OUT con -x raw hex
├── inspect_descriptors.ps1            # descriptores USB/HID
├── kx500_analyze_pcap.py              # parser pcap/pcapng standalone
├── 01_solid_color.pcapng              # (pendiente Erik)
├── 02_per_key_single.pcapng           # (pendiente Erik)
└── ...                                # más capturas individuales pendientes
```

---

## 🔗 Referencias

- [`kn4oqw-clint/redragon-ks82b-rgb`](https://github.com/kn4oqw-clint/redragon-ks82b-rgb) — Sinowealth 258a:0049, útil para entender patrones HID.
- [`MRtojisan/portronics-hydra-10-SignalRGB-Plugin`](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin) — plantilla de plugin SignalRGB.
- USBPcap: https://desowin.org/usbpcap/
- Wireshark USB HID docs: https://wiki.wireshark.org/USB

---

## 📋 Checklist de avance

### Capturas individuales
- [ ] `01_solid_color.pcapng` — color único para todo el teclado
- [ ] `02_per_key_single.pcapng` — cambiar una sola key
- [ ] `03_brightness.pcapng` — subir/bajar brillo
- [ ] `04_breathing.pcapng` — efecto breathing
- [ ] `05_wave.pcapng` — efecto wave
- [ ] `06_speed.pcapng` — cambiar velocidad
- [ ] `07_off.pcapng` — apagar LEDs
- [ ] `08_on.pcapng` — encender LEDs
- [ ] `09_defaults.pcapng` — restore defaults

### Implementación plugin
- [x] HID transport: output reports, 64 bytes, Report ID 0x04
- [x] Heartbeat wrapper START/END
- [x] Handshake packet on Initialize
- [x] Solid color command (best-guess)
- [x] Per-zone color (best-guess)
- [x] Brightness control (best-guess)
- [x] Shutdown packet (todos 0)
- [ ] Per-key precise color mapping (depende de capturas individuales)
- [ ] Reactive al typing (lee endpoint 0x81 IN)

### Plugin v0.3.0+ (futuro)
- [ ] Detección automática de protocolo (probe al Initialize)
- [ ] Soporte para efectos nativos del KX-500 (breathing, wave, etc.)
- [ ] Reactive typing con detección de WPM
- [ ] Profile persistence (guardar config en memoria del teclado)
