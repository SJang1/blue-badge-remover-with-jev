import { t, type Language } from '@shared/i18n';
import type { AiErrorStage } from '@features/ai-filter/errors';

export type AiResultState = { status: 'ready'; probability: number }
  | { status: 'failed'; error?: string; stage?: AiErrorStage; httpStatus?: number }
  | { status: 'pending' | 'disabled' | 'unconfigured' };
const RESULT_ATTR = 'data-bbr-ai-result';
const STATUS_KEYS = {
  pending: 'aiResultPending', failed: 'aiResultFailed', disabled: 'aiResultDisabled', unconfigured: 'aiResultNoWorker',
} as const;
const ERROR_STAGE_KEYS = { image: 'aiErrorStageImage', worker: 'aiErrorStageWorker', extension: 'aiErrorStageExtension' } as const;
let banners = new WeakMap<HTMLElement, HTMLDetailsElement>();

function injectStyles(): void {
  if (document.querySelector('[data-bbr-ai-result-style]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-bbr-ai-result-style', 'true');
  style.textContent = `
    [${RESULT_ATTR}] { display: block; width: 100%; box-sizing: border-box; flex: 0 0 auto;
      color: white; background: #536471;
      font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    [${RESULT_ATTR}][data-status="pending"] { background: #1d6cac; }
    [${RESULT_ATTR}][data-status="failed"], [${RESULT_ATTR}][data-verdict="above"] { background: #f4212e; }
    [${RESULT_ATTR}][data-verdict="below"] { background: #007a52; }
    [${RESULT_ATTR}] > summary { display: flex; flex-wrap: wrap; align-items: center;
      justify-content: center; gap: 6px 12px; padding: 8px 20px; list-style: none; cursor: pointer; }
    [${RESULT_ATTR}] > summary::-webkit-details-marker { display: none; }
    [${RESULT_ATTR}] > summary:focus-visible { outline: 2px solid white; outline-offset: -4px; }
    [${RESULT_ATTR}] .bbr-ai-title, [${RESULT_ATTR}] .bbr-ai-summary { font-weight: 600; overflow-wrap: anywhere; }
    [${RESULT_ATTR}] .bbr-ai-button { background: white; color: #0f1419; border-radius: 16px;
      padding: 6px 18px; font-weight: 600; white-space: nowrap; }
    [${RESULT_ATTR}] .bbr-ai-button::after { content: " ▾"; }
    [${RESULT_ATTR}][open] .bbr-ai-button::after { content: " ▴"; }
    [${RESULT_ATTR}] .bbr-ai-values { padding: 0 20px 12px; white-space: pre-line;
      overflow-wrap: anywhere; text-align: center; user-select: text; }
    [${RESULT_ATTR}][data-status="failed"] .bbr-ai-values { max-height: 320px; overflow: auto;
      white-space: pre-wrap; text-align: left; font: 12px/1.6 monospace; }
  `;
  document.head.appendChild(style);
}

export function removeAiDetailResult(element: HTMLElement): void {
  banners.get(element)?.remove();
  banners.delete(element);
  element.querySelector(`[${RESULT_ATTR}]`)?.remove();
}

export function clearAiDetailResults(): void {
  document.querySelectorAll(`[${RESULT_ATTR}]`).forEach((element) => element.remove());
  banners = new WeakMap();
}

function createBanner(element: HTMLElement): HTMLDetailsElement {
  clearAiDetailResults();
  const banner = document.createElement('details');
  banner.setAttribute(RESULT_ATTR, 'true');
  const summary = document.createElement('summary');
  for (const name of ['title', 'summary', 'button']) {
    const span = document.createElement('span');
    span.className = `bbr-ai-${name}`;
    if (name === 'summary') { span.setAttribute('role', 'status'); span.setAttribute('aria-live', 'polite'); }
    summary.appendChild(span);
  }
  const values = document.createElement('div');
  values.className = 'bbr-ai-values';
  banner.append(summary, values);
  banners.set(element, banner);
  return banner;
}

function placeBanner(element: HTMLElement, banner: HTMLDetailsElement): void {
  const header = document.querySelector('[data-testid="primaryColumn"] > div > div:first-child');
  if (header && !header.contains(element)) {
    if (banner.parentElement !== header) header.appendChild(banner);
    return;
  }
  if (banner.isConnected) return;
  // X의 article은 가로 flex다. 그 안에 넣지 않고 셀 앞의 세로 흐름에 삽입한다.
  let anchor = element.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ?? element;
  while (anchor.parentElement) {
    const layout = getComputedStyle(anchor.parentElement);
    if (!layout.display.includes('flex') || layout.flexDirection.startsWith('column')) break;
    anchor = anchor.parentElement;
  }
  anchor.before(banner);
}

function setText(banner: HTMLDetailsElement, className: string, value: string): void {
  const target = banner.querySelector(`.bbr-ai-${className}`);
  if (target && target.textContent !== value) target.textContent = value;
}

function resultLines(probability: number, isFadak: boolean, threshold: number, imageCount: number, language: Language): string[] {
  const percent = new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(probability * 100);
  const group = t(isFadak ? 'aiResultFadakGroup' : 'aiResultNormalGroup', language);
  const comparison = t(probability >= threshold / 100 ? 'aiResultAbove' : 'aiResultBelow', language);
  return [
    t('aiResultProbability', language, { percent, probability: String(probability) }),
    t('aiResultThreshold', language, { group, threshold: String(threshold), comparison }),
    t(imageCount > 1 ? 'aiResultMergedImages' : 'aiResultImages', language, { count: String(imageCount) }),
  ];
}

function errorText(state: Extract<AiResultState, { status: 'failed' }>, language: Language): string {
  const stage = state.stage ? t('aiResultErrorStage', language, { stage: t(ERROR_STAGE_KEYS[state.stage], language) }) : '';
  const status = state.httpStatus === undefined ? '' : `HTTP ${state.httpStatus}`;
  return [stage, status, state.error || t('aiResultFailed', language)].filter(Boolean).join('\n');
}

export function renderAiDetailResult(
  element: HTMLElement, state: AiResultState, isFadak: boolean, threshold: number, imageCount: number, language: Language,
): void {
  injectStyles();
  const existing = banners.get(element);
  const banner = existing?.isConnected ? existing : createBanner(element);
  setText(banner, 'title', t('aiResultTitle', language));
  setText(banner, 'button', t('aiResultDetails', language));
  if (state.status === 'ready') {
    const percent = new Intl.NumberFormat(language, { maximumFractionDigits: 4 }).format(state.probability * 100);
    setText(banner, 'summary', t('aiResultSummary', language, { percent }));
    setText(banner, 'values', resultLines(state.probability, isFadak, threshold, imageCount, language).join('\n'));
    banner.dataset['probability'] = String(state.probability);
    banner.dataset['verdict'] = state.probability >= threshold / 100 ? 'above' : 'below';
  } else {
    setText(banner, 'summary', t(STATUS_KEYS[state.status], language));
    setText(banner, 'values', state.status === 'failed' ? errorText(state, language) : t(STATUS_KEYS[state.status], language));
    delete banner.dataset['probability'];
    delete banner.dataset['verdict'];
  }
  banner.dataset['status'] = state.status;
  placeBanner(element, banner);
}
