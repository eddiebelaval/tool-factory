# SPEC.md -- Living Specification
## Tool Factory

> Last reconciled: 2026-03-12 | Build stage: Operational
> Drift status: CURRENT
> VISION alignment: 90% (4 realized, 3 advanced partial)

---

## Identity

The Tool Factory is id8Labs' internal infrastructure for creating, testing, refurbishing, and managing every tool in the Claude Code toolkit. It lives at `~/Development/id8/tool-factory/` and operates through bash scripts, Python parsers, and YAML configuration. The factory manages 460 tools across 6 types: skills (284), slash commands (58), hooks (46), agents (35), plugins (22), and MCP servers (15).

## Capabilities

What this system can do TODAY.

### Registry

- **Single source of truth:** `registry/index.json` catalogs all 460 tools with metadata (name, type, status, category, path, duplicate flags).
- **Duplicate tracking:** 16 duplicate clusters identified. 12 retired to `registry/retired/`. 6 separated as different purposes. All resolved.
- **Usage logging:** `registry/track-usage.sh` writes invocations to `registry/usage/YYYY-MM-DD.jsonl`. Updates `last_used` in registry. Wired to `track-skill-usage.sh` hook for automatic capture.

### Lexicon

- **Three constraint documents:** `lexicon/anthropic.md` (prompt engineering, MCP spec, skill conventions), `lexicon/openai.md` (function schemas, eval patterns, multi-model routing), `lexicon/id8labs.md` (brand voice, engineering standards, shipping requirements).
- **Enforcement model:** Compliance checked at generation time (skill generator runs 6 checks) and at scoring time (Range evaluates 14 criteria). The Lexicon is a build requirement, not documentation.

### Generators

Five generators, all following the same 7-step contract: validate input, generate artifact, register if needed, create test fixture, update registry, run compliance check, report status.

| Generator | Creates | Output Location | Registration |
|-----------|---------|----------------|-------------|
| `generators/skill.sh` | SKILL.md with frontmatter | `~/.claude/skills/<name>/` | File-drop (auto-discovered) |
| `generators/agent.sh` | Agent .md with YAML + examples | `~/.claude/agents/` | File-drop |
| `generators/command.sh` | Command .md with workflow | `~/.claude/commands/` | File-drop |
| `generators/hook.sh` | Executable .sh + settings.json entry | `~/.claude/hooks/` | Script + settings.json |
| `generators/mcp.sh` | JSON config entry | `~/.claude/mcpServers.json` | JSON config |

- **Skill generator** runs 6 lexicon compliance checks at generation time (frontmatter, triggers, workflows, emojis, tokens, quick reference). Generated skills score 85+ on the Range.
- **Hook generator** auto-registers in `settings.json` under the specified event (SessionStart, SessionEnd, Notification, Stop, PostToolUse).
- **MCP generator** supports command-based (`--command` + `--args`) and HTTP-based (`--url`) servers with environment variable injection.
- All generators include duplicate detection against existing registry/config.

### Range (Quality Scoring)

- **Runner:** `range/runner.sh` scores skills against 14 criteria across 3 categories.
- **Scoring breakdown:**
  - Lexicon Compliance (40 pts): frontmatter presence, triggers, emoji-free, token budget
  - Structure (30 pts): description, Core Workflows section, Quick Reference, constraints, numbered steps
  - Content Quality (30 pts): category, tags, version, content depth, examples
- **Verdicts:** PASS (85+), PARTIAL (60-84), FAIL (<60)
- **Output:** JSON scorecards to `range/reports/`. Supports single skill, batch (`--all`), summary (`--report`).
- **Fleet status (post-automation):**

| Verdict | Count | Percentage |
|---------|-------|-----------|
| PASS | 187 | 72% |
| PARTIAL | 11 | 4% |
| FAIL | 63 | 24% |
| **Total** | **261** | 100% |

### Workshop (Refurbishment)

- **Manual mode:** Direct editing of individual skills based on Range scorecards.
- **Automated mode:** `workshop/retrofit.sh` batch-retrofits failing skills.
  - Supports: single skill, `--all` (batch), `--dry-run` (preview)
  - Fixes: missing frontmatter (adds complete block), partial frontmatter (adds missing fields), missing Core Workflows section
  - Category auto-detection from content keywords
  - Non-destructive: only adds structure, never overwrites existing content
  - Tags retrofitted skills with `tool-factory-retrofitted` for traceability
- **Batch results:** 86 skills retrofitted out of 314 scanned (228 already compliant).
- **Manual sprint results:** 7 high-value skills (ship, heal, verify, reconcile, supabase-expert, llc-ops, browser-use) raised from 37-57 to 85-95.

