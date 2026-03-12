#!/bin/bash
# Tool Factory — Agent Generator
# Generates a Claude Code agent definition with YAML frontmatter.
#
# Usage: ./agent.sh "agent-name" "One-line description" [model]
# Example: ./agent.sh "data-pipeline-expert" "Expert in ETL pipelines and data engineering" sonnet
#
# Models: opus | sonnet | haiku (default: sonnet)
#
# Output: ~/.claude/agents/<agent-name>.md
#         Updates tool-factory/registry/index.json

set -euo pipefail

# --- Config ---
AGENTS_DIR="$HOME/.claude/agents"
FACTORY_DIR="$HOME/Development/id8/tool-factory"
REGISTRY="$FACTORY_DIR/registry/index.json"
FIXTURES_DIR="$FACTORY_DIR/range/fixtures"

# --- Colors ---
ORANGE='\033[38;2;239;111;46m'
TEAL='\033[38;2;78;205;196m'
AMBER='\033[38;2;245;158;11m'
RED='\033[38;2;239;68;68m'
GREEN='\033[38;2;34;197;94m'
GRAY='\033[38;2;119;119;119m'
WHITE='\033[38;2;238;238;238m'
RESET='\033[0m'

# --- Input Validation ---
if [ $# -lt 2 ]; then
  echo -e "${RED}Usage: ./agent.sh \"agent-name\" \"One-line description\" [model]${RESET}"
  echo -e "${GRAY}Models: opus | sonnet | haiku (default: sonnet)${RESET}"
  exit 1
fi

AGENT_NAME="$1"
AGENT_DESC="$2"
AGENT_MODEL="${3:-sonnet}"

# Validate name (kebab-case)
if ! echo "$AGENT_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo -e "${RED}Agent name must be kebab-case (e.g., data-pipeline-expert)${RESET}"
  exit 1
fi

# Validate model
case "$AGENT_MODEL" in
  opus|sonnet|haiku) ;;
  *) echo -e "${RED}Model must be: opus | sonnet | haiku${RESET}"; exit 1 ;;
esac

# Check for duplicates
AGENT_FILE="$AGENTS_DIR/$AGENT_NAME.md"
if [ -f "$AGENT_FILE" ]; then
  echo -e "${AMBER}Warning: Agent '$AGENT_NAME' already exists at $AGENT_FILE${RESET}"
  exit 1
fi

