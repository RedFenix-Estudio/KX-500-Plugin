# Tools — Captura USB para el RE del KX-500

> Esta carpeta contiene las herramientas necesarias para hacer el **reverse engineering del protocolo HID** del KX-500 vía captura USB. Son los installers; tenés que correrlos una vez para instalarlos al sistema.

## 📦 Qué hay acá

| Archivo | Tamaño | SHA256 |
|---|---|---|
| `USBPcapSetup-1.5.4.0.exe` | 195 KB | `87A7EDF9BBBCF07B5F4373D9A192A6770D2FF3ADD7AA1E276E82E38582CCB622` |
| `Wireshark-4.6.8-x64.exe`   | 94.4 MB | `8EBA737CB6875D9B3709228D37893F71125BDC50D7148E24D9CDC755259E9C3A`  |

| | Versión | Por qué |
|---|---|---|
| **USBPcap** | 1.5.4.0 (estable, 2022) | Único sniffer USB open-source para Windows que captura traffic de devices por root hub. Es lo que se ve en Wireshark como `USBPcap1`, `USBPcap2`, etc. |
| **Wireshark** | 4.6.8 stable x64 (2026-08-12) | Soporte nativo de USBPcap (revisión 48847+). Stable channel. Necesario para filtrar y decodificar HID URBs. |

> **Nota sobre USBPcap**: no hay versión portable. Es un **kernel driver** que se instala como servicio de Windows. Por eso, aunque el `.exe` vive en este repo, tenés que correrlo una vez como administrador para que funcione.

## ⚙️ Instalación

### USBPcap (driver de captura)

1. Click derecho sobre `USBPcapSetup-1.5.4.0.exe` → **Ejecutar como administrador**.
2. Aceptar el UAC de Windows.
3. En el wizard:
   - ☑ Install `USBPcap` (obvio)
   - ☑ Install `USBPcapCMD` (command-line, útil para captura automatizada)
   - ☑ Install `USBPcapFilter` (helper para filtrar por device)
   - ☑ Create desktop icon (opcional)
4. Click **Install**.
5. **Reiniciar Windows** (USBPcap lo pide explícitamente — es un kernel driver, necesita el reboot).
6. Después del reboot, abrí Device Manager → `Network adapters` → deberías ver varios `USBPcap` adapters (uno por root hub USB).

### Wireshark (analizador)

1. Doble click sobre `Wireshark-4.6.8-x64.exe`.
2. Si pide UAC, aceptar.
3. Wizard de instalación:
   - Next → next → Install.
   - Cuando pregunta por **Npcap** (similar a WinPcap), **recomendado instalar** (USBPcap no requiere Npcap, pero Wireshark usa Npcap para otras interfaces).
   - Si tenés otro Wireshark instalado, podés tener varias versiones; el `.exe` usa `AppData/Local` y no choca.
4. Finalizar.

### Verificación post-instalación

Abrí Wireshark. En la pantalla principal ("Capture"), en la lista de interfaces tenés que ver algo como:

```
USBPcap1        \Device\USBPDO-... (USB)
USBPcap2        \Device\USBPDO-... (USB)
...etc
```

Si `USBPcap1/2/...` no aparecen, USBPcap no quedó bien instalado (revisar reboot y permisos).

## 🎯 Uso: capturar el KX-500

### 1. Identificar a qué root hub está conectado el KX-500

Pluga el KX-500. En Wireshark mirás la lista de interfaces USBPcap y hacés doble click sobre cada una hasta que veas tráfico del dispositivo. Una forma rápida:

- Filtro que matchea **solo el KX-500** (en la barra de display filter arriba):
  ```
  usb.idVendor == 0x320f && usb.idProduct == 0x5008
  ```
- Si el filtro matchea en varias interfaces, es porque el teclado está conectado a través de un hub interno. Elegí la que tenga más tráfico.

Alternativa visual: en la columna "Vendor" / "Product" de la lista de interfaces, debería aparecer "Checkpoint" o "USB" (depende del root hub).

### 2. Arrancar la captura

1. Seleccioná la interfaz del KX-500.
2. Click en **Start** (icono del tiburón abajo a la izquierda) o doble click sobre la interfaz.
3. Se abre una ventana con paquetes en vivo.

### 3. Aplicar filtros útiles

Los filtros se escriben en la barra "Apply a display filter" arriba:

| Filtro | Qué captura |
|---|---|
| `usb.idVendor == 0x320f && usb.idProduct == 0x5008` | Todo el tráfico del KX-500 |
| `usb.idVendor == 0x320f && usb.idProduct == 0x5008 && usb.endpoint_address.direction == 0` | Solo comandos RGB OUT (host → teclado). Esto es lo principal para el RE. |
| `usb.idVendor == 0x320f && usb.idProduct == 0x5008 && usb.endpoint_address.direction == 1` | Solo HID Keyboard IN (teclado → host). Key press reports. |
| `usb.transfer_type == 0x01` | Solo interrupt transfers (ignora control transfers de bajo nivel que son ruido). |
| `usb.capdata` | Solo los paquetes con HID data payload (descarta descriptors, etc.). |

Podés **combinar** con `&&` o `||`, ej:
```
usb.idVendor == 0x320f && usb.idProduct == 0x5008 && usb.endpoint_address.direction == 0 && usb.capdata
```

### 4. Disparar la acción

Mientras Wireshark captura:
- Abrí el driver oficial del KX-500.
- Configurá un color / efecto / lo que quieras capturar.
- Esperá 2-3 segundos para que se estabilice.

### 5. Frenar y exportar

1. Click en el botón rojo **Stop** (arriba a la izquierda).
2. File → Save As → `captures/<nombre>.pcapng` (la convención está en `examples/wireshark-capture-guide.md`).

### 6. Analizar

- **View → Show Packet Bytes** para ver hex crudo.
- Click derecho sobre un paquete → **Follow → USB Stream** para ver el stream continuo.
- Diff entre dos `.pcapng` abriendo ambos y usando `File → Export Specified Packets`.

## 🔧 Tips y troubleshooting

### Mi filtro `usb.idVendor == 0x320f` no devuelve nada

Probá sin filtro primero; a veces el driver de Checkpoint enumera con un descriptor genérico y los campos `usb.idVendor` aparecen solo en algunos paquetes. Filtrá por root hub y deducí cuál es el KX-500 viendo los URBs.

### Veo miles de paquetes por segundo

El KX-500 probablemente soporta polling rate alto (1000Hz o más). Eso significa 1000 interrupt IN por segundo. Para reducir ruido:
- Filtrá por direction OUT (host → device) para aislar los comandos RGB.
- O capturá en ventanas cortas: arrancá Wireshark, hacé la acción, frená.

### USBPcap no detecta el KX-500

Puede pasar si conectás el KX-500 a través de un hub USB externo en lugar de un puerto directo de la motherboard. Conectalo directo a un puerto trasero de la PC.

### Faltan permisos

USBPcap necesita **admin rights** para capturar. Si ejecutás Wireshark como usuario normal, vas a ver las interfaces pero la captura va a fallar. Click derecho sobre Wireshark → Ejecutar como administrador.

## 🚀 Próximo paso: arrancar el RE

Después de instalar y tener todo funcionando, seguí `../examples/wireshark-capture-guide.md`. Ahí está el plan completo de capturas a hacer (Parte A: RGB OUT, Parte B: Keyboard IN).

Después yo analizo los `.pcapng` y empiezo a implementar `protocol/kx500.js`.
