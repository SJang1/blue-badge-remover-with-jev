import { getAiSettings, saveAiSettings, workerOrigin, type AiSettings } from '@features/ai-filter/settings';
import { hasBuiltInDataConsent, requestAiPermission, requestQuestionPermission } from '@features/ai-filter/permissions';
import { getWorkerQuestion } from '@features/ai-filter/question';
import { tp } from '@shared/i18n';

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const context = (group: string) => document.getElementById(`ai-${group}-context`) as HTMLTextAreaElement;
let questionRequest = 0;

function showQuestion(message: string): void {
  document.getElementById('ai-question')!.textContent = message;
}

function resetQuestion(): void {
  questionRequest++;
  showQuestion(tp('aiQuestionSaveHint'));
}

async function refreshQuestion(settings: AiSettings): Promise<void> {
  if (input('ai-worker-url').value.trim() !== settings.workerUrl
    || input('ai-api-token').value.trim() !== settings.apiToken) return;
  const request = ++questionRequest;
  if (!settings.workerUrl) { showQuestion(tp('aiQuestionSaveHint')); return; }
  showQuestion(tp('aiQuestionLoading'));
  try {
    const question = await getWorkerQuestion(settings.workerUrl, settings.apiToken);
    if (request === questionRequest) showQuestion(question);
  } catch {
    if (request === questionRequest) showQuestion(tp('aiQuestionLoadFailed'));
  }
}

function bindThreshold(group: string, value: number): void {
  const range = input(`ai-${group}-threshold`);
  const number = input(`ai-${group}-percent`);
  range.value = number.value = String(value);
  range.addEventListener('input', () => { number.value = range.value; });
  number.addEventListener('input', () => { if (number.validity.valid) range.value = number.value; });
}

function readSettings(): AiSettings {
  return {
    enabled: input('ai-enabled').checked,
    workerUrl: input('ai-worker-url').value.trim(),
    apiToken: input('ai-api-token').value.trim(),
    fadakThreshold: input('ai-fadak-percent').valueAsNumber,
    normalThreshold: input('ai-normal-percent').valueAsNumber,
    fadakContext: context('fadak').value.trim(),
    normalContext: context('normal').value.trim(),
  };
}

function showStatus(message: string, success: boolean): void {
  const element = document.getElementById('ai-status');
  if (!element) return;
  element.textContent = message;
  element.className = `save-status ${success ? 'success' : 'error'}`;
}

async function save(builtInDataConsent: boolean): Promise<void> {
  const settings = readSettings();
  const enteredWorkerUrl = settings.workerUrl;
  if (![settings.fadakThreshold, settings.normalThreshold].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) {
    showStatus(tp('aiInvalidThreshold'), false); return;
  }
  if (settings.fadakContext.length > 4000 || settings.normalContext.length > 4000) {
    showStatus(tp('aiContextTooLong'), false); return;
  }
  if (settings.workerUrl || settings.enabled) {
    try { settings.workerUrl = workerOrigin(settings.workerUrl); }
    catch { showStatus(tp('aiInvalidUrl'), false); return; }
  }
  const button = input('ai-save');
  button.disabled = true;
  try {
    // 사용자 클릭의 활성화 상태가 유지되는 동안 권한을 요청한다.
    if (settings.workerUrl) {
      const requestPermission = settings.enabled ? requestAiPermission : requestQuestionPermission;
      const allowed = await requestPermission(settings.workerUrl, builtInDataConsent, Boolean(settings.apiToken));
      if (!allowed && settings.enabled) { showStatus(tp('aiPermissionDenied'), false); return; }
    }
    await saveAiSettings(settings);
    if (input('ai-worker-url').value.trim() === enteredWorkerUrl) input('ai-worker-url').value = settings.workerUrl;
    showStatus(tp('saved'), true);
    void refreshQuestion(settings);
  } catch { showStatus(tp('saveFailed'), false); }
  finally { button.disabled = false; }
}

export async function initAiSettings(): Promise<void> {
  const form = document.getElementById('ai-settings');
  if (!form) return;
  const [settings, builtInDataConsent] = await Promise.all([getAiSettings(), hasBuiltInDataConsent()]);
  input('ai-enabled').checked = settings.enabled;
  input('ai-worker-url').value = settings.workerUrl;
  input('ai-api-token').value = settings.apiToken;
  context('fadak').value = settings.fadakContext;
  context('normal').value = settings.normalContext;
  bindThreshold('fadak', settings.fadakThreshold);
  bindThreshold('normal', settings.normalThreshold);
  input('ai-worker-url').addEventListener('input', resetQuestion);
  input('ai-api-token').addEventListener('input', resetQuestion);
  form.addEventListener('submit', (event) => { event.preventDefault(); void save(builtInDataConsent); });
  void refreshQuestion(settings);
}
