/**
 * Markdown to ParsedIssue.
 *
 * Strategy:
 *   1. gray-matter splits frontmatter from body.
 *   2. Split body into "sections" by H2 headers.
 *   3. Each section is classified by name + content into a SectionKind.
 *   4. Release Log categories ("## A. Models", etc.) are deeply parsed
 *      into ReleaseLogEntry[] so the renderer can emit per-entry markup.
 *   5. The SWE-bench bar chart, the Firefox ratio, and the cross-benchmark
 *      sweep table are extracted from their markdown blocks into typed data.
 */

import matter from 'gray-matter';
import type {
  BarData,
  ChartData,
  IssueFrontmatter,
  ParsedIssue,
  ReleaseLogCategory,
  ReleaseLogEntry,
  Section,
  SectionKind,
  SweepRow,
  TermOfIssue,
} from './types.js';

// ────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────

export function parseIssue(markdown: string, sourcePath: string): ParsedIssue {
  // Pre-process: auto-quote unquoted values that contain ": " (lenient YAML).
  const safeMarkdown = quoteRiskyFrontmatterValues(markdown);
  const parsed = matter(safeMarkdown);
  const frontmatter = normalizeFrontmatter(parsed.data);
  const body = parsed.content;

  const rawSections = splitSectionsByH2(body);
  const sections: Section[] = rawSections.map(classifySection);

  const releaseLog = collectReleaseLog(sections);
  const wordCount = countFobWords(sections);

  return { frontmatter, sections, releaseLog, wordCount, sourcePath };
}

// ────────────────────────────────────────────────────────────────────
// Frontmatter
// ────────────────────────────────────────────────────────────────────

/**
 * gray-matter is strict YAML. Magazine frontmatter often contains values
 * with colons ("Plus: the model you can't have"). We wrap those values
 * in double-quotes if they aren't already quoted.
 */
function quoteRiskyFrontmatterValues(markdown: string): string {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return markdown;
  const orig = fmMatch[1]!;
  const fixed = orig
    .split('\n')
    .map((line) => {
      const m = line.match(/^([a-zA-Z_][\w-]*):\s+(.*)$/);
      if (!m) return line;
      const key = m[1]!;
      const raw = m[2]!.trim();
      // Already quoted, list, or numeric
      if (
        raw.startsWith('"') ||
        raw.startsWith("'") ||
        raw.startsWith('[') ||
        raw.startsWith('{') ||
        raw === '' ||
        /^-?\d+(\.\d+)?$/.test(raw)
      ) {
        return line;
      }
      // Has dangerous YAML special chars?
      if (raw.includes(': ') || raw.includes(' #') || /^[*&!|>]/.test(raw)) {
        const escaped = raw.replace(/"/g, '\\"');
        return `${key}: "${escaped}"`;
      }
      return line;
    })
    .join('\n');
  return markdown.replace(orig, fixed);
}


function normalizeFrontmatter(data: Record<string, unknown>): IssueFrontmatter {
  const fm = data as Partial<IssueFrontmatter>;
  if (typeof fm.issue !== 'number' && typeof fm.issue !== 'string') {
    throw new Error('Frontmatter missing required field "issue".');
  }
  if (!fm.title) throw new Error('Frontmatter missing required field "title".');
  if (!fm.date) throw new Error('Frontmatter missing required field "date".');

  return {
    issue: Number(fm.issue),
    title: String(fm.title),
    date: normalizeDate(fm.date),
    period: typeof fm.period === 'string' ? fm.period : normalizePeriod(fm.period),
    status: String(fm.status ?? 'draft'),
    masthead: String(fm.masthead ?? 'Shipped.'),
    deck: fm.deck ? String(fm.deck) : undefined,
    byline: fm.byline ? String(fm.byline) : undefined,
    fob_content: fm.fob_content ? String(fm.fob_content) : undefined,
    log_content: fm.log_content ? String(fm.log_content) : undefined,
  };
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    // Use UTC parts to avoid timezone shifting back a day.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // Try parse
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return normalizeDate(parsed);
    return value;
  }
  throw new Error(`Frontmatter date is not a string or Date: ${typeof value}`);
}

