import { randomUUID } from 'node:crypto';
import { orderSchema } from '../tools/schemas.js';
import { AppError } from '../errors.js';

export function createStore() {
  const products = new Map([
    [
      'LAPTOP-001',
      { sku: 'LAPTOP-001', name: 'Laptop Pro', price: 18999, currency: 'MXN', stock: 7 },
    ],
    [
      'MOUSE-002',
      { sku: 'MOUSE-002', name: 'Wireless Mouse', price: 599, currency: 'MXN', stock: 22 },
    ],
    [
      'KEYBOARD-003',
      { sku: 'KEYBOARD-003', name: 'Mechanical Keyboard', price: 1499, currency: 'MXN', stock: 0 },
    ],
  ]);
  const customers = new Map([
    ['CUST-123', { customerId: 'CUST-123', name: 'Ana López', active: true }],
    ['CUST-456', { customerId: 'CUST-456', name: 'Luis Pérez', active: false }],
  ]);
  const orders = new Map();
  const quotes = new WeakMap();
  const authorizations = new WeakMap();
  const completed = new Map();
  let nextId = 100;
  const copy = (value) => structuredClone(value);
  function lookup(map, id, kind) {
    const value = map.get(id);
    if (!value) throw new AppError('NOT_FOUND', `${kind} no encontrado: ${id}.`);
    return value;
  }
  function parse(args) {
    const result = orderSchema.safeParse(args);
    if (!result.success)
      throw new AppError(
        'INVALID_ARGUMENTS',
        'Se requieren cliente, SKU y cantidad entera entre 1 y 10, sin campos adicionales.',
      );
    return result.data;
  }
  function quoteOrder(args) {
    const a = parse(args);
    const product = lookup(products, a.sku, 'SKU');
    const customer = lookup(customers, a.customerId, 'Cliente');
    if (!customer.active) throw new AppError('INACTIVE_CUSTOMER', 'El cliente está inactivo.');
    if (product.stock < a.quantity)
      throw new AppError('INSUFFICIENT_STOCK', 'Stock insuficiente para esa cantidad.');
    const total = product.price * a.quantity;
    if (!Number.isSafeInteger(total) || total <= 0)
      throw new AppError('INVALID_TOTAL', 'El total no es válido.');
    return { ...a, unitPrice: product.price, total, currency: product.currency };
  }
  return Object.freeze({
    getProductStock(sku) {
      const p = lookup(products, sku, 'SKU');
      return { sku: p.sku, stock: p.stock };
    },
    getProductPrice(sku) {
      const p = lookup(products, sku, 'SKU');
      return { sku: p.sku, price: p.price, currency: p.currency };
    },
    getCustomer(customerId) {
      return copy(lookup(customers, customerId, 'Cliente'));
    },
    getOrderStatus(orderId) {
      return copy(lookup(orders, orderId, 'Orden'));
    },
    prepareOrder(args) {
      const quote = Object.freeze({
        toolName: 'createOrder',
        ...quoteOrder(args),
        idempotencyKey: randomUUID(),
      });
      quotes.set(quote, quote);
      return quote;
    },
    // Solo la aplicación llama esta función; no se expone como herramienta.
    confirmOrder(quote, response) {
      if (!quotes.has(quote))
        throw new AppError(
          'INVALID_APPROVAL',
          'La cotización no pertenece a esta sesión o ya fue procesada.',
        );
      quotes.delete(quote);
      if (response !== 'CONFIRMAR') return null;
      const authorization = Object.freeze({ idempotencyKey: quote.idempotencyKey });
      authorizations.set(authorization, quote);
      return authorization;
    },
    createOrder(args, authorization) {
      const a = parse(args);
      const quote = authorizations.get(authorization);
      if (!quote)
        throw new AppError(
          'APPROVAL_REQUIRED',
          'Se requiere confirmación humana de la operación exacta.',
        );
      if (
        a.customerId !== quote.customerId ||
        a.sku !== quote.sku ||
        a.quantity !== quote.quantity
      ) {
        throw new AppError('APPROVAL_MISMATCH', 'La confirmación no corresponde a esta operación.');
      }
      const previous = completed.get(quote.idempotencyKey);
      if (previous) return copy(previous);
      // Transacción síncrona: no hay await entre validar, descontar y registrar.
      const current = quoteOrder(a);
      if (
        current.total !== quote.total ||
        current.unitPrice !== quote.unitPrice ||
        current.currency !== quote.currency
      ) {
        throw new AppError('QUOTE_CHANGED', 'El importe cambió; solicita una nueva confirmación.');
      }
      const order = { orderId: `ORD-${nextId}`, ...current, status: 'created' };
      products.get(a.sku).stock -= a.quantity;
      orders.set(order.orderId, order);
      completed.set(quote.idempotencyKey, order);
      nextId += 1;
      return copy(order);
    },
  });
}
