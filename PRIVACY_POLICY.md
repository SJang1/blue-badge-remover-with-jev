# Privacy Policy — Blue Badge Remover

**Last updated:** 2026-10-08

## Overview

Blue Badge Remover is a Chrome extension that hides paid blue badge (Premium) accounts on X (Twitter). This policy explains how the extension handles user data.

## Data Collection

The default local filtering mode processes posts in your browser without sending them to external services.

The optional Jev / CLEF AI mode sends post text, attached images, author handles and display names, blue badge status, and the additional context you enter to your configured Cloudflare Worker and Cloudflare Workers AI. The extension downloads up to four tweet photos or video thumbnails from X's image CDN in your browser, combines multiple images into one in their original order, and sends embedded image bytes with the post; the Worker does not download images. Avatars and video/audio data are excluded. AI mode is off by default. Enabling it requires saving the AI settings and granting access to the configured Worker and `pbs.twimg.com`; Firefox also requests optional data transmission permissions when supported. You can disable AI mode to return to local filtering.

## Data Stored Locally

The extension stores the following data in `chrome.storage.local` (your browser only):

| Data | Purpose | Shared? |
|------|---------|---------|
| Extension settings | Filtering preferences, hide mode, language, AI thresholds and context | Context is sent only in AI mode |
| Worker URL and authentication token | Connecting to your personal AI Worker | Token is sent only to the configured Worker for authentication |
| Follow list (handles) | Exempting followed accounts from filtering | No |
| Whitelist (handles) | Exempting manually added accounts | No |
| Current account handle | Switching follow lists between accounts | No |

Follow lists, whitelists, your current account handle, and hide thresholds stay in your browser. AI context and post data are transmitted only when AI is enabled. Public Workers do not require a token. If a Worker requires authentication, its optional token is stored in browser local storage, not embedded in the extension package.

## Data NOT Collected

- No X login credentials are stored; the optional Worker token is stored locally
- No browsing history is tracked
- In local mode, tweet content is not sent externally; AI mode sends it for classification
- AI mode transmits the post author name and handle with the post text and attached photos
- No analytics or telemetry data is gathered
- No cookies are read or modified

## How the Extension Works

The extension operates by:

1. Intercepting X's internal API responses (within the browser) to identify paid badge accounts
2. Monitoring the page DOM to detect and hide tweets from those accounts
3. Reading the follow list from X's Following page API response to build an exemption list

These steps happen locally in your browser. When AI is enabled, eligible posts are additionally sent to the configured Worker for classification. Opening a post's detail page also requests its AI result for display, even when that main post is exempt from hiding. Posts remain visible while awaiting a response or if classification fails.

## Permissions

| Permission | Justification |
|------------|---------------|
| `storage` | Save settings, follow list, and whitelist locally |
| `host_permissions: x.com` | Content script injection and API response interception on X |
| Optional Worker host access | Send AI classification requests to the Worker chosen by the user |
| Optional `pbs.twimg.com` host access | Download tweet photos in the extension client when AI mode is enabled |

## Third-Party Services

Optional AI filtering uses your configured Cloudflare Worker and Cloudflare Workers AI CLEF. The Worker code does not persist post bodies or log post text, names, or token values. Cloudflare processing is governed by its applicable service terms. No production inference or retention behavior has been verified as part of this local implementation.

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension update notes and this document.

## Contact

For questions about this privacy policy, contact [@fotoner_p on X](https://x.com/fotoner_p).
