import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data/store.js';
import { tools } from '../src/tools/index.js';
const args = { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 };
const approved = (s, a = args) => s.confirmOrder(s.prepareOrder(a), 'CONFIRMAR');

test('inventario y precio exactos, sin referencias mutables', async () => {
  const store = createStore();
  assert.deepEqual(await tools.getProductStock.execute({ sku: 'LAPTOP-001' }, { store }), {
    sku: 'LAPTOP-001',
    stock: 7,
  });
  assert.deepEqual(store.getProductPrice('LAPTOP-001'), {
    sku: 'LAPTOP-001',
    price: 18999,
    currency: 'MXN',
  });
  const customer = store.getCustomer('CUST-123');
  customer.active = false;
  assert.equal(store.getCustomer('CUST-123').active, true);
  assert.equal(store.getCustomer('CUST-456').active, false);
});

test('SKU, cliente y orden desconocidos son errores explícitos', () => {
  const s = createStore();
  for (const action of [
    () => s.getProductStock('TABLET-999'),
    () => s.getProductPrice('__proto__'),
    () => s.getCustomer('missing'),
    () => s.getOrderStatus('ORD-100'),
  ]) {
    assert.throws(action, { code: 'NOT_FOUND' });
  }
});

for (const quantity of [0, -1, 1.5, 11, '2']) {
  test(`cantidad inválida ${JSON.stringify(quantity)} no cambia stock`, () => {
    const s = createStore();
    assert.throws(() => s.prepareOrder({ ...args, quantity }), { code: 'INVALID_ARGUMENTS' });
    assert.equal(s.getProductStock(args.sku).stock, 7);
  });
}

test('reglas de cliente y stock se aplican en backend', () => {
  const s = createStore();
  assert.throws(() => s.prepareOrder({ ...args, quantity: 8 }), { code: 'INSUFFICIENT_STOCK' });
  assert.throws(() => s.prepareOrder({ ...args, sku: 'KEYBOARD-003' }), {
    code: 'INSUFFICIENT_STOCK',
  });
  assert.throws(() => s.prepareOrder({ ...args, customerId: 'CUST-456' }), {
    code: 'INACTIVE_CUSTOMER',
  });
  assert.throws(() => s.prepareOrder({ ...args, customerId: 'missing' }), { code: 'NOT_FOUND' });
  assert.equal(s.getProductStock(args.sku).stock, 7);
});

test('orden atómica, total calculado y reintento idempotente', () => {
  const s = createStore();
  const authorization = approved(s);
  const order = s.createOrder(args, authorization);
  assert.deepEqual(order, {
    orderId: 'ORD-100',
    ...args,
    unitPrice: 18999,
    total: 37998,
    currency: 'MXN',
    status: 'created',
  });
  order.total = 0;
  assert.equal(s.createOrder(args, authorization).total, 37998);
  assert.equal(s.getProductStock(args.sku).stock, 5);
  assert.equal(s.getOrderStatus('ORD-100').status, 'created');
  assert.equal(s.createOrder(args, approved(s)).orderId, 'ORD-101');
  assert.equal(createStore().getProductStock(args.sku).stock, 7);
});

test('stock se vuelve a validar después de confirmar, sin orden parcial', () => {
  const s = createStore();
  const a = { ...args, quantity: 5 };
  const first = approved(s, a);
  const second = approved(s, a);
  s.createOrder(a, first);
  assert.throws(() => s.createOrder(a, second), { code: 'INSUFFICIENT_STOCK' });
  assert.equal(s.getProductStock(args.sku).stock, 2);
  assert.throws(() => s.getOrderStatus('ORD-101'), { code: 'NOT_FOUND' });
});