# Generate display name
AGENT_DISPLAY=$(echo "$AGENT_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

echo -e "${ORANGE}Tool Factory${RESET} ${WHITE}— Generating agent: $AGENT_NAME${RESET}"
echo ""

# --- Generate Agent Definition ---
mkdir -p "$AGENTS_DIR"

cat > "$AGENT_FILE" << AGENT_EOF
---
name: $AGENT_NAME
description: "$AGENT_DESC. Examples include: <example>Context: User needs help with a task matching this agent's expertise. user: 'I need help with $AGENT_DISPLAY tasks' assistant: 'Let me use the $AGENT_NAME agent to handle this.' <commentary>Since the user needs $AGENT_DISPLAY expertise, use the $AGENT_NAME agent.</commentary></example>"
model: $AGENT_MODEL
color: blue
---

# $AGENT_DISPLAY

You are a specialized agent with deep expertise in: $AGENT_DESC

## Core Responsibilities

1. **Analyze** — Understand the problem space and constraints
2. **Recommend** — Provide expert recommendations with trade-offs
3. **Execute** — Implement solutions with precision
4. **Verify** — Confirm outcomes meet expectations

## Approach

- Lead with direct answers, not preamble
- Present 2 options max with a clear recommendation
- Verify your work before reporting completion
- Stay within your expertise — escalate when outside scope

## Expertise Areas

- [Primary domain expertise]
- [Secondary domain expertise]
- [Related tools and technologies]

## Constraints

- Follow id8Labs engineering standards
- No emojis in output
- TypeScript strict mode for code
- Verify before shipping (PEV pattern)
AGENT_EOF

echo -e "  ${GREEN}Created${RESET} $AGENT_FILE"

# --- Generate Test Fixture ---
mkdir -p "$FIXTURES_DIR"

cat > "$FIXTURES_DIR/$AGENT_NAME.json" << FIXTURE_EOF
{
  "tool": "$AGENT_NAME",
  "type": "agent",
  "created": "$(date +%Y-%m-%d)",
  "intake": {
    "problem": "$AGENT_DESC",
    "model": "$AGENT_MODEL"
  },
  "tests": [
    {
      "name": "basic_invocation",
      "type": "live_fire",
      "prompt": "Use the $AGENT_NAME agent for a basic task",
      "expected": "Agent activates and produces relevant output",
      "status": "pending"
    },
    {
      "name": "expertise_match",
      "type": "live_fire",
      "prompt": "Natural language trigger related to $AGENT_DISPLAY",
      "expected": "Agent responds with domain expertise",
      "status": "pending"
    }
  ],
  "scorecard": {
    "score": null,
    "tests_passed": 0,
    "tests_failed": 0,
    "recommendation": null,
    "last_run": null
  }
}
FIXTURE_EOF

echo -e "  ${GREEN}Created${RESET} $FIXTURES_DIR/$AGENT_NAME.json"

# --- Update Registry ---
if [ -f "$REGISTRY" ]; then
  python3 << PYEOF
import json

with open('$REGISTRY', 'r') as f:
    registry = json.load(f)

new_agent = {
    "name": "$AGENT_NAME",
    "type": "agent",
    "purpose": "$AGENT_DESC",
    "model": "$AGENT_MODEL",
    "status": "born",
    "created": "$(date +%Y-%m-%d)",
    "last_used": None,
    "factory_generated": True
}

existing = [a for a in registry.get('agents', []) if a['name'] == '$AGENT_NAME']
if not existing:
    if 'agents' not in registry:
        registry['agents'] = []
    registry['agents'].append(new_agent)
    registry['meta']['total_tools'] = registry['meta']['total_tools'] + 1
    registry['meta']['counts']['agents'] = registry['meta']['counts']['agents'] + 1

with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2, default=str)

print("Registry updated")
PYEOF
  echo -e "  ${GREEN}Updated${RESET} registry/index.json"
fi

# --- Compliance Check ---
echo ""
echo -e "${TEAL}Compliance Check${RESET}"

PASS=true

# Check: Has frontmatter
if head -1 "$AGENT_FILE" | grep -q "^---"; then
  echo -e "  ${GREEN}PASS${RESET} YAML frontmatter present"
else
  echo -e "  ${RED}FAIL${RESET} Missing frontmatter"
  PASS=false
fi

# Check: Has name field
if grep -q "^name:" "$AGENT_FILE"; then
  echo -e "  ${GREEN}PASS${RESET} Name field defined"
else
  echo -e "  ${RED}FAIL${RESET} Missing name"
  PASS=false
fi

# Check: Has description with examples
if grep -q "<example>" "$AGENT_FILE"; then
  echo -e "  ${GREEN}PASS${RESET} Description has example tags"
else
  echo -e "  ${RED}FAIL${RESET} Missing example in description"
  PASS=false
fi

# Check: Has model
if grep -q "^model:" "$AGENT_FILE"; then
  echo -e "  ${GREEN}PASS${RESET} Model specified: $AGENT_MODEL"
else
  echo -e "  ${RED}FAIL${RESET} Missing model"
  PASS=false
fi

# Check: No emojis
if grep -P '[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}]' "$AGENT_FILE" 2>/dev/null; then
  echo -e "  ${RED}FAIL${RESET} Contains emojis"
  PASS=false
else
  echo -e "  ${GREEN}PASS${RESET} No emojis"
fi

echo ""
if [ "$PASS" = true ]; then
  echo -e "${GREEN}Compliance: PASSED${RESET}"
else
  echo -e "${RED}Compliance: FAILED${RESET}"
fi

# --- Summary ---
echo ""
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
echo -e "${WHITE}Agent generated: $AGENT_NAME${RESET}"
echo -e "${GRAY}Location:  $AGENT_FILE${RESET}"
echo -e "${GRAY}Model:     $AGENT_MODEL${RESET}"
echo -e "${GRAY}Fixture:   $FIXTURES_DIR/$AGENT_NAME.json${RESET}"
echo -e "${GRAY}Status:    BORN (ready for customization)${RESET}"
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
