/**
 * "Survey" — Claude Code grew a body. Feature opener + 4-cell stat strip
 * + prose-well + ornament.
 */

import type { Section } from '../types.js';
import { inlineMarkdown } from '../markdown.js';

export function renderSurvey(section: Section): string {
  const headline = extractHeadline(section.content);

  return `<div class="feature-opener" id="survey">
  <span class="vert-label">Survey <span class="vert-num">04</span></span>
  <div class="feature-heading">
    <div class="feature-kicker">p.17 &nbsp;—&nbsp; Reporting by Eddie Belaval</div>
    <h2 class="feature-title">${formatTitle(headline)}</h2>
    <p class="feature-deck">Twenty-six versions in twenty-one days. The CLI is becoming an IDE, and the IDE is becoming a control plane. When does saying &ldquo;Claude Code is a CLI&rdquo; stop being true?</p>
    <div class="feature-meta">
      <div><b>Versions</b> v2.1.85 → v2.1.111 &nbsp;·&nbsp; <b>Cadence</b> 1.24 releases/day</div>
    </div>
  </div>
  <aside class="feature-right">
    <span class="feature-right-label">The arc</span>
    Routines. /ultrareview. /team-onboarding. Multi-session UI. Push notifications. PowerShell. PID namespaces. Plugins with binaries. A diff viewer faster than your IDE&apos;s.
  </aside>
</div>

<div class="survey-data">
  <div class="survey-cell">
    <span class="survey-label">Versions</span>
    <span class="survey-num">26</span>
    <span class="survey-note">Point releases, routine adds, subsystem work. Continuous, unspectacular shipping.</span>
  </div>
  <div class="survey-cell">
    <span class="survey-label">Peak day</span>
    <span class="survey-num"><em>7</em></span>
    <span class="survey-note">Apr 09, Apr 14, and Apr 16 each saw seven-plus release events.</span>
  </div>
  <div class="survey-cell">
    <span class="survey-label">Free /ultrareview</span>
    <span class="survey-num">3</span>
    <span class="survey-note">Cloud code reviews per Pro/Max user per month. Parallel analysis.</span>
  </div>
  <div class="survey-cell">
    <span class="survey-label">Routines</span>
    <span class="survey-num">&infin;</span>
    <span class="survey-note">Saved configs running on Anthropic&apos;s cloud. Agent-that-ships on a schedule.</span>
  </div>
</div>

<div class="prose-well">
  <span class="prose-marginalia">&#x2197; &nbsp; Read the changelog</span>
  <div class="prose drop-cap">
${paragraphs(section.content)}
  </div>
  <aside class="prose-aside">
    <div><b>Also shipped in 26</b></div>
    <div>Push notifications</div>
    <div>PowerShell on Windows</div>
    <div>Auto mode for Max</div>
    <div>Monitor tool</div>
    <div>Subprocess sandboxing</div>
    <div>PreCompact hooks</div>
    <div>Plugin executables</div>
    <div>Conditional hook if fields</div>
  </aside>
</div>

<span class="ornament bold">&#10022; &nbsp; &#10022; &nbsp; &#10022;</span>`;
}

function extractHeadline(content: string): string {
  const lines = content.split('\n');
  for (const l of lines) {
    if (l.startsWith('# ')) return l.slice(2).trim();
  }
  return 'Claude Code grew a body';
}

function formatTitle(headline: string): string {
  // Italicize "a body" or last 2 words
  const words = headline.split(' ');
  if (words.length >= 3) {
    const i = words.length - 2;
    const last2 = words.slice(i).join(' ');
    return [...words.slice(0, i), `<em>${last2}.</em>`].join(' ');
  }
  return headline + '.';
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
