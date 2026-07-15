/**
 * "Quiet on the Wire" — short notes section, two-column layout.
 */

import type { Section } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderQuietOnWire(section: Section): string {
  return `<section class="quiet-section" id="quiet">
  <div class="quiet-head">
    <div class="quiet-kicker">p.20 &nbsp;·&nbsp; Notes</div>
    <h3 class="quiet-title">Quiet on<br>the <em>wire.</em></h3>
  </div>
  <div class="quiet-body">
${paragraphs(section.content)}
  </div>
</section>`;
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
    .map((b) => `    <p>${inlineMarkdown(b.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}
