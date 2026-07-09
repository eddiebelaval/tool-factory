/**
 * Number attestation gate.
 *
 * For each number claim with a candidate source URL:
 *   1. Fetch the source (GET, text body).
 *   2. Strip HTML to plain text.
 *   3. Search for the number using a tolerant matcher.
 *   4. Pass if any candidate URL contains a match. Soft-warn if no exact match
 *      but a value within 5% is present.
 *
 * Sources are cached across the verification run via `options.sourceCache`.
 */

import { fetchSource } from "../http.js";
import type { Claim, Source, VerifyOptions, VerifyResult } from "../types.js";
import { DEFAULT_VERIFY_OPTIONS } from "../types.js";

const GATE_NAME = "number-attestation";

export async function runNumberAttestation(
  claims: Claim[],
  options: VerifyOptions = {},
): Promise<VerifyResult[]> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };
  const cache = options.sourceCache ?? new Map<string, Source>();

  const numClaims = claims.filter((c) => c.kind === "number");
  const results: VerifyResult[] = [];

  for (const claim of numClaims) {
    const candidates = candidateUrls(claim);
    if (candidates.length === 0) {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "warn",
        details: `No candidate source URL near number claim "${claim.text}"`,
        claim,
      });
      continue;
    }

    const variants = numberVariants(claim.text);
    let matched = false;
    let nearMiss = false;
    let lastErr: string | null = null;
    let usedUrl: string | null = null;

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

      const haystack = source.text.toLowerCase();
      if (variants.some((v) => haystack.includes(v.toLowerCase()))) {
        matched = true;
        usedUrl = url;
        break;
      }
      if (!nearMiss && hasNearValue(haystack, claim.text)) nearMiss = true;
    }

    if (matched) {
      results.push({
        passed: true,
        gate: GATE_NAME,
        severity: "info",
        details: `"${claim.text}" attested in ${usedUrl}`,
        claim,
      });
    } else if (nearMiss) {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "warn",
        details: `"${claim.text}" not exact-match in source(s); a value within ~5% is present. Verify manually.`,
        claim,
      });
    } else {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "fail",
        details: `"${claim.text}" not found in ${candidates.length} source(s)${
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
 * Generate plausible textual representations of a number claim.
 * "$100M" -> ["$100M", "$100 million", "100 million", "100M"]
 * "87.6%" -> ["87.6%", "87.6 %", "87.6 percent"]
 * "3x"    -> ["3x", "3×", "three times", "3 times"]
 */
export function numberVariants(raw: string): string[] {
  const out = new Set<string>([raw]);

  // Percentages
  const pct = raw.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) {
    const n = pct[1];
    out.add(`${n}%`);
    out.add(`${n} %`);
    out.add(`${n} percent`);
  }

  // Dollars with magnitude (K/M/B)
  const dollarMag = raw.match(/^\$(\d+(?:\.\d+)?)([KMB])$/i);
  if (dollarMag) {
    const n = dollarMag[1];
    const mag = (dollarMag[2] ?? "").toUpperCase();
    const word = mag === "K" ? "thousand" : mag === "M" ? "million" : "billion";
    out.add(`$${n}${mag}`);
    out.add(`$${n} ${word}`);
    out.add(`${n} ${word}`);
    out.add(`${n}${mag}`);
    out.add(`$${n}.0${mag}`);
  }

  // Bare dollars
  const dollarPlain = raw.match(/^\$(\d+(?:[\.,]\d+)?)$/);
  if (dollarPlain) {
    const n = dollarPlain[1] ?? "";
    out.add(`$${n}`);
    out.add(`${n} dollars`);
  }

  // Multipliers (3x or 3×)
  const mult = raw.match(/^(\d+(?:\.\d+)?)[x×]$/i);
  if (mult) {
    const n = mult[1];
    out.add(`${n}x`);
    out.add(`${n}×`);
    out.add(`${n} times`);
  }

  // Counts with K/M/B suffix (no $)
  const countMag = raw.match(/^(\d+(?:\.\d+)?)([KMB])$/i);
  if (countMag && !raw.startsWith("$")) {
    const n = countMag[1];
    const mag = (countMag[2] ?? "").toUpperCase();
    const word = mag === "K" ? "thousand" : mag === "M" ? "million" : "billion";
    out.add(`${n}${mag}`);
    out.add(`${n} ${word}`);
  }

  // Plain integers/decimals: also try with thousands separators
  const plain = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plain) {
    const n = Number(plain[1]);
    if (!Number.isNaN(n) && n >= 1000) {
      out.add(n.toLocaleString("en-US"));
    }
  }

  return Array.from(out);
}

function hasNearValue(haystack: string, raw: string): boolean {
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m || !m[1]) return false;
  const target = Number(m[1]);
  if (!Number.isFinite(target) || target === 0) return false;

  const re = /(\d+(?:\.\d+)?)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(haystack)) !== null) {
    const v = Number(mm[1]);
    if (!Number.isFinite(v)) continue;
    const diff = Math.abs(v - target) / target;
    if (diff > 0 && diff <= 0.05) return true;
  }
  return false;
}
