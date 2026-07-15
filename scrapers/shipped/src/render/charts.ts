/**
 * Chart renderers — produce HTML fragments that match MOCKUP-FINAL.html.
 *
 * Three charts:
 *   1. Five-bar SWE-bench Verified — the orange "frontier" Mythos bar
 *   2. Firefox Trial ratio — 2 vs 181 with a 90× annotation
 *   3. Cross-benchmark sweep table — eight benchmarks, five columns
 */

import type { BarData, RatioData, SweepTable } from './types.js';
import { esc, inlineMarkdown } from './markdown.js';

// ────────────────────────────────────────────────────────────────────
// 1. Five-bar (SWE-bench Verified)
// ────────────────────────────────────────────────────────────────────

/**
 * Render the SWE-bench Verified five-bar diagram.
 * Bar widths are scaled relative to the highest score (Mythos = 100%).
 */
export function renderFiveBar(bars: BarData[]): string {
  const maxScore = bars.reduce((m, b) => Math.max(m, b.score), 0) || 100;
  const rows = bars
    .map((b) => {
      const widthPct = ((b.score / maxScore) * 100).toFixed(1);
      const rowClass = b.isFrontier ? 'mythos-row frontier' : 'mythos-row';
      const tag = b.tag
        ? ` <span class="tag">${esc(b.tag)}</span>`
        : b.isFrontier
          ? ' <span class="tag">Frontier · Gated</span>'
          : '';
      return `    <div class="${rowClass}">
      <span class="mythos-name">${esc(b.label)}${tag}</span>
      <div class="mythos-bar"><div class="mythos-bar-fill" style="width:${widthPct}%"></div></div>
      <span class="mythos-score">${esc(b.display)}</span>
    </div>`;
    })
    .join('\n');

  return `<section class="mythos-section">
  <div class="mythos-head">
    <h3 class="mythos-head-title">The fifth bar, the <em>Mythos</em> bar.</h3>
    <div class="mythos-head-meta">
      <div><b>SWE-bench Verified</b> · production software engineering</div>
      <div>Higher is better · published by Anthropic, Apr 16</div>
    </div>
  </div>
  <div class="mythos-bars">
${rows}
  </div>
  <div class="mythos-caption">
    <span class="mythos-caption-num">Fig. 01</span>
    <span>The orange bar is the frontier you can read about but cannot call. Opus 4.7 is the floor of what you can buy this week. Mythos is the ceiling of what exists. The 6.3-point gap is the new normal — and Anthropic has decided, for now, that the distance is a feature.</span>
  </div>
</section>`;
}

// ────────────────────────────────────────────────────────────────────
// 2. Firefox Trial ratio
// ────────────────────────────────────────────────────────────────────

/**
 * Render the Firefox Trial 2-vs-181 figure.
 */
export function renderRatio(d: RatioData): string {
  const smallNote = d.smallNote.replace(/\n/g, '<br>');
  const bigNote = d.bigNote.replace(/\n/g, '<br>');
  const sourceUpper = (d.source || '').toUpperCase();
  const figUpper = (d.fig || 'FIG. 02').toUpperCase();

  return `<figure class="fx-ratio" style="margin:40px 0;padding:48px;background:#ffffff;border:1px solid rgba(0,0,0,0.08);display:grid;grid-template-columns:1fr 64px 1fr;gap:0;align-items:stretch">
  <div style="text-align:center;padding:24px 16px">
    <div style="font-family:var(--narrow);font-weight:600;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:12px">${esc(d.smallLabel)}</div>
    <div style="font-family:var(--serif);font-weight:800;font-variation-settings:'opsz' 144;font-size:clamp(72px,14vw,108px);line-height:.9;color:#b5b3af;margin-bottom:12px">${esc(String(d.smallValue))}</div>
    <div style="font-family:var(--sans);font-size:12px;color:var(--muted);line-height:1.45">${smallNote}</div>
  </div>
  <div class="fx-vs" style="display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-style:italic;font-weight:700;font-size:28px;color:var(--ink);border-left:1px solid rgba(0,0,0,0.08);border-right:1px solid rgba(0,0,0,0.08)">vs</div>
  <div style="text-align:center;padding:24px 16px">
    <div style="font-family:var(--narrow);font-weight:600;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink);margin-bottom:12px">${esc(d.bigLabel)}</div>
    <div style="font-family:var(--serif);font-weight:800;font-variation-settings:'opsz' 144;font-size:clamp(120px,28vw,240px);line-height:.9;color:var(--orange);letter-spacing:-0.04em;margin-bottom:12px">${esc(String(d.bigValue))}</div>
    <div style="font-family:var(--sans);font-size:12px;color:var(--muted);line-height:1.45">${bigNote}</div>
  </div>
  <figcaption style="grid-column:1 / -1;text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid rgba(0,0,0,0.08);font-family:var(--serif);font-style:italic;font-size:17px;color:var(--ink)">A <strong style="color:var(--orange);font-style:normal;font-weight:700">${esc(d.ratio)} ratio</strong> in working browser exploits. The capability gap is not "better." It is categorical.<br><span style="font-family:var(--mono);font-size:10px;color:#b5b3af;letter-spacing:.05em;font-style:normal">${esc(figUpper)} · SOURCE: ${esc(sourceUpper)}</span></figcaption>
</figure>
<style>
  @media (max-width: 720px) {
    .fx-ratio { grid-template-columns: 1fr !important; padding: 32px 20px !important; }
    .fx-ratio .fx-vs { display: none !important; }
  }
</style>`;
}

