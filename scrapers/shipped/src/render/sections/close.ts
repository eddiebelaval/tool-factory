/**
 * "The Close" — three-beat closer on dark background.
 *
 * Each non-empty paragraph in the markdown becomes a `.close-line`.
 * The last paragraph gets `.close-final` (italic orange).
 */

import type { Section } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderClose(section: Section): string {
  const blocks = section.content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^-{3,}$/.test(b));

  const linesHtml = blocks
    .map((b, i) => {
      const cls = i === blocks.length - 1 ? 'close-line close-final' : 'close-line';
      return `    <p class="${cls}">${inlineMarkdown(b)}</p>`;
    })
    .join('\n');

  return `<section class="close-section">
  <div class="close-kicker">The Close</div>
  <div class="close-stack">
${linesHtml}
  </div>
  <div class="close-mark">&#10022;</div>
</section>`;
}