### Composer (Pipeline Chaining)

- **Orchestrator:** `composer/compose.sh` with 4 subcommands: `new`, `list`, `validate`, `run`.
- **Compositions:** YAML files in `composer/compositions/`. Define sequential step pipelines.
- **Step types:**

| Type | Execution | Example |
|------|----------|---------|
| `shell` | Runs directly via bash | `npm run build` |
| `hook` | Runs hook script from `~/.claude/hooks/` | `play-sound success` |
| `skill` | Queued for Claude invocation | `verify quick` |
| `command` | Queued for Claude invocation | `ship --no-merge` |
| `agent` | Referenced (documentation only) | Agent routing |

- **Flow control:** Sequential execution. Stops on first failure. `continue_on_fail: true` skips failures.
- **Environment variable injection:** `export_as: VAR_NAME` captures step stdout into a variable available to subsequent steps. `env: KEY=value` injects per-step environment variables. Variables accumulate across steps via temp file.
- **Conditional branching:** `on_fail: step-name` jumps to a named step on failure (skipping intermediate steps). `skip: true` marks steps as jump-only targets (not executed in normal flow).
- **Validate:** Checks all referenced tools exist at expected filesystem paths before running.
- **Example:** `preflight-ship.yaml` chains typecheck, build, verify, ship.

### Usage Intelligence

- **Intelligence script:** `registry/intelligence.sh` generates fleet-wide reports from merged data sources.
- **Data sources:**
  - Local JSONL files in `registry/usage/` (written by PostToolUse hook via `track-usage.sh`)
  - id8labs.app API (`/api/claude-stats`) — historical usage counts, cached locally
- **Report sections:**

| Section | What It Shows |
|---------|-------------|
| Fleet Health | Total skills, tracked vs dark, PASS/PARTIAL/FAIL counts, ghost + decay counts |
| Top Used | Most-invoked tools with Range scores and usage bars |
| Decay Risk | Used tools with failing scores — action items with fix commands |
| Ghost Tools | High-score tools with zero usage — retirement candidates |
| Dormant | All tools with no recorded usage |

- **Subcommands:** `--top`, `--dormant`, `--decay`, `--ghost`, `--health`, `--trends`, or full report (default).
- **Score trends (`--trends`):** Reads `registry/score-history.jsonl` and compares latest two snapshots. Reports: regressions (>15pt drops), improvements (>10pt gains), fleet average trend (IMPROVING/STABLE/DECLINING), verdict distribution changes.
- **PostToolUse hook:** Wired in `settings.json` — fires `track-skill-usage.sh` on every Skill invocation, which calls both the id8labs API and the local `track-usage.sh`.

### Self-Healing Lifecycle

- **Lifecycle script:** `registry/lifecycle.sh` runs a 4-phase automated maintenance cycle.
- **Phases:**

| Phase | Action |
|-------|--------|
| 1. Range Scoring | Re-scores all skills, reports PASS/PARTIAL/FAIL distribution, snapshots scores to `score-history.jsonl` |
| 2. Auto-Retrofit | Runs `workshop/retrofit.sh --all` on any skills below threshold |
| 3. Dormant Detection | Flags tools unused for 60+ days (configurable threshold) |
| 4. Decay Alerts | Cross-references usage with scores — surfaces used-but-failing tools with priority (HIGH/MEDIUM/LOW) |

- **Modes:** `--score`, `--fix`, `--flag-dormant`, `--report` (dry-run), `--dry-run`, or full cycle (default).
- **Score history:** Each lifecycle run appends all scores to `registry/score-history.jsonl` (one JSONL line per tool: date, tool, score, verdict). Enables regression detection via `intelligence.sh --trends`.
- **Scheduled execution:** Two launchd plists fire daily:
  - `com.id8labs.tool-factory.lifecycle` — 2 AM, runs `scripts/scheduled-lifecycle.sh` (dry-run weekdays, live on Sundays)
  - `com.id8labs.tool-factory.intelligence` — 3 AM, runs `intelligence.sh --health`
- **Notification dispatch:** Wrapper script uses HYDRA's `notify-eddie.sh` for alerts:
  - URGENT: Score regression >20pts
  - NORMAL: Decay alerts (used tools with bad scores)
  - SILENT: Weekly dormant report (Sundays only)
- **Reports:** Markdown reports to `registry/lifecycle-reports/YYYY-MM-DD.md`.

## Architecture

