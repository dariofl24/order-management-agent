import { AppError } from '../errors.js';
export function throwIfCancelled(signal) {
  if (signal?.aborted)
    throw signal.reason instanceof AppError
      ? signal.reason
      : new AppError(
          'CANCELLED',
          'Solicitud cancelada. Las operaciones ya realizadas se conservan.',
        );
}

// El listener se retira al terminar, aunque la dependencia rechace la promesa.
export async function withCancellation(operation, signal) {
  throwIfCancelled(signal);
  if (!signal) return operation();
  let onAbort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        onAbort = () => {
          try {
            throwIfCancelled(signal);
          } catch (error) {
            reject(error);
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }),
      operation(),
    ]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
