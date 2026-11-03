import { Ollama } from 'ollama';
import { AppError } from '../errors.js';
import { decisionJsonSchema } from './decisionSchema.js';
import { withCancellation } from './cancellation.js';

export function createOllamaClient(config, { fetch: fetchImpl = globalThis.fetch } = {}) {
  async function request(operation, externalSignal) {
    const controller = new AbortController();
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    const client = new Ollama({
      host: config.ollamaBaseUrl,
      fetch: (url, options = {}) =>
        fetchImpl(url, {
          ...options,
          redirect: 'error',
          signal,
        }),
    });
    const timer = setTimeout(
      () =>
        controller.abort(
          new AppError(
            'OLLAMA_TIMEOUT',
            'Ollama excedió el tiempo de espera. Prueba una solicitud más breve o aumenta OLLAMA_TIMEOUT_MS.',
          ),
        ),
      config.timeoutMs,
    );
    try {
      return await withCancellation(() => operation(client), signal);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'OLLAMA_UNAVAILABLE',
        'No se pudo consultar Ollama. Abre Ollama o ejecuta ollama serve; verifica la URL local y ollama list.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async checkAvailability() {
      const result = await request((client) => client.list());
      const model = result.models?.find((m) => m.name === 'gemma3:4b' || m.model === 'gemma3:4b');
      if (!model)
        throw new AppError('MODEL_MISSING', 'Falta gemma3:4b. Ejecuta: ollama pull gemma3:4b');
      if (model.remote_host || model.remote_model)
        throw new AppError(
          'MODEL_NOT_LOCAL',
          'gemma3:4b debe estar descargado y ejecutarse localmente.',
        );
    },
    async decide(messages, { signal } = {}) {
      const response = await request(
        (client) =>
          client.chat({
            model: 'gemma3:4b',
            messages,
            stream: false,
            format: decisionJsonSchema,
            options: { temperature: config.temperature, num_predict: 1024, num_ctx: 8192 },
          }),
        signal,
      );
      const content = response.message?.content;
      if (typeof content !== 'string')
        throw new AppError('INVALID_DECISION', 'Ollama no devolvió contenido JSON.');
      if (content.length > config.maxOutputChars)
        throw new AppError('OUTPUT_LIMIT', 'La salida excede el límite permitido.');
      return content;
    },
  };
}
