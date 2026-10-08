export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorDetails;
}

export function errorDetails(error: unknown, seen = new Set<unknown>()): ErrorDetails {
  if (seen.has(error)) return { name: 'Error', message: 'Circular error cause' };
  seen.add(error);
  if (error instanceof Error) {
    return {
      name: error.name, message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause !== undefined ? { cause: errorDetails(error.cause, seen) } : {}),
    };
  }
  if (typeof error === 'string') return { name: 'Error', message: error };
  try { return { name: 'Error', message: JSON.stringify(error) ?? String(error) }; }
  catch { return { name: 'Error', message: String(error) }; }
}
