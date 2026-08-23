# KX-500 HID Protocol — Estado del RE

> Documento vivo. Se actualiza cada vez que descubrimos un comando nuevo del driver oficial.

## Dispositivo

| Campo | Valor |
|---|---|
| USB VID | `0x320F` |
| USB PID | `0x5008` |
| Interfaz HID RGB | `FF1C:0092` (Vendor Defined, OUT endpoint) |
| Path típico (Win) | `\\\\?\\HID#VID_320F&PID_5008#...` |
| Layout | Full-size US ANSI 104 keys (con numpad, F1-F12, nav cluster, Win/Fn, Menu) |
| Driver oficial | `CHECKPOINT KX-500 Keyboard Driver.exe` (instalado y funcional) |

## Capacidades observadas del teclado (2026-08-23)

Erik reportó lo siguiente contra el teclado físico + driver oficial. Esto define **qué tiene que poder hacer el plugin** y **qué buscar en el RE**.

### 1. Per-key RGB con color mixing completo
> "las luces se combinan entre sí incluso formando un rango amplio de colores"

→ Cada key tiene su propio LED con R, G, B independientes. No es por zonas. **Podemos pintar cualquier key de cualquier color**, y el teclado hace el blending internamente.

### 2. Efectos fluidos sin lag
> "los efectos son fluidos, no se sienten lageados"

→ El MCU del teclado interpola / anima a alta frecuencia. Esto sugiere que el driver probablemente **envía comandos de efecto** (no frames raw a 60fps). El teclado corre la animación en hardware.

⚠️ Implicación para el plugin: puede haber dos modos en el protocolo:
- **Modo "raw frame"**: el host manda pixeles R,G,B por key cada frame (lo que necesita SignalRGB).
- **Modo "effect command"**: el host manda "ejecuta efecto X con params Y" y el teclado anima localmente.

El RE debe capturar ambos modos si existen.

### 3. Detección de velocidad de tipeo
> "detecta la velocidad a la que escribo y acelera la animación"

→ El teclado reporta eventos de key press al host (vía HID input reports en la interfaz standard de Keyboard). Eso significa que **podemos leer las teclas que se presionan** desde nuestro plugin y:
- Contar el WPM / KPM.
- Acelerar efectos en función de la velocidad de tipeo.
- Disparar animaciones reactivas al tecleo (este es el effect `typing_reactive` que ya está implementado en `effects/typing_reactive.js`).

### 4. Animaciones triggered por posición de tecla
> "es capaz de animar dependiendo del toque de la tecla, iluminando letras individuales o realizando animaciones al presionar un área, así que sabe desde donde crear la animación"

→ El teclado conoce **qué key se presionó** (HID usage ID) y puede:
- Encender solo esa key.
- Iniciar una animación que se propaga desde esa key.

Esto lo hace probablemente en el MCU. Para nuestro plugin, la traducción es:
- Leemos el HID input report.
- Identificamos la key por su usage ID.
- Disparamos el effect en la posición correspondiente de nuestro framebuffer.

⚠️ Implicación: **necesitamos dos canales HID abiertos**:
1. **OUT al canal RGB (FF1C:0092)** — mandar comandos/pixeles al teclado.
2. **IN desde el canal de Keyboard input (Usage Page 0x07)** — leer qué teclas se presionan.

## Estructura probable del paquete HID (hipótesis)

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

### Modo raw frame (esenciales para SignalRGB)
- [ ] Set color por key individual (1 key)
- [ ] Set color por key individual con key ID (las 104 keys enumeradas)
- [ ] Set all keys a un color (broadcast)
- [ ] Header / framing (cantidad de keys por paquete, padding, etc.)

### Modo effect command (lo que probablemente usa el driver oficial)
- [ ] Effect: static
- [ ] Effect: breathing (con color y velocidad)
- [ ] Effect: wave (con colores y velocidad)
- [ ] Effect: rainbow
- [ ] Effect: reactive / typing-triggered
- [ ] Effect: ripple from key press
- [ ] Brightness / speed / direction

### Configuración
- [ ] Brightness (0–100%)
- [ ] Save to on-board memory
- [ ] Restore defaults
- [ ] Protocol version / handshake
- [ ] LED on/off global

### HID Input Reports (key press detection)
- [ ] ¿El driver del KX-500 expone los keypress events en algún Usage Page custom, o solo en el Usage Page estándar 0x07?
- [ ] ¿Hay algún campo extra (presión / force) en los reports?

## Referencias

- [`kn4oqw-clint/redragon-ks82b-rgb`](https://github.com/kn4oqw-clint/redragon-ks82b-rgb) — Python per-key para Sinowealth 258a:0049 (estructura similar).
- [`MRtojisan/portronics-hydra-10-SignalRGB-Plugin`](https://github.com/MRtojisan/portronics-hydra-10-SignalRGB-Plugin) — plantilla de plugin SignalRGB.
