/**
 * "The Open" — opening editorial essay.
 *
 * Layout: pull quote (first paragraph, italic, with em→orange), then
 * remaining paragraphs in serif body, with an aside listing the brief.
 */

import type { Section } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderOpen(section: Section, period: string): string {
  const paras = section.content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^-{3,}$/.test(p));

  if (paras.length === 0) return '';

  const quoteText = inlineMarkdown(paras[0]!.replace(/\n/g, ' '));
  const restHtml = paras
    .slice(1)
    .map((p) => `<p>${inlineMarkdown(p.replace(/\n/g, ' '))}</p>`)
    .join('\n        ');

  const periodLabel = formatPeriod(period);

  return `<section class="section open-section" id="open">
  <div class="section-folio">
    <div class="section-folio-left">
      <span class="folio"><b>p.03</b> <span class="ruler"></span> Shipped. <span class="dot">—</span> 00 <span class="dot">—</span> Apr 2026</span>
    </div>
    <span class="section-folio-sub">The Open</span>
  </div>

  <div class="open-grid">
    <div class="open-lead">
      <p class="open-quote">${quoteText}</p>
      <div class="open-prose">
        ${restHtml}
      </div>
    </div>
    <aside class="open-aside">
      <div>The brief</div>
      <div><b>Period</b> ${periodLabel}</div>
      <div><b>Days</b> 21</div>
      <div><b>Releases</b> 56</div>
      <div><b>Consortium</b> 12 orgs</div>
      <div><b>Ceiling</b> 1 model, gated</div>
      <div><b>Floor</b> 1 model, GA</div>
      <div><b>The gap</b> the new normal</div>
    </aside>
  </div>
</section>`;
}

function formatPeriod(period: string): string {
  // "2026-03-27 to 2026-04-16" -> "Mar 27 -> Apr 16"
  const re = /(\d{4})-(\d{2})-(\d{2})\s+to\s+(\d{4})-(\d{2})-(\d{2})/;
  const m = re.exec(period);
  if (!m) return period;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m1 = months[Number(m[2]) - 1];
  const m2 = months[Number(m[5]) - 1];
  return `${m1} ${Number(m[3])} → ${m2} ${Number(m[6])}`;
}
