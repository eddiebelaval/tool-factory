/**
 * Shared HTTP utilities for verification gates.
 * Uses Node 20+ built-in fetch + AbortController.
 *
 * All requests go through `fetchWithTimeout`. All gates share `runWithConcurrency`
 * for parallelism with a hard cap (default 8).
 */

import type { Source } from "./types.js";

export interface FetchOptions {
  method?: "HEAD" | "GET";
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchWithTimeout(
  url: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 10_000);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "user-agent": "shipped-verify/0.1 (+id8labs.com)",
        accept: "text/html,application/xhtml+xml,application/json,*/*",
        ...opts.headers,
      },
      signal: ac.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL and return a Source: status, html (if text), text (HTML stripped).
 * Returns a Source even on 4xx/5xx — gates decide what to do with the status.
 * Throws only on transport errors (DNS failure, abort, network down).
 */
export async function fetchSource(
  url: string,
  timeoutMs = 10_000,
): Promise<Source> {
  const res = await fetchWithTimeout(url, { method: "GET", timeoutMs });
  const ct = res.headers.get("content-type") ?? "";
  let html: string | undefined;
  let text = "";
  if (ct.includes("text/") || ct.includes("json") || ct.includes("xml") || ct === "") {
    html = await res.text();
    text = htmlToText(html);
  }
  return {
    url,
    status: res.status,
    html,
    text,
    fetchedAt: Date.now(),
  };
}

/**
 * Strip HTML to plain text. Naive but sufficient for substring checks.
 *  - drops <script>/<style> blocks
 *  - drops all tags
 *  - decodes a handful of common entities
 *  - collapses whitespace
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Run async tasks with bounded concurrency. */
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = 8,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i] as T;
      out[i] = await worker(item, i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return out;
}

export function shouldSkipHost(url: string, skipHosts: string[]): boolean {
  try {
    const host = new URL(url).hostname;
    return skipHosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return true; // malformed URL — skip rather than crash
  }
}
