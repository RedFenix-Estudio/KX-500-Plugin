# KX-500 HID Protocol — Estado del RE

> Documento vivo. Se actualiza cada vez que descubrimos un comando nuevo del driver oficial.

## Dispositivo

| Campo | Valor |
|---|---|
| USB VID | `0x320F` |
| USB PID | `0x5008` |
| Interfaz HID RGB | `FF1C:0092` (Vendor Defined) |
| Path típico (Win) | `\\\\?\\HID#VID_320F&PID_5008#...` |

## Descubierto hasta ahora

> ⚠️ **Vacío.** Pendiente de la captura USBPcap. Ver [`examples/wireshark-capture-guide.md`](./examples/wireshark-capture-guide.md) para cómo se captura.

### Estructura probable del paquete HID (hipótesis)

Basado en el patrón típico de teclados RGB HID Vendor Defined (similar a Sinowealth 258a:0049 que usa el Redragon KS82B):

```
Byte 0    : Report ID (típicamente 0x00 o 0x01)
Byte 1    : Comando (set color, set effect, save, etc.)
Byte 2    : Sub-comando / modo / zona
Byte 3    : Cantidad de keys o parámetro
Byte 4..N : Datos (RGB por key, parámetros del efecto)
```

> ⚠️ **Esto es hipótesis**, no confirmado. La captura lo va a develar.

## Comandos a descubrir (checklist)

- [ ] Set color por key individual
- [ ] Set color por zona
- [ ] Set all keys a un color
- [ ] Effect: static
- [ ] Effect: breathing
- [ ] Effect: wave
- [ ] Effect: rainbow
- [ ] Effect: reactive (audio)
- [ ] Brightness / speed / direction
- [ ] Save to on-board memory
- [ ] Restore defaults
- [ ] Protocol version / handshake

## Referencias

- [`kn4oqw-clint/redragon-ks82b-rgb`](https://github.com/kn4oqw-clint/redragon-ks82b-rgb) — Python per-key para Sinowealth 258a:0049 (estructura similar).
- [`MRtojisan/portronics-hydra-10-SignalRGB-Plugin`](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin) — plantilla de plugin SignalRGB.
