# Order Management Agent

Demo: un agente en una terminal consulta una tienda simulada y crea órdenes con confirmación humana. **El LLM decide qué herramienta solicitar; Node.js controla qué se puede ejecutar.**

Un LLM genera texto a partir de su contexto. Aquí se convierte en parte de un agente porque un programa interpreta sus decisiones, ejecuta herramientas permitidas y devuelve sus resultados al modelo en un ciclo limitado.

## Requisitos e instalación

- Node.js 22 o superior y npm.
- [Ollama](https://ollama.com/download) ejecutándose localmente.
- Modelo obligatorio `gemma3:4b` descargado. La descarga inicial requiere internet; las inferencias y los datos del demo permanecen locales.

Instala Node.js y Ollama para tu sistema. En macOS abre la aplicación Ollama. En Linux verifica el servicio; si no está iniciado, ejecuta `ollama serve` en otra terminal.

```sh
ollama pull gemma3:4b
ollama list
cd order-management-agent
npm install
npm run dev
```

## Configuración

Los valores predeterminados funcionan sin crear `.env`. Para personalizarlos:

```sh
cp .env.example .env
```

En PowerShell: `Copy-Item .env.example .env`. Las variables del proceso tienen prioridad sobre `.env`.

| Variable | Valor inicial | Restricción |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | HTTP local: 127.0.0.1, localhost o [::1], sin credenciales ni rutas |
| `OLLAMA_MODEL` | `gemma3:4b` | No se permite otro modelo |
| `AGENT_MAX_STEPS` | `8` | 1–8 llamadas al modelo, contando reparaciones |
| `AGENT_TEMPERATURE` | `0` | 0–2; 0 reduce variación, no garantiza determinismo |
| `AGENT_LOG_LEVEL` | `debug` | debug, info o silent |
| `OLLAMA_TIMEOUT_MS` | `120000` | 1–600000 ms por petición, incluido arranque |
| `AGENT_MAX_OUTPUT_CHARS` | `12000` | 100–12000 caracteres |
| `AGENT_HISTORY_MESSAGES` | `24` | 2–24 mensajes anteriores |

La respuesta del modelo también tiene un límite de 1024 tokens generados. El contexto de Ollama se configura en 8192 tokens. Cada entrada está limitada a 4000 caracteres; el historial guardado contiene preguntas y respuestas finales, no trazas completas. En el turno activo sí se conservan decisiones y resultados de herramientas.

## Uso y confirmación

```text
Tú> ¿Cuántas LAPTOP-001 tenemos y cuánto cuestan?
[LLM] {"step":1,"action":"tool","tool":"getProductStock"}
[TOOL] ... "data":{"sku":"LAPTOP-001","stock":7} ...
[LLM] ... "tool":"getProductPrice" ...
[TOOL] ... "price":18999,"currency":"MXN" ...
Agente> Tenemos 7 unidades a $18,999 MXN cada una.

Tú> Quiero comprar 2 LAPTOP-001 como CUST-123.
[APP] Se creará una orden para CUST-123: 2 x LAPTOP-001.
[APP] Precio unitario $18,999.00; total $37,998.00 MXN.
[APP] ¿Confirmas esta operación? Escribe exactamente CONFIRMAR: CONFIRMAR
[APP] Confirmación aceptada.
[TOOL] ... "orderId":"ORD-100" ...
Agente> Se creó la orden ORD-100.
```

Ejemplo ilustrativo: el orden de consultas y la redacción pueden variar. **Solo el resultado exitoso `[TOOL]` demuestra una ejecución**; un `action=tool` es una solicitud y la respuesta final del LLM puede equivocarse.

La aplicación muestra operación, cliente, cantidad, precio unitario, total y moneda antes de preguntar. Solo la línea exacta `CONFIRMAR` introducida en ese aviso autoriza la operación: minúsculas, espacios, `NO`, EOF y cualquier otra respuesta cancelan. Una frase del modelo o un `CONFIRMAR` en la pregunta inicial no autorizan nada.

Una autorización opaca queda vinculada a esa cotización y a una clave de idempotencia generada por Node.js. El store recalcula precio, cliente y stock antes de descontar inventario. Un reintento con la misma autorización devuelve la misma orden; un nuevo pedido del usuario requiere una nueva confirmación.

### Comandos

| Comando | Efecto |
|---|---|
| `/help` | Ayuda y ejemplos |
| `/reset` | Borra conversación; conserva inventario y órdenes |
| `/exit` o `salir` | Termina la sesión |
| Ctrl+C | Cancela la generación y termina; conserva operaciones ya realizadas |
| EOF (Ctrl+D en Unix) | Termina; si se esperaba confirmación, cancela |

Para restaurar el catálogo inicial, sal y vuelve a ejecutar `npm start`. No hay archivos de datos ni base de datos.

## Herramientas y datos

| Tool | Argumentos | Resultado / regla |
|---|---|---|
| `getProductStock` | `{sku}` | SKU y stock; SKU inexistente es error |
| `getProductPrice` | `{sku}` | Precio unitario y moneda |
| `getCustomer` | `{customerId}` | ID, nombre y estado activo |
| `createOrder` | `{customerId, sku, quantity}` | Cliente activo, cantidad entera 1–10, stock suficiente y confirmación |
| `getOrderStatus` | `{orderId}` | Copia de la orden existente, incluido status |

Todos los argumentos se validan con Zod; se rechazan campos adicionales. Ninguna herramienta ejecuta shell, código generado o archivos. `getOrderStatus` está implementada y sirve como ejemplo para el ejercicio de clase.

| SKU | Nombre | Precio MXN | Stock inicial |
|---|---|---:|---:|
| LAPTOP-001 | Laptop Pro | 18999 | 7 |
| MOUSE-002 | Wireless Mouse | 599 | 22 |
| KEYBOARD-003 | Mechanical Keyboard | 1499 | 0 |

Clientes ficticios: `CUST-123` (Ana López, activa) y `CUST-456` (Luis Pérez, inactivo). No hay órdenes iniciales; se numeran `ORD-100`, `ORD-101`, etc. al crearlas.

## Pruebas

```sh
npm test
npm run check
npm run test:live
```

- `npm test`: pruebas unitarias e integración con modelo y aprobación simulados, sin Ollama ni conexión de red. Comprueban datos, reglas, schemas, allowlist, límite, repetición, errores, autorización e idempotencia y CLI.
- `npm run check`: revisa sintaxis de todos los archivos JavaScript de código, scripts y pruebas.
- `npm run test:live`: tres pruebas opcionales con el SDK real y `gemma3:4b`: stock/precio, compra y una sesión completa de CLI con entrada guionada. Las aprobaciones están **simuladas por los tests** sobre tiendas aisladas; la sesión guionada incluye `NO` y `CONFIRMAR`. Se omiten si Ollama o el modelo no están disponibles; un fallo de comportamiento con Ollama disponible sí hace fallar la prueba.

## Estructura

```text
src/
  index.js                 Arranque, .env y disponibilidad de Ollama
  cli.js                   Terminal y confirmación humana
  config.js                Configuración validada
  errors.js                Errores públicos controlados
  agent/
    runAgent.js            Ciclo y límites
    prompt.js              Instrucciones y contratos de herramientas
    decisionSchema.js      Zod y JSON Schema plano
    ollamaClient.js        SDK oficial y timeout con cancelación
    executeTool.js         Allowlist, argumentos y confirmación
  tools/                   Registro, schemas y cinco herramientas
  data/store.js            Estado, reglas y operación atómica
tests/                    Pruebas con mocks y live opcional
docs/                     Guía docente, escenarios y arquitectura
```

## Solución de problemas

| Síntoma | Acción |
|---|---|
| Conexión rechazada en 11434 | Abre Ollama o ejecuta `ollama serve`; revisa la URL. `curl http://127.0.0.1:11434/api/tags` permite comprobar el servicio. |
| Falta el modelo | Ejecuta `ollama pull gemma3:4b` y comprueba `ollama list`. |
| `EPERM` / conexión bloqueada en un entorno restringido | Ejecuta la CLI desde una terminal local con acceso a loopback. Una prueba live omitida no demuestra que el modelo funcione. |
| Memoria insuficiente | Cierra otras aplicaciones y otros modelos; revisa memoria y logs de Ollama. No sustituir el modelo requerido. |
| JSON inválido o respuesta truncada | El motor hace como máximo un reintento consecutivo de formato dentro de las ocho decisiones. Simplifica la pregunta y usa `/reset`; revisa `[APP]` y `[LLM]`. |
| CPU lenta / timeout | La primera carga puede tardar. Usa mensajes breves y ajusta `OLLAMA_TIMEOUT_MS` hasta 600000. |
| El modelo repite una herramienta | Se reutiliza el resultado una vez; una tercera solicitud idéntica detiene el turno. Reformula la pregunta. |
| Orden rechazada | Revisa cliente activo, SKU exacto, cantidad 1–10, stock y confirmación exacta. |
| No aparecen traces | Configura `AGENT_LOG_LEVEL=debug`. `silent` conserva el aviso de confirmación. |

Las trazas no guardan texto libre de preguntas, salida JSON inválida, claves de idempotencia ni stack traces. Sí muestran argumentos validados y datos **ficticios** de la tienda para explicar el flujo. No uses información sensible en este demo.
