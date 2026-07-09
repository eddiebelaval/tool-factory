/**
 * Date attestation gate.
 *
 * For each "shipped on YYYY-MM-DD" / "Date: YYYY-MM-DD" / "released on YYYY-MM-DD" claim:
 *   1. Fetch the cited source URL.
 *   2. Confirm the date appears in any common format:
 *        - "YYYY-MM-DD"
 *        - "Month DD, YYYY"        ("April 16, 2026")
 *        - "Mon DD, YYYY"          ("Apr 16, 2026")
 *        - "DD Month YYYY"         ("16 April 2026")
 *        - "Month DD"              ("April 16") -- if same year as claim
 *   3. Pass if any variant matches, else fail.
 */

import { fetchSource } from "../http.js";
import type { Claim, Source, VerifyOptions, VerifyResult } from "../types.js";
import { DEFAULT_VERIFY_OPTIONS } from "../types.js";

const GATE_NAME = "date-attestation";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = MONTHS_FULL.map((m) => m.slice(0, 3));

export async function runDateAttestation(
  claims: Claim[],
  options: VerifyOptions = {},
): Promise<VerifyResult[]> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };
  const cache = options.sourceCache ?? new Map<string, Source>();

  const dateClaims = claims.filter((c) => c.kind === "date");
  const results: VerifyResult[] = [];

  for (const claim of dateClaims) {
    const candidates = candidateUrls(claim);
    if (candidates.length === 0) {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "warn",
        details: `No candidate source URL near date "${claim.text}"`,
        claim,
      });
      continue;
    }

    const variants = dateVariants(claim.text);
    if (variants.length === 0) {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "warn",
        details: `Could not parse date "${claim.text}"`,
        claim,
      });
      continue;
    }

    let matched = false;
    let usedUrl: string | null = null;
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

      const haystack = source.text.toLowerCase();
      if (variants.some((v) => haystack.includes(v.toLowerCase()))) {
        matched = true;
        usedUrl = url;
        break;
      }
    }

    if (matched) {
      results.push({
        passed: true,
        gate: GATE_NAME,
        severity: "info",
        details: `Date "${claim.text}" attested in ${usedUrl}`,
        claim,
      });
    } else {
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "fail",
        details: `Date "${claim.text}" not found in ${candidates.length} source(s)${
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
 * Generate plausible textual representations of an ISO date.
 * Input must be YYYY-MM-DD. Returns variants in common formats.
 */
export function dateVariants(iso: string): string[] {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const dayNum = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11 || !year) return [];

  const monthFull = MONTHS_FULL[monthIdx];
  const monthShort = MONTHS_SHORT[monthIdx];
  const day = String(dayNum);
  const dayPad = String(dayNum).padStart(2, "0");
  if (!monthFull || !monthShort) return [];

  const variants = new Set<string>([
    iso,
    `${monthFull} ${day}, ${year}`,
    `${monthFull} ${dayPad}, ${year}`,
    `${monthShort} ${day}, ${year}`,
    `${monthShort} ${dayPad}, ${year}`,
    `${day} ${monthFull} ${year}`,
    `${day} ${monthShort} ${year}`,
    `${dayPad} ${monthFull} ${year}`,
    `${dayPad} ${monthShort} ${year}`,
    `${monthFull} ${day}`,
    `${monthShort} ${day}`,
    `${year}/${m[2]}/${m[3]}`,
    `${m[2]}/${m[3]}/${year}`,
  ]);

  return Array.from(variants);
}
