/**
 * "Term of the Issue" — dictionary-style entry.
 */

import type { Section, TermOfIssue } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderTermOfIssue(section: Section): string {
  const data = (section.data as TermOfIssue | undefined) ?? {
    word: 'shadow release',
    pronunciation: 'SHA-doh ree-LEES',
    partOfSpeech: 'noun',
    definition: [],
  };

  const wordHtml = formatWord(data.word);
  const part = data.partOfSpeech ?? 'noun';
  const pron = data.pronunciation ?? '';
  const defHtml = (data.definition ?? [])
    .map((p) => `    <p>${inlineMarkdown(p)}</p>`)
    .join('\n');
  const firstObs = data.firstObservable
    ? `    <p><strong>First observable instance:</strong> ${inlineMarkdown(data.firstObservable)}</p>`
    : '';
  const usage = data.usage
    ? `    <div class="term-usage">
      <b>Usage</b>
      &ldquo;${stripQuotes(inlineMarkdown(data.usage))}&rdquo;
    </div>`
    : '';

  return `<section class="term-section" id="term">
  <div class="term-kicker">Term of the Issue &nbsp;·&nbsp; p.19 &nbsp;·&nbsp; First observable 2026-04-16</div>
  <div class="term-word">
    ${wordHtml}<span class="part">/<em>${formatPron(pron)}</em>/&nbsp;&nbsp;·&nbsp;&nbsp;${part}</span>
  </div>
  <div class="term-def">
${defHtml}
${firstObs}
${usage}
  </div>
</section>`;
}

function formatWord(word: string): string {
  // Two-word terms break across lines: "shadow<br>release"
  return word.split(' ').join('<br>');
}

function formatPron(pron: string): string {
  // Convert "SHA-doh ree-LEES" → "SHA</em>-doh&nbsp;&nbsp;ree-<em>LEES"
  // Keep it simple: replace double space with double nbsp
  return pron.replace(/\s+/g, '&nbsp;&nbsp;');
}

function stripQuotes(s: string): string {
  return s.replace(/^[“"]/, '').replace(/[”"]$/, '').trim();
}
