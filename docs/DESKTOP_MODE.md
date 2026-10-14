# Modo escritorio (global desktop overlay)

> Español abajo · English summary first.

**English summary.** «Modo escritorio» shows the whip in a transparent, borderless, always-on-top overlay window above other applications. Clicks pass through the empty area to the apps below. The global cursor position (read with Electron's official `screen.getCursorScreenPoint()`) drives the handle; configurable global shortcuts (Electron `globalShortcut`) request strikes from the physics engine, toggle the overlay, pause and mute. A tray / menu-bar icon offers every action and a full quit. Nothing is captured from other applications: no screen capture, no keystroke logging, no click interception.

---

## Uso

1. Abre Látigo Digital FX y ajusta aspecto, sonido y física como siempre.
2. En **Ajustes → Modo escritorio**, marca «Usar el látigo sobre el escritorio y otras aplicaciones».
3. El látigo aparece sobre el escritorio y sigue al cursor. Tus aplicaciones siguen recibiendo los clics.
4. Pulsa el atajo de latigazo (por defecto **⌘⌥⇧J** en macOS, **Ctrl+Alt+Shift+J** en Windows/Linux) desde cualquier aplicación.
5. Puedes cerrar o minimizar la ventana de ajustes: el látigo sigue activo y aparece un icono en la bandeja o en la barra de menús.
6. Para pararlo: atajo de mostrar/ocultar, «Desactivar modo escritorio» o «Salir de Látigo Digital FX» en el icono.

### Atajos globales predeterminados

| Acción                 | macOS | Windows / Linux  |
| ---------------------- | ----- | ---------------- |
| Latigazo               | ⌘⌥⇧J  | Ctrl+Alt+Shift+J |
| Mostrar / ocultar      | ⌘⌥⇧K  | Ctrl+Alt+Shift+K |
| Pausar / reanudar      | ⌘⌥⇧P  | Ctrl+Alt+Shift+P |
| Silenciar / con sonido | ⌘⌥⇧M  | Ctrl+Alt+Shift+M |

Se cambian con «Cambiar» → pulsar la combinación. Solo se aceptan combinaciones con ⌘/Ctrl, ⌥/Alt o Super más una tecla, para no interferir nunca con la escritura normal. Si una combinación la usa otra aplicación o el sistema la rechaza, se muestra el motivo en rojo y el resto de atajos siguen funcionando; el icono de la bandeja ofrece siempre las mismas acciones.

### Opciones

| Opción                             | Efecto                                                                                                                                              | Predeterminado       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Usar el látigo sobre el escritorio | Activa la superposición, los atajos globales, el seguimiento del cursor y el icono de la bandeja                                                    | Desactivado          |
| Mostrar la superposición           | Oculta el látigo sin desactivar los atajos                                                                                                          | Sí                   |
| Seguir el cursor global            | El mango sigue al cursor en todo el escritorio                                                                                                      | Sí                   |
| Paso de clics                      | La superposición no captura el ratón. Desactívalo para arrastrar el látigo directamente (modo interactivo); vuelve con **Esc** o el botón del aviso | Sí                   |
| Seguir el cursor entre monitores   | La superposición se traslada al monitor donde está el cursor                                                                                        | Sí                   |
| Sonido en el escritorio            | Silencia solo la superposición                                                                                                                      | Sí                   |
| Tamaño del látigo                  | Alcance del látigo como fracción de la altura de la pantalla                                                                                        | 45 %                 |
| Opacidad de los efectos            | Estela, chispas y ondas; la zona vacía sigue siendo totalmente transparente                                                                         | 90 %                 |
| Al cerrar esta ventana             | «Seguir en la bandeja» (el látigo sigue activo) o «Salir de la aplicación»                                                                          | Seguir en la bandeja |

«Restaurar valores del modo escritorio» devuelve esta sección a sus valores predeterminados sin tocar el resto de preferencias. Las preferencias anteriores (versión 1) se migran automáticamente: se conservan todas y se añade la sección nueva con valores seguros (desactivada).

## Comportamiento de cada acción

| Acción                       | Resultado                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Activar                      | Crea una única ventana de superposición, registra los 4 atajos, inicia el seguimiento del cursor y muestra el icono                      |
| Desactivar                   | Destruye la superposición, libera los atajos, detiene el seguimiento y quita el icono                                                    |
| Mostrar / ocultar            | Oculta o muestra la superposición; oculta no se sondea el cursor ni se consume CPU de dibujo                                             |
| Pausar                       | Congela la física y el dibujo (un único fotograma) y detiene el sondeo del cursor                                                        |
| Silenciar                    | Preferencia compartida con la ventana principal; los chasquidos siguen ocurriendo sin sonido                                             |
| Latigazo                     | Pide un golpe al motor físico; el sonido suena solo si la física detecta el chasquido. Si la superposición está oculta, se muestra antes |
| Restablecer                  | Reinicia la cuerda en la posición actual del mango                                                                                       |
| Cerrar la ventana de ajustes | Con «Seguir en la bandeja» y el modo escritorio activo: se oculta (en macOS desaparece también del Dock). En cualquier otro caso: sale   |
| Minimizar la ventana         | El látigo de escritorio sigue funcionando                                                                                                |
| Salir (bandeja o ⌘Q)         | Cierra todas las ventanas, libera atajos y el icono, y termina el proceso                                                                |

No hay inicio automático con el sistema, ni procesos ocultos: mientras el modo escritorio está activo, el icono de la bandeja o de la barra de menús está siempre visible.

## Arquitectura

```
Proceso principal (src/electron)                         Superposición (src/overlay)
 DesktopController (src/desktop, puro)  ──comandos──▶    OverlayApp
   ├─ OverlayWindowManager  (ventana transparente)         ├─ Simulation (mismo núcleo físico)
   ├─ GlobalInputManager    (cursor global, 60 Hz) ─cursor─▶├─ Renderer (modo transparente)
   │    └─ DesktopCoordinateMapper (puro)                  ├─ ImpactEffects / TipTrail
   ├─ GlobalShortcutManager (atajos, puro + globalShortcut) └─ AudioEngine (chasquido por evento físico)
   └─ TrayManager           (bandeja / barra de menús)
 Centro de preferencias: una única copia en memoria, persistida y difundida a ambas ventanas.
```

- La conversión de coordenadas no asume que el cursor global coincide con las coordenadas de la ventana: `DesktopCoordinateMapper` localiza el monitor (también con coordenadas negativas a la izquierda o arriba del principal), resta el origen del monitor y devuelve píxeles CSS locales; la cámara los convierte a metros del simulador. Las coordenadas de Electron ya están en píxeles independientes del dispositivo, así que el escalado HiDPI se aplica al dibujar (`devicePixelRatio`).
- El látigo vive en un monitor cada vez. Al pasar el cursor a otro monitor, la superposición se ajusta a ese monitor y el látigo se reinicia bajo el cursor (no se dibuja partido entre dos pantallas).
- Al añadir, quitar o cambiar la resolución de un monitor se recalculan los límites y la superposición se reajusta.
- Solo se envía el cursor cuando cambia de posición; con el cursor quieto no hay tráfico IPC.

## Permisos y diferencias por sistema operativo

### macOS (verificado en macOS 26.6, Apple Silicon)

- **No se necesitan permisos de Accesibilidad ni de Monitorización de entrada** (comprobado: la autoprueba registra los atajos y lee el cursor sin que macOS pida ningún permiso). La posición del cursor se obtiene con `screen.getCursorScreenPoint()` y los atajos con `globalShortcut`, que registra combinaciones concretas en el sistema; ninguna de las dos cosas lee las pulsaciones del usuario. (Las teclas multimedia sí requerirían Accesibilidad; por eso no se usan.)
- La superposición es un `NSPanel` flotante, visible en todos los escritorios y sobre aplicaciones a pantalla completa, sin aparecer en Mission Control y sin robar el foco.
- Si macOS o otra aplicación ya reserva una combinación, el registro falla y se informa en Ajustes.
- La aplicación nunca solicita permiso de grabación de pantalla.

### Windows (configurado, no verificado en esta máquina)

- Ventana transparente de Electron, siempre encima (nivel `screen-saver`), sin botón en la barra de tareas y sin foco; el paso de clics usa `setIgnoreMouseEvents`.
- No se necesitan permisos especiales ni privilegios de administrador.
- Los juegos en **pantalla completa exclusiva** pueden dibujarse por encima de cualquier superposición; usa el modo «ventana sin bordes» del juego.
- Monitores con distinto escalado: Electron entrega coordenadas en DIP; si observas un desfase en configuraciones mixtas, abre una incidencia con los datos del modo laboratorio.

### Linux (configurado, no verificado en esta máquina)

- **X11**: transparencia (requiere compositor), paso de clics, cursor global y atajos globales funcionan con las APIs estándar.
- **Wayland**: por diseño del protocolo, una aplicación **no puede leer el cursor fuera de sus propias ventanas** ni registrar atajos globales libremente. La app lo detecta y lo indica en Ajustes. Alternativas:
  - desactivar el paso de clics y usar el **modo interactivo** (el látigo sigue al ratón sobre la superposición);
  - ejecutar la app en XWayland: `latigo-digital-fx --ozone-platform=x11`;
  - usar el icono de la bandeja en lugar de los atajos si el compositor no ofrece el portal _GlobalShortcuts_.
- La bandeja requiere StatusNotifierItem/AppIndicator (en GNOME, la extensión AppIndicator).

## Pruebas

- Unitarias (sin Electron, `npm test`): conversión de coordenadas (monitores con coordenadas negativas, huecos, desconexión, cambio de resolución), validación y grabación de atajos, registro/liberación/conflictos de atajos, activación, desactivación, ocultación, pausa, silencio, latigazo, paso de clics, cierre completo del controlador, detección de capacidades X11/Wayland y migración de preferencias.
- Integración en el sistema operativo real (`npm run test:desktop`): 38 comprobaciones sobre la ventana real, los atajos reales del sistema, la bandeja, minimizar/restaurar, el cierre de la ventana de ajustes y la salida completa. Resultado en macOS 26.6 (arm64): **38/38 correctas**. Con un solo monitor, el movimiento entre monitores se comprueba solo con pruebas unitarias.
- Limitación: el paso real de clics hacia otras aplicaciones no se puede automatizar sin inyectar eventos del sistema (lo que este proyecto evita). La autoprueba verifica que `setIgnoreMouseEvents` está aplicado y que la ventana no es enfocable; la comprobación de que los clics llegan a otra aplicación concreta queda pendiente de verificación manual.
