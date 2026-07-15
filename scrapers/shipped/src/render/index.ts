/**
 * Renderer entry point.
 *
 * `renderIssue(markdownPath, options)` reads the markdown source, parses
 * it into a ParsedIssue, dispatches each section to the matching renderer,
 * splices the results into the template, writes the issue HTML, and
 * idempotently updates the archive page.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseIssue, extractSweepTable } from './parse.js';
import { loadTemplate, render } from './template.js';
import { renderSweepTable } from './charts.js';
import { renderReleaseLog } from './release-log.js';
import { updateArchive } from './archive.js';
import {
  renderOpen,
  renderByTheNumbers,
  renderLeadStory,
  renderInvestigation,
  renderFeature,
  renderTimeline,
  renderSurvey,
  renderAlsoShipped,
  renderTermOfIssue,
  renderQuietOnWire,
  renderClose,
} from './sections/index.js';
import { fmtPrettyDate, pad2 } from './markdown.js';
import type { ParsedIssue, RenderOptions, RenderResult, Section } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default deploy paths relative to the renderer module.
//   tool-factory/scrapers/shipped/src/render/  →  ../../../../../id8labs/public/shipped
const DEFAULT_DEPLOY_ROOT = path.resolve(__dirname, '../../../../../id8labs/public/shipped');

// ────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────

export async function renderIssue(
  markdownPath: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const absMarkdown = path.resolve(markdownPath);
  const markdown = await fs.readFile(absMarkdown, 'utf-8');
  const issue = parseIssue(markdown, absMarkdown);

  const issueNum = pad2(issue.frontmatter.issue + 1); // dry-run #00 → URL /01/
  const deployRoot =
    options.deployRoot ??
    process.env.SHIPPED_DEPLOY_PATH ??
    DEFAULT_DEPLOY_ROOT;

  const outputPath =
    options.outputPath ?? path.join(deployRoot, issueNum, 'index.html');
  const archivePath =
    options.archivePath ?? path.join(deployRoot, 'index.html');
  const scratchPath =
    options.scratchPath ?? '/tmp/shipped-render-output.html';

  // Build the template data dictionary.
  const data = await buildTemplateData(issue, issueNum);

  // Apply
  const template = await loadTemplate();
  const html = render(template, data);

  // Always write to scratch for diffing.
  await fs.writeFile(scratchPath, html, 'utf-8');

  if (!options.dryRun) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf-8');
    await updateArchive(archivePath, issue, issueNum);
  }

  return {
    outputPath,
    archivePath,
    wordCount: issue.wordCount,
    sectionCount: issue.sections.length,
    releaseLogEntryCount: issue.releaseLog.reduce((s, c) => s + c.entries.length, 0),
    scratchPath,
  };
}

// ────────────────────────────────────────────────────────────────────
// Template data builder
// ────────────────────────────────────────────────────────────────────

async function buildTemplateData(
  issue: ParsedIssue,
  issueNum: string,
): Promise<Record<string, string>> {
  const fm = issue.frontmatter;
  const find = (kindOrName: string): Section | undefined =>
    issue.sections.find((s) => s.kind === kindOrName || s.name === kindOrName);

  const datePretty = fmtPrettyDate(fm.date);
  const dateShort = datePretty.replace(/(\w+) (\d+), (\d+)/, '$1\u00a0$2, $3');
  const dateIsoSpaced = fm.date.replace(/-/g, ' — ');

  // Companion to the Lead — sweep table
  const companion = find('companion_lead');
  const sweep = companion ? extractSweepTable(companion.content) : null;
  const sweepHtml = sweep && sweep.kind === 'sweep_table' ? renderSweepTable(sweep.data) : '';

  // Editorial sections
  const open = find('open');
  const lead = find('lead_story');
  const investigation = find('investigation');
  const feature = find('feature');
  const timeline = find('timeline');
  const survey = find('survey');
  const cowork = find('cowork');
  const papers = find('papers');
  const term = find('term_of_issue');
  const quiet = find('quiet_on_wire');
  const close = find('close');

  // Compute "next issue" date (current + 7 days)
  const nextIssueDate = computeNextIssueDate(fm.date);

  // Build cover bottom row from cover_label / lead headline / etc.
  const coverBottomRow = renderCoverBottomRow();

  const releaseLogHtml = renderReleaseLog(issue.releaseLog);
  const releaseLogCount = issue.releaseLog.reduce((s, c) => s + c.entries.length, 0);

  return {
    // Meta
    meta_title: `Shipped. — Issue ${issueNum} — ${stripTitlePrefix(fm.title)}`,
    meta_description: `A weekly magazine on what Anthropic ships. Issue ${issueNum} — ${fm.deck ?? stripTitlePrefix(fm.title)}.`,
    meta_description_short: 'A weekly magazine on what Anthropic ships.',
    canonical_url: `https://id8labs.app/shipped/${issueNum}/`,
    og_image_url: `https://id8labs.app/shipped/${issueNum}/og.png`,
    author: 'Eddie Belaval',

    // Pub bar
    issue_num: issueNum,
    date_short: dateShort,

    // Cover
    volume: 'I',
    cover_label: stripTitlePrefix(fm.title) || 'The Founding Issue',
    cover_sub: 'A dry-run — three weeks to stress-test the format at maximum size.',
    date_iso_spaced: dateIsoSpaced,
    period: fmtPeriod(fm.period),
    cover_top_meta: `${releaseLogCount} Releases · 21 Days · 1 Shadow`,
    cover_huge_num: issueNum,
    cover_deck: 'The <em>Shadow</em> Release',
    cover_deckline:
      'Three weeks of Anthropic, in one read. The model they shipped. The model you can&apos;t have. And the distance between them — the new normal.',
    cover_bottom_row: coverBottomRow,

    // Editorial
    'section:open': open ? renderOpen(open, fm.period) : '',
    'section:by_the_numbers': renderByTheNumbers(),
    'section:lead_story': lead ? renderLeadStory(lead) : '',
    'chart:sweep_table': sweepHtml,
    'section:investigation': investigation ? renderInvestigation(investigation) : '',
    'section:feature': feature ? renderFeature(feature) : '',
    'section:timeline': timeline ? renderTimeline(timeline) : '',
    'section:survey': survey ? renderSurvey(survey) : '',
    'section:also_shipped': renderAlsoShipped(cowork, papers),
    'section:term_of_issue': term ? renderTermOfIssue(term) : '',
    'section:quiet_on_wire': quiet ? renderQuietOnWire(quiet) : '',
    'section:close': close ? renderClose(close) : '',

    // Release log
    release_log_sections: releaseLogHtml,

    // Colophon
    word_count: String(issue.wordCount),
    release_log_count: String(releaseLogCount),
    release_log_sections_count: String(issue.releaseLog.length),
    status_display: fm.status === 'dry-run' ? 'Published' : capitalize(fm.status),
    next_issue_date: nextIssueDate,
    next_issue_label: `Issue ${pad2(fm.issue + 2)}`,
    next_issue_date_long: nextIssueDate.replace(',', '') + ' at 9 AM ET',
  };
}

function stripTitlePrefix(title: string): string {
  // "The Founding Issue — The Shadow Release" → "The Shadow Release"
  const parts = title.split(' — ');
  return parts[parts.length - 1] ?? title;
}

function fmtPeriod(period: string): string {
  // Pass-through with space normalization
  return period.replace(/\s+/g, ' ').trim().replace(/ to /, ' → ');
}

function computeNextIssueDate(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 7);
  return fmtPrettyDate(d.toISOString().slice(0, 10));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function renderCoverBottomRow(): string {
  // Issue 01 hardcoded; future issues can override via frontmatter
  return `<div class="cover-bottom">
    <div class="cover-bottom-cell">
      <span class="cover-bottom-label">The Lead</span>
      <span class="cover-bottom-val">Opus <b>4.7</b> vs. the chart</span>
    </div>
    <div class="cover-bottom-cell">
      <span class="cover-bottom-label">The Investigation</span>
      <span class="cover-bottom-val"><b>Glasswing</b></span>
    </div>
    <div class="cover-bottom-cell">
      <span class="cover-bottom-label">The Survey</span>
      <span class="cover-bottom-val">Claude Code, <b>v26</b></span>
    </div>
    <div class="cover-bottom-cell">
      <span class="cover-bottom-label">The Term</span>
      <span class="cover-bottom-val"><em>shadow release</em></span>
    </div>
  </div>`;
}
