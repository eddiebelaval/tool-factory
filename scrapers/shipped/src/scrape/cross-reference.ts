/**
 * Cross-reference scraped tweets against an existing Release Log.
 *
 * The Release Log is a markdown document. Existing entries contain hyperlinks
 * (typically to anthropic.com/news, docs, github, etc). When a scraped tweet
 * shares a URL with one of those entries, the tweet attaches as supporting
 * context. When a tweet's URLs are novel, it's a candidate for a new entry.
 *
 * No fancy NLP -- the URL is the bridge.
 */

import type {
  CrossReferenceResult,
  ScrapedTweet,
  TweetMatch,
} from './types.js';

/**
 * One existing Release Log entry, parsed from the markdown source.
 */
export interface ReleaseEntry {
  /** Stable identifier (heading slug, line range, or hash). Used for `entryId` in matches. */
  id: string;
  /** All URLs found in the entry's body. Compared against tweet links. */
  urls: string[];
}

/**
 * Patterns that suggest a tweet is talking about a "release-y" thing even
 * without a URL. Used for the `context_only` bucket.
 *
 * These are intentionally loose -- editorial decides what to do with them.
 */
const FEATURE_VERSION_PATTERNS: readonly RegExp[] = [
  /\bv?\d+\.\d+(\.\d+)?\b/i,
  /\b(?:opus|sonnet|haiku|claude)\s*\d+(?:\.\d+)?\b/i,
  /\b(?:released|shipping|ships?|now\s+available|launched|rolling\s+out|generally\s+available|ga|beta|alpha|preview)\b/i,
  /\b(?:new|announcing|introducing)\s+(?:feature|tool|model|api|sdk|version)\b/i,
  /\bchangelog\b/i,
];

export interface CrossReferenceOptions {
  /**
   * If true, URL matching is whole-URL strict (after normalization).
   * If false (default), matching also accepts when one URL is a prefix of the other
   * (handles trailing slashes, anchors, query-string variants).
   */
  strictMatch?: boolean;
}

/**
 * Cross-reference scraped tweets against existing Release Log entries.
 */
export function crossReferenceTweets(
  tweets: ScrapedTweet[],
  entries: ReleaseEntry[],
  options: CrossReferenceOptions = {},
): CrossReferenceResult {
  const strict = options.strictMatch ?? false;
  const result: CrossReferenceResult = {
    matched: [],
    novel: [],
    context_only: [],
  };

  // Build an index from normalized URL -> entry id for O(1) lookups.
  const urlIndex = new Map<string, string>();
  for (const entry of entries) {
    for (const u of entry.urls) {
      urlIndex.set(normalizeUrl(u), entry.id);
    }
  }

  for (const tweet of tweets) {
    const tweetMatches: TweetMatch[] = [];

    for (const link of tweet.links) {
      const normalized = normalizeUrl(link);
      const entryId = urlIndex.get(normalized);
      if (entryId !== undefined) {
        tweetMatches.push({ tweet, matchedUrl: link, entryId });
        continue;
      }
      if (!strict) {
        for (const [indexedUrl, id] of urlIndex) {
          if (
            normalized.startsWith(indexedUrl) ||
            indexedUrl.startsWith(normalized)
          ) {
            tweetMatches.push({ tweet, matchedUrl: link, entryId: id });
            break;
          }
        }
      }
    }

    if (tweetMatches.length > 0) {
      result.matched.push(...tweetMatches);
      continue;
    }

    if (tweet.links.length > 0) {
      result.novel.push(tweet);
      continue;
    }

    if (looksLikeReleaseChatter(tweet.text)) {
      result.context_only.push(tweet);
    }
  }

  return result;
}

/**
 * Parse Release Log markdown into entries.
 *
 * Heuristic: each `##`/`###` heading starts a new entry. The entry body is
 * everything until the next heading at the same-or-shallower depth. URLs are
 * extracted from the body via standard markdown link syntax + bare URLs.
 */
export function parseReleaseLog(markdown: string): ReleaseEntry[] {
  const entries: ReleaseEntry[] = [];
  const lines = markdown.split(/\r?\n/);

  let currentTitle: string | null = null;
  let currentBody: string[] = [];
  let entryIndex = 0;

  const flush = () => {
    if (currentTitle === null) return;
    const body = currentBody.join('\n');
    const urls = extractUrlsFromMarkdown(body);
    entries.push({
      id: slugifyHeading(currentTitle, entryIndex),
      urls,
    });
    entryIndex += 1;
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const depth = headingMatch[1].length;
      if (depth <= 3) {
        flush();
        currentTitle = headingMatch[2];
        currentBody = [];
        continue;
      }
    }
    if (currentTitle !== null) {
      currentBody.push(line);
    }
  }
  flush();

  return entries;
}

/**
 * Normalize a URL for comparison: lowercase host, strip trailing slash,
 * strip fragment, drop common tracking params, drop www.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';

    const TRACKING_PREFIXES = ['utm_', 'ref_', 'mc_', 'fbclid', 'gclid'];
    const params = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (TRACKING_PREFIXES.some((p) => k.toLowerCase().startsWith(p))) continue;
      params.append(k, v);
    }
    const query = params.toString();
    return `${u.protocol}//${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Extract all URLs from a markdown body: from `[text](url)`, `<url>`, and bare
 * http(s) URLs in plain text.
 */
export function extractUrlsFromMarkdown(markdown: string): string[] {
  const urls = new Set<string>();

  // Markdown links: [text](url)
  for (const m of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)/g)) {
    if (m[1] && /^https?:/i.test(m[1])) urls.add(m[1]);
  }

  // Angle-bracketed URLs: <url>
  for (const m of markdown.matchAll(/<(https?:\/\/[^>\s]+)>/g)) {
    if (m[1]) urls.add(m[1]);
  }

  // Bare URLs (avoid matching inside markdown link parens)
  for (const m of markdown.matchAll(/(?<![\(<])\bhttps?:\/\/[^\s)<>\]"']+/g)) {
    if (m[0]) urls.add(m[0]);
  }

  return Array.from(urls);
}

function slugifyHeading(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || `entry-${index}`;
}

function looksLikeReleaseChatter(text: string): boolean {
  return FEATURE_VERSION_PATTERNS.some((re) => re.test(text));
}
