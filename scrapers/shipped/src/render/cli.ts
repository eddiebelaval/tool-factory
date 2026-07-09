/**
 * Render CLI.
 *
 *   pnpm render path/to/issue-NN.md [--dry-run]
 *
 * Prints a render summary on stdout. Exits 0 on success, 1 on any error.
 */

import { renderIssue } from './index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const flags = new Set(args.filter((a) => a.startsWith('--')));

  if (positional.length === 0) {
    console.error('Usage: pnpm render <issue.md> [--dry-run]');
    process.exit(1);
  }

  const markdownPath = positional[0]!;
  const dryRun = flags.has('--dry-run');

  try {
    const result = await renderIssue(markdownPath, { dryRun });
    console.log('');
    console.log('  Shipped. — render complete');
    console.log('  ────────────────────────────');
    console.log(`  Source       : ${markdownPath}`);
    console.log(`  Output       : ${result.outputPath}${dryRun ? '  (dry-run, not written)' : ''}`);
    console.log(`  Archive      : ${result.archivePath}${dryRun ? '  (dry-run, not written)' : ''}`);
    console.log(`  Scratch copy : ${result.scratchPath}`);
    console.log(`  Sections     : ${result.sectionCount}`);
    console.log(`  FOB words    : ${result.wordCount}`);
    console.log(`  Log entries  : ${result.releaseLogEntryCount}`);
    console.log('');
  } catch (err) {
    console.error('Render failed:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

void main();
