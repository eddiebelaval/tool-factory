/**
 * X API v2 client for the @claudedevs scraper.
 *
 * Read-only. Uses Node 20+ built-in `fetch`. No SDK dependencies.
 *
 * Endpoints used:
 *   - GET /2/users/by/username/{username}    → resolve user id
 *   - GET /2/users/{id}/tweets               → user timeline
 *
 * Rate limiting: at most 1 request/sec (we run weekly; this is generous).
 *
 * On missing token: throws `MissingTokenError`. Callers should catch this
 * and fall back gracefully — never abort the wider /shipped pipeline.
 */

import type {
  ScrapedTweet,
  ScrapeOptions,
  TweetEngagement,
} from './types.js';

const X_API_BASE = 'https://api.x.com/2';
const REQUEST_DELAY_MS = 1000; // 1 req/sec ceiling

/** Thrown when X_API_BEARER_TOKEN is not set. */
export class MissingTokenError extends Error {
  constructor() {
    super('X_API_BEARER_TOKEN not set in environment');
    this.name = 'MissingTokenError';
  }
}

/** Thrown for auth/rate-limit/permission failures (401/403/429). */
export class XApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'XApiError';
  }
}

/* -------------------------------------------------------------------------- */
/* Raw X API v2 response shapes (only the fields we read)                     */
/* -------------------------------------------------------------------------- */

interface XUserLookupResponse {
  data?: { id: string; username: string; name: string };
  errors?: Array<{ title: string; detail?: string }>;
}

interface XPublicMetrics {
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
}

interface XUrlEntity {
  url: string;
  expanded_url?: string;
  display_url?: string;
}

interface XHashtagEntity {
  tag: string;
}

interface XTweetEntities {
  urls?: XUrlEntity[];
  hashtags?: XHashtagEntity[];
}

interface XReferencedTweet {
  type: 'replied_to' | 'quoted' | 'retweeted';
  id: string;
}

interface XAttachments {
  media_keys?: string[];
}

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: XPublicMetrics;
  entities?: XTweetEntities;
  referenced_tweets?: XReferencedTweet[];
  attachments?: XAttachments;
  in_reply_to_user_id?: string;
}

interface XMediaItem {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
}

interface XMeta {
  result_count?: number;
  next_token?: string;
  newest_id?: string;
  oldest_id?: string;
}

interface XTimelineResponse {
  data?: XTweet[];
  includes?: { media?: XMediaItem[] };
  meta?: XMeta;
  errors?: Array<{ title: string; detail?: string }>;
}

/* -------------------------------------------------------------------------- */
/* Public client                                                              */
/* -------------------------------------------------------------------------- */

export interface XApiClientOptions {
  /** Optional explicit token. Defaults to env X_API_BEARER_TOKEN. */
  token?: string;
  /** Override fetch (used for tests). */
  fetchImpl?: typeof fetch;
  /** Override the inter-request delay in ms (used for tests). */
  delayMs?: number;
}

