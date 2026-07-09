/**
 * Nitter HTML fallback scraper.
 *
 * LAST RESORT only. Nitter instances are perpetually unstable -- mirrors come
 * and go, anti-scraping measures change, HTML structure drifts. This scraper
 * is best-effort: if anything looks off, we return empty with a warning rather
 * than crash the wider pipeline.
 *
 * Strategy:
 *   1. Try a list of mirrors in order.
 *   2. Fetch the user's timeline page (HTML).
 *   3. Parse `<div class="timeline-item">` nodes with permissive regexes.
 *   4. Filter by date, normalize to ScrapedTweet.
 *
 * Rate limit: 1 req/sec to whichever mirror we land on.
 */

import type { ScrapedTweet, ScrapeOptions } from './types.js';

/** Mirrors are tried in order. First successful response wins. */
export const NITTER_MIRRORS: readonly string[] = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
];

export interface NitterClientOptions {
  /** Override mirror list (used for tests). */
  mirrors?: readonly string[];
  /** Override fetch (used for tests). */
  fetchImpl?: typeof fetch;
  /** Inter-request delay in ms (default 1000). */
  delayMs?: number;
  /** Per-mirror request timeout in ms (default 10s). */
  timeoutMs?: number;
}

export class NitterClient {
  private readonly mirrors: readonly string[];
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private lastRequestAt = 0;

  constructor(options: NitterClientOptions = {}) {
    this.mirrors = options.mirrors ?? NITTER_MIRRORS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.delayMs = options.delayMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Fetch the user's recent tweets via Nitter, filtered to `sinceDays` window.
   * Returns [] on any failure (after logging a warning).
   */
  async fetchTimeline(options: ScrapeOptions): Promise<ScrapedTweet[]> {
    const cutoff = Date.now() - options.sinceDays * 24 * 60 * 60 * 1000;
    const html = await this.fetchFirstWorkingMirror(options.username);
    if (!html) {
      console.warn('[nitter] All mirrors failed; returning empty result');
      return [];
    }

    let tweets: ScrapedTweet[];
    try {
      tweets = parseNitterHtml(html, options.username);
    } catch (err) {
      console.warn(
        `[nitter] HTML parsing failed (structure may have changed): ${(err as Error).message}`,
      );
      return [];
    }

    return tweets
      .filter((t) => {
        const ts = Date.parse(t.date);
        return Number.isFinite(ts) && ts >= cutoff;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  private async fetchFirstWorkingMirror(
    username: string,
  ): Promise<string | null> {
    for (const mirror of this.mirrors) {
      const url = `${mirror.replace(/\/$/, '')}/${encodeURIComponent(username)}`;
      try {
        await this.throttle();
        const html = await this.fetchWithTimeout(url);
        if (html && html.includes('timeline-item')) {
          return html;
        }
        console.warn(
          `[nitter] Mirror ${mirror} returned response but no timeline-item nodes`,
        );
      } catch (err) {
        console.warn(
          `[nitter] Mirror ${mirror} failed: ${(err as Error).message}`,
        );
      }
    }
    return null;
  }

  private async fetchWithTimeout(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'shipped-pipeline/0.1 (+https://id8labs.app/shipped)',
          Accept: 'text/html',
        },
      });
      if (!res.ok) {
        return null;
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

/* -------------------------------------------------------------------------- */
/* HTML parser                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parse a Nitter timeline HTML page.
 * Exported for tests. Permissive -- failures collapse to "skip this tweet".
 */
export function parseNitterHtml(
  html: string,
  username: string,
): ScrapedTweet[] {
  const tweets: ScrapedTweet[] = [];
  // Each tweet is wrapped in <div class="timeline-item">...</div>
  // Loose match on the wrapper -- Nitter's nesting is messy in practice.
  const itemRegex =
    /<div class="timeline-item[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    if (!block) continue;
    const tweet = parseTweetBlock(block, username);
    if (tweet) tweets.push(tweet);
  }

  return tweets;
}

function parseTweetBlock(
  block: string,
  username: string,
): ScrapedTweet | null {
  // Tweet permalink: <a class="tweet-link" href="/USER/status/ID#m">
  const linkMatch = block.match(
    /<a class="tweet-link" href="\/[^/]+\/status\/(\d+)/,
  );
  if (!linkMatch || !linkMatch[1]) return null;
  const id = linkMatch[1];

  // Date: <span class="tweet-date"><a ... title="ISO_TIMESTAMP">...</a></span>
  // Nitter uses titles like "Apr 15, 2026 . 2:23 PM UTC"
  const dateMatch = block.match(
    /<span class="tweet-date">[\s\S]*?title="([^"]+)"/,
  );
  const dateRaw = dateMatch?.[1] ?? '';
  const date = parseNitterDate(dateRaw);

  // Body: <div class="tweet-content media-body" ...>TEXT</div>
  const bodyMatch = block.match(
    /<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  );
  const text = bodyMatch?.[1] ? stripTags(bodyMatch[1]).trim() : '';

  // Links: <a href="URL" rel="nofollow noreferrer">...</a> within the body.
  const links = extractLinks(bodyMatch?.[1] ?? '');

  // Hashtags: <a href="/search?q=%23TAG" ...>#TAG</a>
  const hashtags = extractHashtags(block);

  // Attachments: presence of .attachment, .video-container, .gif -> category
  const attachments = extractAttachments(block);
  if (attachments.length === 0 && links.length > 0) attachments.push('link');

  // Engagement: <span class="tweet-stat">...N</span>
  const stats = extractEngagement(block);

  // Retweet/reply detection
  const isContinuation =
    /class="replying-to"/.test(block) || /class="retweet-header"/.test(block);

  return {
    id,
    date,
    text,
    url: `https://x.com/${username}/status/${id}`,
    links,
    hashtags,
    attachments,
    thread_root_id: null, // Nitter doesn't expose this reliably
    is_thread_continuation: isContinuation,
    engagement: stats,
  };
}

function extractLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<a[^>]*href="(https?:\/\/[^"#?][^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function extractHashtags(block: string): string[] {
  const out: string[] = [];
  const re = /<a href="\/search\?q=%23([^"&]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    if (m[1]) out.push(decodeURIComponent(m[1]).toLowerCase());
  }
  return out;
}

