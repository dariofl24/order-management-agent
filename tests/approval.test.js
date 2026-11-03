import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data/store.js';
import { executeTool } from '../src/agent/executeTool.js';
import { runAgent } from '../src/agent/runAgent.js';
import { tool, final, mockModel } from './helpers.js';
const args = { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 };
const decision = tool('createOrder', args);
function unchanged(store) {
  assert.equal(store.getProductStock('LAPTOP-001').stock, 7);
  assert.throws(() => store.getOrderStatus('ORD-100'), { code: 'NOT_FOUND' });
}
test('sin canal de confirmación no hay mutación', async () => {
  const store = createStore();
  const result = await executeTool(decision, { store });
  assert.equal(result.error.code, 'APPROVAL_REQUIRED');
  unchanged(store);
});
for (const response of [
  'NO',
  '',
  'confirmar',
  ' CONFIRMAR',
  'CONFIRMAR ',
  true,
  { approved: true },
]) {
  test(`confirmación distinta del literal se rechaza: ${JSON.stringify(response)}`, async () => {
    const store = createStore();
    const result = await executeTool(decision, {
      store,
      approval: { request: async () => response },
    });
    assert.equal(result.error.code, 'APPROVAL_DENIED');
    unchanged(store);
  });
}
test('confirmación muestra operación e importe exactos; repetición crea solo una vez', async () => {
  const store = createStore();
  let prompts = 0;
  const approval = {
    request: async (quote) => {
      prompts++;
      assert.equal(quote.toolName, 'createOrder');
      assert.equal(quote.customerId, 'CUST-123');
      assert.equal(quote.sku, 'LAPTOP-001');
      assert.equal(quote.quantity, 2);
      assert.equal(quote.unitPrice, 18999);
      assert.equal(quote.total, 37998);
      assert.equal(quote.currency, 'MXN');
      assert.ok(quote.idempotencyKey);
      return 'CONFIRMAR';
    },
  };
  const result = await runAgent({
    userMessage: 'Compra',
    store,
    approval,
    model: mockModel([decision, decision, final()]),
  });
  assert.equal(result.steps[0].result.data.orderId, 'ORD-100');
  assert.equal(result.steps[1].result.data.orderId, 'ORD-100');
  assert.equal(prompts, 1);
  assert.equal(store.getProductStock(args.sku).stock, 5);
});
test('el modelo no puede añadir confirmación, importe ni idempotencyKey', async () => {
  for (const field of ['confirmed', 'authorization', 'idempotencyKey', 'total']) {
    const store = createStore();
    const result = await executeTool(tool('createOrder', { ...args, [field]: 'CONFIRMAR' }), {
      store,
    });
    assert.equal(result.error.code, 'INVALID_ARGUMENTS');
    unchanged(store);
  }
});
test('autorización falsa, copiada, ajena o con operación diferente no funciona', () => {
  const store = createStore();
  const quote = store.prepareOrder(args);
  assert.throws(() => store.confirmOrder({ ...quote }, 'CONFIRMAR'), { code: 'INVALID_APPROVAL' });
  const auth = store.confirmOrder(quote, 'CONFIRMAR');
  assert.throws(() => store.createOrder(args, { ...auth }), { code: 'APPROVAL_REQUIRED' });
  assert.throws(() => createStore().createOrder(args, auth), { code: 'APPROVAL_REQUIRED' });
  assert.throws(() => store.createOrder({ ...args, quantity: 1 }, auth), {
    code: 'APPROVAL_MISMATCH',
  });
  assert.throws(() => store.confirmOrder(quote, 'CONFIRMAR'), { code: 'INVALID_APPROVAL' });
  unchanged(store);
});
test('rechazo no se convierte en una segunda solicitud de confirmación', async () => {
  const store = createStore();
  let count = 0;
  await runAgent({
    userMessage: 'Compra',
    store,
    approval: {
      request: async () => {
        count++;
        return 'NO';
      },
    },
    model: mockModel([decision, decision, final()]),
  });
  assert.equal(count, 1);
  unchanged(store);
});
