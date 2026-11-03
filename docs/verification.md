# Verificación de la entrega

Fecha: 2 de noviembre de 2026. Node.js v24.18.0; npm 11.16.0; SDK ollama 0.6.4; Zod 4.6.5; dotenv 17.4.2. Ollama reportó versión 0.40.11 y modelo local gemma3:4b.

## Evidencia obtenida

| Comprobación | Resultado observado |
|---|---|
| Instalación reproducible `npm ci --offline --ignore-scripts --no-audit --no-fund` | 4 paquetes instalados desde caché; package-lock válido |
| `npm test` | 60 pruebas aprobadas, 0 fallos, 0 omitidas |
| `npm run check` | Sintaxis correcta en src, tests y scripts |
| `npm test -- tests/ollama.live.js`, antes de añadir la tercera prueba live | 62 aprobadas, 0 fallos, 0 omitidas: 60 locales + 2 reales |
| `npm start` | Arranque, comprobación del modelo, banner y prompt `Tú>` correctos |
| Último `npm run test:live`, con tercera prueba de CLI | 3 omitidas por falta de acceso del proceso al servicio local; no cuenta como prueba real exitosa |

## Resultados con modelo real

1. **Stock y precio:** Gemma solicitó getProductStock y getProductPrice, obtuvo stock 7 y precio 18999 MXN, y devolvió una respuesta final con ambos datos.
2. **Compra:** Gemma solicitó createOrder para 2 LAPTOP-001 y CUST-123. El test simuló CONFIRMAR únicamente después de comprobar total 37998. Se creó ORD-100, el inventario quedó en 5 y Gemma informó el éxito. Es aprobación simulada de una prueba, no intervención humana.

Los tests reales se volvieron a ejecutar con éxito después de corregir cancelación y caché. El comportamiento en lenguaje natural sigue siendo probabilístico; estas pruebas no garantizan todas las conversaciones posibles.

## Revisión y correcciones

Una revisión independiente detectó lecturas cacheadas obsoletas tras crear una orden y Ctrl+C que no cancelaba la petición al modelo. Se añadieron cuatro pruebas que reprodujeron los fallos. Se corrigieron invalidando lecturas tras mutaciones y propagando AbortSignal desde la terminal al loop y al SDK. Las cuatro pruebas pasan dentro de la suite de 60.

## Límites de esta ejecución

El entorno restringido produjo `EPERM` en algunos procesos Node que intentaban conectar con loopback, aunque curl alcanzaba Ollama. Dos ejecuciones del comando de tests permitido sí pudieron usar el SDK real. La sesión interactiva arrancó, pero la política del entorno bloqueó enviar teclas a ese proceso. El test adicional de CLI con entrada guionada quedó omitido por la restricción de conexión; su ejecución integral con Gemma permanece pendiente.

Las pruebas de CLI con modelo simulado sí verificaron compra, rechazo por EOF, comandos, reset sin restaurar inventario, líneas canalizadas y Ctrl+C. La descarga de paquetes desde npm tampoco pudo verificarse por DNS restringido: se instalaron versiones exactas disponibles en caché, sin sustituir dependencias.
