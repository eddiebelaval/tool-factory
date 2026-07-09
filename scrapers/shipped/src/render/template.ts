/**
 * Tiny template engine.
 *
 * Vanilla string-replace because the template is a single, large HTML
 * file with named slots. We deliberately avoid Mustache, EJS, etc. —
 * the data shape is fixed and the template author owns the markup.
 *
 * Placeholder syntax:
 *   {{key}}                — replaced with data[key]
 *   {{key|raw}}            — same; reserved for future "trust raw HTML"
 *   {{section:open}}       — replaced with data["section:open"]
 *   {{chart:swe_bench}}    — replaced with data["chart:swe_bench"]
 *
 * All values must be strings. The renderer is responsible for HTML-escaping
 * any values that originate as user data; the template just splices.
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TemplateData {
  [key: string]: string;
}

/**
 * Read the canonical template HTML.
 */
export async function loadTemplate(): Promise<string> {
  const templatePath = path.join(__dirname, 'template.html');
  return fs.readFile(templatePath, 'utf-8');
}

/**
 * Render a template string by replacing every {{key}} occurrence with data[key].
 * Unknown keys are replaced with the empty string (after a console warning).
 */
export function render(template: string, data: TemplateData): string {
  const seen = new Set<string>();
  const result = template.replace(/\{\{([a-zA-Z0-9_:]+)\}\}/g, (_m, key: string) => {
    seen.add(key);
    if (key in data) return data[key]!;
    console.warn(`[template] unknown placeholder: {{${key}}}`);
    return '';
  });
  return result;
}
