export type AiErrorStage = 'image' | 'worker' | 'extension';
export interface AiFailure { ok: false; error?: string; stage?: AiErrorStage; httpStatus?: number }

export function aiErrorMessage(error: unknown, seen = new Set<unknown>()): string {
  if (seen.has(error)) return 'Circular error cause';
  seen.add(error);
  if (error instanceof Error) {
    const message = error.stack ?? `${error.name}: ${error.message}`;
    return error.cause === undefined ? message : `${message}\nCaused by: ${aiErrorMessage(error.cause, seen)}`;
  }
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error) ?? String(error); }
  catch { return String(error); }
}