function normalizePeriod(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  // YAML may parse "2026-03-27 to 2026-04-16" as a Date if it begins with one.
  if (value instanceof Date) return normalizeDate(value);
  return String(value);
}

// ────────────────────────────────────────────────────────────────────
// Section splitting
// ────────────────────────────────────────────────────────────────────

interface RawSection {
  name: string;
  content: string;
}

function splitSectionsByH2(body: string): RawSection[] {
  const lines = body.split('\n');
  const sections: RawSection[] = [];
  let current: RawSection | null = null;

  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('### ') && !line.startsWith('#### ')) {
      if (current) sections.push(current);
      current = { name: m[1]!.trim(), content: '' };
    } else if (current) {
      current.content += line + '\n';
    }
  }
  if (current) sections.push(current);

  for (const s of sections) {
    s.content = s.content.replace(/\n---\s*\n?$/g, '').trimEnd();
  }
  return sections;
}

// ────────────────────────────────────────────────────────────────────
// Classification
// ────────────────────────────────────────────────────────────────────

const NAME_TO_KIND: Array<[RegExp, SectionKind]> = [
  [/^the open$/i, 'open'],
  [/^in this issue$/i, 'in_this_issue'],
  [/^by the numbers$/i, 'by_the_numbers'],
  [/^the lead story$/i, 'lead_story'],
  [/^companion to the lead$/i, 'companion_lead'],
  [/^feature$/i, 'feature'],
  [/^investigation$/i, 'investigation'],
  [/^timeline$/i, 'timeline'],
  [/^survey$/i, 'survey'],
  [/^cowork shipped/i, 'cowork'],
  [/papers worth/i, 'papers'],
  [/^term of the issue$/i, 'term_of_issue'],
  [/^quiet on the wire$/i, 'quiet_on_wire'],
  [/^the close$/i, 'close'],
  [/^the release log$/i, 'release_log_intro'],
  [/^sources & bibliography$/i, 'bibliography'],
  [/^colophon$/i, 'colophon'],
];

const RELEASE_LOG_HEADER_RE = /^([A-G])\.\s+(.+)$/;

function classifySection(raw: RawSection): Section {
  const logMatch = RELEASE_LOG_HEADER_RE.exec(raw.name);
  if (logMatch) {
    const category = parseReleaseLogCategory(logMatch[1]!, logMatch[2]!.trim(), raw.content);
    return {
      name: raw.name,
      kind: 'release_log_category',
      content: raw.content,
      data: category,
    };
  }

  let kind: SectionKind = 'unknown';
  for (const [re, k] of NAME_TO_KIND) {
    if (re.test(raw.name)) {
      kind = k;
      break;
    }
  }

  let data: unknown = undefined;
  if (kind === 'term_of_issue') {
    data = parseTermOfIssue(raw.content);
  }

  return { name: raw.name, kind, content: raw.content, data };
}

// ────────────────────────────────────────────────────────────────────
// Release log parser
// ────────────────────────────────────────────────────────────────────

const ENTRY_HEADER_RE = /^####\s+(.+?)\s*$/;
const ENTRY_DATE_TITLE_RE = /^(\d{4}-\d{2}(?:-\d{2})?)\s*[—–-]\s*(.+?)(?:\s+\(\[([^\]]+)\]\(([^)]+)\)\))?\s*$/;
const ENTRY_TAG_RE = /^`\[([A-Z-]+)\]`\s*$/;
const SUB_HEADER_RE = /^###\s+(.+?)\s*$/;

