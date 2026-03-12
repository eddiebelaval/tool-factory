# Tool Factory — BUILDING.md

## What This Is

A machine that builds machines. The Tool Factory is id8Labs' system for creating, testing, refurbishing, and managing every tool in the toolkit: skills, MCP servers, plugins, agents, hooks, and compositions.

> **Triad:** [VISION.md](VISION.md) (future) | [SPEC.md](SPEC.md) (present) | BUILDING.md (past)

---

## Build Log

### 2026-03-12 — Foundation: Audit + Registry + Lexicon

**Why:** Eddie has 460 tools (284 skills, 58 commands, 46 hooks, 35 agents, 22 plugins, 15 MCP servers) accumulated over months of building. No single source of truth. Duplicate detection was manual. Tool quality was inconsistent. No lifecycle management — tools were built and forgotten.

**What was built:**
- **Registry** (`registry/index.json`): Complete inventory of all 460 tools with metadata, status tracking, and duplicate flags. 16 duplicate clusters identified.
- **Lexicon** (`lexicon/`): Three constraint documents encoding best practices from Anthropic (prompt engineering, MCP spec, skill conventions), OpenAI (function schemas, eval patterns, multi-model routing), and id8Labs (brand voice, engineering standards, shipping requirements).
- **Directory structure**: Full factory layout — lexicon, generators, range, workshop, registry, composer, validator.
- **Architecture visualization**: Interactive HTML at `~/Development/artifacts/id8labs/tool-factory-architecture.html` with 5 views (Pipeline, Spaces, Lexicon, Lifecycle, Structure).

**Architecture decisions:**
- Two layers, not three. Factory builds tools; tools do work. Tools don't build more tools.
- Completion Gate closes the loop — every tool tested against original problem statement.
- Three spaces (Factory Floor, Range, Workshop) create a lifecycle, not a linear pipeline.
- Lexicon is enforcement, not documentation — non-compliance is a build failure.

**Duplicate clusters found:**
- pitch-deck-builder / pitch-deck-creator
- copywriter / copywriting
- pricing-strategist / pricing-strategy
- referral-program / referral-program-designer
- community-builder / community-manager
- competitive-intelligence / competitor-tracker
- workflow-automator / workflow-designer / automation-architect
- social-content / social-post-creator / social-caption-writer
- landing-page-designer / landing-page-optimizer / build-landing-page
- performance-optimization / performance-profiler
- seo-analyst / seo-audit
- ab-test-designer / ab-test-setup
- agent-orchestrator / agent-workflow-builder
- onboarding-designer / client-onboarding-designer
- word-document-creator / word-processor-expert
- creator-partnership-manager / influencer-finder

### 2026-03-12 — Generators + Range + Usage Tracking

**Why:** The registry showed 460 tools but no way to build new ones consistently, test existing ones, or know which ones are actually used. Three gaps: creation, quality, visibility.

**What was built:**

**Skill Generator** (`generators/skill.sh`):
- Automated skill creation from problem statement
- Intake: name, purpose, category
- Outputs: lexicon-compliant SKILL.md + test fixture + registry entry
- Built-in duplicate detection (checks registry for similar names)
- Lexicon compliance check runs at generation time (6 checks: frontmatter, triggers, workflows, emojis, tokens, quick reference)
- Tested: generates skills that score 85+ on the Range out of the box

**Range Runner** (`range/runner.sh`):
- Scores skills against 14 criteria across 3 categories (100 points max):
  - Lexicon Compliance (40 pts): frontmatter, triggers, emojis, token budget
  - Structure (30 pts): description, workflows, quick reference, constraints, numbered steps
  - Content Quality (30 pts): category, tags, version, content depth, examples
- Three verdicts: PASS (85+), PARTIAL (60-84), FAIL (<60)
- Outputs JSON scorecards to `range/reports/`
- Supports single tool, batch (`--all`), and summary (`--report`) modes
- First batch results (10 skills): 2 PASS, 2 PARTIAL, 7 FAIL
  - Marketplace template skills score 100/100 (copywriter, pitch-deck-builder)
  - Custom-built skills score 37-60 (ship, verify, heal, reconcile, supabase-expert)
  - Pattern: template skills have structure; hand-built skills have content but no structure

**Usage Tracker** (`registry/track-usage.sh`):
- Logs tool invocations to `registry/usage/YYYY-MM-DD.jsonl`
- Updates `last_used` field in registry
- Wired into existing `track-skill-usage.sh` hook — every skill invocation now tracked locally
- Supports both CLI args and stdin (hook-compatible)

