/**
 * URL liveness gate.
 *
 * For every unique URL claim:
 *   1. HEAD request (10s timeout, follow redirects).
 *   2. If HEAD returns 405/501 (method not allowed) or any failure, retry with GET.
 *   3. 2xx/3xx => pass. 4xx/5xx => fail. Network/transport error => fail.
 *
 * Concurrency-limited to 8 by default. Skips hosts in the allowlist
 * (localhost, 127.0.0.1, etc).
 */

import { fetchWithTimeout, runWithConcurrency, shouldSkipHost } from "../http.js";
import type { Claim, VerifyResult, VerifyOptions } from "../types.js";
import { DEFAULT_VERIFY_OPTIONS } from "../types.js";

const GATE_NAME = "url-liveness";

export async function runUrlLiveness(
  claims: Claim[],
  options: VerifyOptions = {},
): Promise<VerifyResult[]> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };

  const urlClaims = dedupeByUrl(claims.filter((c) => c.kind === "url"));
  if (urlClaims.length === 0) return [];

  return runWithConcurrency(
    urlClaims,
    (claim) => checkOne(claim, opts.timeoutMs, opts.skipHosts),
    opts.concurrency,
  );
}

async function checkOne(
  claim: Claim,
  timeoutMs: number,
  skipHosts: string[],
): Promise<VerifyResult> {
  const url = claim.sourceUrl ?? claim.text;

  if (shouldSkipHost(url, skipHosts)) {
    return {
      passed: true,
      gate: GATE_NAME,
      severity: "info",
      details: `Skipped (host in skip list): ${url}`,
      claim,
    };
  }

  // Try HEAD first.
  let status: number | null = null;
  let lastErr: unknown = null;
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", timeoutMs });
    status = res.status;
    if (status >= 200 && status < 400) {
      return pass(url, claim, "HEAD", status);
    }
    // Some sites refuse HEAD with 405/501/403; fall through to GET.
  } catch (err) {
    lastErr = err;
  }

  // Fall back to GET.
  try {
    const res = await fetchWithTimeout(url, { method: "GET", timeoutMs });
    status = res.status;
    if (status >= 200 && status < 400) {
      return pass(url, claim, "GET", status);
    }
    return {
      passed: false,
      gate: GATE_NAME,
      severity: "fail",
      details: `Dead link (${status}): ${url}`,
      claim,
    };
  } catch (err) {
    lastErr = err;
  }

  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    passed: false,
    gate: GATE_NAME,
    severity: "fail",
    details: `Transport failure for ${url}${status ? ` (HEAD=${status})` : ""}: ${errMsg}`,
    claim,
  };
}

function pass(url: string, claim: Claim, method: string, status: number): VerifyResult {
  return {
    passed: true,
    gate: GATE_NAME,
    severity: "info",
    details: `${method} ${status}: ${url}`,
    claim,
  };
}

function dedupeByUrl(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const out: Claim[] = [];
  for (const c of claims) {
    const key = c.sourceUrl ?? c.text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
