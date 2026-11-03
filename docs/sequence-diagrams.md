# Diagramas de secuencia

Flujos principales de la aplicación, en formato [Mermaid](https://mermaid.js.org/).
Se renderizan directamente en GitHub, VS Code (con la extensión de Mermaid) y la mayoría de visores de Markdown.

Participantes habituales:

| Participante | Archivo |
| --- | --- |
| `index` | `src/index.js` |
| `CLI` | `src/cli.js` |
| `Agente` | `src/agent/runAgent.js` |
| `Modelo` | `src/agent/ollamaClient.js` (Ollama + `gemma3:4b`) |
| `Decisión` | `src/agent/decisionSchema.js` |
| `Ejecutor` | `src/agent/executeTool.js` |
| `Tienda` | `src/data/store.js` |

## 1. Arranque de la aplicación

`index.js` valida la configuración, comprueba que Ollama y el modelo local estén disponibles
y solo entonces abre la terminal interactiva.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant I as index
    participant C as config
    participant M as Modelo (Ollama)
    participant T as CLI

    U->>I: npm start
    I->>C: loadConfig(process.env)
    alt Configuración inválida
        C-->>I: AppError CONFIG_ERROR
        I-->>U: [APP] mensaje de error (exitCode 1)
    else Configuración válida
        C-->>I: config (solo loopback y gemma3:4b)
        I->>M: checkAvailability()
        M->>M: client.list()
        alt Ollama apagado, timeout o modelo ausente
            M-->>I: AppError OLLAMA_UNAVAILABLE / OLLAMA_TIMEOUT / MODEL_MISSING / MODEL_NOT_LOCAL
            I-->>U: [APP] mensaje de error (exitCode 1)
        else Modelo disponible
            M-->>I: ok
            I->>T: createTerminal() y runCli()
            T-->>U: Order Management Agent y prompt "Tú>"
        end
    end
```

## 2. Turno de conversación con herramientas de solo lectura

Ejemplo: «¿Cuántas LAPTOP-001 tenemos?». El agente repite el ciclo *decidir → ejecutar → observar*
hasta que el modelo devuelve `action="final"` o se agota `maxSteps` (máximo 8).

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant C as CLI
    participant A as Agente (runAgent)
    participant M as Modelo (Ollama)
    participant D as Decisión (parseDecision)
    participant E as Ejecutor (executeTool)
    participant S as Tienda (store)

    U->>C: "¿Cuántas LAPTOP-001 tenemos?"
    C->>A: runAgent(userMessage, history, ...)
    A->>A: buildSystemPrompt() y recorte del historial

    loop Hasta action = final o maxSteps
        A->>M: decide(messages)
        M-->>A: JSON crudo
        A->>D: parseDecision(raw)
        D-->>A: {action, toolName, arguments, message}

        alt action = tool
            A->>A: ¿llamada repetida? (misma herramienta y argumentos)
            A->>E: executeTool(decision)
            E->>E: toolName en el registro y schema.safeParse(arguments)
            E->>S: getProductStock(sku)
            S-->>E: {sku, stock}
            E-->>A: {ok: true, data}
            A->>A: añade TOOL_RESULT a messages
        else action = final
            A-->>C: {message, history, steps}
        end
    end

    C-->>U: "Agente> Hay 7 unidades de LAPTOP-001."
```

## 3. Creación de una orden con confirmación humana

`createOrder` es la única herramienta que modifica datos. El modelo solo la *solicita*:
la autorización la produce la aplicación después de que el usuario escribe exactamente `CONFIRMAR`.
La tienda vuelve a validar todo (cliente activo, stock, importe) dentro de una transacción síncrona.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant A as Agente
    participant M as Modelo
    participant E as Ejecutor
    participant S as Tienda
    participant C as CLI (approval)

    U->>A: "Quiero comprar 2 LAPTOP-001 como CUST-123"
    A->>M: decide(messages)
    M-->>A: {action: tool, toolName: createOrder, arguments}
    A->>E: executeTool(decision)
    E->>E: valida argumentos con orderSchema (strict)
    Note over E: tool.readOnly === false<br/>exige canal de aprobación

    E->>S: prepareOrder(args)
    S->>S: quoteOrder: cliente activo, stock suficiente, total
    alt Cliente inactivo, SKU inexistente o sin stock
        S-->>E: AppError (INACTIVE_CUSTOMER, NOT_FOUND, INSUFFICIENT_STOCK)
        E-->>A: {ok: false, error}
    else Cotización válida
        S-->>E: quote (congelada, con idempotencyKey)
        E->>C: approval.request(quote)
        C-->>U: Se creará una orden: 2 x LAPTOP-001, total $37,998.00 MXN
        U->>C: texto de confirmación
        C-->>E: respuesta

        E->>S: confirmOrder(quote, respuesta)
        alt respuesta distinta de CONFIRMAR
            S-->>E: null
            E-->>A: {ok: false, APPROVAL_DENIED}
        else respuesta = CONFIRMAR
            S-->>E: authorization (ligada a la cotización)
            E->>S: createOrder(args, authorization)
            S->>S: compara con la cotización y revalida importe
            S->>S: descuenta stock y registra ORD-100
            S-->>E: orden creada
            E-->>A: {ok: true, data: orden}
        end
    end

    A->>M: decide(messages + TOOL_RESULT)
    M-->>A: {action: final, message}
    A-->>U: confirmación o motivo del rechazo
```

### Idempotencia y reintentos

Si el modelo repite la misma llamada exitosa, `runAgent` reutiliza el resultado en caché
y no vuelve a pedir confirmación. Si se reintentara a nivel de tienda con la misma
`idempotencyKey`, `createOrder` devuelve la orden ya creada sin descontar stock otra vez.

## 4. Salida inválida del modelo y límites de seguridad

Cubre tres protecciones del bucle del agente: un reintento de formato, el corte por
llamadas repetidas y el límite de pasos.

```mermaid
sequenceDiagram
    autonumber
    participant A as Agente
    participant M as Modelo
    participant D as Decisión
    participant E as Ejecutor

    A->>M: decide(messages)
    M-->>A: texto que no es JSON válido
    A->>D: parseDecision(raw)
    D-->>A: AppError INVALID_DECISION

    alt Primer fallo de formato y quedan pasos
        A->>A: añade FORMAT_ERROR (único reintento)
        A->>M: decide(messages)
        M-->>A: JSON correcto
        A->>D: parseDecision(raw)
        D-->>A: decisión válida
    else Segundo fallo o sin pasos
        A-->>A: finish("No pude completar la solicitud...", invalid_decision)
    end

    Note over A,E: Más adelante en el mismo turno

    A->>A: misma herramienta y argumentos por 3.ª vez
    A-->>A: finish("Detuve la solicitud...", repeated_call)

    A->>A: step > maxSteps
    A-->>A: finish("Se alcanzó el límite...", max_steps)
```

## 5. Cancelación (Ctrl+C) y tiempo de espera

Una sola `AbortSignal` atraviesa CLI, agente, ejecutor y cliente de Ollama.
Las operaciones ya aplicadas se conservan.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant T as CLI (terminal)
    participant A as Agente
    participant W as withCancellation
    participant M as Modelo (Ollama)

    A->>W: withCancellation(() => model.decide(...), signal)
    W->>M: petición HTTP a Ollama (con signal)

    alt Usuario pulsa Ctrl+C
        U->>T: SIGINT
        T->>T: controller.abort() y rl.close()
        T-->>W: evento abort
        W-->>A: AppError CANCELLED
        A-->>T: finish("Solicitud cancelada...", cancelled)
        T-->>U: Agente> Solicitud cancelada. Las operaciones ya realizadas se conservan.
    else Ollama excede OLLAMA_TIMEOUT_MS
        M--xW: sin respuesta a tiempo
        W-->>A: AppError OLLAMA_TIMEOUT
        A-->>T: finish("No pude completar la solicitud...", model_error)
        T-->>U: mensaje con sugerencia de aumentar OLLAMA_TIMEOUT_MS
    end
```

## 6. Comandos locales de la CLI

Los comandos que empiezan por `/` los resuelve la CLI y nunca llegan al modelo.

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario
    participant C as CLI (runCli)
    participant A as Agente

    loop Hasta /exit, salir, EOF o Ctrl+C
        U->>C: línea de texto
        alt /help
            C-->>U: ayuda y ejemplos
        else /reset
            C->>C: history = []
            C-->>U: Historial restablecido (inventario y órdenes se conservan)
        else /exit o salir
            C-->>U: Hasta luego
        else otro comando con "/"
            C-->>U: Comando desconocido
        else más de 4000 caracteres
            C-->>U: Usa como máximo 4000 caracteres
        else mensaje normal
            C->>A: runAgent(...)
            A-->>C: result
            C->>C: history = result.history
            C-->>U: Agente> result.message
        end
    end
```
