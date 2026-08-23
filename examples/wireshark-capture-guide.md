# Guía de captura USBPcap + Wireshark para el KX-500

> Procedimiento para capturar el tráfico HID que manda el driver oficial del KX-500 cuando cambia colores/efectos. Esos bytes crudos son los que vamos a implementar en `protocol/kx500.js`.

## 🧰 Herramientas necesarias

1. **USBPcap** — captura tráfico USB a nivel de kernel.
   - Descarga: https://desowin.org/usbpcap/
   - Instalá con todas las opciones default.
   - Al final te aparece un device `USBPcap1` (o similar) en `ipconfig` / Wireshark.

2. **Wireshark** — analizar el `.pcapng`.
   - Descarga: https://www.wireshark.org/download.html

3. **Driver oficial del KX-500** — ya lo tenés instalado:
   ```
   C:\Users\Fenix\Downloads\CHECKPOINT_Driver_extracted\CHECKPOINT KX-500 Keyboard Driver.exe
   ```

## 🔌 Setup

1. Conectá el KX-500.
2. Verificá en `Device Manager` → `Human Interface Devices` que aparezca como dispositivo HID (además del endpoint RGB).
3. Abrí Wireshark y seleccioná la interfaz `USBPcap1` (la que matchee con tu root hub donde está el KX-500).
4. Filtro inicial: `usb.transfer_type == 0x01 && usb.endpoint_address.direction == 0` (interrupt OUT, o sea device → host). Si no ves tráfico, probá `usb.src == "host"` o filtrá por VID/PID: `usb.idVendor == 0x320f && usb.idProduct == 0x5008`.

## 🎬 Procedimiento de captura

### Captura 1 — Color sólido (todos los keys rojo)

1. Empezá la captura en Wireshark.
2. Abrí el driver oficial del KX-500.
3. Configurá un color sólido rojo en todo el teclado.
4. Esperá 2 segundos.
5. Frená la captura.
6. Guardá como `captures/01_static_red.pcapng`.

### Captura 2 — Color sólido verde

Mismo procedimiento con verde. `captures/02_static_green.pcapng`.

### Captura 3 — Color sólido azul

Mismo procedimiento con azul. `captures/03_static_blue.pcapng`.

### Captura 4 — Efecto breathing

`captures/04_breathing.pcapng`.

### Captura 5 — Efecto wave / rainbow

`captures/05_wave.pcapng`.

### Captura 6 — Color por key individual

Si el driver oficial permite pintar keys individuales, capturá eso: una key roja, el resto apagado. `captures/06_per_key_red.pcapng`.

### Captura 7 — Brightness change

Subí y bajá brightness desde el driver. `captures/07_brightness.pcapng`.

## 🔍 Análisis

### Qué buscar

1. **Endpoint**: confirmá que el tráfico HID RGB va por la interfaz con `usage_page=0xFF1C, usage=0x0092`.
2. **Report ID**: primer byte de cada paquete (típico `0x00` o `0x01`).
3. **Comando**: segundo byte (o el patrón que sea).
4. **Datos**: bytes siguientes.

### Diff entre capturas

La forma más rápida de entender el protocolo es **comparar capturas**:

- Diff entre `01_static_red` y `02_static_green` → qué bytes cambian cuando cambia el color.
- Diff entre `01_static_red` y `03_static_blue` → confirma qué byte es R, cuál G, cuál B.
- Diff entre `01_static_red` y `06_per_key_red` → estructura del "per-key".

### Herramientas útiles

- Wireshark → `View → Show Packet Bytes` para ver el hex crudo.
- Wireshark → `Follow → USB Stream` para ver el stream completo de un endpoint.
- Comparar `.pcapng` con `diff` o abriendo ambos y haciendo `File → Export Specified Packets`.

## 📝 Qué hacer con los resultados

Una vez que identifiques los comandos, actualizá:

1. **`PROTOCOL.md`** — lista de comandos descubiertos con descripción y bytes.
2. **`protocol/kx500.js`** — implementación de cada comando en `sendCommand(bytes)`.
3. **`protocol/kx500.js#sendFrame()`** — lógica para empaquetar el framebuffer completo.

## ⚠️ Notas

- Las capturas pueden ser grandes. Si ves miles de paquetes por segundo, es probable que estés capturando polling (interrupts IN). Filtrá por **OUT** (host → device) para aislar los comandos.
- Algunos drivers mandan un "heartbeat" cada X segundos. Identificalo y descartalo del análisis.
- Si Windows Update reinstaló un driver genérico, perdés el acceso al canal RGB. Verificá en Device Manager que el driver sea el de Checkpoint.