function parseReleaseLogCategory(
  letter: string,
  fullName: string,
  content: string,
): ReleaseLogCategory {
  const lines = content.split('\n');
  let i = 0;
  let deck: string | undefined;

  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (i < lines.length && /^\*[^*]/.test(lines[i]!)) {
    const deckLine = lines[i]!.trim();
    if (deckLine.endsWith('*')) {
      deck = deckLine.slice(1, -1).trim();
      i++;
    }
  }

  const entries: ReleaseLogEntry[] = [];
  let activeSubLabel: string | undefined;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      i++;
      continue;
    }

    const sub = SUB_HEADER_RE.exec(line);
    if (sub) {
      activeSubLabel = sub[1]!.trim();
      i++;
      continue;
    }

    const head = ENTRY_HEADER_RE.exec(line);
    if (head) {
      const { entry, consumed } = parseReleaseLogEntry(lines, i, activeSubLabel);
      if (entry) entries.push(entry);
      i += consumed;
      continue;
    }

    i++;
  }

  return { letter, name: fullName, deck, entries };
}

function parseReleaseLogEntry(
  lines: string[],
  start: number,
  subLabel?: string,
): { entry: ReleaseLogEntry | null; consumed: number } {
  const headerLine = lines[start]!;
  const header = ENTRY_HEADER_RE.exec(headerLine);
  if (!header) return { entry: null, consumed: 1 };

  const headerText = header[1]!;
  const dateTitle = ENTRY_DATE_TITLE_RE.exec(headerText);
  let date = '';
  let title = headerText;
  let url: string | undefined;
  if (dateTitle) {
    date = dateTitle[1]!;
    title = dateTitle[2]!.trim();
    if (dateTitle[4]) url = dateTitle[4];
  }

  let i = start + 1;
  let category = subLabel ?? 'MISC';
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (i < lines.length) {
    const tag = ENTRY_TAG_RE.exec(lines[i]!.trim());
    if (tag) {
      category = tag[1]!;
      i++;
    }
  }

  const body: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    if (ENTRY_HEADER_RE.test(line) || SUB_HEADER_RE.test(line)) break;
    body.push(line);
    i++;
  }

  const bodyText = body.join('\n').trim();
  const { summary, howToUse, whyItMatters, code } = splitEntryBody(bodyText);

  return {
    entry: { date, title, url, category, summary, howToUse, whyItMatters, code },
    consumed: i - start,
  };
}

function splitEntryBody(body: string): {
  summary: string;
  howToUse?: string;
  whyItMatters?: string;
  code?: { language: string; content: string };
} {
  const HOW_RE = /^\*\*How to use:?\*\*\s*/m;
  const WHY_RE = /^\*\*Why it matters:?\*\*\s*/m;

  const howIdx = body.search(HOW_RE);
  const whyIdx = body.search(WHY_RE);

  const cuts: Array<{ at: number; key: 'how' | 'why' }> = [];
  if (howIdx >= 0) cuts.push({ at: howIdx, key: 'how' });
  if (whyIdx >= 0) cuts.push({ at: whyIdx, key: 'why' });
  cuts.sort((a, b) => a.at - b.at);

  let summaryEnd = body.length;
  if (cuts.length > 0) summaryEnd = cuts[0]!.at;

  const summary = body.slice(0, summaryEnd).trim();

  let howToUse: string | undefined;
  let whyItMatters: string | undefined;
  let code: { language: string; content: string } | undefined;

  for (let k = 0; k < cuts.length; k++) {
    const cut = cuts[k]!;
    const next = cuts[k + 1];
    const slice = body.slice(cut.at, next ? next.at : body.length);
    const value = slice.replace(cut.key === 'how' ? HOW_RE : WHY_RE, '').trim();

    if (cut.key === 'how') {
      const codeMatch = /^```(\w*)\n([\s\S]*?)\n```\n?/.exec(value);
      if (codeMatch) {
        code = { language: codeMatch[1] || 'python', content: codeMatch[2]! };
        howToUse = value.slice(codeMatch[0].length).trim();
      } else {
        howToUse = value;
      }
    } else {
      whyItMatters = value;
    }
  }

  return { summary, howToUse, whyItMatters, code };
}

// ────────────────────────────────────────────────────────────────────
// Term of the Issue parser
// ────────────────────────────────────────────────────────────────────

