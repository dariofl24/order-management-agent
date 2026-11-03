import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDecision } from '../src/agent/decisionSchema.js';
const tool = {
  action: 'tool',
  toolName: 'getProductStock',
  arguments: { sku: 'LAPTOP-001' },
  message: '',
};
const final = { action: 'final', toolName: null, arguments: {}, message: 'Disponible.' };
test('acepta decisiones tool/final desde JSON y objetos', () => {
  assert.deepEqual(parseDecision(JSON.stringify(tool)), tool);
  assert.deepEqual(parseDecision(final), final);
});
for (const raw of [
  'oops',
  '```json\n{}\n```',
  null,
  [],
  { ...tool, toolName: '' },
  { ...tool, arguments: [] },
  { ...tool, approved: true },
  { ...final, message: ' ' },
  { ...final, toolName: 'createOrder' },
  { ...final, arguments: { approved: true } },
]) {
  test(`rechaza decisión inválida ${JSON.stringify(raw)}`, () =>
    assert.throws(() => parseDecision(raw), { code: 'INVALID_DECISION' }));
}
test('limita salida antes de parsear', () =>
  assert.throws(() => parseDecision('x'.repeat(12001)), { code: 'OUTPUT_LIMIT' }));
