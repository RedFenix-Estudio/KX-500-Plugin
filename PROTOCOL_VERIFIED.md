# KX-500 Protocol — VERIFICATED AGAINST OFFICIAL DRIVER CAPTURES

> Fuente de verdad: los 18 archivos `.pcapng` en
> `Captura de Wirseshark del teclado/`, capturados mientras
> `CHECKPOINT_KX_500.exe` controlaba el teclado.
> Decodificados con `dev/tools/enumerate_commands.py` y `scan_rgb_traffic.py`.

---

## Estructura universal del Output Report

Todos los paquetes del driver oficial (y los que debe enviar el plugin) tienen
esta estructura exacta de **64 bytes**:

```
 offset  tam  contenido
 ------  ---  -----------------------------------------------------------
 [0]      1   0x04                 Report ID (fijo)
 [1]      1   SEQ                 secuencia incremental (0x08, 0x09, 0x0A, ...)
 [2]      1   BYTE2               0x00 en casi todo; 0x01..0x03 en color global
 [3]      1   0x06                constante
 [4]      1   C1                  0x01 = familia "parametro" | 0x03 = familia "color"
 [5]      1   C2                  ID del parametro
 [6]      2   0x00 0x00           reservado
 [8]      1   VALOR               valor del parametro (o byte[8..10] = R,G,B)
 [9..63] 55   0x00                padding
```

**Handshake** (unica excepcion, 43 bytes utiles):

```
04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00
01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14
```

---

## Mapa de comandos (extraido de las capturas)

| C1 C2 | Nombre | Valor | Evidencia |
|---|---|---|---|
| `06 01 00` | **ID DE ANIMACION** | byte[8] = id | `teclado_solo_cambio_animaciones.pcapng` -> 01, 02<br>`06_breathing.pcapng` -> **05 = breathing** |
| `06 01 01` | **BRILLO** | byte[8] = 0..4 | `04/05_brightness_*.pcapng` -> 03, 04 |
| `06 01 02` | **VELOCIDAD DE ANIMACION** | byte[8] = 1..N | `teclado_velocidad_animacion.pcapng` -> 01, 02, 03 |
| `06 01 03` | **DIRECCION DE ANIMACION** | byte[8] = 00 / FF | `teclado_cambio_direccion_de_animacion.pcapng` -> FF (reversa), 00 |
| `06 01 04` | **KEY NORMALLY-ON** | byte[8] = 00 / 01 | `teclado_boton_colorful_NormallyOn.pcapng` |
| `06 01 11` | **MODO / PRESET** | byte[8] = 1,2,3 | `teclado_solo_cambio_animaciones.pcapng` |
| `06 01 2A` | reservado | — | 12 ocurrencias, valores 01..0E |
| `06 01 2B` | reservado | — | 14 ocurrencias |
| `06 01 2C` | reservado | — | 20 ocurrencias, valores 01..04 |
| `06 01 2D` | reservado (bool) | 00 / FF | 4 ocurrencias |
| `06 01 2E` | reservado | — | 6 ocurrencias |
| `06 03 05` | **COLOR GLOBAL (RGB)** | byte[8..10] = R,G,B | 16 ocurrencias |

### Frecuencia en las capturas

```
0x00 0x01 0x01  40x   BRIGHTNESS
0x00 0x01 0x00  40x   ID DE ANIMACION
0x00 0x01 0x04  34x   KEY NORMALLY-ON
0x00 0x01 0x2C  20x   reservado
0x00 0x01 0x02  16x   VELOCIDAD
0x00 0x01 0x2B  14x   reservado
0x00 0x01 0x2A  12x   reservado
0x01 0x03 0x05  10x   COLOR GLOBAL
0x00 0x01 0x2E   6x   reservado
0x00 0x01 0x11   6x   MODO/PRESET
0x00 0x01 0x03   4x   DIRECCION
0x00 0x01 0x2D   4x   reservado
```

---

## Secuencia real del driver oficial

De `prueba del test 1.pcapng` (accion "solid red", la mas limpia):

