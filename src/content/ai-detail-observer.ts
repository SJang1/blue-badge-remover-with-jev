import { isDetailPage } from './page-utils';
import { extractTweetStatusPath } from './tweet-processing';

const MEDIA = '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]';
const METADATA = `[data-testid="User-Name"], [data-testid="tweetText"], ${MEDIA}, time`;

export function observeAiDetailResult(onChanged: (tweet: HTMLElement) => void): void {
  const pending = new Set<HTMLElement>();
  let scheduled = false;
  const enqueue = (target: Element) => {
    const tweet = target.closest<HTMLElement>('article[data-testid="tweet"]');
    const path = tweet && extractTweetStatusPath(tweet);
    if (!tweet || !path || !window.location.pathname.includes(path)) return;
    pending.add(tweet);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const tweet of pending) { if (tweet.isConnected) onChanged(tweet); }
      pending.clear();
    });
  };
  const observer = new MutationObserver((mutations) => {
    if (!isDetailPage()) return;
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (!target || target.closest('[data-bbr-ai-result]')) continue;
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
      const changed = target.closest(METADATA) || (mutation.type === 'attributes' && target.querySelector(METADATA))
        || nodes.some((node) => node instanceof Element && (node.matches(METADATA) || node.querySelector(METADATA)));
      if (changed) enqueue(target);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['src', 'srcset', 'poster', 'href'] });
  document.addEventListener('load', (event) => {
    if (isDetailPage() && event.target instanceof HTMLImageElement && event.target.closest(MEDIA)) {
      enqueue(event.target);
    }
  }, true);
}
