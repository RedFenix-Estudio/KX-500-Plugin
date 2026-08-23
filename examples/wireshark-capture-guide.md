# Guía de captura USBPcap + Wireshark para el KX-500

> Procedimiento para capturar el tráfico HID que manda el driver oficial del KX-500 cuando cambia colores/efectos. Esos bytes crudos son los que vamos a implementar en `protocol/kx500.js`.
>
> **Actualizado 2026-08-23**: el KX-500 hace más que solo RGB — detecta tipeo y anima desde la tecla presionada. Necesitamos capturar **eventos de key press** también, no solo efectos.

## 🧰 Herramientas necesarias

1. **USBPcap** — captura tráfico USB a nivel de kernel.
   - Descarga: https://desowin.org/usbpcap/
   - Instalá con todas las opciones default.
   - Al final te aparece un device `USBPcap1` (o similar) en Wireshark.

2. **Wireshark** — analizar el `.pcapng`.
   - Descarga: https://www.wireshark.org/download.html

3. **Driver oficial del KX-500** — instalado:
   ```
   C:\Users\Fenix\Downloads\CHECKPOINT_Driver_extracted\CHECKPOINT KX-500 Keyboard Driver.exe
   ```
   ⚠️ **Verificar en Device Manager que esté el driver de Checkpoint, no el genérico de Windows.** Si Windows Update lo sobreescribió, perdimos acceso al canal RGB.

## 🔌 Setup

1. Conectá el KX-500.
2. Verificá en `Device Manager` → `Human Interface Devices` que aparezcan:
   - **HID Keyboard Device** (genérico, no tocar)
   - **Dispositivo de interfaz humana USB** con VID `320F` — este es el canal RGB Vendor Defined.
3. Abrí Wireshark y seleccioná la interfaz `USBPcap1` (la que matchee con tu root hub donde está el KX-500).
4. **Filtros útiles**:
   - Tráfico RGB OUT (host → device): `usb.idVendor == 0x320f && usb.idProduct == 0x5008 && usb.endpoint_address.direction == 0`
   - Tráfico HID Keyboard IN (device → host): `usb.idVendor == 0x320f && usb.idProduct == 0x5008 && usb.endpoint_address.direction == 1`
   - Si tenés varios USB, filtrá por VID/PID: `usb.idVendor == 0x320f && usb.idProduct == 0x5008`

## 🎬 Procedimiento de captura

### Parte A — Comandos RGB (driver → teclado)

> Estas capturas son para entender qué bytes manda el driver al canal FF1C:0092 cuando cambia colores/efectos.

#### Captura 1 — Color sólido (todos los keys rojo)
1. Empezá la captura.
2. Abrí el driver oficial del KX-500.
3. Configurá un color sólido rojo en todo el teclado.
4. Esperá 2 segundos.
5. Frená. Guardá: `captures/01_static_red.pcapng`.

#### Captura 2 — Color sólido verde
`captures/02_static_green.pcapng`.

#### Captura 3 — Color sólido azul
`captures/03_static_blue.pcapng`.

#### Captura 4 — Efecto breathing
`captures/04_breathing.pcapng`.

#### Captura 5 — Efecto wave / rainbow
`captures/05_wave.pcapng`.

#### Captura 6 — Color por key individual
Si el driver oficial permite pintar keys individuales, capturá: una key roja, el resto apagado. `captures/06_per_key_red.pcapng`.

#### Captura 7 — Brightness change
Subí y bajá brightness desde el driver. `captures/07_brightness.pcapng`.

#### Captura 8 — Efecto reactivo al tipeo (si existe en el driver oficial)
Si el driver tiene un efecto que reacciona al teclear, activalo y capturá. `captures/08_typing_reactive.pcapng`.

### Parte B — Eventos de key press (teclado → host)

> Estas capturas son para confirmar cómo el teclado reporta las teclas presionadas. Lo necesitamos para los effects typing-reactive.

