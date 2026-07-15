/**
 * Release Log renderer.
 *
 * Inputs: ReleaseLogCategory[] from the parser.
 * Outputs: a sequence of `<section class="log-section">` blocks, one per
 * category, each containing a header (italic Fraunces name + count badge
 * + deck) and a list of entries.
 *
 * Per-entry markup matches MOCKUP-FINAL.html:
 *   <article class="log-entry">
 *     <div class="log-entry-left"><date><tag></div>
 *     <div>
 *       <h3 class="log-entry-title"><a>Title</a></h3>
 *       <p class="log-entry-body">Body…</p>
 *       <div class="log-entry-how"><b>How to use</b>…</div>
 *       <div class="log-entry-why"><b>Why it matters</b>…</div>
 *     </div>
 *   </article>
 */

import type { ReleaseLogCategory, ReleaseLogEntry } from './types.js';
import { esc, inlineMarkdown, fmtLogDate, tagToClass, tagToLabel } from './markdown.js';

export function renderReleaseLog(categories: ReleaseLogCategory[]): string {
  return categories
    .map(renderCategory)
    .join('\n\n');
}

function renderCategory(cat: ReleaseLogCategory): string {
  const count = renderCount(cat);
  const deck = cat.deck
    ? `  <p class="log-cat-deck">${inlineMarkdown(cat.deck)}</p>`
    : '';

  const entries = cat.entries.map(renderEntry).join('\n');

  return `<section class="log-section">
  <div class="log-cat-head">
    <div class="log-cat-letter">${esc(cat.letter)}</div>
    <div class="log-cat-name">${esc(cat.name)}</div>
    <div class="log-cat-count">${count}</div>
  </div>
${deck}
  <div class="log-entries">
${entries}
  </div>
</section>`;
}

function renderCount(cat: ReleaseLogCategory): string {
  const n = cat.entries.length;
  // Sniff a more specific count label per category, matching the canonical.
  switch (cat.letter) {
    case 'A':
      return `<b>${n}</b> Models in window`;
    case 'B':
      return `<b>${n}</b> Release notes`;
    case 'C':
      return `<b>${n}</b> versions &nbsp;·&nbsp; v2.1.85 → v2.1.111`;
    case 'D':
      return `<b>${n}</b> App releases`;
    case 'E':
      return `<b>${n}</b> SDK releases`;
    case 'F':
      return `<b>${n}</b> Papers`;
    case 'G':
      return `<b>${n}</b> Items`;
    default:
      return `<b>${n}</b> Items`;
  }
}

function renderEntry(entry: ReleaseLogEntry): string {
  const dateLabel = fmtLogDate(entry.date) || '—';
  const tagClass = tagToClass(entry.category);
  const tagLabel = tagToLabel(entry.category);

  const titleInner = entry.url
    ? `<a href="${esc(entry.url)}">${inlineMarkdown(entry.title)}</a>`
    : `<a href="#">${inlineMarkdown(entry.title)}</a>`;

  const bodyHtml = entry.summary
    ? `        <p class="log-entry-body">${inlineMarkdown(entry.summary)}</p>`
    : '';

  let codeHtml = '';
  if (entry.code) {
    codeHtml = `\n        <pre style="font-family:var(--mono);font-size:12px;background:var(--paper-shadow);padding:14px;margin:10px 0;overflow-x:auto"><code>${esc(entry.code.content)}</code></pre>`;
  }

  const howHtml = entry.howToUse
    ? `        <div class="log-entry-how"><b>How to use</b>${inlineMarkdown(entry.howToUse)}</div>`
    : '';

  const whyHtml = entry.whyItMatters
    ? `        <div class="log-entry-why"><b>Why it matters</b>${inlineMarkdown(entry.whyItMatters)}</div>`
    : '';

  return `    <article class="log-entry">
      <div class="log-entry-left">
        <span class="log-entry-date">${esc(dateLabel)}</span>
        <span class="log-tag ${tagClass}">${esc(tagLabel)}</span>
      </div>
      <div>
        <h3 class="log-entry-title">${titleInner}</h3>
${bodyHtml}${codeHtml}
${howHtml}
${whyHtml}
      </div>
    </article>`;
}
