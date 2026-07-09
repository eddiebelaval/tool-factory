/**
 * "Timeline" — 21 days, 56 releases. The visual is a per-day stacked-dot
 * grid (one column per calendar day with weekday/weekend treatment) plus
 * a list of headline events.
 *
 * The markdown encodes day density via a fenced ASCII block where each
 * line begins with a date and a row of "●" bullets. We parse the dot
 * count and emit the matching number of `<span class="tl-dot">` per day.
 *
 * "BIG" days (denoted by all-caps prose lines after the date row, e.g.
 * "PROJECT GLASSWING + MYTHOS PREVIEW") promote the first dot to
 * `tl-dot big` (orange, taller).
 */

import { inlineMarkdown } from '../markdown.js';
import type { Section } from '../types.js';

interface TimelineDay {
  date: string; // "03·27"
  dotCount: number;
  hasBig: boolean;
  isWeekend: boolean;
}

export function renderTimeline(section: Section): string {
  const days = parseTimelineGrid(section.content);
  const grid = days.map(renderDay).join('\n    ');

  return `<section class="tl-section" id="timeline">
  <div class="section-folio">
    <div class="section-folio-left">
      <span class="folio"><b>p.15</b> <span class="ruler"></span> Shipped. <span class="dot">—</span> 00 <span class="dot">—</span> Apr 2026</span>
    </div>
    <span class="section-folio-sub">Timeline</span>
  </div>

  <div class="tl-head">
    <h3 class="tl-title"><em>21 days.</em><br>56 releases.</h3>
    <div class="tl-count"><span>21</span><span class="slash">/</span><span>56</span></div>
  </div>

  <div class="tl-grid" aria-label="Daily release density, Mar 27 to Apr 16">
    ${grid}
  </div>

  <div class="tl-legend">
    <div class="tl-legend-item"><span class="tl-legend-dot big"></span>Flagship moment (model, consortium, GA)</div>
    <div class="tl-legend-item"><span class="tl-legend-dot"></span>Feature · API · SDK release</div>
    <div class="tl-legend-item"><span class="tl-legend-dot minor"></span>Patch &middot; internal</div>
  </div>

  <div class="tl-list">
    <div class="tl-list-item"><span class="tl-list-date">Apr 07</span><div><div class="tl-list-title">Project Glasswing + Mythos Preview (gated)</div><div class="tl-list-desc">12-org consortium. $100M in credits. The shadow goes public — as a thing you cannot have.</div></div></div>
    <div class="tl-list-item"><span class="tl-list-date">Apr 08</span><div><div class="tl-list-title">Managed Agents + ant CLI</div><div class="tl-list-desc">Agent harness as a service. Agent definitions as YAML. The loop becomes infrastructure.</div></div></div>
    <div class="tl-list-item"><span class="tl-list-date">Apr 09</span><div><div class="tl-list-title">Advisor tool + Cowork GA</div><div class="tl-list-desc">Executor/advisor composition becomes a primitive. Cowork leaves beta, picks up RBAC + OpenTelemetry.</div></div></div>
    <div class="tl-list-item"><span class="tl-list-date">Apr 14</span><div><div class="tl-list-title">Sonnet 4 / Opus 4 deprecation · Vas Narasimhan joins LTBT</div><div class="tl-list-desc">Retirement clock starts (June 15). Automated Alignment Researchers paper drops the same day.</div></div></div>
    <div class="tl-list-item"><span class="tl-list-date">Apr 16</span><div><div class="tl-list-title">Claude Opus 4.7 — GA</div><div class="tl-list-desc">Same price. 3× vision. xhigh default. Tokenizer change. And the fourth bar of the launch chart.</div></div></div>
    <div class="tl-list-item"><span class="tl-list-date">Cont.</span><div><div class="tl-list-title">26 versions of Claude Code, v2.1.85 → v2.1.111</div><div class="tl-list-desc">Routines. /ultrareview. /team-onboarding. A UI redesign with a sidebar. The CLI becomes the work environment.</div></div></div>
  </div>
</section>`;
}

function parseTimelineGrid(content: string): TimelineDay[] {
  const fenceLines = extractFenceContent(content);
  const days: TimelineDay[] = [];
  let lastDate = '';
  let lastDay: TimelineDay | null = null;

  // Weekend dates known a priori for the period (Mar 28-29, Apr 4-5, Apr 11-12)
  const weekends = new Set(['03·28', '03·29', '04·04', '04·05', '04·11', '04·12']);

  for (const line of fenceLines) {
    const dateMatch = line.match(/^([A-Z]{3})\s+(\d{2})\s*(.*)$/);
    if (dateMatch) {
      const month = dateMatch[1]!;
      const day = dateMatch[2]!;
      const rest = dateMatch[3]!;
      // Normalize "MAR 27" → "03·27"
      const monthNum: Record<string, string> = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
        JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
      };
      const dateStr = `${monthNum[month] ?? '01'}·${day}`;
      const dotCount = (rest.match(/●/g) || []).length;
      lastDate = dateStr;
      lastDay = {
        date: dateStr,
        dotCount: dotCount > 0 ? dotCount : 1,
        hasBig: false,
        isWeekend: weekends.has(dateStr),
      };
      days.push(lastDay);
    } else if (lastDay && /^[A-Z]/.test(line.trim())) {
      // A continuation line in caps suggests a flagship event for this day.
      lastDay.hasBig = true;
    }
    void lastDate;
  }

  // Cap dot counts at 7 to fit visually; promote first dot to "big" for high-density days.
  for (const d of days) {
    if (d.dotCount > 7) d.dotCount = 7;
    if (d.dotCount >= 5) d.hasBig = true;
  }

  return days;
}

function extractFenceContent(content: string): string[] {
  const lines = content.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const l of lines) {
    if (l.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) out.push(l);
  }
  return out;
}

function renderDay(d: TimelineDay): string {
  const dots: string[] = [];
  for (let i = 0; i < d.dotCount; i++) {
    if (d.hasBig && i === 0) {
      dots.push('<span class="tl-dot big"></span>');
    } else {
      dots.push('<span class="tl-dot"></span>');
    }
  }
  const cls = d.isWeekend ? 'tl-day tl-weekend' : 'tl-day';
  return `<div class="${cls}"><span class="tl-date">${d.date}</span><div class="tl-stack">${dots.join('')}</div></div>`;
}

// suppress unused
void inlineMarkdown;
