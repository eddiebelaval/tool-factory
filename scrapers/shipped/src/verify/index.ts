/**
 * Verification orchestrator.
 *
 * Public API:
 *   runVerification(markdownPath, options?) -> VerifyReport
 *   formatReport(report) -> human-readable string
 *
 * Pipeline:
 *   1. Load markdown via gray-matter (frontmatter stripped from body).
 *   2. Extract claims (extract.ts).
 *   3. Run voice gate (sync, no network).
 *   4. Run URL liveness gate (network -- gates the others).
 *   5. Run number/quote/date attestation gates in parallel, sharing source cache.
 *   6. Aggregate into a VerifyReport.
 */

import { readFile } from "node:fs/promises";
import matter from "gray-matter";

import { extractClaims } from "./extract.js";

/**
 * Resilient frontmatter loader. Uses gray-matter; falls back to naive ---/--- splitting
 * if gray-matter crashes (some valid magazine-style frontmatter contains unescaped colons
 * that strict YAML rejects).
 */
function loadFrontmatter(raw: string): { content: string; data: Record<string, unknown> } {
  try {
    const parsed = matter(raw);
    return { content: parsed.content, data: parsed.data };
  } catch {
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3);
      if (end !== -1) {
        return { content: raw.slice(end + 4), data: {} };
      }
    }
    return { content: raw, data: {} };
  }
}
import { runUrlLiveness } from "./gates/url-liveness.js";
import { runNumberAttestation } from "./gates/number-attestation.js";
import { runQuoteAttestation } from "./gates/quote-attestation.js";
import { runDateAttestation } from "./gates/date-attestation.js";
import { runVoiceGate } from "./gates/voice.js";
import type {
  Source,
  VerifyOptions,
  VerifyReport,
  VerifyResult,
} from "./types.js";

export async function runVerification(
  markdownPath: string,
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  const startedAt = Date.now();
  const raw = await readFile(markdownPath, "utf8");
  const parsed = loadFrontmatter(raw);

  // The voice gate runs against the full markdown (frontmatter stripped internally).
  // The claim extractor uses the body so frontmatter values don't pollute claims.
  const { claims } = extractClaims(parsed.content);
  const sourceCache = options.sourceCache ?? new Map<string, Source>();
  const optsWithCache: VerifyOptions = { ...options, sourceCache };

  const allResults: VerifyResult[] = [];

  // Voice gate -- sync, never blocked.
  allResults.push(...runVoiceGate(raw));

  if (options.offline) {
    return finalizeReport(markdownPath, startedAt, allResults);
  }

  // URL liveness first (gates the attestation work that depends on these URLs being reachable).
  if (!options.skipNetworkGates) {
    const urlResults = await runUrlLiveness(claims, optsWithCache);
    allResults.push(...urlResults);

    // Attestation gates run in parallel; they share the source cache.
    const [numResults, quoteResults, dateResults] = await Promise.all([
      runNumberAttestation(claims, optsWithCache),
      runQuoteAttestation(claims, optsWithCache),
      runDateAttestation(claims, optsWithCache),
    ]);
    allResults.push(...numResults, ...quoteResults, ...dateResults);
  }

  return finalizeReport(markdownPath, startedAt, allResults);
}

// ------------------------------------------------------------------ aggregation

function finalizeReport(
  markdownPath: string,
  startedAt: number,
  results: VerifyResult[],
): VerifyReport {
  const byGate: Record<string, { passed: number; failed: number; warned: number }> = {};
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarned = 0;

  for (const r of results) {
    const bucket = byGate[r.gate] ?? { passed: 0, failed: 0, warned: 0 };
    if (r.passed) {
      bucket.passed += 1;
      totalPassed += 1;
    } else if (r.severity === "warn") {
      bucket.warned += 1;
      totalWarned += 1;
    } else {
      bucket.failed += 1;
      totalFailed += 1;
    }
    byGate[r.gate] = bucket;
  }

  const passed = totalFailed === 0;
  return {
    markdownPath,
    startedAt,
    finishedAt: Date.now(),
    results,
    byGate,
    totalPassed,
    totalFailed,
    totalWarned,
    passed,
    exitCode: passed ? 0 : 1,
  };
}

// ------------------------------------------------------------------ formatting

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

export function formatReport(report: VerifyReport, color = false): string {
  const c = color ? ANSI : Object.fromEntries(Object.keys(ANSI).map((k) => [k, ""]));
  const dur = ((report.finishedAt - report.startedAt) / 1000).toFixed(2);

  const lines: string[] = [];
  lines.push(`${c.bold}Shipped. Verification Report${c.reset}`);
  lines.push(`  file:     ${report.markdownPath}`);
  lines.push(`  duration: ${dur}s`);
  lines.push("");

  // Per-gate summary
  lines.push(`${c.bold}Per-gate results:${c.reset}`);
  for (const [gate, counts] of Object.entries(report.byGate)) {
    const failColor = counts.failed > 0 ? c.red : c.dim;
    const warnColor = counts.warned > 0 ? c.yellow : c.dim;
    lines.push(
      `  ${gate.padEnd(22)} ${c.green}pass=${counts.passed}${c.reset}  ` +
        `${warnColor}warn=${counts.warned}${c.reset}  ` +
        `${failColor}fail=${counts.failed}${c.reset}`,
    );
  }
  lines.push("");

  // Failures and warnings, in order
  const failuresAndWarns = report.results.filter(
    (r) => !r.passed && (r.severity === "fail" || r.severity === "warn"),
  );
  if (failuresAndWarns.length > 0) {
    lines.push(`${c.bold}Issues:${c.reset}`);
    for (const r of failuresAndWarns) {
      const prefix =
        r.severity === "fail"
          ? `${c.red}FAIL${c.reset}`
          : `${c.yellow}WARN${c.reset}`;
      const at = r.claim?.line ? ` (L${r.claim.line})` : "";
      lines.push(`  ${prefix} [${r.gate}]${at}  ${r.details}`);
    }
    lines.push("");
  }

  const verdictColor = report.passed ? c.green : c.red;
  const verdict = report.passed ? "PASS" : "FAIL";
  lines.push(
    `${c.bold}Verdict:${c.reset} ${verdictColor}${verdict}${c.reset}  ` +
      `(passed=${report.totalPassed} warned=${report.totalWarned} failed=${report.totalFailed})`,
  );

  return lines.join("\n");
}

export type {
  VerifyReport,
  VerifyResult,
  VerifyOptions,
  Source,
} from "./types.js";
export { extractClaims } from "./extract.js";
