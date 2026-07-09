/**
 * "By the Numbers" — the Bloomberg numerals section.
 *
 * The numbers in the markdown blockquote are the data we render.
 * The visual layout (s3 / s4 / s6 cells, accent flag, label/note text)
 * is hand-curated for Issue 01. For now we hardcode the cell layout
 * and only let the markdown drive the displayed numbers if they match
 * the canonical set; otherwise we use the canonical defaults.
 *
 * Future iteration: a structured "by_the_numbers.cells" frontmatter block
 * could let the issue author override layout per issue.
 */

export function renderByTheNumbers(): string {
  return `<section class="btn-section" id="numbers">
  <div class="section" style="padding-top:64px;padding-bottom:0">
    <div class="section-folio">
      <div class="section-folio-left">
        <span class="folio"><b>p.04</b> <span class="ruler"></span> Shipped. <span class="dot">—</span> 00 <span class="dot">—</span> Apr 2026</span>
      </div>
      <span class="section-folio-sub">By the numbers</span>
    </div>

    <h2 class="btn-head">The <em>shape</em> of three weeks.</h2>
  </div>

  <div class="btn-grid">
    <div class="btn-cell s3">
      <span class="btn-label">Releases shipped</span>
      <span class="btn-num accent">56</span>
      <span class="btn-note">March 27 → April 16. One lab. No rest day above two.</span>
    </div>
    <div class="btn-cell s3">
      <span class="btn-label">Claude Code versions</span>
      <span class="btn-num">26</span>
      <span class="btn-note">v2.1.85 through v2.1.111. The CLI is becoming an IDE.</span>
    </div>
    <div class="btn-cell s3">
      <span class="btn-label">Agent SDK releases</span>
      <span class="btn-num">20</span>
      <span class="btn-note">Ten Python. Ten TypeScript. Parity maintained.</span>
    </div>
    <div class="btn-cell s3">
      <span class="btn-label">Frontier held back</span>
      <span class="btn-num accent">1</span>
      <span class="btn-note">Mythos Preview. Gated. The ceiling.</span>
    </div>

    <div class="btn-cell s6">
      <span class="btn-label">Cybersecurity benchmark &mdash; cybergym</span>
      <span class="btn-num accent">83.1<span style="font-size:.5em;opacity:.7">%</span></span>
      <span class="btn-note">Mythos Preview on CyberGym vulnerability reproduction. Opus 4.6, the previous frontier, sits at 66.6%. The gap is not marginal.</span>
    </div>
    <div class="btn-cell s6">
      <span class="btn-label">Model credits pledged &mdash; glasswing</span>
      <span class="btn-num">$100<span style="font-size:.55em">M</span></span>
      <span class="btn-note">To the twelve consortium members. Plus $4M to OpenSSF, Apache, and Alpha-Omega — the open-source maintainers who don&apos;t have security teams.</span>
    </div>

    <div class="btn-cell s4">
      <span class="btn-label">Oldest bug Mythos found</span>
      <span class="btn-num">27<span style="font-size:.35em;opacity:.7">&nbsp;yr</span></span>
      <span class="btn-note">A memory-corruption flaw in OpenBSD. Survived decades of human review.</span>
    </div>
    <div class="btn-cell s4">
      <span class="btn-label">Firefox shell exploits</span>
      <span class="btn-num accent">181</span>
      <span class="btn-note">Produced by Mythos in testing. Opus 4.6 produced 2 in the same trial.</span>
    </div>
    <div class="btn-cell s4">
      <span class="btn-label">Tokenizer change</span>
      <span class="btn-num">1.35<span style="font-size:.35em;opacity:.7">&times;</span></span>
      <span class="btn-note">Same input may consume up to 35% more tokens on Opus 4.7. Re-tune your prompts. The bill will tell you.</span>
    </div>

    <div class="btn-cell s4">
      <span class="btn-label">Opus 4.7 pricing (unchanged)</span>
      <span class="btn-num">$5<span style="font-size:.5em;opacity:.7">/$25</span></span>
      <span class="btn-note">Per million input / output tokens. Same as 4.6 — but the tokenizer is not.</span>
    </div>
    <div class="btn-cell s4">
      <span class="btn-label">Sonnet 4 / Opus 4 retire</span>
      <span class="btn-num">60<span style="font-size:.35em;opacity:.7">&nbsp;days</span></span>
      <span class="btn-note">June 15, 2026. If you haven&apos;t migrated, the clock started two days ago.</span>
    </div>
    <div class="btn-cell s4">
      <span class="btn-label">Glasswing public report</span>
      <span class="btn-num">90<span style="font-size:.35em;opacity:.7">&nbsp;days</span></span>
      <span class="btn-note">Until the consortium&apos;s first progress disclosure. Read it carefully — the methodology will be precedent.</span>
    </div>
  </div>
</section>`;
}
