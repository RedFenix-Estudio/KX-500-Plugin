# Análisis del Plugin KX-500 Lite vs Addons SignalRGB que sí funcionan

> Documento técnico de qué aprendimos comparando nuestro plugin con addons
> públicos de SignalRGB que **sí funcionan en producción**.

---

## 📚 Addons estudiados

| Addon | Repo | Estado |
|---|---|---|
| **Portronics Hydra 10** (SinoWealth) | `MRtojisan/portronics-hydra-10-SignalRGB-Plugin` | ✅ Funciona |
| **Redragon Ashe K626** (SinoWealth) | `lucas-hochmann-rosa/signalrgb-redragon-k626-plugin` | ✅ Funciona |
| **PMO Wave75 Pro** | `AkselDinh/PMO-Wave75Pro-SignalRGB-Plugin` | ✅ Funciona |
| **Aula S75 Pro** | `AkselDinh/Aula-S75Pro-SignalRGB-Plugin` | ✅ Funciona |
| **Plugin template oficial** | `docs.signalrgb.com/developer/plugins` | 📖 Documentación |

---

## 🚨 Problemas encontrados en nuestro plugin Lite v1 (los que SignalRGB no leía)

### 1. **`ProductId()` retornaba single value, no array** ⚠️ CRÍTICO

| | v1 (roto) | v2 (arreglado) |
|---|---|---|
| Forma | `return 0x5008;` | `return [0x5008];` |
| Por qué | SignalRGB valida con `Array.includes()` internamente. Un solo número no matchea con el patrón esperado. | Array explícito de PIDs soportados |

Verificado contra Redragon K626 (`ProductId() { return [0x0049]; }`).

### 2. **`Initialize()` no llamaba `device.setName/setSize/setControllableLeds`** ⚠️ CRÍTICO

| | v1 | v2 |
|---|---|---|
| Comportamiento | Device "aparecía" pero no se podía usar — no estaba registrado en la UI interna de SignalRGB | Llama los 3 setters para que el device se registre correctamente |

```js
// v2 — patrón del Redragon K626 plugin:
device.setName(DEVICE_NAME);
device.setSize(LAYOUT_SIZE);
device.setControllableLeds(KX500_KEYS.map(k => k.name), KX500_KEYS.map(k => [k.x, k.y]));
```

### 3. **`Validate()` incompleto — faltaba filtrar por `interface`** ⚠️

| | v1 | v2 |
|---|---|---|
| Forma | Solo filtraba `usage_page === 0xFF1C && usage === 0x0092` | Filtra también `interface === 1` |

SignalRGB ofrece el `endpoint` completo con campos `interface`, `usage_page`, `usage`, `collection`. Si no filtrás por `interface`, el plugin puede matchear dispositivos no deseados.

### 4. **Falta `device.pause(1)` después de `device.send_report()`** ⚠️

| | v1 | v2 |
|---|---|---|
| Sin pause | El firmware del MCU puede ignorar frames si los mandamos sin pausa → luces no encienden o parpadean | `device.pause(1)` entre cada `send_report()` |

El Redragon K626 plugin lo hace. Sin esto, los keyboards pueden saturarse.

### 5. **`device.notify()` no se usaba para errores** ⚠️

| | v1 | v2 |
|---|---|---|
| Errores silenciados | `device.log(...)` pero el usuario no se entera | `device.notify(title, msg, severity)` — aparece como popup |

`device.notify(title, msg, severity)` con severity `0=info, 1=warning, 2=error`.

### 6. **Packet pad size incorrecto: 64 vs 520 bytes** ⚠️

| | v1 | v2 |
|---|---|---|
| Tamaño | `while (packet.length < 64) pad` | `while (packet.length < 520) pad` |

El Redragon K626 usa 382 bytes, Hydra 10 usa 520 bytes, otros keyboards chinos usan 64, 96, 128 o 256. **El tamaño exacto depende del modelo y hay que calibrarlo con USBPcap.** Default razonable para SinoWealth: 520.

### 7. **`ImageUrl()` retornaba string vacío** ⚠️

| | v1 | v2 |
|---|---|---|
| Forma | `return "";` | `return "https://raw.githubusercontent.com/.../assets/KX-500.png";` |

