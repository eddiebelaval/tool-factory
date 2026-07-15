/**
 * Claim extraction.
 *
 * Walks a markdown AST (remark + remark-frontmatter) and pulls out:
 *   - URL claims:    every [text](url) link and bare http(s):// URL
 *   - Number claims: numeric assertions (percentages, dollars, counts) with a nearby source link
 *   - Quote claims:  blockquotes attributed via "-- Name, Org"
 *   - Date claims:   ISO dates ("YYYY-MM-DD") with attestation cues like "shipped on" / "Date:"
 *
 * Each claim carries `context` (surrounding paragraph) and `sourceUrl` when one is identified
 * within ~3 paragraphs of the claim. Attestation gates use these to drive their own fetches.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { createHash } from "node:crypto";

import type { Claim } from "./types.js";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  position?: { start?: { line?: number } };
}

const PROXIMITY_PARAGRAPHS = 3;

export interface ExtractedClaims {
  claims: Claim[];
  /** Map of paragraph index -> URLs found in that paragraph (used by attestation gates). */
  paragraphUrls: Map<number, string[]>;
  /** Plain-text rendering of each top-level block, in document order. */
  blocks: { text: string; line: number; urls: string[] }[];
}

export function extractClaims(markdown: string): ExtractedClaims {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown) as MdNode;

  const blocks: { text: string; line: number; urls: string[] }[] = [];
  for (const child of tree.children ?? []) {
    if (child.type === "yaml") continue;
    blocks.push({
      text: nodeToText(child),
      line: child.position?.start?.line ?? 0,
      urls: collectUrls(child),
    });
  }

  const paragraphUrls = new Map<number, string[]>();
  blocks.forEach((b, i) => paragraphUrls.set(i, b.urls));

  const claims: Claim[] = [];
  let claimCounter = 0;
  const mkId = (kind: string, text: string) => {
    claimCounter += 1;
    const h = createHash("sha1").update(text).digest("hex").slice(0, 6);
    return `${kind}-${claimCounter}-${h}`;
  };

  // ---------- URL claims (one per unique URL, with first-occurrence context) ----------
  const seenUrls = new Set<string>();
  blocks.forEach((block, i) => {
    for (const url of block.urls) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      claims.push({
        id: mkId("url", url),
        kind: "url",
        text: url,
        sourceUrl: url,
        context: block.text.slice(0, 200),
        line: block.line,
        meta: { blockIndex: i },
      });
    }
  });

  // ---------- Number claims ----------
  // Detect: percentages (87.6%), dollars ($100M, $5/$25), counts ("181 working exploits"),
  // multipliers (3x, 90x). Only emit if at least one URL exists within proximity window.
  const numberRegex =
    /(\$?\b\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:%|×|x| ?[KMB])?\b)/g;

  blocks.forEach((block, i) => {
    const nearbyUrls = collectNearbyUrls(blocks, i, PROXIMITY_PARAGRAPHS);
    if (nearbyUrls.length === 0) return;

    const seenInBlock = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = numberRegex.exec(block.text)) !== null) {
      const raw = m[1] ?? m[0];
      // Filter junk: years (4-digit alone), trivial single digits with no unit.
      if (!isInterestingNumber(raw)) continue;
      const key = raw.toLowerCase();
      if (seenInBlock.has(key)) continue;
      seenInBlock.add(key);
      claims.push({
        id: mkId("num", raw),
        kind: "number",
        text: raw,
        sourceUrl: nearbyUrls[0],
        context: block.text,
        line: block.line,
        meta: { candidateUrls: nearbyUrls.slice(0, 5), blockIndex: i },
      });
    }
    numberRegex.lastIndex = 0;
  });

  // ---------- Quote claims ----------
  // Pattern: > "..." -- Name, Org    (em dash or hyphen-dash, with attribution)
  // Detected by scanning blockquote text for a quoted string and an attribution line.
  // Person: starts with capital. Org: may start with "the" (lowercase) before a capital.
  const quotePattern =
    /["“]([^"”]{8,})["”]\s*[\n\r]?\s*[—–-]\s*([A-Z][A-Za-z.\-' ]+?),\s*((?:the\s+)?[A-Z][A-Za-z0-9 .&'\-]+)/g;

  blocks.forEach((block, i) => {
    let m: RegExpExecArray | null;
    while ((m = quotePattern.exec(block.text)) !== null) {
      const quote = (m[1] ?? "").trim();
      const person = (m[2] ?? "").trim();
      const org = (m[3] ?? "").trim();
      const nearbyUrls = collectNearbyUrls(blocks, i, PROXIMITY_PARAGRAPHS);
      claims.push({
        id: mkId("quote", quote),
        kind: "quote",
        text: quote,
        sourceUrl: nearbyUrls[0],
        context: block.text,
        line: block.line,
        meta: { person, org, candidateUrls: nearbyUrls.slice(0, 5) },
      });
    }
    quotePattern.lastIndex = 0;
  });

  // ---------- Date claims ----------
  // Patterns: "shipped on YYYY-MM-DD", "Date: YYYY-MM-DD", with nearby URL.
  const dateAttestPattern =
    /(?:shipped on|Date:|published on|released on|on)\s+(\d{4}-\d{2}-\d{2})/gi;

  blocks.forEach((block, i) => {
    let m: RegExpExecArray | null;
    while ((m = dateAttestPattern.exec(block.text)) !== null) {
      const dateIso = m[1];
      if (!dateIso) continue;
      const nearbyUrls = collectNearbyUrls(blocks, i, PROXIMITY_PARAGRAPHS);
      if (nearbyUrls.length === 0) continue;
      claims.push({
        id: mkId("date", dateIso),
        kind: "date",
        text: dateIso,
        sourceUrl: nearbyUrls[0],
        context: block.text,
        line: block.line,
        meta: { candidateUrls: nearbyUrls.slice(0, 5) },
      });
    }
    dateAttestPattern.lastIndex = 0;
  });

  return { claims, paragraphUrls, blocks };
}

// ------------------------------------------------------------------ helpers

function nodeToText(node: MdNode): string {
  if (node.value) return node.value;
  if (!node.children) return "";
  return node.children.map(nodeToText).join(node.type === "paragraph" ? "" : "\n");
}

function collectUrls(node: MdNode): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === "link" && n.url) out.push(n.url);
    if (n.type === "definition" && n.url) out.push(n.url);
    if (n.type === "text" && n.value) {
      const bare = n.value.match(/https?:\/\/[^\s)\]<>]+/g);
      if (bare) out.push(...bare);
    }
  });
  return Array.from(new Set(out));
}

function walk(node: MdNode, visit: (n: MdNode) => void): void {
  visit(node);
  for (const c of node.children ?? []) walk(c, visit);
}

function collectNearbyUrls(
  blocks: { urls: string[] }[],
  i: number,
  window: number,
): string[] {
  const urls: string[] = [];
  for (let j = Math.max(0, i - window); j <= Math.min(blocks.length - 1, i + window); j++) {
    const b = blocks[j];
    if (!b) continue;
    urls.push(...b.urls);
  }
  return Array.from(new Set(urls));
}

function isInterestingNumber(raw: string): boolean {
  // Has a unit (%, ×, x, K/M/B), or starts with $, or is a multi-digit count.
  if (/[%×x]/.test(raw)) return true;
  if (raw.startsWith("$")) return true;
  if (/[KMB]$/.test(raw)) return true;
  // Plain integer: require >=2 digits and reject 4-digit years (1900-2099).
  const num = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(num)) return false;
  if (raw.length === 4 && num >= 1900 && num <= 2099) return false;
  if (num < 10) return false;
  return true;
}
