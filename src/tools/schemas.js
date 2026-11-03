import { z } from 'zod';
export const identifier = z.string().trim().min(1).max(80);
export const skuSchema = z.object({ sku: identifier }).strict();
export const customerSchema = z.object({ customerId: identifier }).strict();
export const orderSchema = z
  .object({
    customerId: identifier,
    sku: identifier,
    quantity: z.number().int().min(1).max(10),
  })
  .strict();
export const statusSchema = z.object({ orderId: identifier }).strict();
