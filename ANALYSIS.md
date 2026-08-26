# KX-500 RE Analysis — Historial completo

> Análisis paso a paso de cómo descubrimos el protocolo HID del KX-500.
>
> Este documento es histórico-técnico. Para el estado actual del RE, ver [PROTOCOL.md](./PROTOCOL.md).

---

## 📅 Timeline del RE

### 2026-08-19 — Driver oficial + RE estático

- Descargamos e instalamos el driver oficial de Checkpoint
- Path del ejecutable: `C:\Program Files (x86)\CHECKPOINT KX-500\CHECKPOINT_KX_500.exe`
- **HidServ.dll** (35 KB): decompilada en Ghidra, confirmada usa `HidD_SetFeature`, `HidD_GetFeature`, `HidP_SetUsageValue`, etc. → confirma que el RGB va por **feature reports HID**
- **CHECKPOINT_KX_500.exe** (4 MB): decompilado, llama HidServ vía window messages (`0x40D`)
- **Procmon logs**: 44 GB capturados pero NO contienen tráfico HID real (HidD_* son kernel-mode, bypass Procmon)
- USBPcap NO estaba instalado todavía

### 2026-08-22 — USBPcap instalado

- Instalamos USBPcap desde https://desowin.org/usbpcap/
- 4 interfaces USBPcap visibles en Wireshark (USBcap1-4)
- Aún no probamos con el KX-500

### 2026-08-25 — Descriptor HID descubierto vía registry

- Leímos `HKLM\SYSTEM\CurrentControlSet\Enum\HID\VID_320F&PID_5008` directamente
- Confirmamos las 5 colecciones HID del KX-500:
  - MI_00: Generic Desktop Keyboard (BIOS)
  - MI_01 Col01: Generic Desktop Keyboard (NKRO)
  - MI_01 Col02: Wireless Radio Controls
  - MI_01 Col03: Consumer Control
  - MI_01 Col04: **Vendor Defined (FF1C:0092)** ← RGB
- Publicamos plugin v0.1.0 Lite con esta info

### 2026-08-25 — v0.1.0 push inicial

- Repo: https://github.com/RedFenix-Estudio/KX-500-Plugin
- Branch main, 45 tests OK
- Plugin single-file con presets HID seleccionables (sinowealth, corsair, vendor, etc.)
- Comentario en código: "best-effort SinoWealth, RE pendiente con captura USBPcap"

### 2026-08-26 10:31 GMT-4 — Primera captura USBPcap funciona

- Erik confirma USBPcap2 es el KX-500 (los packets de teclas cambian al tipear)
- Captura `teclado_captura.pcapng` con acciones mixtas:
  - Cambio de colores (rojo, verde, azul, blanco, off)
  - Cambio de brillo
  - Cambio de velocidad de efecto
  - Aplicar effectos (rainbow, breathing, etc.)
  - Teclear varias teclas

### 2026-08-26 10:42 GMT-4 — Análisis inicial

- 1902 frames capturados, 77442 bytes totales
- Tamaño de archivo: 140 KB
- **Sorpresa:** No hay paquetes de 312/320 bytes (lo que esperábamos para RGB per-key)
- Tipos de transferencia: solo Control (0x02) e Interrupt (0x01)
- Tamaños: 0, 8, 18, 25, 64, 66 bytes (ninguno coincide con RGB frame esperado)

### 2026-08-26 10:48 GMT-4 — Descriptors HID leídos del pcap

- tshark verbose mode reveló el **Configuration Descriptor completo**
- Hallazgo crítico: el KX-500 tiene **2 interfaces HID**:
  - Interface 0: HID Keyboard (1 endpoint IN 8B)
  - Interface 1: **HID Mouse** declarado (2 endpoints: 0x82 IN 64B, 0x03 OUT 64B) ← **CANAL RGB**
- bInterfaceProtocol = 0x02 (Mouse), NO 0x00 (None) como pensábamos
- El "Mouse" es un truco del fabricante chino para evitar problemas con Windows

### 2026-08-26 11:00 GMT-4 — Protocolo RGB descubierto