function parseTermOfIssue(content: string): TermOfIssue {
  const lines = content
    .split('\n')
    .map((l) => l.replace(/^\s*>\s?/, ''))
    .filter((l) => l !== '');

  let word = 'shadow release';
  let pronunciation: string | undefined;
  let partOfSpeech: string | undefined;
  const definition: string[] = [];
  let firstObservable: string | undefined;
  let usage: string | undefined;

  for (const line of lines) {
    const head = /^\*\*(.+?)\*\*\s*\/(.+?)\/\s*\*(.+?)\*$/.exec(line);
    if (head) {
      word = head[1]!.trim();
      pronunciation = head[2]!.trim();
      partOfSpeech = head[3]!.trim();
      continue;
    }
    if (/^\*\*First observable/i.test(line)) {
      firstObservable = line.replace(/^\*\*[^*]+\*\*\s*/, '').trim();
      continue;
    }
    if (/^\*\*Usage/i.test(line)) {
      usage = line.replace(/^\*\*[^*]+\*\*\s*/, '').trim();
      continue;
    }
    definition.push(line);
  }

  return { word, pronunciation, partOfSpeech, definition, firstObservable, usage };
}

// ────────────────────────────────────────────────────────────────────
// Chart extraction
// ────────────────────────────────────────────────────────────────────

