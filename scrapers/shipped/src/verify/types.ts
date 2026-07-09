/**
 * Verification engine types.
 * Every gate consumes Claims, produces VerifyResults, aggregated into a VerifyReport.
 */

export type ClaimKind =
  | "url"
  | "number"
  | "quote"
  | "date"
  | "voice"
  | "formula"
  | "orange-budget";

/**
 * A verifiable assertion extracted from the issue markdown.
 * The "context" carries the surrounding paragraph(s) so attestation gates can find a nearby source link.
 */
export interface Claim {
  /** Stable id for this claim (kind + index + hash slice). Used in report output. */
  id: string;
  kind: ClaimKind;
  /** The literal text of the claim as it appears in the markdown. */
  text: string;
  /** Source URL associated with this claim, when one is identified during extraction. */
  sourceUrl?: string;
  /** Surrounding text used for context (e.g., the paragraph the claim appears in). */
  context?: string;
  /** 1-indexed line number in the markdown source where the claim was found. */
  line?: number;
  /** Optional structured payload — e.g., parsed quote attribution, parsed number magnitude. */
  meta?: Record<string, unknown>;
}

export interface Source {
  url: string;
  /** Plain-text content (HTML stripped) for substring/fuzzy attestation. */
  text: string;
  /** Final HTTP status returned for the URL. */
  status: number;
  /** Raw HTML content if needed for downstream gates. */
  html?: string;
  /** Time the fetch completed. */
  fetchedAt: number;
}

export interface VerifyResult {
  passed: boolean;
  /** Gate name (e.g., "url-liveness", "number-attestation"). */
  gate: string;
  /** Free-form details for human-readable failure messages. */
  details: string;
  /** Severity of the failure. "fail" blocks publish. "warn" surfaces but does not block. "info" is purely informational. */
  severity?: "fail" | "warn" | "info";
  /** The claim being verified, if applicable. */
  claim?: Claim;
}

export interface VerifyReport {
  markdownPath: string;
  startedAt: number;
  finishedAt: number;
  results: VerifyResult[];
  /** Counts per gate: { gateName: { passed, failed, warned } }. */
  byGate: Record<string, { passed: number; failed: number; warned: number }>;
  totalPassed: number;
  totalFailed: number;
  totalWarned: number;
  /** True iff no result has severity "fail" with passed=false. */
  passed: boolean;
  /** Process exit code: 0 if passed, 1 otherwise. */
  exitCode: 0 | 1;
}

export interface VerifyOptions {
  /**
   * Hosts to skip during URL liveness checks. Useful for fragile or rate-limited domains
   * that 403 against HEAD/GET. Default includes localhost.
   */
  skipHosts?: string[];
  /** Concurrency limit for HTTP requests. Default 8. */
  concurrency?: number;
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** If true, skip network gates entirely. Useful for local/offline test runs. */
  offline?: boolean;
  /** If true, skip URL liveness (the gate that gates the others). */
  skipNetworkGates?: boolean;
  /** Optional cache injected by the orchestrator to share fetched sources across gates. */
  sourceCache?: Map<string, Source>;
}

export const DEFAULT_VERIFY_OPTIONS: Required<
  Omit<VerifyOptions, "sourceCache">
> = {
  skipHosts: ["localhost", "127.0.0.1", "0.0.0.0"],
  concurrency: 8,
  timeoutMs: 10_000,
  offline: false,
  skipNetworkGates: false,
};
