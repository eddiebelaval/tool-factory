/**
 * "Investigation" — Glasswing. Feature opener + prose-well + named quotes
 * (3 voices) + Firefox ratio chart + closing prose. The markdown encodes
 * blockquote-style attributions (`> "quote..." \n> — Name · Org`); we
 * detect and render those as orange/ink-bordered quote cards.
 */

import type { Section } from '../types.js';
import { extractRatioChart } from '../parse.js';
import { renderRatio } from '../charts.js';
import { inlineMarkdown } from '../markdown.js';

export function renderInvestigation(section: Section): string {
  const headline = extractHeadline(section.content);

  const ratio = extractRatioChart(section.content);
  const ratioHtml = ratio && ratio.kind === 'ratio' ? renderRatio(ratio.data) : '';

  // Build the voices block from blockquoted quote+attribution pairs.
  const voicesHtml = renderVoicesAndProse(section.content, ratioHtml);

  return `<div class="feature-opener" id="glasswing">
  <span class="vert-label">Investigation <span class="vert-num">02</span></span>
  <div class="feature-heading">
    <div class="feature-kicker">p.09 &nbsp;—&nbsp; Reporting by Eddie Belaval</div>
    <h2 class="feature-title">${formatTitle(headline)}</h2>
    <p class="feature-deck">On April 7, twelve organizations agreed to use a model none of their customers can touch. The precedent starts here.</p>
    <div class="feature-meta">
      <div><b>Consortium</b> 12 founders · 40+ in talks</div>
      <div>AWS · Apple · Broadcom · Cisco · CrowdStrike · Google · JPMorgan Chase · Linux Foundation · Microsoft · NVIDIA · Palo Alto Networks · Anthropic</div>
    </div>
  </div>
  <aside class="feature-right">
    <span class="feature-right-label">The money</span>
    <b>$100M</b> in Anthropic model credits to partners. <b>$2.5M</b> to Alpha-Omega and OpenSSF. <b>$1.5M</b> to the Apache Software Foundation. Funding routed to the open-source maintainers who don&apos;t have security teams.
  </aside>
</div>

${voicesHtml}

<span class="ornament">&sect; &nbsp; &sect; &nbsp; &sect;</span>`;
}

function extractHeadline(content: string): string {
  const lines = content.split('\n');
  for (const l of lines) {
    if (l.startsWith('# ')) return l.slice(2).trim();
  }
  return 'Glasswing';
}

function formatTitle(headline: string): string {
  // Italicize the whole title for one-word names (e.g. "Glasswing")
  return `<em>${headline}.</em>`;
}

interface Quote {
  text: string;
  attribution: string;
}

function extractQuotes(content: string): Quote[] {
  const lines = content.split('\n');
  const quotes: Quote[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    // Match: > *"... long text ..."*
    const m1 = l.match(/^>\s*\*"(.+?)"\*\s*$/);
    const m2 = l.match(/^>\s*\*“(.+?)”\*\s*$/);
    const matched = m1 || m2;
    if (matched && matched[1] && matched[1].length > 30) {
      // Look at the next non-empty `>` line for the attribution.
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === '') j++;
      let attr = '';
      if (j < lines.length) {
        const a = lines[j]!.match(/^>\s*[—-]\s*(.+)$/);
        if (a) attr = a[1]!.trim();
      }
      quotes.push({ text: matched[1]!, attribution: attr });
    }
  }
  return quotes;
}

