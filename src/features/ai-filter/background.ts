import { browser } from 'wxt/browser';
import { getAiSettings, saveAiSettings, inferenceSettingsKey, workerOrigin, type AiPost, type AiSettings } from './settings';
import { hasAiPermission } from './permissions';
import { downloadTweetImages, MAX_TWEET_IMAGES, tweetImageUrl, type AiImage } from './images';
import { getSettings } from '@features/settings';
import { aiErrorMessage, type AiFailure } from './errors';

export type AiResponse = { ok: true; targetProbability: number } | AiFailure;
const cache = new Map<string, number>();
const pending = new Map<string, Promise<AiResponse>>();
const queue: (() => void)[] = [];
let active = 0;

export function initAiBackground(): void {
  browser.permissions.onRemoved.addListener(() => {
    void getAiSettings().then(async (settings) => {
      if (settings.enabled && !await hasAiPermission(settings.workerUrl, Boolean(settings.apiToken))) {
        await saveAiSettings({ ...settings, enabled: false });
      }
    }).catch(() => {});
  });
}

function schedule(task: () => Promise<AiResponse>): Promise<AiResponse> {
  return new Promise((resolve) => {
    queue.push(() => {
      active++;
      void task().then(resolve, (error: unknown) => resolve({ ok: false, stage: 'extension', error: aiErrorMessage(error) }))
        .finally(() => { active--; pump(); });
    });
    pump();
  });
}

function pump(): void {
  while (active < 2 && queue.length > 0) queue.shift()?.();
}

function parsePost(message: unknown): AiPost | null {
  if (!message || typeof message !== 'object' || !('post' in message)) return null;
  const value = message.post;
  if (!value || typeof value !== 'object' || !('text' in value) || typeof value.text !== 'string'
    || value.text.length > 10_000 || !('handle' in value) || typeof value.handle !== 'string'
    || !value.handle.trim() || value.handle.length > 100 || !('isFadak' in value)
    || typeof value.isFadak !== 'boolean') return null;
  const displayName = 'displayName' in value ? value.displayName : null;
  if (displayName !== null && (typeof displayName !== 'string' || displayName.length > 200)) return null;
  const imageUrls = 'imageUrls' in value ? value.imageUrls : [];
  if (!Array.isArray(imageUrls) || imageUrls.length > MAX_TWEET_IMAGES) return null;
  const urls: string[] = [];
  for (const value of imageUrls) {
    const url = tweetImageUrl(value);
    if (!url) return null;
    if (!urls.includes(url)) urls.push(url);
  }
  return { text: value.text, handle: value.handle, displayName, isFadak: value.isFadak, imageUrls: urls };
}

async function canSendPost(settings: AiSettings, hasImages: boolean): Promise<boolean> {
  const [current, local] = await Promise.all([getAiSettings(), getSettings()]);
  return current.enabled && local.enabled && inferenceSettingsKey(current) === inferenceSettingsKey(settings)
    && await hasAiPermission(settings.workerUrl, Boolean(settings.apiToken), hasImages);
}

async function requestClassification(post: AiPost, settings: AiSettings): Promise<AiResponse> {
  const hasImages = Boolean(post.imageUrls?.length);
  if (!await canSendPost(settings, hasImages)) return { ok: false };
  let images: AiImage[];
  try { images = await downloadTweetImages(post.imageUrls ?? []); }
  catch (error) { return { ok: false, stage: 'image', error: aiErrorMessage(error) }; }
  if (!await canSendPost(settings, hasImages)) return { ok: false };
  try {
    const response = await fetch(`${workerOrigin(settings.workerUrl)}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.apiToken ? { Authorization: `Bearer ${settings.apiToken}` } : {}) },
      body: JSON.stringify({
        text: post.text, handle: post.handle, displayName: post.displayName, isFadak: post.isFadak,
        context: post.isFadak ? settings.fadakContext : settings.normalContext, images,
      }),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    return await parseWorkerResponse(response, post.isFadak);
  } catch (error) { return { ok: false, stage: 'worker', error: aiErrorMessage(error) }; }
}

async function parseWorkerResponse(response: Response, isFadak: boolean): Promise<AiResponse> {
  const body = await response.text();
  const failure: AiFailure = { ok: false, stage: 'worker', httpStatus: response.status, error: body || response.statusText };
  if (!response.ok) return failure;
  let result: unknown;
  try { result = JSON.parse(body); }
  catch (error) { return { ...failure, error: `${aiErrorMessage(error)}\n${body}` }; }
  if (!result || typeof result !== 'object' || !('targetProbability' in result)
    || typeof result.targetProbability !== 'number' || !Number.isFinite(result.targetProbability)
    || result.targetProbability < 0 || result.targetProbability > 1 || !('classifier' in result)
    || result.classifier !== (isFadak ? 'fadak' : 'normal')) return { ...failure, error: `Invalid Worker response\n${body}` };
  return { ok: true, targetProbability: result.targetProbability };
}

export async function handleAiClassification(message: unknown): Promise<AiResponse> {
  const post = parsePost(message);
  if (!post) return { ok: false };
  const settings = await getAiSettings();
  if (!settings.enabled || !settings.workerUrl) return { ok: false };
  const key = JSON.stringify([inferenceSettingsKey(settings), post]);
  if (!await hasAiPermission(settings.workerUrl, Boolean(settings.apiToken), Boolean(post.imageUrls?.length))) return { ok: false };
  const cached = cache.get(key);
  if (cached !== undefined) return { ok: true, targetProbability: cached };
  const running = pending.get(key);
  if (running) return running;
  const task = schedule(() => requestClassification(post, settings));
  pending.set(key, task);
  try {
    const result = await task;
    if (result.ok) {
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, result.targetProbability);
    }
    return result;
  } finally {
    pending.delete(key);
  }
}