export function extractFiveBarChart(content: string): ChartData | null {
  const block = extractBlockquoteBlock(content, /CHART\s+—\s+SWE-bench Verified/i);
  if (!block) return null;

  const titleLine = block.find((l) => /^###\s+CHART/.test(l)) ?? '';
  const title = titleLine.replace(/^###\s+CHART\s*—\s*/, '').trim() || 'SWE-bench Verified';

  let subtitle: string | undefined;
  let source = '';
  for (const l of block) {
    if (/^\*[^*]/.test(l) && !subtitle && !/^\*Source:/i.test(l)) {
      subtitle = stripWrappingAsterisks(l);
    } else if (/^\*Source:/i.test(l)) {
      source = stripWrappingAsterisks(l);
    }
  }

  const tableRows = block.filter((l) => l.startsWith('|') && !/^\|\s*[-:]+/.test(l));
  const dataRows = tableRows.slice(1);

  const bars: BarData[] = dataRows
    .map((row) => parseBarRow(row))
    .filter((b): b is BarData => b !== null);

  const caption =
    'The orange bar is the frontier you can read about but cannot call. Opus 4.7 is the floor of what you can buy this week. Mythos is the ceiling of what exists.';

  return { kind: 'five_bar', title, subtitle, bars, caption, source };
}

function parseBarRow(row: string): BarData | null {
  const cells = row.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  if (cells.length < 2) return null;
  const labelCell = cells[0]!;
  const scoreCell = cells[1]!;

  const isFrontier = /Mythos/i.test(labelCell);
  let label = labelCell.replace(/\*\*(.+?)\*\*/g, '$1');
  let tag: string | undefined;
  const tagMatch = /\*\(([^)]+)\)\*/.exec(label);
  if (tagMatch) {
    tag = tagMatch[1]!.trim();
    label = label.replace(tagMatch[0], '').trim();
  }

  const display = scoreCell.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  const score = Number(display.replace(/[^\d.]/g, '')) || 0;

  return { label, score, display, tag, isFrontier };
}

export function extractRatioChart(content: string): ChartData | null {
  const block = extractBlockquoteBlock(content, /CHART\s+—\s+The Firefox Trial/i);
  if (!block) return null;

  const numberMatches = block
    .filter((l) => /\d/.test(l))
    .map((l) => {
      const m = /^\s*(\S.*?)\s*┃\s*[█\s]*\s*(\d+)\s*$/.exec(l);
      if (m) return { label: m[1]!.trim(), value: Number(m[2]!) };
      return null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  if (numberMatches.length < 2) return null;

  const small = numberMatches[0]!;
  const big = numberMatches[1]!;

  const ratioLine = block.find((l) => /\bratio\b/i.test(l)) ?? '';
  const ratioMatch = /\*\*(\d+×)\s+ratio\*\*/.exec(ratioLine);
  const ratio = ratioMatch ? ratioMatch[1]! : `${Math.round(big.value / Math.max(small.value, 1))}×`;

  const captionLine = ratioLine.replace(/^A\s+/, '').replace(/\*\*/g, '');
  const sourceLine = block.find((l) => /^\*Source:/i.test(l)) ?? '';
  const source = stripWrappingAsterisks(sourceLine);

  return {
    kind: 'ratio',
    data: {
      smallLabel: small.label,
      smallValue: small.value,
      smallNote: 'Working exploits across\nseveral hundred attempts',
      bigLabel: big.label,
      bigValue: big.value,
      bigNote: 'Same trial.\nSame browser.',
      caption: captionLine,
      ratio,
      source,
      fig: 'Fig. 02',
    },
  };
}

export function extractSweepTable(content: string): ChartData | null {
  const tableLines = content.split('\n').filter((l) => l.startsWith('|'));
  if (tableLines.length < 3) return null;

  const headerCells = tableLines[0]!
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const columns = headerCells.slice(1).map((c) => c.replace(/\*\*/g, '').trim());

  const dataLines = tableLines.slice(2);
  const rows: SweepRow[] = dataLines.map((line) => {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    const benchmarkCell = cells[0]!;
    const benchMatch = /^\*\*([^*]+)\*\*(?:\s*\*\(([^)]+)\)\*)?/.exec(benchmarkCell);
    const benchmark = benchMatch ? benchMatch[1]!.trim() : benchmarkCell;
    const benchmarkNote = benchMatch && benchMatch[2] ? benchMatch[2].trim() : undefined;

    const scores: Record<string, string> = {};
    const annotations: Record<string, string> = {};
    const highlight: Record<string, 'winner' | 'frontier'> = {};

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]!;
      const raw = cells[c + 1] ?? '—';
      const isFrontier = /🟧/.test(raw);
      const isWinner = /\*\*/.test(raw) && !isFrontier;
      let cleaned = raw.replace(/🟧/g, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
      const annMatch = /\*\((\+\d+)\)\*/.exec(cleaned);
      if (annMatch) {
        annotations[col] = annMatch[1]!;
        cleaned = cleaned.replace(annMatch[0], '').trim();
      }
      scores[col] = cleaned;
      if (isFrontier) highlight[col] = 'frontier';
      else if (isWinner) highlight[col] = 'winner';
    }

    return { benchmark, benchmarkNote, scores, annotations, highlight };
  });

  return { kind: 'sweep_table', data: { columns, rows } };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function extractBlockquoteBlock(content: string, headerRegex: RegExp): string[] | null {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith('>') && headerRegex.test(l));
  if (start < 0) return null;
  let s = start;
  while (s > 0 && lines[s - 1]!.startsWith('>')) s--;
  let e = start;
  while (e < lines.length - 1 && lines[e + 1]!.startsWith('>')) e++;

  return lines
    .slice(s, e + 1)
    .map((l) => l.replace(/^>\s?/, ''))
    .filter((l) => l !== '');
}

function stripWrappingAsterisks(line: string): string {
  return line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
}

// ────────────────────────────────────────────────────────────────────
// Aggregations
// ────────────────────────────────────────────────────────────────────

function collectReleaseLog(sections: Section[]): ReleaseLogCategory[] {
  return sections
    .filter((s) => s.kind === 'release_log_category')
    .map((s) => s.data as ReleaseLogCategory);
}

function countFobWords(sections: Section[]): number {
  const fobKinds = new Set<SectionKind>([
    'open',
    'by_the_numbers',
    'lead_story',
    'companion_lead',
    'feature',
    'investigation',
    'survey',
    'cowork',
    'papers',
    'term_of_issue',
    'quiet_on_wire',
    'close',
  ]);
  const text = sections
    .filter((s) => fobKinds.has(s.kind))
    .map((s) => s.content)
    .join(' ');
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_|\-]/g, ' ')
    .replace(/\s+/g, ' ');
  return stripped.split(' ').filter((w) => w.trim().length > 0).length;
}
