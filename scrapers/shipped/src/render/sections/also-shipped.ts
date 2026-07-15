/**
 * "Also shipped" — combines the "Cowork shipped, finally" and
 * "Two papers worth your Friday" sections into one editorial block.
 *
 * Each section's H1 is rendered as an italic display heading inside the
 * prose-well; paragraphs follow.
 */

import type { Section } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderAlsoShipped(cowork: Section | undefined, papers: Section | undefined): string {
  const coworkHtml = cowork ? renderInner(cowork) : '';
  const papersHtml = papers ? renderInner(papers, /*isFirst*/ false) : '';

  return `<section class="section" id="also">
  <div class="section-folio">
    <div class="section-folio-left">
      <span class="folio"><b>p.18</b> <span class="ruler"></span> Shipped. <span class="dot">—</span> 00 <span class="dot">—</span> Apr 2026</span>
    </div>
    <span class="section-folio-sub">Also shipped</span>
  </div>

  <div class="prose-well" style="padding:0">
    <span class="prose-marginalia">&#x2197; &nbsp; Cowork GA</span>
    <div class="prose">
${coworkHtml}
${papersHtml}
    </div>
    <aside class="prose-aside">
      <div><b>Cowork GA</b></div>
      <div>Apr 09 · macOS + Windows</div>
      <div>RBAC · Enterprise</div>
      <div>Analytics API · OTel</div>
      <div style="margin-top:12px"><b>Papers</b></div>
      <div>Automated Alignment Researchers</div>
      <div>Emotion Concepts in LLMs</div>
    </aside>
  </div>
</section>`;
}

function renderInner(section: Section, isFirst = true): string {
  const heading = section.name;
  const margin = isFirst ? '0 0 20px' : '48px 0 20px';
  const headingHtml = `      <h3 style="font-family:var(--disp);font-weight:500;font-style:italic;font-size:36px;letter-spacing:-.02em;line-height:1;color:var(--ink);margin:${margin}">${heading}.</h3>`;

  return [headingHtml, paragraphs(section.content)].join('\n');
}

function paragraphs(body: string): string {
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(
      (b) =>
        b.length > 0 &&
        !/^-{3,}$/.test(b) &&
        !b.startsWith('#') &&
        !b.startsWith('>'),
    );
  return blocks
    .map((b) => `      <p>${inlineMarkdown(b.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}
