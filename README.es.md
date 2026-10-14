# Látigo Digital FX

**Simulador de látigo para escritorio con físicas de cuerda en tiempo real, efectos de impacto y sonido disparado por la propia simulación.**

> 🇬🇧 English documentation: [README.md](README.md).

Látigo Digital FX representa el látigo como una cadena de masas puntuales unidas por restricciones. Mueves el mango con el ratón o el trackpad, preparas el golpe, sueltas y ves cómo un bucle recorre la cuerda cónica hasta que la punta supera a la mano y se produce el **chasquido**. El sonido, la onda expansiva y las chispas los dispara la simulación, no la tecla que pulsaste.

## Características

- **Modelo dinámico de cuerda**: integración de Verlet, restricciones de distancia resueltas de forma iterativa, rigidez a flexión (solo compresión) que disminuye hacia la punta, masa decreciente, amortiguación del aire y límites de velocidad.
- **Paso temporal fijo** (120–360 Hz según la calidad) desacoplado del renderizado: acumulador, límite de pasos por fotograma, recuperación tras pausas e interpolación para dibujar.
- **Detección de chasquidos** con histéresis, detección de picos y periodo refractario: un evento por chasquido físico, sea cual sea la tasa de fotogramas.
- **Fases** derivadas del estado real: reposo, preparación, carga, aceleración, propagación, chasquido, recuperación y enfriamiento.
- **Audio procedural** (sin archivos de sonido): transitorio en N, ruido filtrado, componente de alta frecuencia y cola corta; 8 variantes con semilla, variación de tono, ganancia y panorama, «whoosh» del movimiento, silencio instantáneo y protección contra duplicados y exceso de voces. Si no hay dispositivo de audio, la simulación sigue funcionando.
- **Gráficos**: cuerda cónica suavizada con brillo y trenzado, mango con empuñadura y virola, punta deshilachada, estela, partículas reutilizables, ondas expansivas, destello, sacudida de cámara, soporte HiDPI y tres temas (_Oscuro profesional_, _Neón futurista_, _Minimalista claro_).
- **Modos**: libre, práctica, demostración, laboratorio, cámara lenta y entrenamiento.
- **Preferencias** guardadas en el directorio de datos del usuario con validación, escritura atómica y recuperación ante archivos corruptos (se conserva una copia).
- **Accesibilidad**: control completo por teclado, etiquetas en español, reducir movimiento, desactivar destellos, desactivar sacudidas, silencio.
- **Privacidad**: funciona sin conexión. Sin telemetría, sin peticiones de red, sin captura de pantalla, sin ganchos globales de teclado o ratón y sin permisos de administrador.

## Requisitos

- Node.js **22 o superior** y npm (solo para desarrollo).
- macOS 11+ (Apple Silicon o Intel), Windows 10/11 o una distribución Linux de escritorio moderna.

## Instalación y ejecución

```bash
npm install
npm start
```

| Comando                                        | Uso                                                     |
| ---------------------------------------------- | ------------------------------------------------------- |
| `npm test`                                     | Pruebas unitarias y de integración (sin interfaz)       |
| `npm run check`                                | Tipos + linter + formato + pruebas                      |
| `npm run smoke`                                | Abre la app real, ejecuta un golpe y emite un informe   |
| `npm run bench`                                | Benchmark de la física en esta máquina                  |
| `npm run dev:web`                              | Vista web de desarrollo en `http://127.0.0.1:5178`      |
| `npm run pack:dir`                             | App sin instalador para el sistema actual en `release/` |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Instaladores y paquetes (nunca se publican)             |

Compilación por plataforma, firma y notarización: [docs/BUILDING.md](docs/BUILDING.md).

## Controles

| Entrada                        | Acción                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Mover ratón o trackpad         | Mueve el mango; los movimientos rápidos y los cambios bruscos de dirección generan ondas                                   |
| Clic izquierdo + arrastrar     | Preparar el golpe tirando hacia atrás (se acumula carga)                                                                   |
| Soltar                         | Latigazo en la dirección contraria al arrastre                                                                             |
| `Espacio` / botón **Latigazo** | Golpe automático (lateral, por encima o ascendente)                                                                        |
| `R`                            | Reiniciar el látigo                                                                                                        |
| `P`                            | Pausa                                                                                                                      |
| `M`                            | Silenciar                                                                                                                  |
| `L`                            | Modo laboratorio                                                                                                           |
| `F`                            | Pantalla completa                                                                                                          |
| `O`                            | Ocultar o mostrar paneles                                                                                                  |
| `H` / `F1`                     | Ayuda                                                                                                                      |
| `Esc`                          | Cierra la ayuda → cancela el arrastre → sale de pantalla completa → muestra paneles → cierra ajustes (nunca cierra la app) |

