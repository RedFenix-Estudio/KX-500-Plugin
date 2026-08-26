# Instalación del plugin KX-500 para SignalRGB

> Pasos detallados para instalar y configurar el plugin.
>
> Si tenés problemas, revisá la sección [Troubleshooting](#troubleshooting) abajo.

---

## 📋 Pre-requisitos

1. **Windows 10/11** (64-bit)
2. **SignalRGB** instalado y funcionando
   - Descarga: https://signalrgb.com/
3. **Teclado Checkpoint KX-500** conectado por USB
4. **Driver oficial de Checkpoint** instalado (al menos una vez, para registrar el device)
   - Descarga: https://cpgaming.com o el installer que vino con el teclado

---

## 🚀 Instalación

### Paso 1: Cerrar SignalRGB

```
Click derecho en el icono de SignalRGB en la system tray → Quit
```

### Paso 2: Cerrar procesos conflictivos

Abrí PowerShell y ejecutá:

```powershell
Get-Process | Where-Object { $_.Name -match "Mechanical|HidServ|CHECKPOINT_KX_500" } | Stop-Process -Force
```

Estos procesos monopolizan el HID del KX-500 y bloquean al plugin.

### Paso 3: Copiar el plugin

1. Ubicá tu carpeta de plugins SignalRGB:
   - Típicamente: `C:\Users\<TU_USUARIO>\AppData\Local\WhirlwindFX\SignalRGB\Plugins\`
   - O creá una carpeta nueva si no existe

2. Copiá `KX500_Lite.js` a esa carpeta.

3. Verificá que la estructura quede así:
   ```
   Plugins/
   └── KX500_Lite.js
   ```

### Paso 4: Abrir SignalRGB

1. Abrí SignalRGB
2. Andá a **Settings → Plugins**
3. Debería aparecer "Checkpoint KX-500 (NA-KB-1001)" en la lista
4. **Activá** el plugin
5. Volvé a la pestaña principal

### Paso 5: Verificar reconocimiento

1. En SignalRGB, mirá la lista de dispositivos
2. Buscá **"Checkpoint KX-500"**
3. Si aparece con el layout de 104 keys → ✅ todo OK
4. Si NO aparece → revisá Troubleshooting

### Paso 6: Probar

1. Seleccioná el KX-500
2. Aplicá un effect básico (Rainbow de SignalRGB, por ejemplo)
3. Las luces del teclado deberían responder
4. Si no responden → puede ser que el endpoint RGB no esté bien mapeado (ver Troubleshooting)

---

## ⚙️ Configuración recomendada

Una vez que el plugin está activo:

| Setting | Valor recomendado | Por qué |
|---|---|---|
| `Brightness` | 80-100% | El KX-500 tiene LEDs no muy brillantes; con 100% se ve mejor |
| `Lighting Mode` | Canvas | Para usar effects de SignalRGB directamente |
| `Effect` (modo Forced) | static | Si querés un color fijo |
| `Shutdown Color` | #000000 | Apaga LEDs al cerrar SignalRGB |

---

## 🔧 Troubleshooting

### "No aparece el KX-500 en SignalRGB"

**Causa más común:** Conflicto con el driver oficial.

**Solución:**
1. Verificá que no esté corriendo `CHECKPOINT_KX_500.exe`:
   ```powershell
   Get-Process CHECKPOINT_KX_500 -ErrorAction SilentlyContinue
   ```
2. Si está corriendo, cerralo:
   ```powershell
   Stop-Process -Name "CHECKPOINT_KX_500" -Force
   ```
3. También verificá `HidServ.exe`:
   ```powershell
   Get-Process HidServ -ErrorAction SilentlyContinue
   Stop-Process -Name "HidServ" -Force -ErrorAction SilentlyContinue
   ```
4. Reiniciá SignalRGB.

### "El plugin carga pero las luces no responden"

**Posibles causas:**
1. **Endpoint RGB mal matcheado** — el Validate() filtra por interface HID, pero quizás SignalRGB ve otra interface.
   - Workaround: editá `KX500_Lite.js` y cambiá `Validate()` para ser más permisivo:
     ```js
     export function Validate(endpoint) {
         return endpoint.vendor_id === 0x320F;
     }
     ```

2. **El driver de Windows genérico HID** está activo en vez del driver Checkpoint.
   - Solución: Device Manager → busca el KX-500 → Update Driver → Browse → "Let me pick from a list" → busca "HID Keyboard Device" o "USB Input Device"

3. **Falta el handshake** — quizás el KX-500 no responde sin el handshake packet primero.
   - El plugin actual lo manda en `Initialize()`. Si no funciona, intentá capturar de nuevo para confirmar el handshake.

### "Algunas teclas se prenden, otras no"

**Causa probable:** El KX-500 tiene ~16-19 zonas RGB, no 104 LEDs individuales.

**Solución actual:** El plugin envía el **promedio de color** de todos los keys. Esto va a hacer que el teclado se vea uniforme, no per-key.

**Solución definitiva:** Necesitamos capturas individuales para mapear los bytes exactos del protocolo per-zone. Ver [PROTOCOL.md#pendientes](./PROTOCOL.md).

### "Las luces parpadean / se ven mal"

**Causa probable:** Estamos mandando comandos a una velocidad que el MCU no puede manejar.

**Workaround:**
1. Reducí el FPS de SignalRGB (Settings → Performance → Reduce FPS)
2. O editá el `Render()` del plugin para mandar cada N frames:
   ```js
   let frameCounter = 0;
   export function Render() {
       frameCounter++;
       if (frameCounter % 3 !== 0) return;  // mandar 1 de cada 3 frames
       // ... resto del código
   }
   ```

### "Los logs de SignalRGB muestran errores"

1. Abrí SignalRGB → Settings → Logs
2. Filtrá por "KX500"
3. Si ves errores tipo "device.write failed" → el endpoint está cerrado. Solución: reiniciá SignalRGB con el KX-500 conectado desde el inicio.
4. Si ves "Validate failed" → el endpoint HID no matchea. Ver problema anterior.

---

## 🐛 Debug avanzado

### Ver qué packets está mandando el plugin

```powershell
# 1. Iniciá Wireshark con USBPcap en el KX-500
# 2. Filtrá por: usb.endpoint_address == 0x03
# 3. Hacé una acción en SignalRGB (cambiar color, effect, etc.)
# 4. En Wireshark, mirá los HID Data: deberían empezar con 04 (Report ID)
```

### Comparar con el driver oficial

```powershell
# 1. Cerrá SignalRGB
# 2. Abrí CHECKPOINT_KX_500.exe
# 3. Iniciá Wireshark capturando
# 4. Cambiá un color desde el driver oficial
# 5. Compará el patrón de packets con el que manda el plugin
```

---

## 📞 Soporte

- **Issues:** https://github.com/RedFenix-Estudio/KX-500-Plugin/issues
- **SignalRGB Discord:** https://discord.gg/signalrgb
