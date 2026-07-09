/**
 * Type definitions for the Shipped. magazine renderer.
 *
 * Pipeline: markdown source (knowledge/series/shipped/issue-NN.md)
 *           → ParsedIssue (typed AST + sections)
 *           → HTML output (id8labs/public/shipped/NN/index.html)
 */

// ────────────────────────────────────────────────────────────────────
// Frontmatter (YAML at top of issue markdown)
// ────────────────────────────────────────────────────────────────────

export interface IssueFrontmatter {
  /** Issue number, zero-padded in URL paths (00 → "01" issue display). */
  issue: number;
  /** Subtitle / title block ("The Founding Issue — The Shadow Release"). */
  title: string;
  /** Publication date YYYY-MM-DD. */
  date: string;
  /** Coverage period ("2026-03-27 to 2026-04-16"). */
  period: string;
  /** "draft" | "dry-run" | "published". */
  status: string;
  /** Magazine masthead, usually "Shipped." */
  masthead: string;
  /** Cover deck — short hero phrase. Optional; falls back to derived value. */
  deck?: string;
  /** Editorial byline. */
  byline?: string;
  /** "editorial" | "reference" — kind of the front-of-book. */
  fob_content?: string;
  /** "editorial" | "reference" — kind of the release log. */
  log_content?: string;
}

// ────────────────────────────────────────────────────────────────────
// Sections
// ────────────────────────────────────────────────────────────────────

/**
 * Section "kind" — used to dispatch to the right renderer.
 * Front-of-book (editorial prose) and back-of-book (release log) use
 * different section types.
 */
export type SectionKind =
  | 'open'
  | 'in_this_issue'
  | 'by_the_numbers'
  | 'lead_story'
  | 'companion_lead'
  | 'feature'
  | 'investigation'
  | 'timeline'
  | 'survey'
  | 'cowork'
  | 'papers'
  | 'term_of_issue'
  | 'quiet_on_wire'
  | 'close'
  | 'release_log_intro'
  | 'release_log_category'
  | 'bibliography'
  | 'colophon'
  | 'unknown';

export interface Section {
  /** Original H2 heading text. */
  name: string;
  /** Inferred kind. */
  kind: SectionKind;
  /** Raw markdown content (everything between this H2 and the next). */
  content: string;
  /** Optional pre-parsed structured data. */
  data?: ChartData | ReleaseLogCategory | TermOfIssue | unknown;
}

// ────────────────────────────────────────────────────────────────────
// Charts
// ────────────────────────────────────────────────────────────────────

export interface BarData {
  label: string;
  /** Numeric score, e.g. 87.6 */
  score: number;
  /** Display value, e.g. "87.6%" */
  display: string;
  /** Optional tag, shown after label ("Today", "Frontier · Gated"). */
  tag?: string;
  /** True for the orange "frontier" bar (Mythos). */
  isFrontier?: boolean;
}

export interface RatioData {
  smallLabel: string;
  smallValue: number;
  smallNote: string;
  bigLabel: string;
  bigValue: number;
  bigNote: string;
  caption: string;
  ratio: string; // "90×"
  source: string;
  fig: string; // "Fig. 02"
}

export interface SweepRow {
  benchmark: string;
  benchmarkNote?: string;
  /** Map of column name → cell value (raw string, e.g. "87.6%" or "—"). */
  scores: Record<string, string>;
  /** Optional winner annotations: column → annotation ("+12", "+44"). */
  annotations?: Record<string, string>;
  /** Optional bold/highlight: column → "winner" | "frontier". */
  highlight?: Record<string, 'winner' | 'frontier'>;
}

export interface SweepTable {
  columns: string[]; // ["Opus 4.6", "Opus 4.7", ...]
  rows: SweepRow[];
}

export type ChartData =
  | { kind: 'five_bar'; title: string; subtitle?: string; bars: BarData[]; caption: string; source: string }
  | { kind: 'ratio'; data: RatioData }
  | { kind: 'sweep_table'; data: SweepTable };

// ────────────────────────────────────────────────────────────────────
// Release Log
// ────────────────────────────────────────────────────────────────────

export interface ReleaseLogEntry {
  /** YYYY-MM-DD or partial like "2026-03". */
  date: string;
  title: string;
  /** Primary URL (the linked title in the markdown). */
  url?: string;
  /** Tag from the markdown ([MODEL], [API], [CODE], …) — uppercase. */
  category: string;
  /** Body text (markdown, normalized). */
  summary: string;
  /** "How to use" block (markdown). Optional. */
  howToUse?: string;
  /** "Why it matters" block (markdown). Optional. */
  whyItMatters?: string;
  /** Optional code block (e.g. python snippet). */
  code?: { language: string; content: string };
}

export interface ReleaseLogCategory {
  /** Category letter (A, B, C, …) */
  letter: string;
  /** Category display name ("Models", "API & Platform", …). */
  name: string;
  /** Optional sub-label ("Python — claude-agent-sdk"). */
  subLabel?: string;
  /** Optional editorial deck under the section header. */
  deck?: string;
  entries: ReleaseLogEntry[];
}

// ────────────────────────────────────────────────────────────────────
// Term of the Issue
// ────────────────────────────────────────────────────────────────────

export interface TermOfIssue {
  word: string;
  pronunciation?: string;
  partOfSpeech?: string;
  /** Definition paragraphs (markdown). */
  definition: string[];
  firstObservable?: string;
  usage?: string;
}

// ────────────────────────────────────────────────────────────────────
// Parsed Issue
// ────────────────────────────────────────────────────────────────────

export interface ParsedIssue {
  frontmatter: IssueFrontmatter;
  /** All sections in document order. */
  sections: Section[];
  /** Convenient accessors built from sections. */
  releaseLog: ReleaseLogCategory[];
  /** Top-level word count for the front-of-book prose. */
  wordCount: number;
  /** Source markdown path (absolute). */
  sourcePath: string;
}

// ────────────────────────────────────────────────────────────────────
// Render options + result
// ────────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Where to write the issue HTML. Default: ../../id8labs/public/shipped/NN/index.html */
  outputPath?: string;
  /** Where the archive page lives. Default: ../../id8labs/public/shipped/index.html */
  archivePath?: string;
  /** Override the deploy root (defaults from env: SHIPPED_DEPLOY_PATH). */
  deployRoot?: string;
  /** When true, only write to /tmp for diffing; do not touch deploy paths. */
  dryRun?: boolean;
  /** Extra path written for diffing in CI/dry-run. */
  scratchPath?: string;
}

export interface RenderResult {
  outputPath: string;
  archivePath: string;
  wordCount: number;
  sectionCount: number;
  releaseLogEntryCount: number;
  /** When dryRun is true, this is the scratch file. */
  scratchPath?: string;
}

// ────────────────────────────────────────────────────────────────────
// Archive entry
// ────────────────────────────────────────────────────────────────────

export interface ArchiveCard {
  issueNum: string; // "01"
  href: string; // "/shipped/01/"
  headline: string; // The Lead title (with em → orange)
  blurb: string;
  date: string; // "Apr 17, 2026"
  label: string; // "Founding Issue"
  topics: string[];
}