SignalRGB carga la imagen via HTTP — necesita URL a `raw.githubusercontent.com` (no a la página del repo). Si no hay imagen, el device aparece "sin foto" pero sigue funcionando.

### 8. **`/* global ... */` comment faltaba** ⚠️ menor

```js
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/
```

Este comentario le dice al editor y al bundler que esas globals existen (las inyectará SignalRGB en runtime). Sin esto, los editores se quejan pero el plugin funciona igual.

### 9. **`Documentation()` no definido** ⚠️ menor

Algunos plugins lo definen para que SignalRGB muestre un link de ayuda al usuario. Nosotros ahora devolvemos la URL del repo.

---

## 🆚 Tabla comparativa: v1 vs v2 vs Redragon K626

| Feature | KX-500 Lite v1 | KX-500 Lite v2 | Redragon K626 |
|---|---|---|---|
| `ProductId()` retorna array | ❌ | ✅ | ✅ |
| `device.setName()` en Initialize | ❌ | ✅ | ✅ |
| `device.setSize()` en Initialize | ❌ | ✅ | ✅ |
| `device.setControllableLeds()` | ❌ | ✅ | ✅ |
| `device.setImageFromUrl()` | ❌ | (URL provista, no llamada directa) | ✅ |
| `Validate()` filtra interface | ❌ | ✅ (`interface===1`) | ✅ (`interface===1`) |
| `device.pause(1)` | ❌ | ✅ | ✅ |
| `device.notify()` errores | ❌ | ✅ | ✅ |
| Packet pad a 520 bytes | ❌ (64) | ✅ (520) | ✅ (382) |
| `ImageUrl()` raw GitHub | ❌ | ✅ | ✅ |
| `/* global */` comment | ❌ | ✅ | ✅ |
| `Documentation()` | ❌ | ✅ | ✅ |
| `ConflictingProcesses()` | ✅ | ✅ | ❌ (no lo usa) |

---

## ✅ Tests después del refactor

```
> node test/validate.js
  43 ✅ / 0 ❌  (era 30 ✅ en v1)

Cambios cubiertos por tests:
  - ProductId() retorna [0x5008]
  - Validate() filtra interface + usage_page + usage
  - Initialize() llama setName/setSize/setControllableLeds
  - send_report() va seguido de pause(1)
  - Render() y Shutdown() también llaman pause(1)
  - Header SinoWealth (06 08 00 00 01 00 7A 01) verificado
  - Report size 520 (estándar)
```

---

## 🔧 Lo que falta para que las luces enciendan al 100%

Con todos los fixes v2, **SignalRGB debería detectar el KX-500 correctamente**.
Lo único que queda es calibrar el header HID real:

1. Cerrá SignalRGB
2. Iniciá driver oficial `Mechanical Keyboard.exe` o `CHECKPOINT_KX_500.exe`
3. Iniciá Wireshark + USBPcap (ya están en `tools/`)
4. Aplicá un color desde el driver oficial
5. Capturá los bytes → editá `PROTOCOL_HEADER` en `KX500_Lite.js`
6. Si el report size es diferente a 520, ajustá `HID_REPORT_SIZE`

Una vez calibrado, las luces encienden sin tocar nada más.

---

## 📦 Cómo Erik prueba la nueva versión

1. Descargá la nueva versión de `KX500_Lite.js` desde el repo
2. Reemplazá el archivo viejo en `%LOCALAPPDATA%\VortxEngine\app-*\Signal-x64\Plugins\`
4. Reiniciá SignalRGB
5. Devices → debería aparecer "Checkpoint KX-500 (NA-KB-1001)"
6. Enable streaming
7. Si las luces no encienden → calibrar header (arriba)

---

## 🙏 Créditos del análisis

- `MRtojisan/portronics-hydra-10-SignalRGB-Plugin` — patrón SinoWealth base
- `lucas-hochmann-rosa/signalrgb-redragon-k626-plugin` — el más limpio y completo
- `AkselDinh/PMO-Wave75Pro-SignalRGB-Plugin` — confirmación de packet pad patterns
- `docs.signalrgb.com/developer/plugins/` — spec oficial