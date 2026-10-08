// entrypoints/background.ts — WXT background service worker
import { browser } from 'wxt/browser';
import { logger } from '@shared/utils/logger';
import { MESSAGE_TYPES } from '@shared/constants';
import { cleanupOldStats } from '@features/stats';
import { handleWhitelistRequest } from '@features/settings/whitelist-storage';
import { initLanguageOnInstall } from '@features/settings';
import { AI_CLASSIFY_MESSAGE } from '@features/ai-filter/settings';
import { handleAiClassification, initAiBackground } from '@features/ai-filter/background';

const UPDATE_NOTI_FLAG = 'bbr-update-available';

export default defineBackground(() => {
  logger.info('Blue Badge Remover installed');
  initAiBackground();

  const isFirefoxAndroid = navigator.userAgent.includes('Firefox') && navigator.userAgent.includes('Android');

  // MV2/MV3 호환: browser.action (MV3) 또는 browser.browserAction (MV2)
  const actionApi = browser.action ?? (browser as unknown as Record<string, unknown>).browserAction as typeof browser.action | undefined;

  // 확장 업데이트 감지
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') void initLanguageOnInstall();
    if (details.reason === 'update' && !isFirefoxAndroid) {
      void browser.storage.local.set({ [UPDATE_NOTI_FLAG]: true });
    }
  });

  // SW 시작 시 통계 정리
  void cleanupOldStats();

  // content script → 설정 페이지 열기 요청 처리
  browser.runtime.onMessage.addListener((message, sender) => {
    const type = (message as Record<string, unknown>).type;
    if (type === AI_CLASSIFY_MESSAGE) return handleAiClassification(message).catch(() => ({ ok: false }));
    if (type === MESSAGE_TYPES.WHITELIST) return handleWhitelistRequest(message);
    if (type !== MESSAGE_TYPES.OPEN_SETTINGS) return;
    const settingsUrl = browser.runtime.getURL('/popup.html');
    if (isFirefoxAndroid && sender.tab?.id != null) {
      void browser.tabs.update(sender.tab.id, { url: settingsUrl });
    } else {
      void browser.tabs.create({ url: settingsUrl });
    }
  });

  // Firefox for Android: 팝업 대신 새 탭으로 열기
  if (isFirefoxAndroid && actionApi) {
    actionApi.setPopup({ popup: '' });
    actionApi.onClicked.addListener(() => {
      void browser.tabs.create({ url: browser.runtime.getURL('/popup.html') });
    });
  }
});
