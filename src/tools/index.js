import { skuSchema, customerSchema, orderSchema, statusSchema } from './schemas.js';
import { getProductStock } from './getProductStock.js';
import { getProductPrice } from './getProductPrice.js';
import { getCustomer } from './getCustomer.js';
import { createOrder } from './createOrder.js';
import { getOrderStatus } from './getOrderStatus.js';
export const tools = Object.freeze({
  getProductStock: Object.freeze({
    description: 'Consulta unidades disponibles de un SKU exacto.',
    readOnly: true,
    schema: skuSchema,
    execute: getProductStock,
  }),
  getProductPrice: Object.freeze({
    description: 'Consulta precio unitario y moneda de un SKU exacto.',
    readOnly: true,
    schema: skuSchema,
    execute: getProductPrice,
  }),
  getCustomer: Object.freeze({
    description: 'Consulta ID, nombre y estado activo de un cliente exacto.',
    readOnly: true,
    schema: customerSchema,
    execute: getCustomer,
  }),
  createOrder: Object.freeze({
    description:
      'Solicita crear una orden de 1 a 10 unidades. Node.js exige confirmación humana del importe calculado.',
    readOnly: false,
    schema: orderSchema,
    execute: createOrder,
  }),
  getOrderStatus: Object.freeze({
    description: 'Consulta una orden existente por su ID exacto.',
    readOnly: true,
    schema: statusSchema,
    execute: getOrderStatus,
  }),
});
