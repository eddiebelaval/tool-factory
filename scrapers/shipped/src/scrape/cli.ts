#!/usr/bin/env -S npx tsx
/**
 * CLI for the @claudedevs scraper.
 *
 * Usage:
 *   pnpm scrape                           # scrape last 7 days from @claudedevs
 *   pnpm scrape --days 14                 # change lookback window
 *   pnpm scrape --user other_handle       # different account
 *   pnpm scrape --dry                     # don't write output
 *   pnpm scrape --include-replies         # include reply tweets
 *   pnpm scrape --include-retweets        # include RT'd tweets
 *
 * Exit codes:
 *   0 = success (or graceful empty)
 *   1 = both X API and Nitter failed AND no token was even available
 *       (the caller decides whether to treat as fatal -- see /shipped)
 */

import { scrapeClaudedevs } from './index.js';
import { DEFAULT_SCRAPE_OPTIONS } from './types.js';

interface CliFlags {
  days: number;
  user: string;
  dry: boolean;
  includeReplies: boolean;
  includeRetweets: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    days: DEFAULT_SCRAPE_OPTIONS.sinceDays,
    user: DEFAULT_SCRAPE_OPTIONS.username,
    dry: false,
    includeReplies: DEFAULT_SCRAPE_OPTIONS.includeReplies,
    includeRetweets: DEFAULT_SCRAPE_OPTIONS.includeRetweets,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--days': {
        const next = argv[i + 1];
        if (!next) throw new Error('--days requires a number');
        const n = parseInt(next, 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`--days must be a positive integer (got "${next}")`);
        }
        flags.days = n;
        i += 1;
        break;
      }
      case '--user': {
        const next = argv[i + 1];
        if (!next) throw new Error('--user requires a username');
        flags.user = next.replace(/^@/, '');
        i += 1;
        break;
      }
      case '--dry':
      case '--dry-run':
        flags.dry = true;
        break;
      case '--include-replies':
        flags.includeReplies = true;
        break;
      case '--include-retweets':
        flags.includeRetweets = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        if (arg && arg.startsWith('--')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  return flags;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`shipped scrape -- @claudedevs X feed scraper

Usage:
  pnpm scrape [options]

Options:
  --days N             Lookback window in days (default: ${DEFAULT_SCRAPE_OPTIONS.sinceDays})
  --user HANDLE        X username without @ (default: ${DEFAULT_SCRAPE_OPTIONS.username})
  --dry                Skip writing output to disk
  --include-replies    Include reply tweets (default: off)
  --include-retweets   Include retweeted tweets (default: off)
  --help, -h           Show this help

Environment:
  X_API_BEARER_TOKEN   Optional. If set, X API is tried first.
                       If absent, falls back to Nitter (best-effort).

Output:
  output/x-claudedevs/{YYYY-MM-DD}.json
  output/x-claudedevs/latest.json (symlink)
`);
}

async function main(): Promise<number> {
  let flags: CliFlags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`error: ${(err as Error).message}`);
    printHelp();
    return 2;
  }

  if (flags.help) {
    printHelp();
    return 0;
  }

  const result = await scrapeClaudedevs({
    username: flags.user,
    sinceDays: flags.days,
    includeReplies: flags.includeReplies,
    includeRetweets: flags.includeRetweets,
    dry: flags.dry,
  });

  // ---- Summary ----
  const lines: string[] = [
    '',
    '── scrape summary ──────────────────────────────',
    `  user:      @${flags.user}`,
    `  window:    last ${flags.days}d`,
    `  source:    ${result.source}`,
    `  tweets:    ${result.tweets.length}`,
    `  output:    ${result.outputPath ?? '(dry-run, not written)'}`,
  ];
  if (result.failureReason) {
    lines.push(`  failure:   ${result.failureReason}`);
  }
  lines.push('────────────────────────────────────────────────');
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  // Exit code:
  //   0 if we got tweets, OR if we got 0 tweets but at least one source was
  //     reachable (legitimate empty week is fine).
  //   1 if both sources failed AND we never fetched anything (hard failure --
  //     the upstream caller can decide whether this is fatal for the pipeline).
  if (result.tweets.length === 0 && result.source === 'cached') {
    return 1;
  }
  return 0;
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('cli.ts') === true ||
  process.argv[1]?.endsWith('cli.js') === true;

if (isDirectInvocation) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { main, parseArgs };