**First Range Results — The Workshop Queue:**
| Tool | Score | Verdict | Issue |
|------|-------|---------|-------|
| copywriter | 100 | PASS | -- |
| pitch-deck-builder | 100 | PASS | -- |
| senior-fullstack | 60 | PARTIAL | No triggers, no workflow section |
| audit | 60 | PARTIAL | No triggers, no workflow section |
| browser-use | 57 | FAIL | No triggers, no workflows, no constraints |
| supabase-expert | 50 | FAIL | No triggers, 3247 tokens (over budget) |
| llc-ops | 50 | FAIL | No triggers, 6323 tokens (way over) |
| ship | 45 | FAIL | No frontmatter, no triggers, no description |
| heal | 45 | FAIL | No frontmatter, no triggers, no description |
| reconcile | 40 | FAIL | No frontmatter, 3232 tokens (over) |
| verify | 37 | FAIL | No frontmatter, no triggers, no workflows |

**Key insight:** The custom-built skills (ship, heal, verify, reconcile) are the most-used but worst-scored. They work because they're substantive — real content, real logic — but they violate every structural convention. The Workshop's first job is to retrofit these with frontmatter, triggers, and workflow headers without breaking the content that makes them valuable.

### 2026-03-12 — Workshop Sprint: 7 Skills Retrofitted

**Why:** The Range identified 7 high-value skills scoring 37-60 (FAIL) due to missing structural conventions (frontmatter, triggers, workflows). These are the most-used skills in the toolkit — they needed structure without losing their substance.

**What was done:**
- Added YAML frontmatter (name, slug, description, category, complexity, version, author, triggers, tags) to all 7 skills
- Added Core Workflows sections with numbered step sequences
- Added Quick Reference tables where missing
- Zero content changes — only structural additions

**Results — Before/After Range Scores:**
| Skill | Before | After | Delta |
|-------|--------|-------|-------|
| ship | 45 | 95 | +50 |
| heal | 45 | 95 | +50 |
| verify | 37 | 88 | +51 |
| reconcile | 40 | 90 | +50 |
| supabase-expert | 50 | 85 | +35 |
| llc-ops | 50 | 85 | +35 |
| browser-use | 57 | 88 | +31 |

**Pattern confirmed:** Structure is additive, not destructive. The Workshop adds conventions *onto* existing content. Token budget is the only remaining constraint — llc-ops (6499 tokens), supabase-expert (3538), and reconcile (3450) are over budget but pass because content depth compensates. This is by design: the Range rewards substance over brevity.

**Duplicate Resolution:**
- 12 duplicate skills retired to `registry/retired/` (including pricing-strategy)
- 6 clusters separated (different purposes confirmed by content comparison)
- All 16 duplicate clusters resolved

### 2026-03-12 — Full Generator Suite: Agents, Commands, Hooks, MCP

**Why:** The skill generator proved the pattern — automated creation with lexicon compliance, duplicate detection, and registry integration. But skills are only 1 of 5 tool types. Agents, commands, hooks, and MCP servers each have different file formats, different registration mechanisms, and different conventions.

**What was built:**

**Agent Generator** (`generators/agent.sh`):
- Creates `.md` with YAML frontmatter in `~/.claude/agents/`
- Includes: name, description with `<example>` tags, model selection, color
- Body template with responsibilities, approach, expertise sections
- 5-point compliance check (frontmatter, name, examples, model, emojis)
- Test fixture + registry entry

**Command Generator** (`generators/command.sh`):
- Creates `.md` in `~/.claude/commands/` (auto-discovered as slash command)
- Pre-computed context section with bash variables
- Usage section with flags
- 3-phase workflow template (Detect -> Execute -> Report)
- Test fixture + registry entry

**Hook Generator** (`generators/hook.sh`):
- Creates executable `.sh` in `~/.claude/hooks/`
- **Auto-registers** in `settings.json` under the specified event
- Supports 5 events: SessionStart, SessionEnd, Notification, Stop, PostToolUse
- Template includes stdin JSON parsing pattern, exit code conventions
- Test fixture + registry entry

**MCP Server Generator** (`generators/mcp.sh`):
- Adds JSON entry to `~/.claude/mcpServers.json`
- Supports command-based (`--command` + `--args`) and HTTP-based (`--url`) servers
- Environment variable injection via `--env`
- Duplicate detection against existing config
- Test fixture + registry entry

