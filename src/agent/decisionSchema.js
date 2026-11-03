import { z } from 'zod';
import { AppError } from '../errors.js';
export const decisionSchema = z
  .object({
    action: z.enum(['tool', 'final']),
    toolName: z.string().max(80).nullable(),
    arguments: z.record(z.string(), z.unknown()),
    message: z.string().max(6000),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.action === 'tool' && !d.toolName?.trim())
      ctx.addIssue({ code: 'custom', message: 'tool requiere toolName.' });
    if (
      d.action === 'final' &&
      (d.toolName !== null || !d.message.trim() || Object.keys(d.arguments).length)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'final requiere nombre nulo, argumentos vacíos y mensaje.',
      });
    }
  });
// Plano para el decodificador de Gemma; los refinamientos se validan en Node.js.
export const decisionJsonSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['tool', 'final'] },
    toolName: { type: ['string', 'null'] },
    arguments: { type: 'object', additionalProperties: true },
    message: { type: 'string' },
  },
  required: ['action', 'toolName', 'arguments', 'message'],
  additionalProperties: false,
};
export function parseDecision(raw, maxOutputChars = 12000) {
  let serialized;
  try {
    serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch {
    throw new AppError('INVALID_DECISION', 'La decisión no es JSON válido.');
  }
  if (serialized?.length > maxOutputChars)
    throw new AppError('OUTPUT_LIMIT', 'La salida excede el límite permitido.');
  try {
    return decisionSchema.parse(JSON.parse(serialized));
  } catch {
    throw new AppError('INVALID_DECISION', 'La decisión no cumple el contrato JSON.');
  }
}
