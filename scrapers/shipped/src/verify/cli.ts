#!/usr/bin/env node
/**
 * CLI entry point for the verifier.
 *
 *   pnpm verify <markdownPath> [--offline] [--no-network]
 *
 * Pretty-prints the report to stdout and exits with the report's exit code.
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { runVerification, formatReport } from "./index.js";
import type { VerifyOptions } from "./types.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    printUsage();
    return 1;
  }

  const path = argv.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("error: missing markdown path");
    printUsage();
    return 1;
  }

  const fullPath = resolve(path);
  if (!existsSync(fullPath)) {
    console.error(`error: file not found: ${fullPath}`);
    return 1;
  }

  const options: VerifyOptions = {
    offline: argv.includes("--offline"),
    skipNetworkGates: argv.includes("--no-network"),
  };

  try {
    const report = await runVerification(fullPath, options);
    const useColor = Boolean(process.stdout.isTTY);
    process.stdout.write(formatReport(report, useColor) + "\n");
    return report.exitCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Verification crashed: ${msg}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    return 1;
  }
}

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  pnpm verify <markdown-path> [options]",
      "",
      "Options:",
      "  --offline       Skip all network gates (URL liveness, attestation).",
      "  --no-network    Same as --offline.",
      "",
      "Examples:",
      "  pnpm verify ../../knowledge/series/shipped/issue-00-the-founding.md",
      "  pnpm verify issue-01.md --offline",
    ].join("\n"),
  );
}

main().then((code) => {
  process.exit(code);
});
