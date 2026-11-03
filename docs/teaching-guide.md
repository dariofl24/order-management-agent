# Guía docente — 100 minutos

## Preparación previa

1. Verifica Node.js 22+ y abre Ollama. Ejecuta `ollama pull gemma3:4b` con tiempo: la primera descarga no debe consumir minutos de clase.
2. En el proyecto ejecuta `npm install`, `npm test` y `npm run check`.
3. Prueba `npm run test:live`. Revisa el resumen: `skipped` significa que no se probó el modelo. Las pruebas live crean una tienda aislada y simulan la confirmación; no sustituyen la demostración humana en la CLI.
4. Abre `npm start`, pregunta por stock y precio y sal. Esto permite cargar el modelo antes de la clase. Vuelve a iniciar para recuperar los datos iniciales.
5. Ten abiertos `src/agent/runAgent.js`, `src/tools/index.js`, `src/data/store.js` y [el diagrama](architecture.md). Mantén el log en `debug`.

## Plan

| Minutos | Tema | Actividad y resultado observable |
|---:|---|---|
| 0–10 | LLM vs agente | Pregunta qué podría saber el modelo sobre el inventario local sin una conexión. Presenta la separación decisión/ejecución. |
| 10–20 | Arquitectura | Sigue CLI → loop → Ollama → decisión → validación → Tool → store. Identifica qué corre en Node y qué corre en el modelo. |
| 20–30 | Tools y schemas | Lee el registro y una decisión JSON. Contrasta JSON válido con argumentos inválidos. Muestra la allowlist. |
| 30–40 | Ollama local | Ejecuta `ollama list`, muestra `.env.example`, arranque y formato estructurado. Explica que no se envían `tool_calls` nativos. |
| 40–55 | Primera Tool | Consulta LAPTOP-001. Identifica `[LLM]`, `[APP]`, `[TOOL]` y respuesta final. Lee `getProductStock`. |
| 55–75 | Agente de órdenes | Consulta precio/cliente/stock y compra dos laptops. Lee el aviso exacto, confirma, observa ORD-100 y stock 5. Repite con NO y explica la ausencia de cambios. |
| 75–90 | Loop y seguridad | Muestra límites, JSON inválido, stock insuficiente, cliente inactivo y herramienta inexistente. Ejecuta pruebas mock para garantizar casos de fallo. |
| 90–97 | Ejercicio | Sigue o reconstruye `getOrderStatus`: schema, registro, store, prueba y consulta. |
| 97–100 | Cierre | Pide a un alumno describir quién decide, quién valida, quién autoriza y quién modifica los datos. |

## Explicaciones para acompañar el código

### `async/await`

`await model.decide(messages)` pausa **esa función** mientras llega la respuesta de Ollama. No significa que el modelo ejecute JavaScript. Cuando termina, Node.js recibe datos y continúa validándolos. Del mismo modo, la CLI espera la respuesta humana sin bloquear la entrada/salida del proceso.

La creación de la orden en el store es deliberadamente síncrona: comprobar stock, descontarlo y registrar la orden ocurre sin un `await` intermedio. En este único proceso no puede intercalarse otra compra entre esas operaciones. Una base de datos o varios procesos necesitarían otra solución transaccional.

### Validación con Zod

JSON válido solo significa que se puede interpretar la sintaxis. `{"quantity":"dos"}` es JSON válido y no es una cantidad aceptable. `decisionSchema` comprueba la envoltura; el schema de cada herramienta comprueba sus argumentos. El store comprueba reglas de negocio como stock y cliente activo. Son comprobaciones distintas y complementarias.

Muestra `orderSchema`: la cantidad debe ser número entero entre 1 y 10 y `.strict()` rechaza campos extra. Añadir `approved:true` a una decisión no concede permiso.

### Separación de responsabilidades

