#!/bin/bash
# Tool Factory — Skill Generator
# Generates a lexicon-compliant Claude Code skill from a problem statement.
#
# Usage: ./skill.sh "skill-name" "One-line purpose" [category]
# Example: ./skill.sh "deploy-monitor" "Monitor Vercel deployments and alert on failures" operations
#
# Categories: development | operations | meta | design | data | testing | content | business | marketing
#
# Output: ~/.claude/skills/<skill-name>/SKILL.md (lexicon-compliant)
#         tool-factory/range/fixtures/<skill-name>.json (test fixture)
#         Updates tool-factory/registry/index.json

set -euo pipefail

# ─── Config ───
SKILLS_DIR="$HOME/.claude/skills"
FACTORY_DIR="$HOME/Development/id8/tool-factory"
REGISTRY="$FACTORY_DIR/registry/index.json"
FIXTURES_DIR="$FACTORY_DIR/range/fixtures"
REPORTS_DIR="$FACTORY_DIR/range/reports"

# ─── Colors ───
ORANGE='\033[38;2;239;111;46m'
TEAL='\033[38;2;78;205;196m'
AMBER='\033[38;2;245;158;11m'
RED='\033[38;2;239;68;68m'
GREEN='\033[38;2;34;197;94m'
GRAY='\033[38;2;119;119;119m'
WHITE='\033[38;2;238;238;238m'
RESET='\033[0m'

