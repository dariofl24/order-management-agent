import { z } from 'zod';
import { AppError } from './errors.js';
const schema = z.object({
  OLLAMA_BASE_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:11434')
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      );
    }, 'Usa una URL HTTP de loopback local, sin credenciales ni rutas.'),
  OLLAMA_MODEL: z.literal('gemma3:4b').default('gemma3:4b'),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(8).default(8),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  AGENT_LOG_LEVEL: z.enum(['debug', 'info', 'silent']).default('debug'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1).max(600000).default(120000),
  AGENT_MAX_OUTPUT_CHARS: z.coerce.number().int().min(100).max(12000).default(12000),
  AGENT_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(24).default(24),
});
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new AppError(
      'CONFIG_ERROR',
      `Configuración inválida (${result.error.issues.map((i) => i.path.join('.')).join(', ')}). Revisa .env.example; solo se permite gemma3:4b local.`,
    );
  const c = result.data;
  return Object.freeze({
    ollamaBaseUrl: c.OLLAMA_BASE_URL,
    ollamaModel: c.OLLAMA_MODEL,
    maxSteps: c.AGENT_MAX_STEPS,
    temperature: c.AGENT_TEMPERATURE,
    logLevel: c.AGENT_LOG_LEVEL,
    timeoutMs: c.OLLAMA_TIMEOUT_MS,
    maxOutputChars: c.AGENT_MAX_OUTPUT_CHARS,
    historyMessages: c.AGENT_HISTORY_MESSAGES,
  });
}