| Parte | Responsabilidad |
|---|---|
| CLI | Recibir mensajes, mostrar resultados y obtener confirmación humana |
| Adaptador Ollama | Enviar mensajes y JSON Schema, aplicar timeout/cancelación |
| Loop | Solicitar decisiones, llevar contexto, limitar pasos y repeticiones |
| Ejecutor | Verificar allowlist y schema; pedir confirmación antes de mutaciones |
| Tools | Conectar argumentos validados con operaciones concretas del store |
| Store | Datos, reglas de negocio, cotizaciones, autorización e idempotencia |

### Flujo de datos

Lee en voz alta una secuencia completa: «El usuario pregunta. El modelo pide getProductStock. Node comprueba el nombre y el SKU. La herramienta lee el store. Node añade TOOL_RESULT al contexto. El modelo usa ese resultado y contesta».

El resultado se añade como mensaje `user` etiquetado por la aplicación, no como instrucciones `system` ni un rol `tool` ficticio. Pregunta por qué sería incorrecto ejecutar cualquier nombre generado por el modelo.

### Confirmación e idempotencia

Compara dos frases: «El modelo afirma que el usuario confirmó» y «la CLI recibió exactamente CONFIRMAR después de mostrar el importe». Solo la segunda produce una autorización. La cotización y la autorización son objetos controlados por el store y no están disponibles como herramientas.

La clave de idempotencia identifica una operación autorizada. Reintentar esa misma operación devuelve ORD-100 sin descontar otra vez. Un nuevo pedido, aunque tenga los mismos productos, requiere una nueva confirmación y obtiene otra clave.

### Cómo leer las trazas

- `[USER]` registra la longitud de la entrada, evitando copiar texto libre a los logs; la pregunta se ve en la terminal.
- `[LLM]` muestra acción y herramienta solicitada.
- `[APP]` muestra validación o error; el aviso de compra contiene datos exactos calculados por backend.
- `[TOOL]` contiene el resultado real, `ok` o `error`. `cached:true` significa que no hubo otra ejecución.
- `Agente>` es lenguaje natural generado. Contrástalo con los resultados; puede alucinar incluso con un backend seguro.

Las lecturas almacenadas temporalmente se invalidan tras una compra exitosa, de modo que consultar stock nuevamente dentro del turno muestra el dato actualizado. Los resultados de mutaciones se conservan para evitar duplicados.

## Ejercicio de siete minutos: `getOrderStatus`

La solución ya está implementada. Para trabajar sin romper el demo, pide a los alumnos que expliquen cada pieza antes de leer la siguiente:

1. **1 minuto:** escribir el contrato `{orderId:string}` y decidir si es lectura o mutación.
2. **2 minutos:** localizar schema estricto, entrada del registro y wrapper en `src/tools/getOrderStatus.js`.
3. **2 minutos:** seguir la búsqueda en el store. Explicar por qué un ID desconocido da `NOT_FOUND` y por qué se devuelve una copia.
4. **1 minuto:** leer la prueba de ORD-100 y proponer otra de orden inexistente.
5. **1 minuto:** ejecutar el escenario 10 y comprobar que el modelo descubre la herramienta a través del prompt generado desde el registro.

Para una práctica posterior pueden reconstruir esos componentes en una copia del proyecto, manteniendo las pruebas. No hace falta dejar TODOs en la entrega funcional.

## Preguntas de cierre

- ¿Quién decide qué herramienta solicitar? El LLM.
- ¿Quién comprueba que exista y que los argumentos sean válidos? Node.js.
- ¿Quién autoriza la compra? El humano mediante la CLI; el código valida esa respuesta.
- ¿Quién calcula el total y modifica inventario? El store.
- ¿Qué ocurre si el modelo inventa una herramienta o repite decisiones? Rechazo o límite, sin ejecución arbitraria.

## Alternativa si Ollama falla durante clase

Usa `npm test` para demostrar secuencias y controles con mocks reproducibles. Explica claramente que un mock verifica el motor, no la calidad de Gemma. Para el diagnóstico real usa la tabla del README; no sustituyas el modelo ni agregues servicios externos. Si se agota el tiempo o el contexto, muestra los resultados ya ejecutados: no se revierte toda una conversación automáticamente.
