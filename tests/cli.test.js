import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { runCli, createTerminal } from '../src/cli.js';
import { createStore } from '../src/data/store.js';
import { loadConfig } from '../src/config.js';
import { tool, final, mockModel } from './helpers.js';
const config = loadConfig({ AGENT_LOG_LEVEL: 'silent' });
function ioMock(inputs) {
  const output = [];
  return {
    output,
    write: (value) => output.push(value),
    question: async (prompt) => {
      output.push(prompt);
      return inputs.shift() ?? null;
    },
  };
}
test('CLI: ayuda, compra, reset de historial sin reiniciar tienda y salida', async () => {
  const store = createStore();
  const io = ioMock([
    '/help',
    'Compra 2 laptops',
    'CONFIRMAR',
    '/reset',
    'Consulta stock',
    '/exit',
  ]);
  const model = mockModel([
    tool('createOrder', { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 }),
    final('Orden ORD-100 creada.'),
    (messages) => {
      assert.doesNotMatch(JSON.stringify(messages), /Orden ORD-100 creada/);
      return tool('getProductStock', { sku: 'LAPTOP-001' });
    },
    final('Quedan 5.'),
  ]);
  await runCli({ io, store, model, config });
  assert.equal(store.getProductStock('LAPTOP-001').stock, 5);
  const output = io.output.join('\n');
  assert.match(output, /37[,.]998/);
  assert.match(output, /CONFIRMAR/);
  assert.match(output, /Quedan 5/);
  assert.match(output, /gemma3:4b/);
});
test('EOF al confirmar cancela la orden', async () => {
  const store = createStore();
  await runCli({
    io: ioMock(['Compra']),
    store,
    config,
    model: mockModel([
      tool('createOrder', { customerId: 'CUST-123', sku: 'LAPTOP-001', quantity: 2 }),
      final('Cancelada.'),
    ]),
  });
  assert.equal(store.getProductStock('LAPTOP-001').stock, 7);
});
test('readline procesa líneas canalizadas y EOF sin perder entradas', async () => {
  let output = '';
  const terminal = createTerminal({
    input: Readable.from(['hola\nCONFIRMAR\nsalir\n']),
    output: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk;
        callback();
      },
    }),
  });
  assert.equal(await terminal.question('Tú> '), 'hola');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await terminal.question('Confirmación> '), 'CONFIRMAR');
  assert.equal(await terminal.question('Tú> '), 'salir');
  assert.equal(await terminal.question('Tú> '), null);
  terminal.close();
  assert.match(output, /Confirmación/);
});

test('Ctrl+C cancela el turno activo de la terminal', async () => {
  const { PassThrough } = await import('node:stream');
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  const terminal = createTerminal({ input, output });
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const session = runCli({
    io: terminal,
    config,
    model: {
      decide: async () => {
        started();
        return pending;
      },
    },
  });
  input.write('consulta\n');
  await ready;
  input.write('\x03');
  const done = await Promise.race([
    session.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 50)),
  ]);
  release(final());
  await session;
  terminal.close();
  input.end();
  output.end();
  assert.equal(done, true);
});
