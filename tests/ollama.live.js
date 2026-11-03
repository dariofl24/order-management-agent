// Opcional: nunca forma parte de npm test. Solo usa gemma3:4b local.
import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { loadConfig } from '../src/config.js';
import { createOllamaClient } from '../src/agent/ollamaClient.js';
import { runAgent } from '../src/agent/runAgent.js';
import { createStore } from '../src/data/store.js';
dotenv.config({ quiet: true });
const config = loadConfig();
const model = createOllamaClient(config);
let unavailable;
try {
  await model.checkAvailability();
} catch (error) {
  if (['OLLAMA_UNAVAILABLE', 'OLLAMA_TIMEOUT', 'MODEL_MISSING'].includes(error.code))
    unavailable = error.message;
  else throw error;
}
const logger = (tag, event) => console.log(`[${tag}] ${JSON.stringify(event)}`);

test(
  'live: Gemma consulta precio y stock mediante JSON Schema y responde',
  { skip: unavailable || false, timeout: config.timeoutMs * 8 + 5000 },
  async () => {
    const result = await runAgent({
      userMessage:
        '¿Cuántas LAPTOP-001 tenemos y cuánto cuesta cada una? Consulta ambos datos con herramientas.',
      model,
      store: createStore(),
      logger,
      ...config,
    });
    assert.equal(result.reason, 'final', result.message);
    const results = result.steps.filter((s) => s.result?.ok).map((s) => s.result.data);
    assert.ok(
      results.some((r) => r.stock === 7),
      'Debe consultar stock real',
    );
    assert.ok(
      results.some((r) => r.price === 18999),
      'Debe consultar precio real',
    );
    assert.match(result.message, /7|siete/i);
    console.log(`Agente> ${result.message}`);
  },
);

test(
  'live: compra con aprobación simulada del test y stock actualizado',
  { skip: unavailable || false, timeout: config.timeoutMs * 8 + 5000 },
  async () => {
    const store = createStore();
    let approvalCount = 0;
    const result = await runAgent({
      userMessage:
        'Crea una orden de 2 LAPTOP-001 para CUST-123. Solicita createOrder; la aplicación me pedirá confirmación.',
      model,
      store,
      logger,
      ...config,
      approval: {
        request: async (quote) => {
          assert.equal(quote.total, 37998);
          assert.equal(quote.customerId, 'CUST-123');
          assert.equal(quote.sku, 'LAPTOP-001');
          assert.equal(quote.quantity, 2);
          approvalCount++;
          return 'CONFIRMAR'; // Doble de prueba; la CLI usa la entrada humana.
        },
      },
    });
    assert.equal(result.reason, 'final', result.message);
    assert.equal(approvalCount, 1);
    assert.equal(store.getProductStock('LAPTOP-001').stock, 5);
    assert.equal(store.getOrderStatus('ORD-100').total, 37998);
    console.log(`Agente> ${result.message}`);
  },
);

test(
  'live: CLI completa con entrada guionada, rechazo, compra y consulta posterior',
  { skip: unavailable || false, timeout: config.timeoutMs * 24 + 10000 },
  async () => {
    const { spawn } = await import('node:child_process');
    const { readFile } = await import('node:fs/promises');
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, AGENT_LOG_LEVEL: 'debug' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const done = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const timeout = setTimeout(() => child.kill('SIGTERM'), config.timeoutMs * 24);
    try {
      child.stdin.end(await readFile(new URL('./fixtures/cli-session.txt', import.meta.url)));
      assert.equal(await done, 0, output);
      assert.match(output, /APPROVAL_DENIED/, output);
      assert.match(output, /Confirmación aceptada/, output);
      assert.match(output, /"orderId":"ORD-100"/, output);
      assert.match(output, /"stock":5/, output);
      assert.doesNotMatch(output, /"orderId":"ORD-101"/, output);
      console.log(output);
    } finally {
      clearTimeout(timeout);
      child.kill();
    }
  },
);
