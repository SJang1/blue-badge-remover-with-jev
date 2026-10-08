import { buildContext, DEFAULT_ADDITIONAL_EXPLANATION, parsePostInput, type PostInput } from './classification';
import { errorDetails } from './errors';

const MODEL = '@cf/cloudflare/clef' as const;
type WorkerEnv = Env & { API_TOKEN?: string };
const MAX_BODY_BYTES = 13 * 1024 * 1024;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function authorized(request: Request, token: string): Promise<boolean> {
  if (!token) return false;
  const digest = async (value: string) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  const [expected, actual] = await Promise.all([
    digest(`Bearer ${token}`), digest(request.headers.get('Authorization') ?? ''),
  ]);
  return crypto.subtle.timingSafeEqual(expected, actual);
}

async function readPost(request: Request): Promise<PostInput> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('Expected application/json');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('Request body exceeds 13 MiB');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return parsePostInput(body);
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== '/classify' && path !== '/question') return json({ error: 'Not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const method = path === '/question' ? 'GET' : 'POST';
    if (request.method !== method) return json({ error: `Use ${method}` }, 405);
    if (env.API_TOKEN && !await authorized(request, env.API_TOKEN)) return json({ error: 'Unauthorized' }, 401);
    if (path === '/question') return json({ question: DEFAULT_ADDITIONAL_EXPLANATION });
    let post: PostInput;
    try { post = await readPost(request); }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400); }
    try {
      const result = await env.AI.run(MODEL, {
        model: 'clef',
        ...(post.images.length ? { images: post.images } : {}),
        state: {
          context: buildContext(post),
          post_text: post.text,
          author: {
            handle: post.handle,
            display_name: post.displayName,
            is_fadak: post.isFadak,
          },
        },
        questions: {
          filter_target: {
            type: 'noul',
            instructions: DEFAULT_ADDITIONAL_EXPLANATION,
          },
        },
      });
      const answers: unknown = result.answers;
      const answer = answers && typeof answers === 'object' && 'filter_target' in answers
        ? answers.filter_target : undefined;
      const probability = typeof answer === 'number' ? answer
        : answer && typeof answer === 'object' && 'type' in answer && answer.type === 'noul' && 'noul' in answer
          ? answer.noul : undefined;
      if (typeof probability !== 'number' || !Number.isFinite(probability)
        || probability < 0 || probability > 1) {
        console.error(JSON.stringify({ event: 'clef_response_invalid', answerType: typeof answer, probabilityType: typeof probability }));
        return json({ error: 'Unexpected CLEF response' }, 502);
      }
      return json({ model: MODEL, classifier: post.isFadak ? 'fadak' : 'normal', targetProbability: probability });
    } catch (error) {
      const details = errorDetails(error);
      const imageInfo = post.images.map((image) => ({ contentType: image.content_type,
        bytes: image.base64.length / 4 * 3 - (image.base64.endsWith('==') ? 2 : image.base64.endsWith('=') ? 1 : 0) }));
      console.error(JSON.stringify({ event: 'clef_classification_failed', details, imageInfo }));
      return json({ error: 'CLEF inference failed', details, imageInfo }, 502);
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