**Key difference between generators:** Skills, agents, and commands are "file-drop" — create a file in the right directory and it's discovered. Hooks require both a script AND a `settings.json` registration. MCP servers require a JSON config entry. The hook and MCP generators handle this extra registration step automatically.

**All 5 generators now follow the same contract:**
1. Validate input (name format, duplicates)
2. Generate the tool artifact (format varies by type)
3. Register if needed (hooks in settings.json, MCP in mcpServers.json)
4. Create test fixture in `range/fixtures/`
5. Update `registry/index.json`
6. Run compliance check (skills only — others have simpler conventions)
7. Report with status BORN

### 2026-03-12 — Workshop Automation: Batch Retrofit

**Why:** The manual Workshop sprint proved the pattern — structural additions raise Range scores by 30-50 points without breaking content. But 7 skills took focused human effort. The remaining 86 FAIL skills needed the same treatment at machine speed.

**What was built:**

**Retrofit Script** (`workshop/retrofit.sh`):
- Automated non-destructive structural addition for skills that FAIL the Range
- Supports: single skill, `--all` (batch), `--dry-run` (preview)
- Fixes applied:
  - Missing YAML frontmatter → adds complete block (name, slug, description, category, complexity, version, author, triggers, tags)
  - Partial frontmatter → adds only missing fields (never overwrites existing)
  - Missing "Core Workflows" section → inserts after frontmatter with template workflow
- Category auto-detection from content keywords (deploy/ship→operations, test/verify→testing, market/seo→marketing, etc.)
- Tags include `tool-factory-retrofitted` for traceability

**Batch results:**
| Metric | Count |
|--------|-------|
| Total skills scanned | 314 |
| Retrofitted | 86 |
| Already compliant | 228 |

**Key insight:** 73% of skills were already compliant — mostly marketplace templates that shipped with full structure. The remaining 27% were custom-built skills with real substance but no structural conventions. Same pattern as the manual sprint, just at scale.

### 2026-03-12 — Composer: Pipeline Chaining

**Why:** Tools work independently — run a skill, then a hook, then a command. But common workflows chain them: preflight checks before shipping, validation before deploy. Composer lets you define these chains as named, validated, reusable YAML pipelines.

**What was built:**

**Composer** (`composer/compose.sh`):
- 4 subcommands: `new`, `list`, `validate`, `run`
- Compositions stored as YAML in `composer/compositions/`
- 5 step types: `skill`, `command`, `hook`, `agent`, `shell`
- Sequential execution — stops on first failure unless `continue_on_fail: true`
- Skills and commands are "queued" (logged for Claude invocation) since they require the Claude runtime
- Hooks and shell commands execute directly
- Validate checks all referenced tools exist at expected filesystem paths

**Example composition** (`preflight-ship.yaml`):
```yaml
steps:
  - type: shell     → typecheck (npx tsc --noEmit)
  - type: shell     → build (npm run build)
  - type: skill     → verify (quick)
  - type: command   → ship (--no-merge)
```

**Architecture decision:** Composer is a bash orchestrator, not a Claude skill. This is deliberate — it runs outside Claude's context window, so pipelines can chain 20 steps without burning tokens. Skills and commands get "queued" as messages rather than auto-invoked, because those require Claude's inference loop. The hybrid approach: shell/hook steps execute immediately, Claude-dependent steps get logged for invocation.

**Bug fixed during build:** Python's `.strip("'")` strips ALL matching characters from both ends, not just matching pairs. Command `echo '[preflight]...'` had its trailing `'` stripped, leaving an unmatched quote. Fixed with explicit pair detection: `if v.startswith("'") and v.endswith("'"): v = v[1:-1]`.

### 2026-03-12 — Usage Intelligence + Self-Healing Lifecycle

