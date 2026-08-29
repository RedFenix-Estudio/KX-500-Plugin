# Changelog

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
