import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createOllamaClient } from '../src/agent/ollamaClient.js';
const config = loadConfig({});
const response = (data) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
test('configuración rechaza cloud, modelo diferente y límites inválidos', () => {
  assert.throws(() => loadConfig({ OLLAMA_BASE_URL: 'not-a-url' }), { code: 'CONFIG_ERROR' });
  for (const env of [
    { OLLAMA_MODEL: 'other' },
    { OLLAMA_BASE_URL: 'https://example.com' },
    { OLLAMA_BASE_URL: 'http://user:pass@localhost:11434' },
    { AGENT_MAX_STEPS: '9' },
    { OLLAMA_TIMEOUT_MS: '-1' },
  ]) {
    assert.throws(() => loadConfig(env), { code: 'CONFIG_ERROR' });
  }
  assert.equal(config.ollamaModel, 'gemma3:4b');
});
test('SDK oficial envía format JSON Schema, sin tool_calls, y lee respuesta', async () => {
  let request;
  const client = createOllamaClient(config, {
    fetch: async (url, options) => {
      request = { url: String(url), body: JSON.parse(options.body) };
      return response({
        message: {
          role: 'assistant',
          content: '{"action":"final","toolName":null,"arguments":{},"message":"Hola"}',
        },
        done: true,
      });
    },
  });
  const result = await client.decide([{ role: 'user', content: 'Hola' }]);
  assert.match(result, /Hola/);
  assert.equal(request.body.model, 'gemma3:4b');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.format.type, 'object');
  assert.equal(request.body.format.properties.arguments.type, 'object');
  assert.equal(request.body.tools, undefined);
  assert.ok(request.body.options.num_predict > 0);
});
test('arranque verifica modelo local y diagnostica faltante', async () => {
  await createOllamaClient(config, {
    fetch: async () => response({ models: [{ name: 'gemma3:4b' }] }),
  }).checkAvailability();
  await assert.rejects(
    createOllamaClient(config, { fetch: async () => response({ models: [] }) }).checkAvailability(),
    { code: 'MODEL_MISSING' },
  );
  await assert.rejects(
    createOllamaClient(config, {
      fetch: async () => response({ models: [{ name: 'gemma3:4b', remote_host: 'cloud' }] }),
    }).checkAvailability(),
    { code: 'MODEL_NOT_LOCAL' },
  );
});
test('errores de conexión y timeout son controlados; timeout aborta fetch', async () => {
  await assert.rejects(
    createOllamaClient(config, {
      fetch: async () => {
        throw new Error('private-stack');
      },
    }).checkAvailability(),
    { code: 'OLLAMA_UNAVAILABLE' },
  );
  let signal;
  const client = createOllamaClient(
    { ...config, timeoutMs: 15 },
    {
      fetch: async (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    },
  );
  await assert.rejects(client.decide([]), { code: 'OLLAMA_TIMEOUT' });
  assert.equal(signal.aborted, true);
});

test('cancelación externa aborta el fetch del SDK inmediatamente', async () => {
  const controller = new AbortController();
  let signal;
  const client = createOllamaClient(
    { ...config, timeoutMs: 50 },
    {
      fetch: async (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    },
  );
  const pending = client.decide([], { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(signal.aborted, true);
});
