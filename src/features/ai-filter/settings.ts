import { browser } from 'wxt/browser';

export const AI_SETTINGS_KEY = 'bbr-ai-settings';
export const AI_CLASSIFY_MESSAGE = 'BBR_AI_CLASSIFY';

export interface AiSettings {
  enabled: boolean;
  workerUrl: string;
  apiToken: string;
  fadakThreshold: number;
  normalThreshold: number;
  fadakContext: string;
  normalContext: string;
}

export interface AiPost {
  text: string;
  handle: string;
  displayName: string | null;
  isFadak: boolean;
  imageUrls?: string[];
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  workerUrl: '',
  apiToken: '',
  fadakThreshold: 70,
  normalThreshold: 70,
  fadakContext: '',
  normalContext: '',
};

function threshold(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : 70;
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const input = value && typeof value === 'object' ? value as Partial<AiSettings> : {};
  return {
    enabled: input.enabled === true,
    workerUrl: typeof input.workerUrl === 'string' ? input.workerUrl : '',
    apiToken: typeof input.apiToken === 'string' ? input.apiToken : '',
    fadakThreshold: threshold(input.fadakThreshold),
    normalThreshold: threshold(input.normalThreshold),
    fadakContext: typeof input.fadakContext === 'string' ? input.fadakContext : '',
    normalContext: typeof input.normalContext === 'string' ? input.normalContext : '',
  };
}

export async function getAiSettings(): Promise<AiSettings> {
  const stored = await browser.storage.local.get([AI_SETTINGS_KEY]);
  return normalizeAiSettings(stored[AI_SETTINGS_KEY]);
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await browser.storage.local.set({ [AI_SETTINGS_KEY]: settings });
}

export function workerOrigin(value: string): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid Worker URL');
  }
  return url.origin;
}

export function workerPermission(value: string): string {
  const url = new URL(workerOrigin(value));
  return `${url.protocol}//${url.hostname}/*`;
}

export function inferenceSettingsKey(settings: AiSettings): string {
  return JSON.stringify([settings.workerUrl, settings.apiToken, settings.fadakContext, settings.normalContext]);
}
