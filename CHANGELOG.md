# Changelog

## v2.0.1 (2026-08-29) — Handshake completo de 16 paquetes

**Cambio:** `Initialize()` ahora envia 16 paquetes del handshake (1 HANDSHAKE + 15 START/END heartbeat) en vez de solo 1 paquete.

**Por que:** el RE de `HidServ.dll` (en `driver_RE/`) mostro que el driver oficial SIEMPRE envia 16 paquetes antes de cualquier comando RGB. El firmware del KX-500 se queda en estado "no inicializado" si no recibe el heartbeat completo.

**Test que lo confirmo:** `dev/tools/test_with_handshake.py` con `HidD_SetOutputReport` — el usuario confirmo que el teclado cambio de color con el handshake de 16 paquetes.

**Nuevas funciones:**
- `buildHeartbeatPair(seq)` — genera un paquete START (seq par) o END (seq impar)

**Secuencia de Initialize (v2.0.1):**
```
1. set_endpoint(0x03)
2. HANDSHAKE               (1 paquete, 64B con VID/PID)
3. 15x START/END heartbeat (paquetes 04 01 00 01 / 04 02 00 02)
4. pause(10)
5. brightness MAX         (level 4)
6. pause(10)
7. color test             (azul)
```

**Verificacion:**
- `node --check KX500_Plugin.js` → OK
- Test Python con handshake completo: 16/16 paquetes OK + solid color OK + visual confirmado

---

## v2.0.0 (2026-08-28) — REVERT a v0.5.x + fix byte 2

**Cambio:** revertir el plugin a la version v0.5.1/v0.6.1 que controlaba el teclado, con el fix del byte 2 = 0x01 (en vez de 0x03 que era incorrecto).

**Por que:** el bug del byte 2 causaba que el firmware ignorara el solid color (aceptaba brightness=0 como valido pero no colores RGB arbitrarios).

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