```
tool-factory/
  BUILDING.md              # Build journal (append-only history)
  VISION.md                # North star (rewritten when direction changes)
  SPEC.md                  # This file (present-tense reality)
  lexicon/
    anthropic.md           # Anthropic best practices
    openai.md              # OpenAI best practices
    id8labs.md             # id8Labs standards
  generators/
    skill.sh               # Skill generator (SKILL.md + frontmatter)
    agent.sh               # Agent generator (.md + YAML)
    command.sh             # Command generator (.md)
    hook.sh                # Hook generator (.sh + settings.json)
    mcp.sh                 # MCP generator (JSON config)
  range/
    runner.sh              # 14-criteria scorer
    reports/               # JSON scorecards
    fixtures/              # Test fixtures from generators
  workshop/
    retrofit.sh            # Automated batch retrofitter
  composer/
    compose.sh             # Pipeline orchestrator
    compositions/          # YAML pipeline definitions
      preflight-ship.yaml  # Example: typecheck -> build -> verify -> ship
  registry/
    index.json             # Single source of truth (460 tools)
    track-usage.sh         # Usage logger (JSONL)
    intelligence.sh        # Fleet health + usage reports + trends
    lifecycle.sh           # Self-healing maintenance cycle
    score-history.jsonl    # Append-only score snapshots (one line/tool/run)
    usage/                 # Daily usage logs (JSONL)
    lifecycle-reports/     # Maintenance cycle reports (markdown)
    retired/               # Retired duplicate tools
  scripts/
    scheduled-lifecycle.sh # launchd wrapper with notification dispatch
  validator/               # (Placeholder -- future validation tools)
```

## Verification Surface

Assertions testable against the live system:

- [ ] `registry/index.json` exists and contains entries for all 6 tool types
- [ ] `generators/skill.sh "test-skill" "Test" "testing"` creates a valid SKILL.md that scores 85+ on the Range
- [ ] `generators/agent.sh "test-agent" "Test agent"` creates a valid agent .md
- [ ] `generators/command.sh "test-cmd" "Test command"` creates a valid command .md
- [ ] `generators/hook.sh "test-hook" "Test hook" SessionStart` creates executable .sh AND registers in settings.json
- [ ] `generators/mcp.sh "test-mcp" "Test" --command npx --args "test"` adds entry to mcpServers.json
- [ ] `range/runner.sh ship` returns a score >= 85 (PASS)
- [ ] `range/runner.sh --report` outputs fleet-wide summary with PASS/PARTIAL/FAIL counts
- [ ] `workshop/retrofit.sh --dry-run --all` runs without error and reports changes
- [ ] `composer/compose.sh validate preflight-ship` validates all steps exist
- [ ] `composer/compose.sh run preflight-ship` executes shell steps and queues skill/command steps
- [ ] `composer/compose.sh list` shows all compositions with descriptions and step counts
- [ ] `composer/compose.sh new test-pipeline` creates a valid YAML template
- [ ] `registry/intelligence.sh --health` outputs fleet health with usage/score cross-reference
- [ ] `registry/intelligence.sh --decay` identifies used tools with failing scores
- [ ] `registry/lifecycle.sh --report` runs 4-phase maintenance cycle in dry-run mode
- [ ] PostToolUse hook fires `track-skill-usage.sh` on Skill invocations (check `settings.json`)
- [ ] `registry/intelligence.sh --trends` reads score-history.jsonl and reports trend data
- [ ] `registry/lifecycle.sh --score` appends scores to `registry/score-history.jsonl`
- [ ] `composer/compose.sh run test-env.yaml` passes env variables between steps (VERSION=2.5.0)
- [ ] `composer/compose.sh run test-branch.yaml` jumps to fallback on failure, skips intermediate steps
- [ ] `scripts/scheduled-lifecycle.sh` runs lifecycle and dispatches notifications on alerts
- [ ] `plutil ~/Library/LaunchAgents/com.id8labs.tool-factory.lifecycle.plist` validates OK
- [ ] `plutil ~/Library/LaunchAgents/com.id8labs.tool-factory.intelligence.plist` validates OK
- [ ] `launchctl list | grep tool-factory` shows both jobs loaded

## Drift Log

| Date | What Drifted | Resolution |
|------|-------------|-----------|
| 2026-03-12 | Initial spec | Written alongside VISION.md from complete BUILDING.md history |
| 2026-03-12 | Usage Intelligence + Lifecycle added | intelligence.sh, lifecycle.sh, PostToolUse hook wired. VISION alignment 60% -> 70% |
| 2026-03-12 | Sprint 2: Close the Loop | Score history + trends, Composer env/branching, scheduled lifecycle (launchd), HYDRA notifications. VISION alignment 70% -> 90% |
