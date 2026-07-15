/**
 * Voice gate.
 *
 * Scans the issue markdown for STYLE.md violations:
 *   - Hard-coded forbidden phrases (case-insensitive regex list).
 *   - Overuse of the "X isn't Y, it's Z" formula -- fail if > 1 occurrence.
 *
 * Returns one VerifyResult per offense.
 */

import type { Claim, VerifyResult } from "../types.js";

const GATE_NAME = "voice";

interface ForbiddenRule {
  pattern: RegExp;
  label: string;
  hint: string;
}

const FORBIDDEN: ForbiddenRule[] = [
  {
    pattern: /\bEPIC\b/i,
    label: "EPIC",
    hint: "STYLE.md: 'EPIC' is dead. Strike the word.",
  },
  {
    pattern: /thrilled to (announce|share)/i,
    label: "thrilled to announce/share",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /ushers? in/i,
    label: "ushers in",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bgame[- ]changing\b/i,
    label: "game-changing",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bindustry[- ]leading\b/i,
    label: "industry-leading",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bsynergies\b/i,
    label: "synergies",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\brobust solution\b/i,
    label: "robust solution",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bbest[- ]in[- ]class\b/i,
    label: "best-in-class",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bunveiled\b/i,
    label: "unveiled",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bempowers? \w+ to\b/i,
    label: "empowers X to ...",
    hint: "STYLE.md: corporate-PR cliche.",
  },
  {
    pattern: /\bleverage\b(?!d)/i,
    label: "leverage (verb)",
    hint: "STYLE.md: corporate-PR cliche when used as a verb.",
  },
];

/**
 * "X isn't Y, it's Z" pattern. STYLE.md allows ONE per issue; >1 fails.
 * Examples: "isn't a bug, it's a feature", "isn't a deal problem. It's a process problem"
 */
const FORMULA_PATTERN = /isn't[^.,;]{2,80}?[,.]\s*(?:it's|that's)\b/gi;
const FORMULA_LIMIT = 1;

export function runVoiceGate(markdown: string): VerifyResult[] {
  const results: VerifyResult[] = [];

  // Strip frontmatter so the YAML doesn't trip phrase rules.
  const body = stripFrontmatter(markdown);
  const lines = body.split(/\r?\n/);

  // Forbidden phrases.
  for (const rule of FORBIDDEN) {
    lines.forEach((line, idx) => {
      const m = rule.pattern.test(line) ? rule.pattern.exec(line) : null;
      if (!m) return;
      // Skip code fences and inline code via simple heuristic.
      if (isCodeLine(lines, idx)) return;
      const claim: Claim = {
        id: `voice-${rule.label}-L${idx + 1}`,
        kind: "voice",
        text: m[0] ?? rule.label,
        line: idx + 1,
        meta: { rule: rule.label, snippet: line.trim().slice(0, 200) },
      };
      results.push({
        passed: false,
        gate: GATE_NAME,
        severity: "fail",
        details: `Forbidden phrase "${rule.label}" at L${idx + 1}: ${rule.hint}`,
        claim,
      });
    });
  }

  // If no forbidden phrases tripped, emit one info-level pass so the report has signal.
  if (results.length === 0) {
    results.push({
      passed: true,
      gate: GATE_NAME,
      severity: "info",
      details: `No forbidden phrases detected (${FORBIDDEN.length} rules checked).`,
    });
  }

  // "X isn't Y, it's Z" formula counter.
  const matches = body.match(FORMULA_PATTERN) ?? [];
  if (matches.length > FORMULA_LIMIT) {
    const claim: Claim = {
      id: `voice-formula-overuse`,
      kind: "formula",
      text: `${matches.length} occurrences`,
      meta: { samples: matches.slice(0, 3) },
    };
    results.push({
      passed: false,
      gate: GATE_NAME,
      severity: "fail",
      details: `"X isn't Y, it's Z" formula used ${matches.length} times (limit ${FORMULA_LIMIT}). STYLE.md: one per issue maximum.`,
      claim,
    });
  } else if (matches.length > 0) {
    results.push({
      passed: true,
      gate: GATE_NAME,
      severity: "info",
      details: `"X isn't Y, it's Z" formula used ${matches.length} time(s) -- within budget.`,
    });
  }

  return results;
}

// ------------------------------------------------------------------ helpers

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const end = md.indexOf("\n---", 3);
  if (end === -1) return md;
  return md.slice(end + 4);
}

function isCodeLine(lines: string[], idx: number): boolean {
  // True if inside a fenced code block (count fences before this line).
  let fences = 0;
  for (let i = 0; i < idx; i++) {
    const l = lines[i] ?? "";
    if (/^\s*```/.test(l)) fences += 1;
  }
  return fences % 2 === 1;
}
