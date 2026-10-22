# KX-500 — Protocolo verificado contra las capturas del driver oficial

> Fuente de verdad: los 18 `.pcapng` de `Captura de Wirseshark del teclado/`,
> capturados mientras `CHECKPOINT_KX_500.exe` controlaba el teclado.
> Decodificados con `dev/tools/dump_reports.py` (parser USBPcap propio, sin tshark).
>
> **Última revisión: 2026-10-21.** Corrige la conclusión anterior ("falta el
> comando `06 01 00`"), que era incorrecta.

---

## 1. Formato del Output Report (64 bytes)

```
 [0]     0x04            Report ID (fijo)
 [1]     SEQ             contador rodante (0x01/0x02 en START/END)
 [2]     B2              ver §4
 [3]     TIPO            0x01/0x02 = START/END | 0x06 = comando | 0x11 = per-key
 [4]     C1              familia del comando
 [5]     C2              id del comando
 [6..7]  0x00            (en per-key bulk, [6] = byte alto del offset)
 [8..]   payload         valor, o R,G,B
```

El header USB de las capturas (USBPcap) mide **27 bytes** en transferencias de
interrupción y **28** en control; `transfer` usa el enum de USBPcap
(0=iso, 1=interrupt, 2=control, 3=bulk). El canal RGB es `endpoint 0x03`,
`transfer=1`, `dataLength=64`.

---

## 2. Toda operación va envuelta en una transacción

**Este es el hallazgo que faltaba.** El driver no manda comandos sueltos:
abre con `04 01 00 01`, manda los comandos y cierra con `04 02 00 02`.

```
04 01 00 01 00 00 00 00   -> START
   ... comandos 06 xx xx ...
04 02 00 02 00 00 00 00   -> END
```

En las capturas: **125 transacciones**, todas bien formadas. Sin el `END` el
firmware no aplica el contenido y sigue ejecutando su animación (de ahí el
parpadeo con el color anterior).

Formas de transacción observadas (las más frecuentes):

| # | Secuencia | Acción |
|---|---|---|
| 31 | `11 03` | color de una tecla |
| 20 | `06 01 00` (a veces + `06 01 04`) | cambio de efecto |
| 18 | `06 01 01` | brillo |
| 8  | `06 01 02` | velocidad |
| 7  | `11 36` ×7 | frame per-key completo |
| 5  | **`06 01 04` + `06 03 05`** | **color sólido global** |
| 4  | `06 01 03` | dirección |

---

## 3. Secuencia canónica de "un solo color"

De `teclado_un_solo_color.pcapng` (cada cambio de color del usuario):

```
04 01 00 01                                     START
04 0B 00 06 01 04 00 00 00                      KEY_NORMALLY_ON = 0
04 8E 00 06 03 05 00 00 80 00 00                COLOR = (128,0,0)
04 02 00 02                                     END
```

**No se manda `06 01 00` para color sólido.** El ID de animación sólo aparece
cuando el usuario cambia de efecto (`06 01 00` + `06 01 04`). Mandarlo al
inicializar pone el firmware en modo animación y es lo que hacía parpadear al
teclado.

Brillo (`teclado_brillo.pcapng`), siempre también envuelto:

```
04 01 00 01 | 04 0B 00 06 01 01 00 00 03 | 04 02 00 02      nivel 3
```

Nivel `0..4`; `0` apaga los LEDs.

---

## 4. Qué es B2 (byte 2)

Distribución real sobre 466 reports:

| Comando | B2 |
|---|---|
| START / END | `0x00` (125/125) |
| BRILLO | `0x00` (22/22) |
| ANIM_ID | `0x00` (20/20) |
| KEY_NORMALLY_ON | `0x00` (17/17) |
| **COLOR GLOBAL** | **`0x01` en 8 de 11** |
| PER-KEY single | 0x00..0x03 |
| PER-KEY bulk | variable (0x00..0x32) |

No es checksum (probado: suma, XOR y complemento no cierran). En color global
el valor de referencia es `0x01`; en el resto `0x00`.

---

## 5. Per-key (descubierto, pendiente de mapear)

**Una tecla:**
```
04 SEQ B2 11 03 IDX 00 00 R G B
```
`IDX` es un índice de LED/tecla (se observaron valores 0x00..0xED).

**Frame completo:** 7 paquetes de 54 bytes de RGB:

```
04 SEQ B2 11 36 OFF_LO OFF_HI 00  <54 bytes RGB>
```
`OFF` = `[6]<<8 | [5]` = 0, 54, 108, 162, 216, 270, 324
→ 378 bytes = **126 LEDs RGB**.

O sea: el teclado tiene **126 LEDs direccionables**, no 104. Falta el mapeo
LED → tecla física.

Ejemplo real (`teclado_coastal_cambio_TeclaPorTecla_Colores.pcapng`):
```
START | 11 03 B7 .. FF 00 00 | END        -> tecla IDX 0xB7 en rojo
START | 11 36 00 00 + RGB… | … ×7 | END   -> frame per-key completo
```

---

## 6. Handshake

Una sola vez, al conectar, y **no** va envuelto:

```
04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00
01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14
```

---

## 7. Lo que estaba mal antes

| Creencia anterior | Realidad |
|---|---|
| "Falta `06 01 00` para tomar control" | Al revés: ese comando **cambia de efecto** y provoca el parpadeo. Para color sólido no se manda. |
| "El heartbeat START/END causa 995" | El driver oficial lo usa siempre. Es parte del protocolo. |
| "BYTE2 = índice de chunk/zona" | En color global es fijo `0x01`; en per-key single es 0..3; en bulk varía. |
| "El teclado tiene ~16-19 zonas" | Tiene 126 LEDs direccionables (frame de 378 bytes). |

---

## 8. Herramientas

| Archivo | Qué hace |
|---|---|
| `dev/tools/dump_reports.py` | Vuelca en orden todos los Output Reports de un `.pcapng` (con `--compact`, `--raw`, `--info`) |
| `dev/tools/enumerate_commands.py` | Mapa de comandos (versión anterior, filtra de más) |
| `dev/tools/scan_rgb_traffic.py` | Extrae sólo `06 03 05` / `06 01 01` |
| `dev/test/validate_v3.js` | Valida el plugin v3: layout y bytes de cada paquete |
