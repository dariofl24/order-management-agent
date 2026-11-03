export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
export function errorResult(error) {
  return {
    ok: false,
    error:
      error instanceof AppError
        ? { code: error.code, message: error.message }
        : { code: 'INTERNAL_ERROR', message: 'No se pudo completar la operación.' },
  };
}
