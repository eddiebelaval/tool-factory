#!/usr/bin/env node
/**
 * Shipped. — Orchestrator CLI
 *
 * Chains scrape → render → verify → stage.
 * Never commits. Never pushes. Human gate at git push is the final word.
 *
 * Usage:
 *   pnpm publish <markdown-path>
 *   pnpm publish ../../knowledge/series/shipped/issue-02-{slug}.md
 *
 * Flags:
 *   --skip-scrape      Don't refresh X scraper output (use cached)
 *   --skip-verify      Skip verification gates (DANGEROUS — only for previewing)
 *   --skip-stage       Render + verify but don't touch git
 *   --dry              Render to /tmp/ instead of id8labs/public/shipped/
 *   --quiet            Suppress per-step logs
 *
 * Exit codes:
 *   0  All stages passed, changes staged, ready for human git push
 *   1  Verification failed (lying-prevention triggered) — fix markdown and re-run
 *   2  Render failed (template or markdown structural error)
 *   3  Scraper failed in a way that should block (rare)
 *   4  Git working tree dirty in id8labs — refuse to stage on top of unrelated changes
 *   5  CLI error (bad args, missing file, etc.)
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, '..', '..');
const ID8LABS_ROOT = resolve(PIPELINE_ROOT, '..', '..', '..', 'id8labs');

interface PublishOptions {
  markdownPath: string;
  skipScrape: boolean;
  skipVerify: boolean;
  skipStage: boolean;
  dry: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): PublishOptions {
  const args = argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const flags = new Set(args.filter((a) => a.startsWith('--')));

  if (positional.length === 0) {
    log.error('Usage: pnpm publish <markdown-path>');
    process.exit(5);
  }

  return {
    markdownPath: resolve(process.cwd(), positional[0]!),
    skipScrape: flags.has('--skip-scrape'),
    skipVerify: flags.has('--skip-verify'),
    skipStage: flags.has('--skip-stage'),
    dry: flags.has('--dry'),
    quiet: flags.has('--quiet'),
  };
}

const log = {
  info: (msg: string) => process.stderr.write(`\x1b[2m·\x1b[0m ${msg}\n`),
  step: (n: number, total: number, msg: string) =>
    process.stderr.write(`\n\x1b[1m[${n}/${total}]\x1b[0m \x1b[36m${msg}\x1b[0m\n`),
  ok: (msg: string) => process.stderr.write(`  \x1b[32m✓\x1b[0m ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`  \x1b[33m⚠\x1b[0m ${msg}\n`),
  error: (msg: string) => process.stderr.write(`  \x1b[31m✗\x1b[0m ${msg}\n`),
  banner: (msg: string) =>
    process.stderr.write(
      `\n\x1b[1m═════════════════════════════════════════\n  ${msg}\n═════════════════════════════════════════\x1b[0m\n`,
    ),
};

async function runStep(name: string, cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<number> {
  return new Promise((resolveExit) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? PIPELINE_ROOT,
      stdio: 'inherit',
      shell: false,
    });
    child.on('exit', (code) => resolveExit(code ?? 1));
    child.on('error', (err) => {
      log.error(`${name} failed to spawn: ${err.message}`);
      resolveExit(1);
    });
  });
}

async function checkGitClean(opts: PublishOptions): Promise<boolean> {
  if (opts.skipStage || opts.dry) return true;
  return new Promise((resolveCheck) => {
    const child = spawn('git', ['status', '--porcelain', 'public/shipped/'], {
      cwd: ID8LABS_ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('exit', () => {
      // Allow only changes inside public/shipped/{NN}/ — the path we're about to stage.
      const lines = out.split('\n').filter((l) => l.trim().length > 0);
      const allShipped = lines.every((l) => l.includes('public/shipped/'));
      resolveCheck(allShipped);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!existsSync(opts.markdownPath)) {
    log.error(`Markdown file not found: ${opts.markdownPath}`);
    process.exit(5);
  }

  log.banner(`Shipped. — Publish Pipeline`);
  log.info(`Source: ${basename(opts.markdownPath)}`);
  log.info(`Pipeline: ${PIPELINE_ROOT}`);
  log.info(`Deploy:   ${ID8LABS_ROOT}/public/shipped/`);
  if (opts.dry) log.warn(`DRY RUN — will write to /tmp/ instead of id8labs/`);
  if (opts.skipVerify) log.warn(`SKIP-VERIFY — verification gates will NOT run. Use only for preview.`);

  // ───────────────────────────────────────────
  // Stage 0 — Pre-flight
  // ───────────────────────────────────────────
  log.step(0, 4, 'Pre-flight');

  if (!(await checkGitClean(opts))) {
    log.error('id8labs git working tree has unrelated changes in public/shipped/.');
    log.error('Refuse to stage on top of dirty state. Commit or stash, then re-run.');
    process.exit(4);
  }
  log.ok('Git working tree clean (or only public/shipped/ changes present)');

  // ───────────────────────────────────────────
  // Stage 1 — Scrape (unless skipped)
  // ───────────────────────────────────────────
  if (!opts.skipScrape) {
    log.step(1, 4, 'Scrape — refresh @claudedevs feed');
    const scrapeExit = await runStep('scrape', 'pnpm', ['scrape', '--days', '7']);
    if (scrapeExit !== 0) {
      log.warn('Scraper exited non-zero. Continuing — X feed is supplemental, not blocking.');
    } else {
      log.ok('Scraper output refreshed');
    }
  } else {
    log.step(1, 4, 'Scrape — SKIPPED (--skip-scrape)');
  }

  // ───────────────────────────────────────────
  // Stage 2 — Render
  // ───────────────────────────────────────────
  log.step(2, 4, 'Render — markdown → magazine HTML');
  const renderArgs = ['render', opts.markdownPath];
  if (opts.dry) renderArgs.push('--dry');
  const renderExit = await runStep('render', 'pnpm', renderArgs);
  if (renderExit !== 0) {
    log.error('Render failed. See output above.');
    process.exit(2);
  }
  log.ok('Render complete');

  // ───────────────────────────────────────────
  // Stage 3 — Verify (unless skipped)
  // ───────────────────────────────────────────
  if (!opts.skipVerify) {
    log.step(3, 4, 'Verify — attestation gates');
    const verifyExit = await runStep('verify', 'pnpm', ['verify', opts.markdownPath]);
    if (verifyExit !== 0) {
      log.error('Verification failed. The render is on disk but DO NOT publish.');
      log.error('Fix the markdown source and re-run. The pipeline is doing its job.');
      process.exit(1);
    }
    log.ok('All verification gates passed');
  } else {
    log.step(3, 4, 'Verify — SKIPPED (--skip-verify) ⚠ DANGEROUS');
  }

  // ───────────────────────────────────────────
  // Stage 4 — Stage git
  // ───────────────────────────────────────────
  if (opts.skipStage || opts.dry) {
    log.step(4, 4, 'Stage — SKIPPED');
    log.banner('Pipeline complete (skip-stage / dry).');
    return;
  }

  log.step(4, 4, 'Stage — git add (NEVER commits, NEVER pushes)');
  await runStep('git-add', 'git', ['add', 'public/shipped/'], { cwd: ID8LABS_ROOT });
  await runStep('git-status', 'git', ['status', 'public/shipped/'], { cwd: ID8LABS_ROOT });
  log.ok('Changes staged in id8labs/');

  // ───────────────────────────────────────────
  // Done — print the human gate
  // ───────────────────────────────────────────
  log.banner('Ready to publish.');
  process.stderr.write(`
  To deploy Issue (HUMAN GATE):

    cd ${ID8LABS_ROOT}
    git diff --cached public/shipped/      # one final read
    git commit -m "Publish Shipped. Issue NN — <title>"
    git push origin main

  Vercel auto-deploys ~2 minutes after push.
  After deploy:
    /post-tweet  --shipped NN
    /post-linkedin --shipped NN

`);
}

main().catch((err) => {
  log.error(`Unhandled: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