```
#0  HANDSHAKE                          04 A2 03 04 2C 00 00 00 55 AA FF ...
#1  BRIGHTNESS  level=4   seq=0x0C     04 0C 00 06 01 01 00 00 04
#2  COLOR GLOBAL blue   seq=0x09 b2=01 04 09 01 06 03 05 00 00 00 00 FF
#3  COLOR GLOBAL red    seq=0x0A b2=01 04 0A 01 06 03 05 00 00 FF 00 00
#4  COLOR GLOBAL green  seq=0x0B b2=01 04 0B 01 06 03 05 00 00 00 FF 00
#5  BRIGHTNESS  level=0   seq=0x08     04 08 00 06 01 01 00 00 00
```

### SECUENCIA de `teclado_captura_todo.pcapng` (cambio de efecto real)

El driver envia una **ráfaga de ~40 paquetes `06 01 00` (ID de animacion)**,
`06 01 01` (brillo), `06 01 2A/2B/2C/2D/2E` (parametros del perfil) ANTES de
aplicar el color. Cada paquete aparece **2 veces** en la captura porque USBPcap
registra el submit y el complete del mismo URB (no son dos envios).

---

## ESTADO DE LA IMPLEMENTACION

El plugin (`KX500_Plugin.js` v2.5.0) implementa los tres comandos que envia
el driver oficial:

| Comando | Funcion | Estado |
|---|---|---|
| `06 01 01` BRILLO | `buildBrightness()` | implementado |
| `06 01 00` ID DE ANIMACION | `buildEffect()` | implementado |
| `06 03 05` COLOR RGB | `buildSolidColor()` | implementado, `byte[2] = 0x01` |

Las capturas confirman `05 = breathing` en `06 01 00`; los valores `01` y `02`
aparecen en `teclado_solo_cambio_animaciones`. El plugin usa `buildEffect(1)`.

**Lo que quedo pendiente NO es el protocolo.** El error
`ERROR_OPERATION_ABORTED (995)` de `device.write()` sigue sin causa raiz
identificada. Ver `DIAGNOSTICO.md` para el detalle de las cinco hipotesis
refutadas y por que no se puede afirmar que sea un bug del SDK.

---

## Sobre BYTE2 (byte 2)

- En la familia `06 01 xx` (parametros): **siempre 0x00**
- En `06 03 05` (color global): **0x00, 0x01, 0x02, 0x03**

El plugin usa `0x01` para color, lo cual es valido (aparece en 10 de las 16
ocurrencias). `0x00` tambien funciona. No es un modo, es probablemente un
indice de zona/frame.

---

## Herramientas de analisis creadas

| Archivo | Que hace |
|---|---|
| `dev/tools/parse_pcapng_usb.py` | Parser pcapng minimo (sin tshark) |
| `dev/tools/parse_urb.py` | Parser de URBs (modo Windows USBPcap) |
| `dev/tools/scan_rgb_traffic.py` | Extrae Output Reports RGB de las capturas |
| `dev/tools/enumerate_commands.py` | Enumera el mapa de comandos completo |
| `dev/tools/get_caps_clean.py` | HIDP_CAPS por collection |

---

## Hallazgo sobre el transporte

Las capturas estan en **modo URB de Windows**, y el URB_FUNCTION del driver
oficial es **`0x000B` = `URB_FUNCTION_CLASS_DEVICE`**.

**Correccion importante:** este valor NO implica WinUsb. `HidD_SetOutputReport`
tambien genera URBs de tipo CLASS_DEVICE por dentro de `HidUsb.sys`. Y la API
WinUsb **no esta disponible** en este device:

```
\\?\USB#VID_320F&PID_5008#...#{GUID}
  CreateFileW          -> OK
  WinUsb_Initialize    -> err=6 ERROR_INVALID_HANDLE
```

El device esta enlazado a `HidUsb.sys`, no a `WinUsb.sys`. Por eso el plugin
usa `Type() = 'rawusb'` para probar via libusb (otro mecanismo) y no WinUsb.