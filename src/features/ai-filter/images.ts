import { composeTweetImages } from './image-composition';

export const MAX_TWEET_IMAGES = 4;
export const IMAGE_HOST_PERMISSION = 'https://pbs.twimg.com/*';
const MEDIA_PATHS = ['/media/', '/ext_tw_video_thumb/', '/amplify_video_thumb/', '/tweet_video_thumb/'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type ImageContentType = 'image/png' | 'image/jpeg' | 'image/webp';
export interface AiImage { content_type: ImageContentType; base64: string }

export function tweetImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com' || url.port
      || url.username || url.password || url.hash || !MEDIA_PATHS.some((path) => url.pathname.startsWith(path))) return null;
    return url.href;
  } catch { return null; }
}

async function readImage(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.ok || !response.body) throw new Error('Could not download tweet image');
  if (Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES) {
    await response.body.cancel();
    throw new Error('Tweet image exceeds 4 MiB');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error('Tweet image exceeds 4 MiB'); }
    chunks.push(value);
  }
  if (!size) throw new Error('Empty tweet image');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function downloadImage(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
  if (!response.ok) throw new Error(`Image download HTTP ${response.status}: ${url}\n${await response.text()}`);
  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'image/png' && contentType !== 'image/jpeg' && contentType !== 'image/webp') {
    await response.body?.cancel();
    throw new Error(`Unsupported tweet image format: ${contentType ?? 'missing Content-Type'} (${url})`);
  }
  const bytes = await readImage(response);
  return new Blob([bytes], { type: contentType });
}

function encodeBase64(bytes: Uint8Array): string {
  let base64 = '';
  // 3의 배수 단위로 인코딩해 중간 조각에 padding이 생기지 않도록 한다.
  for (let offset = 0; offset < bytes.length; offset += 32_766) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(offset, offset + 32_766)));
  }
  return base64;
}

export async function downloadTweetImages(urls: string[]): Promise<AiImage[]> {
  if (!urls.length) return [];
  if (urls.length > MAX_TWEET_IMAGES || urls.some((url) => !tweetImageUrl(url))) throw new Error('Invalid tweet image URLs');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const images = await Promise.all(urls.map((url) => downloadImage(url, controller.signal)));
    const image = await composeTweetImages(images);
    const bytes = new Uint8Array(await image.arrayBuffer());
    return [{ content_type: image.type as ImageContentType, base64: encodeBase64(bytes) }];
  } finally { clearTimeout(timeout); controller.abort(); }
}