## Modos de uso

- **Libre**: solo el látigo.
- **Práctica**: fase actual y consejos contextuales («Sin chasquido: aumenta la fuerza…»).
- **Demostración**: golpes autónomos; al mover el ratón tomas el control y la demo se reanuda tras 2,5 s sin actividad.
- **Laboratorio**: FPS, peor fotograma, frecuencia de simulación, pasos por fotograma, nodos, iteraciones, velocidad del mango y de la punta, umbral, energía, nodo más rápido, fase, eventos, estado y latencia del audio, voces, partículas y recuperaciones numéricas. Los nodos se colorean según su velocidad.
- **Cámara lenta**: escala temporal ajustable (0,05–0,5×). Solo en este modo el chasquido se vuelve más grave para acompañar la cámara lenta; el modo normal siempre usa el tono natural.
- **Entrenamiento**: el chasquido debe producirse dentro del objetivo; se registran aciertos, racha y mejor intensidad.

## Arquitectura y decisiones

Consulta [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y las simplificaciones físicas en [docs/PHYSICS.md](docs/PHYSICS.md).

**Tecnología elegida: Electron + TypeScript.** En el equipo de desarrollo solo estaba disponible Node.js (ni Rust ni Godot). La plataforma web aporta Web Audio con latencia interactiva, canvas 2D acelerado y HiDPI, eventos de puntero uniformes para ratón y trackpad, un único código empaquetado para macOS, Windows y Linux con `electron-builder`, dependencias con licencias compatibles con MIT, pruebas triviales del núcleo físico sin interfaz y la menor barrera de entrada para contribuir. El coste es un binario más grande (~290 MB sin comprimir).

## Pruebas

`npm test` ejecuta 79 pruebas (todas correctas en el commit inicial). Detalle, cobertura y límites en [docs/TESTING.md](docs/TESTING.md).

## Compatibilidad

| Plataforma               | Estado                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| macOS 26 · Apple Silicon | ✅ Verificado: ejecución en desarrollo, smoke test y paquete sin instalador (firma ad-hoc) arrancado y probado |
| macOS · Intel            | ⚙️ Configurado, no verificado                                                                                  |
| Windows 10/11            | ⚙️ Configurado (NSIS + portable) y en CI, no verificado localmente                                             |
| Linux                    | ⚙️ Configurado (AppImage + tar.gz) y en CI, no verificado localmente                                           |

## Solución de problemas

- **No hay sonido**: revisa la fila _Audio_ del modo laboratorio. En la vista web el audio empieza tras el primer clic o tecla.
- **El golpe no chasquea**: es la física. Sube la _Fuerza_, baja la _Amortiguación_ o haz el gesto más rápido y frena en seco.
- **Configuración extraña**: se valida y repara automáticamente; los archivos corruptos se guardan como `settings.corrupt-<fecha>.json`. Usa _Restablecer ajustes_.
- **Ubicación de las preferencias**: se muestra al final del panel de ajustes (macOS: `~/Library/Application Support/Látigo Digital FX/`, Windows: `%APPDATA%\Látigo Digital FX\`, Linux: `~/.config/Látigo Digital FX/`).

## Limitaciones

- Vista lateral 2D. El modelo es una aproximación estable y verosímil; no reproduce con exactitud la aerodinámica ni la velocidad supersónica de un látigo real. El umbral de chasquido es una velocidad calibrada (~30 m/s con 2,2 m), no Mach 1.
- Renderizado Canvas 2D (sin shaders todavía).
- Solo se ha compilado y ejecutado en macOS arm64.
- No hay pruebas automáticas de extremo a extremo de la interfaz (el smoke test cubre arranque, bucle, física e inicialización del audio).

## Hoja de ruta

Renderizador WebGL con bloom y distorsión, modelo de muñeca 3D, síntesis con AudioWorklet dependiente de la velocidad de pico, mandos de juego, grabación y repetición de golpes, exportación de datos del laboratorio, interfaz en inglés.

## Publicación manual en GitHub (opcional, para el futuro)

El repositorio se ha creado solo en local. Cuando decidas publicarlo, hazlo tú manualmente, por ejemplo creando un repositorio vacío en GitHub y ejecutando `git remote add origin <url>` seguido de `git push -u origin main`. Ningún script de este proyecto publica nada.

## Contribuir y licencia

Lee [CONTRIBUTING.md](CONTRIBUTING.md), el [Código de conducta](CODE_OF_CONDUCT.md) y [SECURITY.md](SECURITY.md). Licencia [MIT](LICENSE). No se incluyen recursos multimedia de terceros: todos los sonidos se generan por código ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