**Why:** The factory could build, test, and refurbish tools — but it was blind. 314 skills existed with no visibility into which ones were actually used, which were dead weight, and which were decaying. The usage tracker wrote JSONL but nothing read it. The workshop fixed tools manually but nothing triggered it. Two gaps: intelligence (what's happening) and automation (what to do about it).

**What was built:**

**PostToolUse Hook Wiring:**
- `track-skill-usage.sh` was already calling the factory's `track-usage.sh`, but it was never registered as a PostToolUse hook in `settings.json`
- Added `Skill` matcher to PostToolUse events — now every skill invocation writes to both the id8labs API and local JSONL
- Data flows: Skill invoked -> PostToolUse fires -> `track-skill-usage.sh` -> (1) id8labs API + (2) `track-usage.sh` -> JSONL + registry update

**Intelligence Script** (`registry/intelligence.sh`):
- Merges two data sources: local JSONL files + id8labs.app API (cached locally)
- 5 report sections: Fleet Health, Top Used, Decay Risk, Ghost Tools, Dormant
- Key metrics surfaced:
  - 8 tools have recorded usage out of 314 (97% dark — expected, hook just wired)
  - 183 ghost tools (high score, zero usage)
  - 1 decay risk: omni-vu (2x used, 53/100 FAIL)
  - Top 5: commit (45x), fix (23x), ship (15x), test (12x), verify (10x)
- Subcommands: `--top`, `--dormant`, `--decay`, `--ghost`, `--health`

**Lifecycle Script** (`registry/lifecycle.sh`):
- 4-phase automated maintenance cycle:
  1. Range Scoring — re-scores all skills
  2. Auto-Retrofit — runs `workshop/retrofit.sh --all` on FAILs
  3. Dormant Detection — flags tools unused for 60+ days
  4. Decay Alerts — cross-references usage with scores, assigns priority (HIGH/MEDIUM/LOW)
- Generates markdown reports to `registry/lifecycle-reports/`
- Supports `--dry-run` and `--report` modes for safe preview
- Designed for scheduled execution (launchd) but runnable manually

**Triad Documents:**
- Created VISION.md (7 pillars, 4 realized, Anti-Vision immune system)
- Created SPEC.md (present-tense capabilities, 17-point Verification Surface)
- Cross-linked all three via Triad reference in BUILDING.md header
- VISION-SPEC gap reveals remaining roadmap: deeper Composer (branching/parallel), time-series dashboards, scheduled lifecycle runs

**Key insight:** The intelligence report immediately proved its value. 183 ghost tools — structurally perfect, never used — is the clearest retirement signal possible. These are marketplace templates that score 100/100 but serve no actual need. The factory now knows the difference between "high quality" and "valuable."

### 2026-03-12 — Sprint 2: Close the Loop

**Why:** Sprint 1 built the factory. Sprint 2 closes the self-healing loop — the factory now runs itself, detects regressions, dispatches alerts, and builds time-series data for trend analysis. The Composer also graduates from flat pipelines to branching workflows with shared state.

**What was built:**

**Score History + Regression Detection:**
- Each lifecycle run now snapshots all scores to `registry/score-history.jsonl` (append-only JSONL, one line per tool per run)
- `intelligence.sh --trends` compares the two most recent snapshots: flags regressions (>15pt drops), improvements (>10pt gains), fleet average trend (IMPROVING/STABLE/DECLINING), verdict distribution changes
- 261 scores per snapshot, ~95K lines/year at daily runs — trivially small
- First snapshot: 261 tools, avg 82/100

**Composer: Environment Variable Injection:**
- `export_as: VAR_NAME` captures step stdout into a variable available to all subsequent steps
- `env: KEY=value` injects per-step environment variables
- Variables accumulate across steps via temp file (solves bash subshell boundary)
- Tested: step 1 exports VERSION=2.5.0, step 2 reads it alongside injected DEPLOY_TARGET=staging

**Composer: Conditional Branching:**
- `on_fail: step-name` jumps to a named step on failure, skipping intermediate steps
- `skip: true` marks steps as jump-only targets (not executed in normal flow)
- Replaced simple while-loop with step-name-based execution engine
- Tested: failing step jumps to fallback, intermediate "should-not-run" step correctly skipped

**Scheduled Lifecycle (launchd):**
- `scripts/scheduled-lifecycle.sh` — wrapper that runs lifecycle, parses output, dispatches notifications
- Mode selection: dry-run reports weekdays, live fixes on Sundays
- Notification dispatch via HYDRA's `notify-eddie.sh`:
  - URGENT: Score regression >20pts (immediate attention)
  - NORMAL: Decay alerts (used tools with bad scores)
  - SILENT: Weekly dormant report (Sundays only)
- Regression detection: Python compares latest two dates in score-history.jsonl
- Two launchd plists loaded:
  - `com.id8labs.tool-factory.lifecycle` — daily 2 AM
  - `com.id8labs.tool-factory.intelligence` — daily 3 AM

**VISION alignment: 70% -> 90%**
- Pipeline Composition: 30% -> 60% (env injection + branching)
- Usage Intelligence: 60% -> 85% (score history + trends + regression)
- Self-Healing Lifecycle: 40% -> 80% (scheduled + notifications + regression alerts)

**Remaining to full VISION:** Parallel step execution in Composer, visual time-series dashboards, automatic retirement proposals, self-tuning thresholds.
