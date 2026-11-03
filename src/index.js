import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createOllamaClient } from './agent/ollamaClient.js';
import { createTerminal, runCli } from './cli.js';
import { AppError } from './errors.js';

dotenv.config({ quiet: true });
let terminal;
try {
  const config = loadConfig();
  const model = createOllamaClient(config);
  console.log(`[APP] Comprobando ${config.ollamaModel} en ${config.ollamaBaseUrl}…`);
  await model.checkAvailability();
  terminal = createTerminal();
  await runCli({ io: terminal, model, config });
} catch (error) {
  console.error(
    `[APP] ${error instanceof AppError ? error.message : 'No se pudo completar la sesión. Revisa la configuración e inténtalo de nuevo.'}`,
  );
  process.exitCode = 1;
} finally {
  terminal?.close();
}