- Filtramos por `usb.transfer_type == 0x01 AND usb.endpoint_address == 0x03`
- 324 paquetes HID Output Reports de 64 bytes
- **Todos empiezan con byte 0x04** (Report ID)
- **Estructura:** `[04] [CMD] [PARAMS...] [pad 0x00]`
- **55 comandos únicos** identificados
- Heartbeat: `04 01 00 01` (START, 46x) y `04 02 00 02` (END, 46x)
- Handshake: `04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 ...` (3x, contiene VID/PID embebidos)
- "Solid color" probable: `04 22 12 11 36 00 00 00 00 FF 00 00 FF 00 00 ...` (16 triplets de `FF 00 00` = rojo)

### 2026-08-26 11:03 GMT-4 — Erik corrige análisis previo

- Erik confirma: SÍ es RGB per-key con color picker arbitrario
- El KX-500 prende en magenta, violeta, cyan, cualquier color
- Los efectos multicolores son fluidos
- **La captura mixta confundió mi análisis** — necesito capturas individuales

### 2026-08-26 11:30 GMT-4 — v0.2.0-dev publicado

- Plugin reescrito con:
  - `device.write()` (output report) en vez de `device.send_report()` (feature report)
  - Report ID 0x04 fijo
  - 64 bytes por paquete (no 520)
  - Heartbeat wrapper START/END
  - Handshake en Initialize
  - 35/35 tests pasando
- Documentación actualizada con descubrimientos
- Repo reorganizado con `dev/captures/` para futuras capturas individuales

---

## 🧠 Lecciones aprendidas

### Lección 1: El KX-500 NO es un dispositivo HID "estándar"
- Declara el canal RGB como **HID Mouse** (`bInterfaceProtocol = 0x02`) en vez de Vendor Defined (`0xFF1C:0092`)
- Truco común en dispositivos chinos para evitar problemas con Windows
- Sin USBPcap nunca lo hubiéramos descubierto — los descriptor HID tools a veces ocultan esta info

### Lección 2: HID Feature Reports vs Output Reports
- **Inicialmente asumimos** que el KX-500 usa feature reports (porque HidServ.dll usa HidD_SetFeature)
- **USBPcap reveló** que el RGB se manda por **output reports** (interrupts OUT)
- Posible explicación: HidServ.dll puede usar AMBOS, y nuestro caso específico es output
- El plugin v0.1.0 usaba feature reports → no funcionaba
- El plugin v0.2.0 usa output reports → debería funcionar

### Lección 3: Capturas mixtas son confusas
- 324 paquetes con acciones mezcladas → imposible saber qué byte va con qué acción
- Solución: capturas individuales (1 acción por pcap)
- Erik ya empezó a hacerlas: `01_solid_color.pcapng`, etc.

### Lección 4: USBPcap es indispensable
- Procmon (44 GB) NO capturó nada útil
- USBPcap (140 KB) capturó todo
- USBPcap intercepta a nivel USB físico, no API-level
- Indispensable para cualquier RE HID futuro

---

## 📚 Referencias utilizadas

- USBPcap: https://desowin.org/usbpcap/
- Wireshark USB/HID docs: https://wiki.wireshark.org/USB
- USB Made Simple: https://www.usbmadesimple.co.uk/
- HID Specification: https://www.usb.org/document-library/hid-specification
- HidServ.dll decompilación: Ghidra (open source)
- Protocolos similares: Sinowealth 258a:0049 (Redragon KS82B), Corsair K70

---

## 🎯 Estado actual (2026-08-26 11:30 GMT-4)

| Componente | Estado | Notas |
|---|---|---|
| Plugin estructura | ✅ | Single-file `KX500_Lite.js` |
| HID transport | ✅ | Output Report, 64B, Report ID 0x04 |
| Layout 104 keys | ✅ | Full-size US ANSI |
| Heartbeat wrapper | ✅ | START/END automático |
| Handshake packet | ✅ | Mandado en Initialize |
| Solid color (promedio) | ⚠️ | Manda color promedio de todos los keys |
| Per-key RGB preciso | ⏳ | Pendiente capturas individuales |
| Brightness control | ⏳ | Comando exacto no confirmado |
| Effectos nativos | ⏳ | Pendiente capturas individuales |
| Tests automatizados | ✅ | 35/35 pasando |

**Próximos pasos:**
1. Erik hace capturas individuales (1 acción por pcap)
2. Mapeamos comandos → acciones con esas capturas
3. Refinamos `buildSolidColor()` con bytes exactos
4. Implementamos per-zone/per-key RGB
5. v0.3.0 con soporte completo