function renderVoicesAndProse(content: string, ratioHtml: string): string {
  // First — render the intro prose (everything before the first quote)
  // Then alternate: quotes + paragraphs in document order, ending with the
  // ratio chart inserted between the second and third quote (canonical).
  const lines = content.split('\n');
  const isQuoteStart = (l: string) => /^>\s*\*"/.test(l) || /^>\s*\*“/.test(l);

  // Intro paragraphs — read until the first quote line
  let i = 0;
  // Skip the H1
  while (i < lines.length && !lines[i]!.startsWith('## ') && lines[i]!.startsWith('#')) i++;
  while (i < lines.length && !isQuoteStart(lines[i]!) && !lines[i]!.startsWith('> ###')) i++;

  const introBody = lines.slice(0, i).join('\n');
  const intro = paragraphs(introBody);

  const quotes = extractQuotes(content);

  // Trailing prose — paragraphs after the last quote (before any sidebar).
  const lastQuote = quotes[quotes.length - 1];
  let tailStart = 0;
  if (lastQuote) {
    const idx = content.indexOf(lastQuote.text);
    tailStart = idx + lastQuote.text.length;
    // Move past the attribution line
    const newlineIdx = content.indexOf('\n', tailStart);
    tailStart = content.indexOf('\n', newlineIdx + 1) + 1;
  }
  const tailBody = stripSidebar(content.slice(tailStart));
  const tail = paragraphs(tailBody);

  // Quote 1 + middle paragraphs + Quote 2 + chart + Quote 3 + tail
  const q1 = quotes[0] ? renderQuote(quotes[0], 'orange') : '';
  const q2 = quotes[1] ? renderQuote(quotes[1], 'ink') : '';
  const q3 = quotes[2] ? renderQuote(quotes[2], 'ink') : '';

  // Mid-paragraph between q1 and q2 (about Mythos producing results)
  const midBody = quotes[0] && quotes[1] ? extractBetween(content, quotes[0].text, quotes[1].text) : '';
  const mid = paragraphs(midBody);

  // Paragraph between q2 and q3 (CyberGym scoring)
  const mid2 = quotes[1] && quotes[2] ? extractBetween(content, quotes[1].text, quotes[2].text) : '';
  const mid2Html = paragraphs(mid2);

  return `<div class="prose-well">
  <span class="prose-marginalia">&#x2197; &nbsp; Apr 07 &nbsp; · &nbsp; Consortium announced</span>
  <div class="prose drop-cap">
${intro}
  </div>
  <aside class="prose-aside">
    <div><b>What Mythos found</b></div>
    <div>OpenBSD · 27 yr</div>
    <div>FFmpeg · 16 yr</div>
    <div>Linux kernel · chain</div>
    <div>Firefox JIT · 4-vuln</div>
    <div>OSS-Fuzz · 10 tgt</div>
    <div style="margin-top:8px;color:var(--orange)"><b>Disclosed under embargo</b></div>
  </aside>
</div>

<div class="prose-well">
  <span class="prose-marginalia">&#x2197; &nbsp; Voices</span>
  <div class="prose" style="font-family:var(--disp)">
    ${q1}
${mid}
    ${q2}
${mid2Html}
    ${ratioHtml}
    ${q3}
${tail}
  </div>
  <aside class="prose-aside">
    <div><b>Three voices</b></div>
    <div>Microsoft (AI + OS)</div>
    <div>Cisco (infra)</div>
    <div>Linux Foundation (OSS)</div>
    <div style="margin-top:12px"><b>90 days</b></div>
    <div>Until the first public report</div>
  </aside>
</div>`;
}

function renderQuote(q: Quote, accent: 'orange' | 'ink'): string {
  const borderColor = accent === 'orange' ? 'var(--orange)' : 'var(--ink)';
  return `<blockquote style="margin:32px 0;padding:0;border-left:3px solid ${borderColor};padding-left:20px">
      <p style="font-style:italic;font-size:22px;line-height:1.35;color:var(--ink);margin-bottom:12px">&ldquo;${inlineMarkdown(q.text)}&rdquo;</p>
      <span style="font-family:var(--narrow);font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)">— ${inlineMarkdown(q.attribution)}</span>
    </blockquote>`;
}

function extractBetween(content: string, before: string, after: string): string {
  const i1 = content.indexOf(before);
  if (i1 < 0) return '';
  const start = content.indexOf('\n', i1 + before.length) + 1;
  const i2 = content.indexOf(after, start);
  if (i2 < 0) return '';
  // Move back to the start of the attribution line for `after`
  return content.slice(start, content.lastIndexOf('\n', i2));
}

function stripSidebar(content: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^>\s*###\s+Sidebar/.test(l));
  if (start < 0) return content;
  let s = start;
  while (s > 0 && lines[s - 1]!.startsWith('>')) s--;
  let e = start;
  while (e < lines.length - 1 && lines[e + 1]!.startsWith('>')) e++;
  return [...lines.slice(0, s), ...lines.slice(e + 1)].join('\n');
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
        !b.startsWith('>') &&
        !b.startsWith('|'),
    );
  return blocks
    .map((b) => `    <p>${inlineMarkdown(b.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}
