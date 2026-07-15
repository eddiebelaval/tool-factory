/**
 * Section renderers — one function per editorial section type.
 *
 * Each renderer takes the parsed Section and returns an HTML fragment that
 * matches the corresponding block in MOCKUP-FINAL.html.
 *
 * The canonical hand-built HTML uses many bespoke editorial layouts
 * (full-screen pull quotes, sidebar boxes, Bloomberg numerals grid…) that
 * markdown can't express directly. We derive what we can from the markdown,
 * and fall back to template constants for the structurally-fixed parts.
 */

export { renderOpen } from './open.js';
export { renderByTheNumbers } from './by-the-numbers.js';
export { renderLeadStory } from './lead-story.js';
export { renderInvestigation } from './investigation.js';
export { renderFeature } from './feature.js';
export { renderTimeline } from './timeline.js';
export { renderSurvey } from './survey.js';
export { renderAlsoShipped } from './also-shipped.js';
export { renderTermOfIssue } from './term-of-issue.js';
export { renderQuietOnWire } from './quiet-on-wire.js';
export { renderClose } from './close.js';