// ────────────────────────────────────────────────────────────────────
// 3. Cross-benchmark sweep table
// ────────────────────────────────────────────────────────────────────

const HEADER_TH_STYLE =
  'text-align:right;padding:14px 12px 10px;font-family:var(--narrow);font-weight:600;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink)';

const CELL_STYLE = 'padding:18px 12px;border-bottom:1px solid rgba(0,0,0,0.08)';

/**
 * Render the cross-benchmark sweep table.
 */
export function renderSweepTable(table: SweepTable): string {
  const header = `<tr>
        <th style="text-align:left;padding:14px 12px 10px;font-family:var(--narrow);font-weight:600;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink)">Benchmark</th>
${table.columns.map((c) => `        <th style="${HEADER_TH_STYLE}">${esc(c)}</th>`).join('\n')}
      </tr>`;

  const rows = table.rows
    .map((row) => {
      const cells = table.columns
        .map((col) => {
          const val = row.scores[col] ?? '—';
          const ann = row.annotations?.[col];
          const hl = row.highlight?.[col];
          if (val === '—' || val === '') {
            return `        <td style="${CELL_STYLE};text-align:right;font-size:15px;color:#b5b3af">—</td>`;
          }
          if (hl === 'frontier') {
            return `        <td style="${CELL_STYLE};text-align:right;font-family:var(--serif);font-weight:700;font-size:17px;color:var(--orange)">${esc(val)}</td>`;
          }
          if (hl === 'winner') {
            const annHtml = ann
              ? ` <span style="font-family:var(--sans);font-weight:600;font-size:12px;color:var(--orange)">${esc(ann)}</span>`
              : '';
            return `        <td style="${CELL_STYLE};text-align:right;font-family:var(--serif);font-weight:700;font-size:17px">${esc(val)}${annHtml}</td>`;
          }
          return `        <td style="${CELL_STYLE};text-align:right;font-size:15px">${esc(val)}</td>`;
        })
        .join('\n');

      const note = row.benchmarkNote
        ? `<span style="display:block;font-family:var(--mono);font-size:10px;color:#b5b3af;margin-top:2px">// ${esc(row.benchmarkNote)}</span>`
        : '';

      return `      <tr>
        <td style="${CELL_STYLE};font-size:15px;font-weight:500">${esc(row.benchmark)} ${note}</td>
${cells}
      </tr>`;
    })
    .join('\n');

  return `<section style="max-width:1240px;margin:80px auto;padding:0 32px">
  <div style="display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:32px">
    <span style="font-family:var(--narrow);font-weight:700;font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:var(--orange)">Companion to the Lead — Fig. 03</span>
    <span style="font-family:var(--sans);font-weight:600;font-size:14px;color:var(--ink)">Where each model wins</span>
  </div>

  <div style="background:#ffffff;border:1px solid rgba(0,0,0,0.08);padding:48px 56px">
    <div style="font-family:var(--narrow);font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Cross-benchmark sweep</div>
    <h3 style="font-family:var(--serif);font-weight:700;font-variation-settings:'opsz' 96;font-size:42px;line-height:1.05;letter-spacing:-0.02em;margin-bottom:12px">The pattern is the news.</h3>
    <p style="font-family:var(--sans);font-size:16px;line-height:1.55;color:var(--muted);max-width:640px;margin-bottom:40px">Eight benchmarks Anthropic published in the Opus 4.7 launch, with comparable scores from competitor models where reported. <strong style="color:var(--ink)">Bold</strong> = winner. <strong style="color:var(--orange)">Orange bold</strong> = Mythos Preview leads.</p>

    <table style="width:100%;border-collapse:collapse;font-family:var(--sans);font-variant-numeric:tabular-nums">
      <thead>
        ${header}
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>

    <div style="margin-top:32px;padding:24px;background:var(--ink);color:var(--paper)">
      <p style="font-family:var(--serif);font-style:italic;font-size:18px;line-height:1.5;max-width:780px">Opus 4.7 leads or ties on every benchmark Anthropic published — except the two Mythos sits on. <strong style="color:var(--orange);font-style:normal;font-weight:700">Anthropic now ships the second-best model and tells you who's first.</strong></p>
    </div>

    <div style="font-family:var(--mono);font-size:10px;color:#b5b3af;letter-spacing:.05em;margin-top:24px;padding-top:16px;border-top:1px solid rgba(0,0,0,0.08)">SOURCE · Anthropic Opus 4.7 announcement · Mythos rows from red.anthropic.com Mythos Preview disclosure · Em-dash = no published score for that model on that benchmark</div>
  </div>
</section>`;
}

// Suppressed-unused import warning suppression
void inlineMarkdown;