# ─── Input Validation ───
if [ $# -lt 2 ]; then
  echo -e "${RED}Usage: ./skill.sh \"skill-name\" \"One-line purpose\" [category]${RESET}"
  echo -e "${GRAY}Categories: development | operations | meta | design | data | testing | content | business | marketing${RESET}"
  exit 1
fi

SKILL_NAME="$1"
SKILL_PURPOSE="$2"
SKILL_CATEGORY="${3:-development}"

# Validate skill name (kebab-case)
if ! echo "$SKILL_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo -e "${RED}Skill name must be kebab-case (e.g., deploy-monitor)${RESET}"
  exit 1
fi

# Check for duplicates
SKILL_DIR="$SKILLS_DIR/$SKILL_NAME"
if [ -d "$SKILL_DIR" ]; then
  echo -e "${AMBER}Warning: Skill '$SKILL_NAME' already exists at $SKILL_DIR${RESET}"
  echo -e "${GRAY}Use the Workshop to refurbish existing skills.${RESET}"
  exit 1
fi

# Check registry for similar names
if [ -f "$REGISTRY" ]; then
  SIMILAR=$(python3 -c "
import json, sys
with open('$REGISTRY') as f:
    reg = json.load(f)
name = '$SKILL_NAME'
parts = set(name.split('-'))
matches = []
for s in reg.get('skills', []):
    sparts = set(s['name'].split('-'))
    overlap = parts & sparts
    if len(overlap) >= 2 and s['name'] != name:
        matches.append(s['name'])
for m in matches[:3]:
    print(m)
" 2>/dev/null || true)

  if [ -n "$SIMILAR" ]; then
    echo -e "${AMBER}Similar tools found in registry:${RESET}"
    echo "$SIMILAR" | while read -r line; do
      echo -e "  ${GRAY}- $line${RESET}"
    done
    echo -e "${GRAY}Proceeding anyway. Review for duplicates later.${RESET}"
    echo ""
  fi
fi

# ─── Generate Human-Readable Name ───
SKILL_DISPLAY_NAME=$(echo "$SKILL_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

echo -e "${ORANGE}Tool Factory${RESET} ${WHITE}— Generating skill: $SKILL_NAME${RESET}"
echo ""

# ─── Create Skill Directory ───
mkdir -p "$SKILL_DIR"

# ─── Generate SKILL.md ───
cat > "$SKILL_DIR/SKILL.md" << SKILL_EOF
---
name: $SKILL_DISPLAY_NAME
slug: $SKILL_NAME
description: $SKILL_PURPOSE
category: $SKILL_CATEGORY
complexity: complex
version: "1.0.0"
author: "id8Labs"
triggers:
  - "$SKILL_NAME"
  - "$(echo "$SKILL_NAME" | tr '-' ' ')"
tags:
  - $SKILL_CATEGORY
  - tool-factory-generated
---

# $SKILL_DISPLAY_NAME

$SKILL_PURPOSE.

## Core Workflows

### Workflow 1: Primary Action
1. **Analyze** the input and context
2. **Validate** prerequisites are met
3. **Execute** the core operation
4. **Verify** the output meets expectations
5. **Report** results with actionable next steps

### Workflow 2: Review and Iterate
1. **Assess** current state
2. **Identify** gaps or issues
3. **Recommend** specific improvements
4. **Apply** changes if approved
5. **Verify** improvements

## Quick Reference

| Action | Command/Trigger |
|--------|-----------------|
| Run primary workflow | "/$SKILL_NAME" or "$(echo "$SKILL_NAME" | tr '-' ' ')" |
| Review mode | "/$SKILL_NAME review" |

## Constraints

- Follow id8Labs engineering standards (TypeScript strict, no emojis in output)
- Verify before shipping (PEV pattern)
- Report failures directly — never dismiss as transient
- Stay within scope — do not expand beyond the stated purpose

## Best Practices

- Lead with action, not analysis
- Present 2 options max with a recommendation
- Skip preamble — get to the point
- If it can be done in one step, don't make it three
SKILL_EOF

echo -e "  ${GREEN}Created${RESET} $SKILL_DIR/SKILL.md"

# ─── Generate Test Fixture ───
mkdir -p "$FIXTURES_DIR"

cat > "$FIXTURES_DIR/$SKILL_NAME.json" << FIXTURE_EOF
{
  "tool": "$SKILL_NAME",
  "type": "skill",
  "created": "$(date +%Y-%m-%d)",
  "intake": {
    "problem": "$SKILL_PURPOSE",
    "category": "$SKILL_CATEGORY"
  },
  "tests": [
    {
      "name": "basic_invocation",
      "type": "live_fire",
      "prompt": "/$SKILL_NAME",
      "expected": "Skill activates and produces relevant output",
      "status": "pending"
    },
    {
      "name": "natural_trigger",
      "type": "live_fire",
      "prompt": "$(echo "$SKILL_NAME" | tr '-' ' ')",
      "expected": "Skill activates via natural language trigger",
      "status": "pending"
    },
    {
      "name": "edge_empty_input",
      "type": "edge_case",
      "prompt": "/$SKILL_NAME with no additional context",
      "expected": "Skill asks for clarification or uses sensible defaults",
      "status": "pending"
    }
  ],
  "scorecard": {
    "score": null,
    "tests_passed": 0,
    "tests_failed": 0,
    "tests_skipped": 0,
    "recommendation": null,
    "last_run": null
  }
}
FIXTURE_EOF

echo -e "  ${GREEN}Created${RESET} $FIXTURES_DIR/$SKILL_NAME.json"

# ─── Update Registry ───
if [ -f "$REGISTRY" ]; then
  python3 << PYEOF
import json

with open('$REGISTRY', 'r') as f:
    registry = json.load(f)

# Add to skills array
new_skill = {
    "name": "$SKILL_NAME",
    "type": "skill",
    "purpose": "$SKILL_PURPOSE",
    "category": "$SKILL_CATEGORY",
    "status": "born",
    "created": "$(date +%Y-%m-%d)",
    "last_used": None,
    "factory_generated": True
}

# Check if already exists
existing = [s for s in registry['skills'] if s['name'] == '$SKILL_NAME']
if not existing:
    registry['skills'].append(new_skill)
    registry['meta']['total_tools'] = registry['meta']['total_tools'] + 1
    registry['meta']['counts']['skills'] = registry['meta']['counts']['skills'] + 1

with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2, default=str)

print("Registry updated")
PYEOF
  echo -e "  ${GREEN}Updated${RESET} registry/index.json"
fi

# ─── Lexicon Compliance Check ───
echo ""
echo -e "${TEAL}Lexicon Compliance Check${RESET}"

PASS=true
ISSUES=""

# Check: Has frontmatter
if head -1 "$SKILL_DIR/SKILL.md" | grep -q "^---"; then
  echo -e "  ${GREEN}PASS${RESET} Frontmatter present"
else
  echo -e "  ${RED}FAIL${RESET} Missing frontmatter"
  PASS=false
fi

# Check: Has triggers
if grep -q "^triggers:" "$SKILL_DIR/SKILL.md"; then
  echo -e "  ${GREEN}PASS${RESET} Triggers defined"
else
  echo -e "  ${RED}FAIL${RESET} No triggers"
  PASS=false
fi

# Check: Has workflows
if grep -q "## Core Workflows" "$SKILL_DIR/SKILL.md"; then
  echo -e "  ${GREEN}PASS${RESET} Core Workflows section"
else
  echo -e "  ${RED}FAIL${RESET} Missing Core Workflows"
  PASS=false
fi

# Check: No emojis
if grep -P '[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' "$SKILL_DIR/SKILL.md" 2>/dev/null; then
  echo -e "  ${RED}FAIL${RESET} Contains emojis (id8Labs brand violation)"
  PASS=false
else
  echo -e "  ${GREEN}PASS${RESET} No emojis"
fi

# Check: Under 2000 tokens (rough: ~4 chars per token)
CHARS=$(wc -c < "$SKILL_DIR/SKILL.md")
APPROX_TOKENS=$((CHARS / 4))
if [ "$APPROX_TOKENS" -lt 2000 ]; then
  echo -e "  ${GREEN}PASS${RESET} Under 2000 tokens (~$APPROX_TOKENS)"
else
  echo -e "  ${AMBER}WARN${RESET} ~$APPROX_TOKENS tokens (target: <2000)"
fi

# Check: Has Quick Reference table
if grep -q "## Quick Reference" "$SKILL_DIR/SKILL.md"; then
  echo -e "  ${GREEN}PASS${RESET} Quick Reference table"
else
  echo -e "  ${RED}FAIL${RESET} Missing Quick Reference"
  PASS=false
fi

echo ""
if [ "$PASS" = true ]; then
  echo -e "${GREEN}Lexicon: COMPLIANT${RESET}"
else
  echo -e "${RED}Lexicon: NON-COMPLIANT — fix issues before Range testing${RESET}"
fi

# ─── Summary ───
echo ""
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
echo -e "${WHITE}Skill generated: $SKILL_NAME${RESET}"
echo -e "${GRAY}Location:  $SKILL_DIR/SKILL.md${RESET}"
echo -e "${GRAY}Fixture:   $FIXTURES_DIR/$SKILL_NAME.json${RESET}"
echo -e "${GRAY}Status:    BORN (awaiting Range testing)${RESET}"
echo -e "${GRAY}Next:      Run Range tests to score and qualify${RESET}"
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
