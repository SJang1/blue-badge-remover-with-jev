import { browser } from 'wxt/browser';
import { matchesProtectedKeyword } from '@features/keyword-filter';
import {
  AI_CLASSIFY_MESSAGE, AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS, getAiSettings,
  inferenceSettingsKey, normalizeAiSettings, type AiPost,
} from '@features/ai-filter/settings';
import type { AiResponse } from '@features/ai-filter/background';
import { aiErrorMessage } from '@features/ai-filter/errors';
import { classifyTweet, classifyQuote, type ClassifyInput, type ClassifyResult, type QuoteClassifyInput, type QuoteClassifyResult } from './tweet-classifier';
import { extractTweetImageUrls } from './ai-images';
import { renderAiDetailResult, type AiResultState } from './ai-result';

let settings = { ...DEFAULT_AI_SETTINGS };
let generation = 0;
const scores = new Map<string, AiResponse>();
const pending = new Map<string, Map<HTMLElement, (element: HTMLElement) => void>>();

export async function initAiFiltering(onChanged: () => void): Promise<void> {
  settings = await getAiSettings();
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[AI_SETTINGS_KEY]) return;
    const next = normalizeAiSettings(changes[AI_SETTINGS_KEY].newValue);
    if (inferenceSettingsKey(next) !== inferenceSettingsKey(settings) || next.enabled !== settings.enabled) {
      generation++;
      scores.clear();
      pending.clear();
    }
    settings = next;
    onChanged();
  });
}

function targetScore(post: AiPost, element: HTMLElement, onReady: (element: HTMLElement) => void): number | null {
  const key = JSON.stringify(post);
  const cached = scores.get(key);
  if (cached !== undefined) return cached.ok ? cached.targetProbability : null;
  const waiting = pending.get(key);
  if (waiting) { waiting.set(element, onReady); return null; }
  const targets = new Map([[element, onReady]]);
  pending.set(key, targets);
  const version = generation;
  void browser.runtime.sendMessage({ type: AI_CLASSIFY_MESSAGE, post })
    .catch((error: unknown): AiResponse => ({ ok: false, stage: 'extension', error: aiErrorMessage(error) }))
    .then((result: AiResponse | undefined) => {
      if (version !== generation) return;
      if (scores.size >= 500) scores.delete(scores.keys().next().value!);
      scores.set(key, result ?? { ok: false, stage: 'extension', error: 'No classification response from the extension' });
      pending.delete(key);
      for (const [target, callback] of targets) {
        if (target.isConnected) callback(target);
      }
    });
  return null;
}

export function showAiDetailResult(
  post: AiPost, element: HTMLElement, onReady: (element: HTMLElement) => void, local: ClassifyInput['settings'],
): void {
  let state: AiResultState;
  if (!local.enabled || !settings.enabled) state = { status: 'disabled' };
  else if (!settings.workerUrl) state = { status: 'unconfigured' };
  else {
    const probability = targetScore(post, element, onReady);
    const result = scores.get(JSON.stringify(post));
    state = probability !== null ? { status: 'ready', probability }
      : result && !result.ok ? { status: 'failed', error: result.error, stage: result.stage, httpStatus: result.httpStatus }
        : { status: 'pending' };
  }
  const threshold = post.isFadak ? settings.fadakThreshold : settings.normalThreshold;
  renderAiDetailResult(element, state, post.isFadak, threshold, post.imageUrls?.length ?? 0, local.language);
}

function isTarget(post: AiPost, element: HTMLElement, onReady: (element: HTMLElement) => void): boolean {
  const probability = targetScore(post, element, onReady);
  const threshold = post.isFadak ? settings.fadakThreshold : settings.normalThreshold;
  return probability !== null && probability >= threshold / 100;
}

function shouldUseAi(input: ClassifyInput): boolean {
  if (!input.settings.enabled || input.inFollow || input.isWhitelisted) return false;
  if (input.profile && matchesProtectedKeyword(input.profile, input.protectedKeywords)) return false;
  if (input.isRetweet && (input.retweeterInFollow || input.retweeterIsWhitelisted || input.retweeterIsCurrentUser)) return false;
  return input.isRetweet ? input.settings.retweetFilter : input.settings.filter[input.pageType];
}

export function classifyTweetForMode(
  input: ClassifyInput, element: HTMLElement, onReady: (element: HTMLElement) => void,
): ClassifyResult {
  if (!settings.enabled) return classifyTweet(input);
  if (!shouldUseAi(input) || !settings.workerUrl) return { action: 'show' };
  const post = { text: input.tweetText, handle: input.handle, displayName: input.displayName, isFadak: input.isFadak,
    imageUrls: extractTweetImageUrls(element) };
  return isTarget(post, element, onReady)
    ? { action: 'hide', reason: 'ai', category: 'Jev / CLEF' } : { action: 'show' };
}

export function classifyQuoteForMode(
  input: QuoteClassifyInput, post: AiPost, element: HTMLElement, onReady: (element: HTMLElement) => void,
): QuoteClassifyResult {
  if (!settings.enabled) return classifyQuote(input);
  // 기존 인용 모드와 팔로우/화이트리스트 예외를 적용한 뒤 실제 배지 그룹으로 AI 판정.
  const action = classifyQuote({ ...input, quotedIsFadak: true });
  if (action.action === 'show' || !post.handle || !settings.workerUrl) return { action: 'show' };
  return isTarget(post, element, onReady) ? { ...action, reason: 'ai' } : { action: 'show' };
}
