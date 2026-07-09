/**
 * Write structured scrape results to disk.
 *
 * Layout:
 *   output/x-claudedevs/{YYYY-MM-DD}.json   -- one file per scrape day
 *   output/x-claudedevs/latest.json         -- symlink to newest
 *
 * Files are pretty-printed JSON. The `/shipped` source-gathering step reads
 * `latest.json` directly.
 */

import { mkdir, symlink, unlink, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { ScrapeResult } from './types.js';

/**
 * Default output directory, relative to the scrapers/shipped package root.
 * Resolves to scrapers/shipped/output/x-claudedevs/.
 */
export function defaultOutputDir(): string {
  // import.meta.url => file:///.../scrapers/shipped/src/scrape/output.ts
  const here = new URL(import.meta.url).pathname;
  // Walk: src/scrape/output.ts -> src/scrape -> src -> shipped
  const pkgRoot = resolve(dirname(here), '..', '..');
  return join(pkgRoot, 'output', 'x-claudedevs');
}

export interface WriteOptions {
  /** Override output directory. Defaults to `defaultOutputDir()`. */
  outputDir?: string;
  /** Override "today" for filename (used in tests). */
  today?: Date;
  /** If true, skip writing the latest.json symlink. */
  skipLatestSymlink?: boolean;
}

/**
 * Write a scrape result to disk and update the latest symlink.
 * Returns the absolute path of the written file.
 */
export async function writeScrapeResult(
  result: ScrapeResult,
  options: WriteOptions = {},
): Promise<string> {
  const outputDir = options.outputDir ?? defaultOutputDir();
  const today = options.today ?? new Date();
  const dateStamp = formatDateStamp(today);
  const filename = `${dateStamp}.json`;
  const filepath = join(outputDir, filename);

  await mkdir(outputDir, { recursive: true });

  const payload = {
    scrapedAt: result.scrapedAt,
    source: result.source,
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    tweets: result.tweets,
  };

  await writeFile(filepath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  if (!options.skipLatestSymlink) {
    await updateLatestSymlink(outputDir, filename);
  }

  return filepath;
}

async function updateLatestSymlink(
  outputDir: string,
  targetFilename: string,
): Promise<void> {
  const linkPath = join(outputDir, 'latest.json');
  try {
    await unlink(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
  try {
    // Relative target so the symlink survives directory moves.
    await symlink(targetFilename, linkPath);
  } catch (err) {
    // On some filesystems (Windows without admin, certain CI runners), symlinks
    // require special permissions. Fall back to writing latest.json as a copy.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'ENOSYS') {
      const target = join(outputDir, targetFilename);
      const exists = await pathExists(target);
      if (exists) {
        const data = await readFileSafe(target);
        if (data !== null) {
          await writeFile(linkPath, data, 'utf8');
          return;
        }
      }
    }
    throw err;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** Format a Date as `YYYY-MM-DD` in UTC. */
export function formatDateStamp(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
