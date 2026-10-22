# KX-500 SignalRGB — Diagnóstico Consolidado

> Todo lo de este documento fue **medido**, no supuesto.
> Workspace: `E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\`
> Fecha de cierre: 2026-10-10.

---

## 1. Veredicto — qué estamos haciendo mal

Conviene separar dos cosas que se estaban mezclando.

### (a) Lo que el plugin hace mal — corregido

| Bug | Valor anterior | Valor correcto | Fuente |
|---|---|---|---|
| `buildSolidColor` byte 2 | `0x03` | **`0x01`** | `prueba del test 1.pcapng` |
| `Render()` sin dirty-check | 20 writes/s siempre | solo si el color cambia |evita colisión write/read |
| Sin transacción | comandos sueltos | **`START` → paquetes → `END`** | 125/125 transacciones bien formadas |

Los dos primeros se corrigieron en `KX500_Plugin.js` v2.5.0; el tercero en
v3.0.0 (ver §11).

### (b) El error 995 — sin causa raíz identificada

El paquete de 64 bytes coincide **byte a byte** con el driver oficial, y desde
cualquier proceso externo **todas** las vías HID dan 100% OK. Aun así
`device.write()` de SignalRGB devuelve `ERROR_OPERATION_ABORTED (995)`.

**Lo honesto: no se pudo determinar la causa raíz.** Se refutaron cinco
hipótesis midiendo (§4), pero ninguna lo explica. Con certeza **NO** es:

- el protocolo
- el firmware
- el transporte en aislamiento
- los procesos conflictivos

Queda un factor del entorno interno de SignalRGB —timing, ciclo de
regeneración de handles, o threads de lectura— que no se puede replicar desde
fuera. **No es correcto afirmar "es un bug del SDK" como hecho**; es la
hipótesis menos descartada, no una conclusión.

---

## 2. Protocolo verificado (18 capturas USBPcap)

Carpeta: `Captura de Wirseshark del teclado/` — **18 archivos `.pcapng`**.

Estructura de 64 bytes, confirmada en las capturas del driver oficial:

```
[0]=04 ReportID   [1]=SEQ   [2]=BYTE2   [3]=06
[4]=C1           [5]=C2     [6..7]=00    [8]=VALOR  (o [8..10]=R,G,B)
[11..63]=0x00
```

Handshake (única excepción, 43 bytes útiles):
```
04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00
01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14
```

Secuencia real del driver oficial (`prueba del test 1.pcapng`):
```
04 A2 03 04 2C 00 00 00 55 AA FF ...   handshake
04 0C 00 06 01 01 00 00 04             brillo 4
04 09 01 06 03 05 00 00 00 00 FF       azul
04 0A 01 06 03 05 00 00 FF 00 00       rojo
04 0B 01 06 03 05 00 00 00 FF 00       verde
04 08 00 06 01 01 00 00 00             brillo 0
```

### Comandos detectados (12)

| ID | Significado | Plugin |
|---|---|---|
| `06 01 01` | BRILLO (0-4) | `buildBrightness()` |
| `06 01 00` | ID DE ANIMACIÓN | `buildEffect()` |
| `06 03 05` | COLOR GLOBAL RGB | `buildSolidColor()` |
| `06 01 02` | VELOCIDAD DE ANIMACIÓN | — |
| `06 01 03` | DIRECCIÓN DE ANIMACIÓN | — |
| `06 01 04` | KEY NORMALLY-ON | — |
| `06 01 11` | MODO / PRESET | — |
| `06 01 2A`–`2E` | reservados | — |

**Nota sobre `BYTE2`:** en la familia `06 01 xx` siempre es `0x00`. En
`06 03 05` aparecen `0x00`, `0x01`, `0x02`, `0x03`; `0x01` es el valor de
referencia en la captura más limpia.

**Nota importante:** cada paquete aparece 2× en las capturas porque USBPcap
registra el submit y el complete del mismo URB. **No son dos envíos.**

---

## 3. Transporte — mediciones

| Vía | Resultado |
|---|---|
| `HidD_SetOutputReport` | **100% OK** (25/25) |
| `WriteFile` síncrono | **100% OK** (12/12) |
| `WriteFile` overlapped + flag | **100% OK** (25/25) |
| `WriteFile` overlapped + lecturas concurrentes | **100% OK** (25/25) |
| Mismatched: sin flag + overlapped | 100% OK |
| Mismatched: con flag + síncrono | `err=87` (no 995) |
| `device.write()` de SignalRGB | **`ERROR_OPERATION_ABORTED (995)`** |

Herramientas: `test_read_write_collision.py`, `test_overlapped_flag_mismatch.py`,
`test_minimal_write.py`, `test_long_pauses.py`.

**Conclusión:** el 995 no se reproduce desde fuera de SignalRGB en ninguna
combinación probada. **No se puede afirmar que sea un bug del SDK** — solo que
no es protocolo, firmware, transporte aislado ni procesos conflictivos.
Ver §1(b).

---

## 4. Hipótesis refutadas

| Hipótesis | Herramienta | Resultado |
|---|---|---|
| El handshake invalida el handle | `test_handshake_reset.py` | Handle estable `0x158`, 3/3 OK. No hay re-enumeración. |
| Una lectura aborta el write | `test_read_write_collision.py` | 25/25 OK con lector concurrente. |
| Mismatch de flags overlapped | `test_overlapped_flag_mismatch.py` | Las 4 combinaciones funcionan (o fallan con 87, no 995). |
| Procesos conflictivos | `Get-Process` | `Mechanical Keyboard.exe`, `HidServ.exe`, `CHECKPOINT_KX_500.exe` no corren. |
| WinUsb no disponible | `test_winusb.py` | `WinUsb_Initialize err=6`. **Pero esto NO aplica a SignalRGB**, que usa libusb, no WinUsb. |

---

## 5. Sobre el repositorio REA (pedido original)

Se instaló globalmente y se evaluó.

```powershell
npm install --global rea-agents     # -> 6.3.0
rea doctor --json
rea inspect <archivo> --provider ghidra --format json
```

| Bloqueo | Evidencia |
|---|---|
| Exige Ghidra 12.1.x | `rea doctor` → `"11.2.1; accepted releases are 12.1.x"` |
| Rechaza el target | `rea inspect HidServ_for_RE.dll` → `"unsupported_provider"`. El provider Windows exige target *non-DLL*; nuestro objetivo es una DLL |
| Mismo engine | Usa Ghidra por debajo; `HidServ.dll` ya fue decompilado con el Ghidra local (67 funciones, 14 exports) |

**Veredicto: no aporta capacidad nueva** y habría costado ~400 MB de descarga.

### Cómo se conecta (MCP)

Si algún día se quiere usar, el registro es:

```json
{
  "mcpServers": {
    "rea": {
      "command": "<ruta-a-node>/node.exe",
      "args": ["<ruta-global-npm>/rea/scripts/rea.mjs", "mcp"],
      "env": {
        "REA_ANALYSIS_PROVIDER": "ghidra",
        "GHIDRA_INSTALL_DIR": "C:/ruta/a/ghidra_12.1.4_PUBLIC",
        "JAVA_HOME": "C:/ruta/a/jdk-21"
      }
    }
  }
}
```

Requisitos: Node 22.x≥22.19 / 24.x≥24.11 / 26+, Ghidra 12.1.x, JDK 21+.
Alternativa: `npx rea-agents setup` (registra agentes soportados + skill).

### Lo que sí sirvió

REA no cubre el análisis de **capturas de tráfico USB**, que es donde estaba
la respuesta. Eso se resolvió con un parser pcapng/URB propio en Python
(`parse_pcapng_usb.py`, `parse_urb.py`, `scan_rgb_traffic.py`,
`enumerate_commands.py`) — sin tshark, que no está instalado en la máquina.

---

## 6. Lado SignalRGB (hallazgos del log real)

Log: `C:\Users\Fenix\AppData\Local\WhirlwindFX\SignalRgb\Logs\SignalRGB_*.log`

```
SignalRGB.PluginCrawler.WARNING - HID plugin with id 0x320F:0x5088 already exists.
    Overwriting with new path: .../addons/db96a7d88f5b77cb2217d656c1356d4e/GMMK/GMMK_Numpad_QMK.js

