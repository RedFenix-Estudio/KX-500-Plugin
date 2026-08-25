# Instalación del plugin KX-500 Lite en SignalRGB

> Guía paso a paso para que SignalRGB reconozca tu Checkpoint KX-500.

## Requisitos

| Requisito | Detalle |
|---|---|
| SignalRGB | Cualquier versión (Free / Pro / Light Points) — NO es Community Edition |
| OS | Windows 10/11 (64-bit) |
| Teclado | KX-500 (NA-KB-1001) conectado por USB |
| Driver oficial | Opcional. Si está instalado, **cerrá "Mechanical Keyboard.exe"** antes de activar el plugin |

## Pasos

### 1. Localizá la carpeta de plugins

Abrí SignalRGB → **Settings** (icono engranaje) → **User Plugins** → botón **"Open Plugins Folder"**.

Esto abre una carpeta similar a:

```
C:\Users\<TU_USUARIO>\AppData\Local\VortxEngine\app-X.X.XX\Signal-x64\Plugins\
```

Si preferís ir manual, la ruta universal es:

```
%LOCALAPPDATA%\VortxEngine\app-*\Signal-x64\Plugins\
```

### 2. Copiá el plugin

Copí `KX500_Lite.js` (de esta carpeta) a la carpeta `Plugins/` que abriste en el paso 1.

### 3. Reiniciá SignalRGB

Cerrá SignalRGB por completo (botón × en systray o desde la app) y volvé a abrirlo.

### 4. Activá el teclado

1. En SignalRGB, andá a **Devices** (ícono del medio en la sidebar)
2. Buscá **"Checkpoint KX-500 (NA-KB-1001) — Lite"** en la lista de dispositivos
3. Si no aparece: revisá que el teclado esté conectado y que `KX500_Lite.js` esté en la carpeta Plugins
4. Tocá el toggle **"Enable Streaming"** para que el plugin tome el control RGB
5. **Si el driver oficial está corriendo**, SignalRGB va a pedirte cerrar `Mechanical Keyboard.exe` — hacelo

### 5. Probá los effects

En la página del dispositivo, cambiá el setting **"Effect"**:

| Effect | Qué hace |
|---|---|
| `static` | Color sólido |
| `breathing` | Pulsado lento |
| `wave` | Ola horizontal |
| `reactive` | Audio-reactive (usa el audio engine de SignalRGB) |
| `typing` | Pulso desde el centro (placeholder hasta tener el canal HID IN) |

Cambiá **"Effect Color"** para el color y **"Lighting Mode"** para alternar entre Canvas (SignalRGB controla) o Forced (color fijo).

## Verificación rápida

Si todo está OK, vas a ver:
- ✅ El dispositivo aparece en Devices
- ✅ Las luces del teclado responden a los cambios de effect/color
- ✅ En Settings → Logs podés ver `[KX500] Initialized: 104 keys, layout 23×6`

Si las luces NO responden:
1. Abrí SignalRGB → Settings → **Logs**
2. Buscá líneas que empiecen con `[KX500]`
3. Si ves `[KX500] Protocol probe OK` pero las luces no encienden → el comando HID necesita calibración (ver `CALIBRATION.md` abajo)
4. Si ves errores de HID → verificá que el driver oficial no esté monopolizando el dispositivo

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| KX-500 no aparece en Devices | Plugin mal copiado / sintaxis rota | Verificar que `KX500_Lite.js` esté en Plugins/ y reiniciar SignalRGB |
| "Enable Streaming" se queda gris | Driver oficial monopoliza HID RGB | Cerrar `Mechanical Keyboard.exe` |
| Aparece pero luces no encienden | Comando HID best-effort no matchea | Calibrar protocolo (ver CALIBRATION.md) |
| Las luces parpadean erráticamente | Paquetes HID mal formados | Mismo — calibrar protocolo |
| Error `ConflictingProcesses` | HidServ.dll service está corriendo | `services.msc` → detener servicio de Checkpoint |

## Actualizar el plugin

Cuando salga una nueva versión, simplemente sobrescribí `KX500_Lite.js` en la carpeta Plugins/ y reiniciá SignalRGB.

## Desinstalar

Borrá `KX500_Lite.js` de la carpeta Plugins/ y reiniciá SignalRGB.

---

## CALIBRATION.md (resumido)

Si las luces no se encienden con el plugin cargado, el comando HID probablemente difiere del patrón SinoWealth usado por default. Para calibrarlo:

1. Conectá el teclado
2. Cerrá SignalRGB
3. Iniciá el driver oficial `Mechanical Keyboard.exe` (si lo tenés instalado)
4. Iniciá Wireshark con USBPcap capturando el bus USB
5. Filtro recomendado: `usb.transfer_type == 0x01` (interrupt) `&& usb.src == "host"` (out)
6. Aplicá un color sólido desde el driver oficial
7. La captura te muestra los bytes exactos del protocolo
8. En `KX500_Lite.js`, función `buildFrame()`, ajustá los bytes del header
9. Reiniciá SignalRGB y probá

Si lo capturás y querés compartirlo: https://github.com/RedFenix-Estudio/kx500-signalrgb-plugin/issues