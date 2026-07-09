/**
 * Minimal, deterministic markdown to HTML helpers tuned for Shipped.
 *
 * We do NOT use a full markdown engine because the magazine has very
 * specific HTML conventions (em becomes orange, code uses our --paper-shadow
 * background, etc). This file converts only the inline grammar we use.
 */

/** HTML-escape text. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert inline markdown (within a paragraph) to HTML.
 * Supports: **bold**, *italic*, `code`, [text](url), basic em/strong.
 *
 * Important: this assumes input is already trusted markdown (no HTML).
 * We escape angle brackets first, then build inline elements via tokens.
 */
export function inlineMarkdown(input: string): string {
  // Process in this order: code → links → strong → em
  // Use unique placeholders so later passes don't re-process produced HTML.
  let out = input;

  // Escape ampersands and angle brackets (but keep our markdown intact)
  out = out.replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;');

  // Inline code `...`
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escForCode(c)}</code>`);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  // Links [text](url)
  const links: string[] = [];
  out = out.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_m, text: string, url: string) => {
    const safeUrl = url.replace(/"/g, '%22');
    links.push(`<a href="${safeUrl}">${text}</a>`);
    return `\u0000L${links.length - 1}\u0000`;
  });

  // Bold (**text**)
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*)
  out = out.replace(/(^|[\s(])\*([^*]+?)\*(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');

  // Em-dash and en-dash already in the markdown (—, –) pass through.
  // Angle brackets in plain text need escaping (after we've protected code/links).
  out = out.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Restore code and links
  out = out.replace(/\u0000C(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]!);
  out = out.replace(/\u0000L(\d+)\u0000/g, (_m, i: string) => links[Number(i)]!);

  return out;
}

function escForCode(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Convert block markdown into <p>...</p> paragraphs with inline formatting.
 * Splits on blank lines. Skips lines that are just `---`.
 */
export function paragraphs(body: string): string {
  const blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !/^-{3,}$/.test(b));
  return blocks
    .map((b) => `<p>${inlineMarkdown(b.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}

/**
 * Format a YYYY-MM-DD date as the magazine's "2026 · 04 · 16" style.
 * Accepts partial dates like "2026-03".
 */
export function fmtLogDate(date: string): string {
  return date.replace(/-/g, ' · ');
}

/**
 * Format a YYYY-MM-DD date as "Apr 16, 2026" for issue cards / pub bar.
 */
export function fmtPrettyDate(date: string): string {
  const [y, m, d] = date.split('-');
  if (!y || !m) return date;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(m) - 1] ?? m;
  if (!d) return `${month} ${y}`;
  return `${month} ${Number(d)}, ${y}`;
}

/**
 * Format an issue number as a zero-padded 2-character string.
 */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Map a release-log category tag to a CSS class on .log-tag.
 * Falls back to "code" for unknowns.
 */
export function tagToClass(tag: string): string {
  const t = tag.toUpperCase();
  if (t.startsWith('SDK-PY') || t === 'SDK · PY') return 'sdk-py';
  if (t.startsWith('SDK-TS') || t === 'SDK · TS') return 'sdk-ts';
  if (t === 'MODEL') return 'model';
  if (t === 'API') return 'api';
  if (t === 'CODE') return 'code';
  if (t === 'APPS') return 'apps';
  if (t === 'RESEARCH') return 'research';
  if (t === 'NEWS') return 'news';
  if (t === 'DEPRECATION') return 'deprecation';
  return 'code';
}

/**
 * Display label for a release-log category tag (used inside the badge).
 * Inverse-ish of tagToClass — preserves friendly capitalization.
 */
export function tagToLabel(tag: string): string {
  const t = tag.toUpperCase();
  if (t === 'SDK-PY') return 'SDK · PY';
  if (t === 'SDK-TS') return 'SDK · TS';
  if (t === 'MODEL') return 'Model';
  if (t === 'API') return 'API';
  if (t === 'CODE') return 'Code';
  if (t === 'APPS') return 'Apps';
  if (t === 'RESEARCH') return 'Research';
  if (t === 'NEWS') return 'News';
  if (t === 'DEPRECATION') return 'Deprecation';
  // Fall back to the original tag (already friendly), capitalized.
  return tag;
}
