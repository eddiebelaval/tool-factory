# VISION.md -- Living North Star
## Tool Factory

> Last evolved: 2026-03-12 | Confidence: HIGH
> Distance from SPEC: 10% (4 realized, 3 advanced partial)

---

## Soul

The Tool Factory exists because tools rot. id8Labs accumulated 460 tools over months of building -- skills, agents, hooks, commands, MCP servers, plugins -- and every one of them was built for a moment, then forgotten. No quality gate. No lifecycle. No way to know which tools worked, which were duplicates, and which were dead weight. The factory is the answer to one question: what if tools were treated like products? Born with standards, tested against criteria, refurbished when they drift, retired when they're obsolete. A machine that builds machines -- and maintains them.

## Pillars

1. **Lexicon Enforcement** -- REALIZED
   Three constraint documents (Anthropic, OpenAI, id8Labs) encode best practices for every tool type. Compliance is checked at generation time and scored on the Range. The Lexicon is not documentation -- it's a build requirement. Non-compliance is a failure.

2. **Automated Creation** -- REALIZED
   Five generators (skill, agent, command, hook, MCP) follow the same contract: validate, generate, register, fixture, report. Every tool born from the factory ships with frontmatter, test fixtures, and a registry entry. Duplicate detection prevents sprawl at creation time.

3. **Quality Scoring** -- REALIZED
   The Range scores tools against 14 criteria across 3 categories (100 points max). PASS/PARTIAL/FAIL verdicts. JSON scorecards. Batch mode for fleet-wide assessment. The Range is the single source of truth for tool health -- not opinion, not vibes, not "I think it works."

4. **Automated Refurbishment** -- REALIZED
   The Workshop retrofits failing tools with missing structure -- frontmatter, triggers, workflows -- without touching the content that makes them valuable. Manual mode for precision work, batch mode for fleet-wide sweeps. Structure is additive, never destructive.

5. **Pipeline Composition** -- PARTIAL (60%)
   Composer chains tools into named, validated, reusable YAML pipelines. Shell and hook steps execute directly; skill and command steps queue for Claude invocation. Environment variable injection (`export_as` captures stdout, `env` injects per-step). Conditional branching (`on_fail` jumps to named steps, `skip: true` for jump-only targets). Missing: parallel execution, output piping between steps, DAG-style dependency graphs.

6. **Usage Intelligence** -- PARTIAL (85%)
   Usage tracker logs invocations to JSONL and updates registry timestamps. PostToolUse hook wired for Skill events. API data from id8labs.app merged with local JSONL. Intelligence script surfaces fleet health, top-used tools, ghost tools, decay risk, dormant tools, and score trends. Score history (`score-history.jsonl`) enables regression detection across lifecycle runs. `--trends` subcommand shows regressions (>15pt drops), improvements, fleet average trend, and verdict distribution changes. Missing: time-series dashboards (visual), usage-weighted maintenance prioritization.

7. **Self-Healing Lifecycle** -- PARTIAL (80%)
   Lifecycle script runs a 4-phase maintenance cycle: Range scoring (with score history snapshots), auto-retrofit, dormant detection, decay alerts. Scheduled via launchd — daily 2 AM dry-run reports, weekly Sunday live runs with auto-fixes. Notification dispatch via HYDRA's `notify-eddie.sh` on decay alerts and critical score regressions (>20pt drops). Missing: automatic retirement proposals, self-tuning thresholds.

## User Truth

**Who:** Eddie (sole operator) and future id8Labs engineers. The factory serves anyone who builds with Claude Code's tool ecosystem and has enough tools that manual management becomes impossible.

**Before:** "I have 460 tools and no idea which ones work, which are duplicates, or which I actually use. Every new tool I build might already exist. Quality is inconsistent. I can't tell if a tool is good until I try it and it fails."

**After:** "Every tool has a score. I know what's passing, what needs work, and what's dead. New tools ship with full structure. Common workflows are named pipelines I can run with one command. The factory tells me what's broken before I discover it in production."

## Edges

- The Tool Factory builds tools; tools do work. Two layers, not three. Tools never build more tools.
- The factory is infrastructure, not product. It has no UI, no users beyond Eddie, no revenue target.
- The Lexicon enforces conventions, not creativity. It standardizes structure so content can vary freely.
- The Range scores structure and compliance, not usefulness. A perfectly-structured skill that does nothing useful will PASS. Usefulness is a human judgment the factory does not attempt to automate.
- The factory does not auto-fix content. Workshop adds structure. If the content itself is wrong, that's a human edit.

## Anti-Vision

- **Never become a product.** The factory is internal infrastructure. The moment it needs its own landing page, billing, or user onboarding, it has lost the plot.
- **Never auto-generate content.** The factory generates structure (frontmatter, sections, templates). It never writes the actual skill logic, the agent personality, or the command behavior. Content comes from the human building the tool.
- **Never create tools autonomously.** A tool is born from a problem statement. The factory helps birth it with standards. It does not decide what tools should exist.
- **Never conflate score with value.** A tool scoring 35 on the Range might be the most-used tool in the kit. Score measures compliance, not worth. The Workshop fixes compliance; only usage data measures worth.

## Evolution Log

| Date | What Changed | Why |
|------|-------------|-----|
| 2026-03-12 | Initial vision | Built from first day of factory construction -- registry, generators, Range, Workshop, Composer all built in single session |
| 2026-03-12 | Usage Intelligence + Self-Healing | intelligence.sh (fleet health reports), lifecycle.sh (4-phase maintenance cycle), PostToolUse hook wired. Pillars 6-7 move from UNREALIZED to PARTIAL. |
| 2026-03-12 | Sprint 2: Close the Loop | Score history + regression detection, Composer env injection + conditional branching, scheduled lifecycle (launchd 2AM/3AM), HYDRA notification dispatch. Pillars 5-7 advance: 30%->60%, 60%->85%, 40%->80%. VISION alignment: 70%->90%. |
