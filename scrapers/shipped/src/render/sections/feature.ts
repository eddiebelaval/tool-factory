/**
 * "Feature" — the Agent Stack story. Feature opener + 2 prose-wells +
 * embedded code block. The fenced code block in the markdown becomes a
 * `<div class="code-block">` with the magazine's terminal styling.
 */

import type { Section } from '../types.js';
import { inlineMarkdown, esc } from '../markdown.js';

export function renderFeature(section: Section): string {
  const headline = extractHeadline(section.content);

  // Split prose around the fenced code block.
  const { before, after, code } = splitOnCodeBlock(section.content);

  const beforeProse = paragraphs(before);
  const afterProse = paragraphs(after);
  const codeHtml = code ? renderCodeBlock(code) : '';

  return `<div class="feature-opener" id="agent">
  <span class="vert-label">Feature <span class="vert-num">03</span></span>
  <div class="feature-heading">
    <div class="feature-kicker">p.12 &nbsp;—&nbsp; Reporting by Eddie Belaval</div>
    <h2 class="feature-title">${formatTitle(headline)}</h2>
    <p class="feature-deck">Managed Agents. The advisor tool. The <code style="font-family:var(--mono);font-size:.7em;background:var(--paper-shadow);padding:2px 8px">ant</code> CLI. All three shipped inside April 8–9. The era of writing your own loop is closing — Anthropic is taking that work in-house.</p>
    <div class="feature-meta">
      <div><b>Apr 08</b> Managed Agents public beta · <b>ant</b> CLI launch</div>
      <div><b>Apr 09</b> Advisor tool public beta · Cowork GA · SDK parity</div>
    </div>
  </div>
  <aside class="feature-right">
    <span class="feature-right-label">Four primitives, all shipped</span>
    Sandbox. Tool harness. Context manager. Streaming loop. If your competitive moat was the loop, your moat just shrank.
  </aside>
</div>

<div class="prose-well">
  <span class="prose-marginalia">&#x2197; &nbsp; Primitives</span>
  <div class="prose drop-cap">
${beforeProse}
  </div>
  <aside class="prose-aside">
    <div><b>Four primitives</b></div>
    <div>1. Sandbox</div>
    <div>2. Tool harness</div>
    <div>3. Context manager</div>
    <div>4. Streaming loop</div>
    <div style="margin-top:12px;color:var(--orange)"><b>Now commodity</b></div>
  </aside>
</div>

<div class="prose-well">
  <span class="prose-marginalia">&#x2197; &nbsp; Composition</span>
  <div class="prose">
    ${codeHtml}
${afterProse}
  </div>
  <aside class="prose-aside">
    <div><b>Still differentiated</b></div>
    <div>Your prompt library</div>
    <div>Domain-specific tools</div>
    <div>Retrieval pipeline</div>
    <div style="margin-top:12px;color:var(--orange)"><b>Now commodity</b></div>
    <div>Harness · sandbox</div>
    <div>Streaming · context</div>
  </aside>
</div>`;
}

function extractHeadline(content: string): string {
  const lines = content.split('\n');
  for (const l of lines) {
    if (l.startsWith('# ')) return l.slice(2).trim();
  }
  return 'The agent stack got serious';
}

function formatTitle(headline: string): string {
  // Italicize the last 2 words (e.g. "got serious")
  const words = headline.split(' ');
  if (words.length >= 3) {
    const i = words.length - 2;
    const last2 = words.slice(i).join(' ');
    return [...words.slice(0, i), `<em>${last2}.</em>`].join(' ');
  }
  return headline + '.';
}

function splitOnCodeBlock(content: string): {
  before: string;
  after: string;
  code: string | null;
} {
  const lines = content.split('\n');
  const fenceRe = /^```/;
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fenceRe.test(lines[i]!)) {
      if (openIdx < 0) openIdx = i;
      else {
        closeIdx = i;
        break;
      }
    }
  }
  if (openIdx < 0 || closeIdx < 0) {
    return { before: content, after: '', code: null };
  }
  const before = lines.slice(0, openIdx).join('\n');
  const code = lines.slice(openIdx + 1, closeIdx).join('\n');
  const after = lines.slice(closeIdx + 1).join('\n');
  return { before, after, code };
}

function renderCodeBlock(code: string): string {
  // Light Python-ish syntax coloring: strings, comments, keywords.
  const escaped = esc(code);
  const colored = escaped
    .replace(/(#.*?)(?=$|\n)/gm, '<span class="c">$1</span>')
    .replace(/(&quot;[^&]*?&quot;)/g, '<span class="s">$1</span>')
    .replace(/\b(while|not|for|in|if|else|return|def|class|with|as|import|from)\b/g, '<span class="k">$1</span>');

  return `<div class="code-block">
      <div class="code-block-head">
        <span>python &nbsp;·&nbsp; messages.create</span>
        <span>advisor-tool-2026-03-01</span>
      </div>
<pre>${colored}</pre>
    </div>`;
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