#### Captura 9 — Una tecla individual
1. Empezá la captura.
2. **No** abras el driver oficial (queremos ver el tráfico nativo del firmware).
3. Presioná una sola tecla (ej: `A`), soltala, esperá 1 segundo.
4. Frená. Guardá: `captures/09_single_keypress_A.pcapng`.

#### Captura 10 — Varias teclas en secuencia
1. Presioná varias teclas distintas (ej: `Q`, `W`, `E`, `R`, `T`, `1`, `2`, `Space`, `Enter`).
2. Una a la vez, con pausas de ~500ms entre cada una.
3. `captures/10_sequence.pcapng`.

#### Captura 11 — Tecla mantenida (key repeat)
1. Mantené una tecla presionada 5 segundos (ej: `X`).
2. `captures/11_key_repeat_X.pcapng`.

#### Captura 12 — Typing natural (rápido)
1. Escribí algo natural (ej: "the quick brown fox") lo más rápido que puedas.
2. `captures/12_typing_fast.pcapng`.

## 🔍 Análisis

### Qué buscar en Parte A (RGB)

1. **Endpoint**: confirmá que el tráfico RGB va por la interfaz con `usage_page=0xFF1C, usage=0x0092`.
2. **Report ID**: primer byte de cada paquete (típico `0x00` o `0x01`).
3. **Comando**: segundo byte (o el patrón que sea).
4. **Datos**: bytes siguientes.

### Diff entre capturas RGB

La forma más rápida de entender el protocolo es **comparar capturas**:

- Diff entre `01_static_red` y `02_static_green` → qué bytes cambian cuando cambia el color.
- Diff entre `01_static_red` y `03_static_blue` → confirma qué byte es R, cuál G, cuál B.
- Diff entre `01_static_red` y `06_per_key_red` → estructura del "per-key".
- Diff entre `01_static_red` y `07_brightness` → qué byte controla brightness.

### Qué buscar en Parte B (key press)

1. **Endpoint IN**: el dispositivo reporta teclas al host. ¿Va por el Usage Page estándar `0x07` (teclado), o hay un Usage Page custom?
2. **Estructura del report**: ¿es el formato HID Boot standard (8 bytes, 1 modifier + 6 keycodes), o custom?
3. **Datos extra**: ¿hay campos de presión, posición, timestamp?

### Herramientas útiles en Wireshark

- `View → Show Packet Bytes` para ver el hex crudo.
- `Follow → USB Stream` para ver el stream completo de un endpoint.
- Comparar `.pcapng` abriendo ambos y `File → Export Specified Packets`.
- Filtros guardados: creá filtros personalizados para cada análisis y guardalos.

## 📝 Qué hacer con los resultados

Una vez que identifiques los comandos, actualizá:

1. **`PROTOCOL.md`** — lista de comandos descubiertos con descripción y bytes.
2. **`protocol/kx500.js`** — implementación de cada comando en `sendCommand(bytes)` y la lógica de `sendFrame()`.
3. **`effects/typing_reactive.js`** — confirmar la estructura del HID input report para parsear correctamente.

## ⚠️ Notas y pitfalls

- **Las capturas pueden ser grandes.** Si ves miles de paquetes por segundo, probablemente estés capturando polling (interrupts IN de input reports). Filtrá por **OUT** (host → device) para aislar los comandos RGB.
- **Heartbeat**: algunos drivers mandan un "heartbeat" cada X segundos para mantener el dispositivo sincronizado. Identificalo y descartalo del análisis.
- **Driver genérico de Windows**: si Windows Update reinstaló un driver genérico, perdés el acceso al canal RGB. Si pasa, desinstalá el dispositivo en Device Manager, marcá "delete driver", y volvé a instalar el de Checkpoint.
- **Polling rate**: el KX-500 probablemente soporta 1000Hz o más. Eso significa 1000 reports IN por segundo. Filtrá o capturá solo ventanas cortas.
- **NumLock / CapsLock / ScrollLock state**: a veces los drivers incluyen esos estados en el report. Importante para los effects.
