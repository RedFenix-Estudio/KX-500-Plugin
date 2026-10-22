# Changelog

## v3.0.0 (2026-10-21) — Transacciones START/END: el protocolo real del driver

**Hallazgo:** el driver oficial NO manda comandos sueltos. Cada cambio va
envuelto en una transacción:

```
04 01 00 01   -> START
   ...comandos...
04 02 00 02   -> END
```

En las 18 capturas USBPcap hay **125 transacciones, todas bien formadas**.
Sin el `END` el firmware no aplica el contenido y sigue con su animación
(de ahí el parpadeo con el color anterior).

Secuencia canónica de "un solo color" (`teclado_un_solo_color.pcapng`):

```
04 01 00 01                                     START
04 0B 00 06 01 04 00 00 00                      KEY_NORMALLY_ON = 0
04 8E 00 06 03 05 00 00 80 00 00                COLOR = (128,0,0)
04 02 00 02                                     END
```

**Cambios:**
1. `sendTransaction()` envuelve cada operación: `START` -> paquetes -> `END`.
2. `Initialize()` = handshake (sin envolver) + transacción con brillo 4.
3. `Render()` = transacción `06 01 04` + `06 03 05`, solo si el color cambió.
4. Se eliminó `buildEffect()` (`06 01 00`): ese comando **cambia de efecto**,
   no toma el control. Mandarlo al inicializar es lo que ponía al teclado en
   modo animación y lo que provocaba el parpadeo.
5. `Type()` vuelve a `hid`.

**Descubrimiento adicional (per-key, aún sin mapear):** el teclado tiene
**126 LEDs direccionables**, no 104. El frame per-key son 7 paquetes `11 36`
de 54 bytes = 378 bytes.

**Verificación:** `node dev/test/validate_v3.js` -> **16/16 OK** (layout de 104
teclas, bytes de cada paquete y orden de la transacción).

Detalle completo en `PROTOCOL_VERIFIED.md` §2.

---

## v2.5.0 (2026-10-10) — Protocolo verificado contra las capturas + fix del byte 2

**Cambios:**
1. `buildSolidColor()`: byte 2 de `0x03` a **`0x01`**, medido en
   `prueba del test 1.pcapng`.
2. `Render()` con dirty-check: solo escribe si el color cambió (antes
   escribía ~20 veces/s en bucle).
3. `Type()` = `rawusb` (SignalRGB mapea `device.write()` a libusb).
4. 12 comandos mapeados desde las 18 capturas USBPcap del driver oficial.

**Pendiente:** faltaba probarlo en SignalRGB. El error 995 de `device.write()`
sigue **sin causa raíz identificada** — ver `DIAGNOSTICO.md` §1(b).

---

## v2.0.3 (2026-08-29) — FIX: pause(100ms) en Initialize + quitar set_endpoint

**Diagnostico final:** el primer write (handshake) SIEMPRE funciona, pero el segundo
write (brightness) falla con `0x3E3` ERROR_OPERATION_ABORTED. El log de SignalRGB
tambien mostro: `[KX500] set_endpoint failed: Unable to determine callable overload.`

**Cambios:**
1. `set_endpoint(0x03)` QUITADO — la firma espera QJSValue (3 o 4 args), no un int.
   SignalRGB SDK ya configura el endpoint via el Validate() (FF1C:0092).
2. `device.pause(10)` → `device.pause(100)` en `Initialize()` — el dispositivo
   necesita tiempo para procesar el primer write antes del segundo.
3. `writeRGBPacket(packet, pauseMs=5)` ahora acepta pause custom — se pasa 100
   en Initialize y 5 en Render (continuo).

**Test que lo confirmo:** `test_long_pauses.py` con 5 writes separados por 500ms:
5/5 OK vs los tests anteriores que se colgaban en el 2do-3er write.

**Estado final del plugin:**
- 1 HANDSHAKE + 1 brightness + 1 test color (3 paquetes en Initialize)
- 100ms entre cada uno (warmup)
- 5ms entre Render() (continuo, dispositivo en sync)

---

## v2.0.2 (2026-08-29) — REVERTIR handshake de 16 paquetes (CAUSABA ERROR_OPERATION_ABORTED)

**Descubrimiento critico:** el handshake de 16 paquetes (v2.0.1) **CAUSABA**
`ERROR_OPERATION_ABORTED (995)` en SignalRGB SDK, exactamente el mismo error
que v0.6.1 tuvo con el heartbeat wrapper. Mi test Python con 16 paquetes
funciono porque NO competia con SignalRgbService, pero el plugin SÍ.

**Cambio:** revertido a 1 solo HANDSHAKE (como v0.5.1).

**Estado actual del bug:**
- v2.0.0 con byte 2 = 0x01 (1 HANDSHAKE) — el plugin tiene el fix correcto
- SignalRgbService monopoliza el KX-500 (PID 5540) y rompe el handle
- Error: `(0x000003E5) ERROR_IO_PENDING` + `(0x000003E3) ERROR_OPERATION_ABORTED`
  + `Device Hid Handle is no longer connected!`
- Causa: SignalRgbService tiene el handle abierto en background, y cuando
  el plugin intenta escribir, Windows cancela la operacion por conflicto
  de handle

**Solucion propuesta (proximo paso):**
1. Cerrar SignalRgbService antes de cargar el plugin KX-500
2. O configurar el plugin para usar FILE_SHARE_RW (ya lo hace internamente)
3. O reportar a SignalRGB para que agregen el KX-500 a su lista oficial

---

## v2.0.1 (2026-08-29) — Handshake completo de 16 paquetes (REVERTIDO)

**Cambio aplicado:** `Initialize()` envia 16 paquetes del handshake.

**Por que fue revertido:** El log de SignalRGB mostro que el heartbeat de 15
paquetes causa `ERROR_OPERATION_ABORTED` en HID overlapped I/O. El comentario
del plugin v0.6.1 ya advertia de esto:
> "v0.6.1: QUITAR heartbeat (causaba ERROR_OPERATION_ABORTED)"

---

## v2.0.0 (2026-08-28) — REVERT a v0.5.x + fix byte 2

**Cambio:** revertir el plugin a la version v0.5.1/v0.6.1 que controlaba el teclado, con el fix del byte 2 = 0x01 (en vez de 0x03 que era incorrecto).

**Estructura del paquete (confirmado por capturas USBPcap + test Python):**
```
[0x04] [SEQ] [0x01] [0x06 0x03 0x05 0x00 0x00 R G B] + pad
```

---

## v1.x (2026-08-24-27) — Intentos fallidos

- v1.0.0: rewrite mio - HID pero sin device.pause -> 0x57 ERROR_INVALID_PARAMETER
- v1.2.0-1.7.0: intentos de control_transfer / rawusb -> NADA
- v0.5.1: device.write(64B) + device.pause(5/10) -> CONTROLABA (con byte 2 = 0x03 mal)
- v0.5.2: pad HANDSHAKE a 64 bytes (HID handle disconnects)
- v0.6.1: QUITAR heartbeat (causaba ERROR_OPERATION_ABORTED)
