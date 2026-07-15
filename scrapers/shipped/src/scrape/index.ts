/**
 * Main orchestrator for the @claudedevs scraper.
 *
 * Strategy:
 *   1. Try X API first (if X_API_BEARER_TOKEN is present).
 *   2. Fall back to Nitter.
 *   3. If both fail, return an empty result with `failureReason` set --
 *      the caller (/shipped) decides whether that's tolerable.
 *
 * Always writes output via `output.ts`. Logs progress to stdout.
 */

import { NitterClient } from './nitter.js';
import { writeScrapeResult } from './output.js';
import {
  DEFAULT_SCRAPE_OPTIONS,
  type ScrapeOptions,
  type ScrapeResult,
} from './types.js';
import { MissingTokenError, XApiClient, XApiError } from './x-api.js';

export interface ScrapeRunOptions extends Partial<ScrapeOptions> {
  /** If true, do not write output files. Useful for `--dry`. */
  dry?: boolean;
  /** Override fetch (used for tests). */
  fetchImpl?: typeof fetch;
  /** Override the X API token (defaults to env). */
  xApiToken?: string;
  /** Inter-request delay overrides for tests. */
  delayMs?: number;
}

export type ScrapeRunResult = ScrapeResult & {
  /** Absolute path of the output file written, or null if `dry`. */
  outputPath: string | null;
};

export async function scrapeClaudedevs(
  options: ScrapeRunOptions = {},
): Promise<ScrapeRunResult> {
  const opts: ScrapeOptions = {
    username: options.username ?? DEFAULT_SCRAPE_OPTIONS.username,
    sinceDays: options.sinceDays ?? DEFAULT_SCRAPE_OPTIONS.sinceDays,
    includeReplies:
      options.includeReplies ?? DEFAULT_SCRAPE_OPTIONS.includeReplies,
    includeRetweets:
      options.includeRetweets ?? DEFAULT_SCRAPE_OPTIONS.includeRetweets,
  };

  const scrapedAt = new Date().toISOString();
  const result: ScrapeResult = {
    tweets: [],
    scrapedAt,
    source: 'cached',
  };
  const failures: string[] = [];

  // ----- 1. Try X API -----
  const tokenAvailable = Boolean(
    options.xApiToken ?? process.env['X_API_BEARER_TOKEN'],
  );
  if (tokenAvailable) {
    try {
      log(`[scrape] Attempting X API for @${opts.username} (last ${opts.sinceDays}d)`);
      const xClientOpts: ConstructorParameters<typeof XApiClient>[0] = {};
      if (options.xApiToken !== undefined) xClientOpts.token = options.xApiToken;
      if (options.fetchImpl !== undefined) xClientOpts.fetchImpl = options.fetchImpl;
      if (options.delayMs !== undefined) xClientOpts.delayMs = options.delayMs;
      const xClient = new XApiClient(xClientOpts);
      const userId = await xClient.resolveUserId(opts.username);
      const tweets = await xClient.fetchTimeline(userId, opts);
      result.tweets = tweets;
      result.source = 'x-api';
      log(`[scrape] X API success: ${tweets.length} tweets`);
    } catch (err) {
      const reason = describeError(err);
      log(`[scrape] X API failed: ${reason}`);
      failures.push(`x-api: ${reason}`);
    }
  } else {
    log('[scrape] X_API_BEARER_TOKEN not set; skipping X API');
    failures.push('x-api: token missing');
  }

  // ----- 2. Fall back to Nitter -----
  if (result.source !== 'x-api') {
    try {
      log(`[scrape] Attempting Nitter fallback for @${opts.username}`);
      const nitterOpts: ConstructorParameters<typeof NitterClient>[0] = {};
      if (options.fetchImpl !== undefined) nitterOpts.fetchImpl = options.fetchImpl;
      if (options.delayMs !== undefined) nitterOpts.delayMs = options.delayMs;
      const nitter = new NitterClient(nitterOpts);
      const tweets = await nitter.fetchTimeline(opts);
      if (tweets.length > 0) {
        result.tweets = tweets;
        result.source = 'nitter';
        log(`[scrape] Nitter success: ${tweets.length} tweets`);
      } else {
        log('[scrape] Nitter returned 0 tweets');
        failures.push('nitter: empty result');
      }
    } catch (err) {
      const reason = describeError(err);
      log(`[scrape] Nitter failed: ${reason}`);
      failures.push(`nitter: ${reason}`);
    }
  }

  // ----- 3. Failure path -----
  if (result.tweets.length === 0 && result.source === 'cached') {
    result.failureReason =
      failures.length > 0
        ? `All sources failed: ${failures.join('; ')}`
        : 'All sources returned no tweets';
  }

  // ----- 4. Write output -----
  let outputPath: string | null = null;
  if (!options.dry) {
    try {
      outputPath = await writeScrapeResult(result);
      log(`[scrape] Wrote ${outputPath}`);
    } catch (err) {
      log(`[scrape] Failed to write output: ${describeError(err)}`);
    }
  } else {
    log('[scrape] --dry: skipping output write');
  }

  return { ...result, outputPath };
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function describeError(err: unknown): string {
  if (err instanceof MissingTokenError) return 'token missing';
  if (err instanceof XApiError) {
    return `X API error ${err.status}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// Re-exports for convenience.
export type {
  CrossReferenceResult,
  ScrapedTweet,
  ScrapeOptions,
  ScrapeResult,
  TweetEngagement,
  TweetMatch,
} from './types.js';
export {
  crossReferenceTweets,
  parseReleaseLog,
  normalizeUrl,
  extractUrlsFromMarkdown,
  type ReleaseEntry,
  type CrossReferenceOptions,
} from './cross-reference.js';