export class XApiClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private lastRequestAt = 0;

  constructor(options: XApiClientOptions = {}) {
    const token = options.token ?? process.env['X_API_BEARER_TOKEN'];
    if (!token) {
      throw new MissingTokenError();
    }
    this.token = token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.delayMs = options.delayMs ?? REQUEST_DELAY_MS;
  }

  /**
   * Resolve a username (without `@`) to a numeric X user id.
   */
  async resolveUserId(username: string): Promise<string> {
    const url = `${X_API_BASE}/users/by/username/${encodeURIComponent(username)}`;
    const json = await this.requestJson<XUserLookupResponse>(url);
    if (!json.data?.id) {
      throw new XApiError(
        `User @${username} not found (no data.id in response)`,
        404,
        JSON.stringify(json.errors ?? json),
      );
    }
    return json.data.id;
  }

  /**
   * Fetch a user's timeline within the lookback window. Paginates fully.
   * Returns normalized tweets newest-first.
   */
  async fetchTimeline(
    userId: string,
    options: ScrapeOptions,
  ): Promise<ScrapedTweet[]> {
    const startTime = new Date(
      Date.now() - options.sinceDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const exclude: string[] = [];
    if (!options.includeRetweets) exclude.push('retweets');
    if (!options.includeReplies) exclude.push('replies');

    const baseParams = new URLSearchParams({
      'tweet.fields':
        'created_at,public_metrics,entities,referenced_tweets,attachments,in_reply_to_user_id',
      'expansions': 'attachments.media_keys',
      'media.fields': 'type',
      'max_results': '100',
      'start_time': startTime,
    });
    if (exclude.length > 0) baseParams.set('exclude', exclude.join(','));

    const collected: ScrapedTweet[] = [];
    let nextToken: string | undefined;
    // Hard pagination cap to avoid runaway loops on misbehaving APIs.
    const MAX_PAGES = 10;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams(baseParams);
      if (nextToken) params.set('pagination_token', nextToken);

      const url = `${X_API_BASE}/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`;
      const json = await this.requestJson<XTimelineResponse>(url);

      const tweets = json.data ?? [];
      const mediaIndex = buildMediaIndex(json.includes?.media);
      for (const t of tweets) {
        collected.push(normalizeTweet(t, options.username, mediaIndex));
      }

      nextToken = json.meta?.next_token;
      if (!nextToken || tweets.length === 0) break;
    }

    // Newest-first, deduplicated by id.
    const seen = new Set<string>();
    return collected
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  private async requestJson<T>(url: string): Promise<T> {
    await this.throttle();

    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'shipped-pipeline/0.1 (+https://id8labs.app/shipped)',
      },
    });

    if (!res.ok) {
      const body = await safeReadText(res);
      if (res.status === 401) {
        throw new XApiError(
          'X API auth failed (401). Check X_API_BEARER_TOKEN.',
          401,
          body,
        );
      }
      if (res.status === 403) {
        throw new XApiError(
          'X API forbidden (403). Token lacks required scopes or account is restricted.',
          403,
          body,
        );
      }
      if (res.status === 429) {
        throw new XApiError(
          'X API rate limited (429). Retry after the rate-limit window.',
          429,
          body,
        );
      }
      throw new XApiError(
        `X API request failed (${res.status}): ${res.statusText}`,
        res.status,
        body,
      );
    }

    return (await res.json()) as T;
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
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function buildMediaIndex(
  media: XMediaItem[] | undefined,
): Map<string, XMediaItem['type']> {
  const map = new Map<string, XMediaItem['type']>();
  for (const m of media ?? []) {
    map.set(m.media_key, m.type);
  }
  return map;
}

/**
 * Convert one raw X tweet → ScrapedTweet.
 * Exported for tests.
 */
export function normalizeTweet(
  t: XTweet,
  username: string,
  mediaIndex: Map<string, XMediaItem['type']>,
): ScrapedTweet {
  const links: string[] = [];
  for (const u of t.entities?.urls ?? []) {
    const expanded = u.expanded_url ?? u.url;
    // Skip self-links to the tweet itself (X always includes one for media tweets).
    if (
      expanded.includes(`/status/${t.id}`) ||
      expanded.includes(`twitter.com/i/web/status/${t.id}`)
    ) {
      continue;
    }
    links.push(expanded);
  }

  const hashtags = (t.entities?.hashtags ?? []).map((h) => h.tag.toLowerCase());

  const attachments: string[] = [];
  for (const key of t.attachments?.media_keys ?? []) {
    const type = mediaIndex.get(key);
    if (type === 'photo') attachments.push('image');
    else if (type === 'video') attachments.push('video');
    else if (type === 'animated_gif') attachments.push('gif');
  }
  if (attachments.length === 0 && links.length > 0) {
    attachments.push('link');
  }

  let threadRoot: string | null = null;
  let isContinuation = false;
  for (const ref of t.referenced_tweets ?? []) {
    if (ref.type === 'replied_to') {
      threadRoot = ref.id;
      isContinuation = true;
      break;
    }
  }

  const metrics = t.public_metrics ?? {};
  const engagement: TweetEngagement = {
    likes: metrics.like_count ?? 0,
    reposts: metrics.retweet_count ?? 0,
    replies: metrics.reply_count ?? 0,
  };

  return {
    id: t.id,
    date: t.created_at ?? new Date(0).toISOString(),
    text: t.text,
    url: `https://x.com/${username}/status/${t.id}`,
    links,
    hashtags,
    attachments,
    thread_root_id: threadRoot,
    is_thread_continuation: isContinuation,
    engagement,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
