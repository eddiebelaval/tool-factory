# Tool Factory

A self-healing lifecycle system for Claude Code tools. Build, score, refurbish, and manage skills, agents, hooks, commands, and MCP servers at scale.

## The Problem

Claude Code's tool ecosystem grows fast. After months of building, you end up with hundreds of tools — skills, agents, hooks, commands, MCP servers, plugins — and no way to know which ones work, which are duplicates, and which are dead weight. Quality is inconsistent. Tools rot silently.

## The Solution

Tool Factory treats tools like products. Born with standards, tested against criteria, refurbished when they drift, retired when they're obsolete. A machine that builds machines — and maintains them.

### Architecture

Two layers, three spaces:

```
Layer 1: Factory (builds and maintains tools)
Layer 2: Tools  (the skills/agents/hooks that do actual work)

Factory Floor (generators/)  -- Creates new tools from templates
Range         (range/)       -- Scores tools against fitness criteria
Workshop      (workshop/)    -- Auto-retrofits failing tools
```

### Directory Structure

```
tool-factory/
  generators/          # Tool creators (skill, agent, command, hook, MCP)
  range/               # Quality scoring (14 criteria, 100-point scale)
  workshop/            # Auto-retrofit for failing tools
  composer/            # Pipeline chaining (YAML compositions)
  registry/            # Tool inventory + intelligence + lifecycle
    index.json         # Single source of truth for all tools
    intelligence.sh    # Fleet health, usage, trends, dormant detection
    lifecycle.sh       # 4-phase maintenance cycle
    score-history.jsonl # Append-only score snapshots
    track-usage.sh     # Invocation logger
  lexicon/             # Constraint documents (best practices per vendor)
  scripts/             # Automation (scheduled lifecycle wrapper)
  lib/                 # Shared utilities (colors, etc.)
  validator/           # Structural validation
  VISION.md            # Where we're going (north star)
  SPEC.md              # What exists today (living spec)
  BUILDING.md          # How we got here (build log)
```

## Quick Start

### Create a Tool

```bash
# Generate a new skill with frontmatter, test fixtures, and registry entry
bash generators/skill.sh my-new-skill

# Generate other tool types
bash generators/agent.sh my-agent
bash generators/command.sh my-command
bash generators/hook.sh my-hook
bash generators/mcp.sh my-mcp-server
```

### Score Your Tools

```bash
# Score a single tool
bash range/runner.sh my-skill

# Score all tools (fleet-wide)
bash range/runner.sh --all

# Report mode (no changes)
bash range/runner.sh --report
```

Scoring evaluates 14 criteria across 3 categories on a 100-point scale. Results: PASS (70+), PARTIAL (40-69), FAIL (<40).

### Retrofit Failing Tools

```bash
# Fix a single tool
bash workshop/retrofit.sh my-skill

# Fix all failing tools
bash workshop/retrofit.sh --all
```

The Workshop adds missing structure (frontmatter, triggers, workflows) without touching the content that makes tools valuable.

### Fleet Intelligence

```bash
# Fleet health overview
bash registry/intelligence.sh --health

# Usage analysis (top tools, ghost tools, decay risk)
bash registry/intelligence.sh --usage

# Score trends and regression detection
bash registry/intelligence.sh --trends

# Full intelligence report
bash registry/intelligence.sh
```

### Run the Lifecycle

```bash
# Full 4-phase maintenance: score -> retrofit -> dormant check -> decay alerts
bash registry/lifecycle.sh

# Report mode (dry run, no changes)
bash registry/lifecycle.sh --report

# Individual phases
bash registry/lifecycle.sh --score
bash registry/lifecycle.sh --fix
bash registry/lifecycle.sh --flag-dormant
```

### Compose Pipelines

```bash
# Create a new pipeline
bash composer/compose.sh new my-pipeline

# List all pipelines
bash composer/compose.sh list

# Validate a pipeline
bash composer/compose.sh validate my-pipeline

# Run a pipeline
bash composer/compose.sh run my-pipeline
```

Compositions are YAML files that chain tools into sequential workflows:

```yaml
name: deploy-pipeline
description: Score, fix, and report
steps:
  - type: shell
    name: preflight
    command: "echo 'Starting...'"

  - type: shell
    name: get-version
    command: "cat package.json | jq -r .version"
    export_as: VERSION

  - type: shell
    name: test
    command: "npm test"
    on_fail: fallback-lint

  - type: shell
    name: deploy
    command: "echo Deploying v$VERSION"

  - type: shell
    name: fallback-lint
    command: "npm run lint"
    skip: true
```

Features: environment variable injection (`export_as`), conditional branching (`on_fail`), jump-only steps (`skip: true`), and `continue_on_fail` for non-critical steps.

### Schedule Automated Maintenance (macOS)

The scheduled lifecycle runs daily via launchd — dry-run reports on weekdays, live fixes on Sundays:

```bash
# Test the wrapper manually
bash scripts/scheduled-lifecycle.sh

# Force a live run (regardless of day)
bash scripts/scheduled-lifecycle.sh --force
```

See `scripts/` for launchd plist templates.

## The Triad

Tool Factory uses a three-document system instead of a PRD:

- **VISION.md** — Where we're going. Seven pillars, each with a realization percentage.
- **SPEC.md** — What exists today. Capabilities, architecture, verification surface.
- **BUILDING.md** — How we got here. Build log with decisions and rationale.

The delta between VISION and SPEC is the roadmap. Any two documents can reconstruct the third.

## Requirements

- macOS or Linux
- Bash 3.2+
- Python 3.6+
- Claude Code (for the tools themselves)

## License

MIT -- see [LICENSE](LICENSE).

## Author

Built by [id8Labs](https://id8labs.app) as part of the Claude Code tool ecosystem.
