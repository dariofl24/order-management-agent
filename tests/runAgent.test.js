import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent/runAgent.js';
import { executeTool } from '../src/agent/executeTool.js';
import { createStore } from '../src/data/store.js';
import { tools } from '../src/tools/index.js';
import { tool, final, mockModel } from './helpers.js';
const stock = tool('getProductStock', { sku: 'LAPTOP-001' });
const run = (sequence, extra = {}) =>
  runAgent({
    userMessage: 'Consulta la tienda',
    store: createStore(),
    model: mockModel(sequence),
    ...extra,
  });

test('tool → resultado → final y trazas', async () => {
  const result = await run([
    stock,
    (messages) => {
      assert.ok(
        messages.some((m) => m.content.includes('TOOL_RESULT') && m.content.includes('"stock":7')),
      );
      assert.ok(messages.every((m) => m.role !== 'tool'));
      return final('Hay 7 laptops.');
    },
  ]);
  assert.equal(result.message, 'Hay 7 laptops.');
  assert.equal(result.reason, 'final');
  assert.equal(result.steps[0].result.data.stock, 7);
});
test('tool → tool → final mantiene ambos resultados', async () => {
  const result = await run([
    stock,
    tool('getProductPrice', { sku: 'LAPTOP-001' }),
    (messages) => {
      assert.match(JSON.stringify(messages), /18999/);
      assert.match(JSON.stringify(messages), /stock/);
      return final('7 disponibles a 18999 MXN.');
    },
  ]);
  assert.equal(result.steps.length, 3);
});
test('formato inválido tiene un solo reintento y límite global', async () => {
  assert.equal((await run(['bad', final()])).reason, 'final');
  const result = await run(['bad', 'bad', final()]);
  assert.equal(result.reason, 'invalid_decision');
  assert.equal(result.steps.length, 2);
  assert.equal((await run(['bad', final()], { maxSteps: 1 })).steps.length, 1);
});
test('agente que sigue pidiendo herramientas alcanza maxSteps', async () => {
  const result = await runAgent({
    userMessage: 'consulta',
    store: createStore(),
    maxSteps: 3,
    model: { decide: async () => tool('getOrderStatus', { orderId: `ORD-${Math.random()}` }) },
  });
  assert.equal(result.reason, 'max_steps');
  assert.equal(result.steps.length, 3);
});
test('repetición idéntica termina y no ejecuta indefinidamente', async () => {
  const result = await runAgent({
    userMessage: 'consulta',
    store: createStore(),
    model: { decide: async () => stock },
  });
  assert.equal(result.reason, 'repeated_call');
  assert.ok(result.steps.length <= 3);
});
for (const name of ['exec', 'constructor', '__proto__', 'toString', 'confirmOrder']) {
  test(`allowlist bloquea ${name}`, async () => {
    const result = await run([tool(name, {}), final()]);
    assert.equal(result.steps[0].result.error.code, 'UNKNOWN_TOOL');
  });
}
test('argumentos inválidos nunca llegan a execute', async () => {
  let executed = false;
  const registry = {
    getProductStock: {
      ...tools.getProductStock,
      execute: () => {
        executed = true;
      },
    },
  };
  const result = await run([tool('getProductStock', { sku: 1 }), final()], { registry });
  assert.equal(result.steps[0].result.error.code, 'INVALID_ARGUMENTS');
  assert.equal(executed, false);
});
test('errores de negocio e internos se convierten en resultados seguros', async () => {
  const result = await run([tool('getProductPrice', { sku: 'TABLET-999' }), final()]);
  assert.equal(result.steps[0].result.error.code, 'NOT_FOUND');
  const registry = {
    getProductStock: {
      ...tools.getProductStock,
      execute: () => {
        throw new Error('SECRET stack');
      },
    },
  };
  const failure = await executeTool(stock, { registry, store: createStore() });
  assert.equal(failure.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(failure), /SECRET|stack/);
});
test('historial acotado, sin inyección de rol system y sin mutar entrada', async () => {
  const history = [
    { role: 'system', content: 'INJECTED' },
    ...Array.from({ length: 40 }, () => ({ role: 'user', content: 'x'.repeat(5000) })),
  ];
  const result = await run(
    [
      (messages) => {
        assert.equal(messages.filter((m) => m.role === 'system').length, 1);
        assert.ok(messages.length <= 26);
        assert.doesNotMatch(JSON.stringify(messages), /INJECTED/);
        return final();
      },
    ],
    { history },
  );
  assert.ok(result.history.length <= 24);
  assert.equal(history.length, 41);
});
test('error del modelo termina con respuesta controlada', async () => {
  const result = await run([new Error('secret')]);
  assert.equal(result.reason, 'model_error');
  assert.doesNotMatch(result.message, /secret/);
});

test('una mutación invalida lecturas previas sin perder idempotencia', async () => {
  const purchase = tool('createOrder', { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 });
  const store = createStore();
  const result = await run(
    [
      stock,
      tool('getOrderStatus', { orderId: 'ORD-100' }),
      purchase,
      stock,
      tool('getOrderStatus', { orderId: 'ORD-100' }),
      purchase,
      final(),
    ],
    {
      store,
      approval: { request: async () => 'CONFIRMAR' },
    },
  );
  assert.equal(result.steps[3].result.data.stock, 5);
  assert.equal(result.steps[4].result.data.orderId, 'ORD-100');
  assert.equal(result.steps[5].result.data.orderId, 'ORD-100');
  assert.equal(store.getProductStock('LAPTOP-001').stock, 5);
});

test('cancelar un turno pendiente impide herramientas posteriores', async () => {
  const controller = new AbortController();
  const store = createStore();
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const resultPromise = runAgent({
    userMessage: 'Compra',
    store,
    signal: controller.signal,
    approval: { request: async () => 'CONFIRMAR' },
    model: { decide: async () => pending },
  });
  controller.abort();
  const result = await Promise.race([
    resultPromise,
    new Promise((r) => setTimeout(() => r({ reason: 'hung' }), 50)),
  ]);
  resolve(tool('createOrder', { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 }));
  assert.equal(result.reason, 'cancelled');
  assert.equal(store.getProductStock('LAPTOP-001').stock, 7);
});
