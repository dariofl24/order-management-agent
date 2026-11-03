import { createInterface } from 'node:readline/promises';
import { runAgent } from './agent/runAgent.js';
import { createStore } from './data/store.js';

const safeText = (value) => String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
const money = (value) =>
  value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function createTerminal({ input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  // Crear el iterador antes de esperar al modelo conserva también las líneas canalizadas.
  const lines = rl[Symbol.asyncIterator]();
  const controller = new AbortController();
  rl.on('SIGINT', () => {
    controller.abort();
    rl.close();
  });
  return {
    signal: controller.signal,
    write(message) {
      output.write(`${safeText(message)}\n`);
    },
    async question(prompt) {
      output.write(safeText(prompt));
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    close() {
      rl.close();
    },
  };
}

export async function runCli({ io, model, config, store = createStore() }) {
  let history = [];
  const logger = (tag, event) => {
    if (config.logLevel === 'silent') return;
    if (config.logLevel === 'info' && !['TOOL', 'LLM'].includes(tag)) return;
    io.write(`[${tag}] ${JSON.stringify(event)}`);
  };

  const approval = {
    async request(quote) {
      io.write(
        `[APP] Se creará una orden para ${quote.customerId}: ${quote.quantity} x ${quote.sku}.`,
      );
      io.write(
        `[APP] Precio unitario $${money(quote.unitPrice)}; total $${money(quote.total)} ${quote.currency}.`,
      );
      const answer = await io.question(
        '[APP] ¿Confirmas esta operación? Escribe exactamente CONFIRMAR: ',
      );
      io.write(
        answer === 'CONFIRMAR' ? '[APP] Confirmación aceptada.' : '[APP] Operación cancelada.',
      );
      return answer;
    },
  };

  io.write(`Order Management Agent — ${config.ollamaModel} — ${config.ollamaBaseUrl}`);
  io.write('Datos simulados en memoria. /help muestra ejemplos; /exit o salir termina.');

  while (!io.signal?.aborted) {
    const input = await io.question('\nTú> ');
    if (input === null || ['salir', '/exit'].includes(input.trim().toLowerCase())) break;
    const message = input.trim();
    if (!message) continue;
    if (message === '/help') {
      io.write(
        '/help: ayuda | /reset: borra el historial, conserva inventario y órdenes | /exit o salir: termina',
      );
      io.write(
        'Ejemplos:\n¿Cuántas LAPTOP-001 tenemos y cuánto cuestan?\nBusca al cliente CUST-123.\nQuiero comprar 2 LAPTOP-001 como CUST-123.\n¿Qué pasó con ORD-100?',
      );
      io.write(
        'Solo CONFIRMAR en el aviso de la aplicación autoriza una compra. Reinicia el proceso para restablecer la tienda.',
      );
      continue;
    }
    if (message === '/reset') {
      history = [];
      io.write('[APP] Historial restablecido. Inventario y órdenes se conservan.');
      continue;
    }
    if (message.startsWith('/')) {
      io.write('[APP] Comando desconocido. Usa /help.');
      continue;
    }
    if (message.length > 4000) {
      io.write('[APP] Usa como máximo 4000 caracteres por mensaje.');
      continue;
    }
    const result = await runAgent({
      userMessage: message,
      history,
      model,
      store,
      approval,
      logger,
      maxSteps: config.maxSteps,
      maxOutputChars: config.maxOutputChars,
      historyMessages: config.historyMessages,
      signal: io.signal,
    });
    history = result.history;
    io.write(`Agente> ${result.message}`);
  }
  io.write('Hasta luego. Los datos de esta sesión no se guardan.');
}