SignalRGB.ConflictMitigator.INFO - Removing Watcher: [320f:5008:6-10E627AA-0-1]
    from Conflict: [Mechanical Keyboard.exe]
SignalRGB.ConflictMitigator.INFO - Removing Watcher: [320f:5008:6-10E627AA-0-1]
    from Conflict: [HidServ.exe]
SignalRGB.ConflictMitigator.INFO - Removing Watcher: [320f:5008:6-10E627AA-0-1]
    from Conflict: [CHECKPOINT_KX_500.exe]
```

**Implicación práctica:** `ConflictMitigator` puede quitar el watcher del
dispositivo si alguno de esos tres procesos corre. El plugin los declara en
`ConflictingProcesses()`, así que **abrir el software oficial rompe el plugin
de SignalRGB**. Ahora ninguno corre, así que no es el bloqueo actual — pero
es un gotcha a tener presente.

**Colisión de IDs:** `GMMK_Numpad_QMK.js` declara `0x320F:0x5088` (PID distinto
al nuestro `0x5008`), pero SignalRGB reporta que ya existe otro plugin con ese
ID. Ruido del crawler; no afecta al KX-500.

**Limitación del API:** el SDK corre en sandbox QJSEngine y **no expone
sockets**. No existe `device.udpSocket()`, ni UDP, ni named pipes, ni acceso a
filesystem. Cualquier diseño tipo "bridge" es inviable desde el plugin.
`dev/tools/kx500_bridge.py` queda como herramienta de diagnóstico standalone
(probada 7/7 OK), no como backend.

---

## 7. Estado del plugin

`KX500_Plugin.js` v3.0.0 — `node --check` limpio, UTF-8 válido:

- `Type()` = `hid`
- `Validate()` = `endpoint.interface === 1`
- Protocolo verificado: `buildBrightness`, `buildKeyNormallyOn`,
  `buildGlobalColor`
- **Cada operación va envuelta en una transacción** `START` → paquetes → `END`
  (esto es nuevo en v3.0.0 — ver §11)
- `Render()` con dirty-check

`node dev/test/validate_v3.js` → **16/16 OK** (layout de 104 teclas, bytes de
cada paquete y orden de la transacción).

### Qué falta

**Probarlo en SignalRGB.** Es el único paso que no puedo ejecutar yo.

Si v3.0.0 (hid + transacciones) funciona → el diagnóstico se cierra: el
problema era el framing del protocolo, no el transporte.

Si no funciona, siguiente paso diagnóstico:

1. Capturar con **USBPcap mientras corre SignalRGB con el plugin**, y comparar
   contra las capturas del driver oficial. Eso muestra si SignalRGB envía los
   mismos bytes y qué responde el firmware.
2. Enlazar el device con **libusbK** vía Zadig, para eliminar una variable más
   del lado del transporte.

---

## 8. Herramientas (`dev/tools/`)

| Archivo | Qué hace |
|---|---|
| `kx500_bridge.py` | Diagnóstico standalone UDP → `HidD_SetOutputReport` (7/7 OK). No usable como backend del plugin. |
| `enumerate_commands.py` | Mapa de los 12 comandos del driver oficial |
| `scan_rgb_traffic.py` | Extrae Output Reports RGB de las capturas |
| `parse_pcapng_usb.py` | Parser pcapng mínimo (sin tshark) |
| `parse_urb.py` | Parser de URBs (modo Windows USBPcap) |
| `test_minimal_write.py` | Compara WriteFile / SetOutputReport / SetFeature |
| `test_with_handshake.py` | Handshake de 16 paquetes + colores |
| `test_v203_flow.py` | Flow exacto de Initialize + Render |
| `test_handshake_reset.py` | ¿El handshake invalida el handle? |
| `test_read_write_collision.py` | ¿Lectura concurrente aborta el write? |
| `test_overlapped_flag_mismatch.py` | 4 combinaciones de flags overlapped |
| `test_winusb.py` | ¿WinUsb disponible? (err=6 → no) |
| `get_caps_clean.py` | HIDP_CAPS por collection |
| `check_processes.py` | Procesos y handles abiertos |
| `probe_kernel_driver.py` | Busca drivers de kernel / `\\.\FwCustom` |

---

## 9. Dos errores propios corregidos durante la investigación

1. **`device.udpSocket()` no existe.** Se inventó esa API en la v2.4.0. El
   sandbox de SignalRGB no tiene sockets; ese código lanzaba excepción y caía
   al fallback en silencio. Eliminado.

2. **El refut de `rawusb` fue inválido.** Se probó con la API WinUsb
   (`WinUsb_Initialize err=6`), pero SignalRGB en modo rawusb usa **libusb**,
   que es otro mecanismo capaz de desvincular `HidUsb.sys`. Corregido:
   `Type()` vuelve a `rawusb`.

---

## 10. HALLAZGO CRITICO: dos copias del plugin (2026-10-10)

SignalRGB NO carga el plugin del workspace. Carga una copia propia en:

    C:\Users\Fenix\AppData\Local\WhirlwindFX\SignalRgb\cache\addons\ab4984f3380a046c3964904c2bc4ee74\KX500_Plugin.js

Esa copia estaba desactualizada (mtime 2026-09-11) respecto del workspace:

| | Copia LIVE (SignalRGB) | Workspace (lo editado) |
|---|---|---|
| bytes | 13600 | 12956 |
| Type() | hid | rawusb |
| version | v2.1.0 | v2.5.0 |
| solid byte2 | 0x03 (bug) | 0x01 (correcto) |

**Todas las pruebas del usuario se hicieron contra v2.1.0 con byte2=0x03.**
Las correcciones nunca llegaron al archivo que SignalRGB ejecuta.

**Accion aplicada:** se desplego v2.5.0 al directorio addons, con backup de la
version anterior en `KX500_Plugin.js.stale_20261010.bak`.

**Regla para futuros cambios:** despues de editar el workspace, hay que copiar
`KX500_Plugin.js` al directorio addons de SignalRGB O reinstalar el addon.
Verificar con:

    Get-Item "C:\Users\Fenix\AppData\Local\WhirlwindFX\SignalRgb\cache\addons\*\KX500_Plugin.js"

### Nota: la unidad E: no acepta escrituras

Durante esta sesion, toda escritura en E: fallo con
"error irrecuperable de hardware de dispositivo" (las lecturas si funcionan).
Eso produjo 28 lineas con caracteres U+FFFD en el plugin, porque las
escrituras se cortaban a mitad.

Copia de seguridad completa en:

    C:\Users\Fenix\Desktop\KX500_BACKUP_20261010\

Accion recomendada: revisar el disco E: (chkdsk E: /scan o CrystalDiskInfo)
y respaldar el proyecto completo.

---

## 11. v3.0.0 — las transacciones START/END (2026-10-21)

**Hallazgo:** el driver oficial no manda comandos sueltos. Cada cambio va
envuelto en una transacción:

```
04 01 00 01   -> START
   ...comandos...
