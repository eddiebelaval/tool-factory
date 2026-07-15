/**
 * Archive page updater.
 *
 * Reads `id8labs/public/shipped/index.html`, inserts a new `<a class="issue-card">`
 * at the top of the archive list (immediately after `<div class="archive-head">`),
 * and updates the "Next issue — …" label inside `.next-up`.
 *
 * Idempotent: if a card for this issue number already exists, nothing changes.
 */

import { promises as fs } from 'fs';
import { fmtPrettyDate, pad2 } from './markdown.js';
import type { ParsedIssue } from './types.js';

export async function updateArchive(
  archivePath: string,
  issue: ParsedIssue,
  issueNum: string,
): Promise<void> {
  let html: string;
  try {
    html = await fs.readFile(archivePath, 'utf-8');
  } catch {
    // Archive not yet created — skip.
    console.warn(`[archive] not found: ${archivePath} (skipping)`);
    return;
  }

  if (html.includes(`href="/shipped/${issueNum}/"`)) {
    // Already present — idempotent no-op.
    return;
  }

  const card = renderIssueCard(issue, issueNum);

  // Insert immediately after the archive-head div closes.
  const insertAfter = '</div>'; // first match after archive-head — we anchor more precisely below
  const archiveHeadEnd = html.indexOf('</div>', html.indexOf('class="archive-head"'));
  if (archiveHeadEnd < 0) {
    console.warn('[archive] could not locate archive-head; not modifying.');
    return;
  }
  const insertAt = archiveHeadEnd + insertAfter.length;
  const before = html.slice(0, insertAt);
  const after = html.slice(insertAt);
  let updated = before + '\n\n  ' + card + '\n' + after;

  // Update the "Next issue — …" label
  const nextDate = computeNextIssueDate(issue.frontmatter.date);
  updated = updated.replace(
    /Next issue — [^<]+/g,
    `Next issue — ${nextDate}`,
  );

  // Update the archive-meta count if present.
  const newCount = countCards(updated);
  updated = updated.replace(
    /<span class="archive-meta">[^<]*<\/span>/,
    `<span class="archive-meta">${newCount} issue${newCount === 1 ? '' : 's'} · Founded April 2026</span>`,
  );

  await fs.writeFile(archivePath, updated, 'utf-8');
}

function renderIssueCard(issue: ParsedIssue, issueNum: string): string {
  const fm = issue.frontmatter;
  const datePretty = fmtPrettyDate(fm.date);
  const label = stripTitlePrefix(fm.title) || 'Founding Issue';

  // Pull the lead headline if available
  const lead = issue.sections.find((s) => s.kind === 'lead_story');
  const leadHeadline = lead ? extractH1(lead.content) : 'The chart that wasn\'t about Opus 4.7.';

  const blurb =
    fm.deck ??
    `${label} covers ${stripTitlePrefix(fm.title)}.`;

  return `<a href="/shipped/${issueNum}/" class="issue-card">
    <div class="issue-num">${issueNum}<span class="dot">.</span></div>
    <div class="issue-mid">
      <h2>${formatLeadHeadline(leadHeadline)}</h2>
      <p>${escapeHtml(blurb)}</p>
      <div class="topics">
        <span>Opus 4.7</span>
        <span>Mythos Preview</span>
        <span>Project Glasswing</span>
        <span>Agent SDK</span>
        <span>Claude Code v2.1.85→111</span>
      </div>
    </div>
    <div class="issue-right">
      <div class="date">${datePretty}</div>
      <div>${escapeHtml(label)}</div>
      <div class="read">Read →</div>
    </div>
  </a>`;
}

function extractH1(content: string): string {
  const lines = content.split('\n');
  for (const l of lines) {
    if (l.startsWith('# ')) return l.slice(2).trim();
  }
  return '';
}

function formatLeadHeadline(headline: string): string {
  // Italicize "wasn't" / "won't" if mid-sentence.
  const words = headline.split(' ');
  if (words.length >= 3 && /^(wasn't|won't|isn't|wouldn't)$/i.test(words[2]!)) {
    words[2] = `<em>${words[2]}</em>`;
  }
  return words.join(' ').replace(/\.?$/, '.');
}

function stripTitlePrefix(title: string): string {
  const parts = title.split(' — ');
  return parts[parts.length - 1] ?? title;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countCards(html: string): number {
  const matches = html.match(/class="issue-card"/g);
  return matches ? matches.length : 0;
}

function computeNextIssueDate(date: string): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 7);
  return fmtPrettyDate(d.toISOString().slice(0, 10));
}

// Suppress unused
void pad2;
