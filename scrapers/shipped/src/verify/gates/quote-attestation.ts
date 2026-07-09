/**
 * Quote attestation gate.
 *
 * For each quote claim with attribution `> "..." -- Name, Org`:
 *   1. Fetch the source URL associated with the quote's section.
 *   2. Fuzzy-match the quote text against the source's plain text.
 *   3. Pass if word-overlap >= 80%, else fail.
 *
 * Sources are cached across the verification run via `options.sourceCache`.
 */

import { fetchSource } from "../http.js";
import type { Claim, Source, VerifyOptions, VerifyResult } from "../types.js";
import { DEFAULT_VERIFY_OPTIONS } from "../types.js";

const GATE_NAME = "quote-attestation";
const OVERLAP_THRESHOLD = 0.8;

export async function runQuoteAttestation(
  claims: Claim[],
  options: VerifyOptions = {},
): Promise<VerifyResult[]> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };
  const cache = options.sourceCache ?? new Map<string, Source>();

  const quoteClaims = claims.filter((c) => c.kind === "quote");
  const results: VerifyResult[] = [];

  for (const claim of quoteClaims) {
    const candidates = candidateUrls(claim);
    if (candidates.length === 0) {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "warn",
        details: `No candidate source URL near quote "${truncate(claim.text)}"`,
        claim,
      });
      continue;
    }

    let bestScore = 0;
    let bestUrl: string | null = null;
    let lastErr: string | null = null;

    for (const url of candidates) {
      let source = cache.get(url);
      if (!source) {
        try {
          source = await fetchSource(url, opts.timeoutMs);
          cache.set(url, source);
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          continue;
        }
      }

      if (source.status >= 400) {
        lastErr = `source returned HTTP ${source.status}`;
        continue;
      }

      const score = wordOverlap(claim.text, source.text);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
      if (bestScore >= OVERLAP_THRESHOLD) break;
    }

    if (bestScore >= OVERLAP_THRESHOLD) {
      results.push({
        passed: true,
        gate: GATE_NAME,
        severity: "info",
        details: `Quote "${truncate(claim.text)}" attested in ${bestUrl} (overlap ${(bestScore * 100).toFixed(0)}%)`,
        claim,
      });
    } else {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "fail",
        details: `Quote "${truncate(claim.text)}" not attested. Best overlap: ${(bestScore * 100).toFixed(0)}% in ${bestUrl ?? "n/a"}${
          lastErr ? ` (last error: ${lastErr})` : ""
        }`,
        claim,
      });
    }
  }

  return results;
}

// ------------------------------------------------------------------ helpers

function candidateUrls(claim: Claim): string[] {
  const urls: string[] = [];
  if (claim.sourceUrl) urls.push(claim.sourceUrl);
  const meta = (claim.meta?.candidateUrls as string[] | undefined) ?? [];
  for (const u of meta) if (!urls.includes(u)) urls.push(u);
  return urls;
}

/**
 * Word-overlap score: fraction of distinct content words from the quote
 * that appear in the source text.
 */
export function wordOverlap(quote: string, source: string): number {
  const quoteWords = tokenize(quote).filter((w) => !STOPWORDS.has(w));
  if (quoteWords.length === 0) return 0;

  const sourceTokenSet = new Set(tokenize(source));
  let hits = 0;
  for (const w of quoteWords) if (sourceTokenSet.has(w)) hits += 1;
  return hits / quoteWords.length;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function truncate(s: string, n = 60): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "and", "or", "but",
  "it", "its", "this", "that", "these", "those", "as", "from", "into",
  "we", "you", "they", "i", "he", "she", "him", "her", "them", "us",
  "do", "does", "did", "have", "has", "had", "not", "no", "yes",
  "so", "if", "than", "then", "there", "here", "what", "which",
  "our", "your", "their", "his", "hers",
]);