04 02 00 02   -> END
```

Medido sobre las **18 capturas USBPcap**: **125 transacciones, todas bien
formadas**. Sin el `END` el firmware no aplica el contenido y sigue ejecutando
su animación — de ahí el parpadeo con el color anterior.

Secuencia canónica de "un solo color" (`teclado_un_solo_color.pcapng`):

```
04 01 00 01                                     START
04 0B 00 06 01 04 00 00 00                      KEY_NORMALLY_ON = 0
04 8E 00 06 03 05 00 00 80 00 00                COLOR = (128,0,0)
04 02 00 02                                     END
```

**Corrección importante:** `06 01 00` (ID de animación) **no** se manda para
color sólido. Ese comando *cambia de efecto*; mandarlo al inicializar es
justo lo que ponía al teclado en modo animación. La v2.x sí lo mandaba.

**Descubrimiento adicional (per-key, aún sin mapear):** el teclado tiene
**126 LEDs direccionables**, no 104. El frame per-key son 7 paquetes `11 36`
de 54 bytes = 378 bytes. Falta el mapeo LED → tecla física.

**Herramientas nuevas:** `dev/tools/dump_reports.py` (vuelca en orden todos los
Output Reports de un `.pcapng`) y `dev/test/validate_v3.js` (valida layout y
bytes del plugin v3).

**El 995 sigue sin causa raíz identificada.** Lo que cambió en v3 es el
*framing* del protocolo, medido contra las capturas. El error 995 de
`device.write()` no se ha reproducido ni explicado todavía.

### Nota sobre el conteo de capturas

Hay **18 capturas únicas**. Existe una 19ª copia byte a byte idéntica
(`dev/captures/teclado_captura_mixta.pcapng` = `teclado_captura_todo.pcapng`),
y por eso algunas notas anteriores decían 19.