function extractAttachments(block: string): string[] {
  const out: string[] = [];
  if (
    /class="attachment image"/.test(block) ||
    /class="still-image"/.test(block)
  ) {
    out.push('image');
  }
  if (
    /class="attachment video-container"/.test(block) ||
    /<video/.test(block)
  ) {
    out.push('video');
  }
  if (/class="attachment gif"/.test(block)) out.push('gif');
  return out;
}

function extractEngagement(block: string): {
  likes: number;
  reposts: number;
  replies: number;
} {
  // Nitter renders stats in <span class="tweet-stat">...NUMBER</span>
  // Document order: replies, retweets, quotes, likes.
  const stats: number[] = [];
  const re = /<span class="tweet-stat">[\s\S]*?<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const inner = m[0];
    const num =
      inner.match(/([\d,]+)\s*<\/div>/) ?? inner.match(/>([\d,]+)</);
    if (num && num[1]) {
      stats.push(parseInt(num[1].replace(/,/g, ''), 10) || 0);
    } else {
      stats.push(0);
    }
  }
  return {
    replies: stats[0] ?? 0,
    reposts: stats[1] ?? 0,
    likes: stats[3] ?? stats[2] ?? 0,
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Parse Nitter date strings like "Apr 15, 2026 . 2:23 PM UTC" -> ISO.
 * Falls back to Date.parse for anything else.
 */
export function parseNitterDate(raw: string): string {
  if (!raw) return new Date(0).toISOString();
  const normalized = raw.replace(/[\u00B7\u2022]/g, '').replace(/\s+/g, ' ').trim();
  const ts = Date.parse(normalized);
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  return new Date(0).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
