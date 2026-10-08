import { MAX_TWEET_IMAGES, tweetImageUrl } from '@features/ai-filter/images';
import { findQuoteBlock } from './tweet-processing';

const VIDEO_PLAYER = '[data-testid="videoPlayer"], [data-testid="videoComponent"]';
const ATTACHMENTS = '[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] video, [data-testid="videoPlayer"] img, '
  + '[data-testid="videoComponent"] video, [data-testid="videoComponent"] img';

export function extractTweetImageUrls(element: HTMLElement): string[] {
  const quoteBlock = findQuoteBlock(element);
  const urls = new Set<string>();
  const players = new Set<Element>();
  for (const media of element.querySelectorAll<HTMLImageElement | HTMLVideoElement>(ATTACHMENTS)) {
    if (quoteBlock?.contains(media)) continue;
    const player = media.closest(VIDEO_PLAYER);
    if (player && players.has(player)) continue;
    const value = media instanceof HTMLVideoElement ? media.poster : media.currentSrc || media.src;
    const url = tweetImageUrl(value);
    if (url) urls.add(url);
    if (url && player) players.add(player);
    if (urls.size === MAX_TWEET_IMAGES) break;
  }
  return [...urls];
}
