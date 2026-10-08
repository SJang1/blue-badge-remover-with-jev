import { hasQuestionPermission } from './permissions';
import { workerOrigin } from './settings';

export async function getWorkerQuestion(workerUrl: string, apiToken: string): Promise<string> {
  const origin = workerOrigin(workerUrl);
  if (!await hasQuestionPermission(origin, Boolean(apiToken))) throw new Error('Missing Worker permission');
  const response = await fetch(`${origin}/question`, {
    headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Could not fetch Worker question');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('question' in result)
    || typeof result.question !== 'string' || !result.question.trim()) {
    throw new Error('Invalid Worker question');
  }
  return result.question;
}
