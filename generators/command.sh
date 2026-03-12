#!/bin/bash
# Tool Factory — Command Generator
# Generates a Claude Code slash command.
#
# Usage: ./command.sh "command-name" "One-line description"
# Example: ./command.sh "deploy-staging" "Deploy current branch to staging environment"
#
# Output: ~/.claude/commands/<command-name>.md
#         Updates tool-factory/registry/index.json

set -euo pipefail

# --- Config ---
COMMANDS_DIR="$HOME/.claude/commands"
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
  echo -e "${RED}Usage: ./command.sh \"command-name\" \"One-line description\"${RESET}"
  exit 1
fi

CMD_NAME="$1"
CMD_DESC="$2"

# Validate name (kebab-case)
if ! echo "$CMD_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo -e "${RED}Command name must be kebab-case (e.g., deploy-staging)${RESET}"
  exit 1
fi

# Check for duplicates
CMD_FILE="$COMMANDS_DIR/$CMD_NAME.md"
if [ -f "$CMD_FILE" ]; then
  echo -e "${AMBER}Warning: Command '$CMD_NAME' already exists at $CMD_FILE${RESET}"
  exit 1
fi

# Generate display name
CMD_DISPLAY=$(echo "$CMD_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

echo -e "${ORANGE}Tool Factory${RESET} ${WHITE}— Generating command: /$CMD_NAME${RESET}"
echo ""

# --- Generate Command ---
mkdir -p "$COMMANDS_DIR"

cat > "$CMD_FILE" << CMD_EOF
# /$CMD_NAME - $CMD_DISPLAY

$CMD_DESC.

## Pre-computed Context

\`\`\`bash
PROJECT=\$(basename "\$(git rev-parse --show-toplevel 2>/dev/null || echo 'unknown')")
BRANCH=\$(git branch --show-current 2>/dev/null || echo 'unknown')
\`\`\`

**Project:** \$PROJECT
**Branch:** \$BRANCH

## Usage

\`\`\`
/$CMD_NAME                    # Default: run primary workflow
/$CMD_NAME --dry-run          # Show what would happen without changes
\`\`\`

## Workflow

### Phase 1: Detect Context
1. Identify the project and current branch
2. Validate prerequisites are met
3. State what you're about to do

### Phase 2: Execute
1. Run the core operation
2. Verify each step before proceeding
3. Handle errors gracefully

### Phase 3: Report
1. Summarize what was done
2. Show relevant output or links
3. Suggest next steps if applicable

## Rules

- Verify before acting (PEV pattern)
- Never proceed past a failed step
- Report failures directly — never dismiss as transient
- Stay within scope of this command
CMD_EOF

echo -e "  ${GREEN}Created${RESET} $CMD_FILE"

# --- Generate Test Fixture ---
mkdir -p "$FIXTURES_DIR"

cat > "$FIXTURES_DIR/cmd-$CMD_NAME.json" << FIXTURE_EOF
{
  "tool": "$CMD_NAME",
  "type": "command",
  "created": "$(date +%Y-%m-%d)",
  "intake": {
    "problem": "$CMD_DESC"
  },
  "tests": [
    {
      "name": "basic_invocation",
      "type": "live_fire",
      "prompt": "/$CMD_NAME",
      "expected": "Command executes primary workflow",
      "status": "pending"
    },
    {
      "name": "dry_run",
      "type": "live_fire",
      "prompt": "/$CMD_NAME --dry-run",
      "expected": "Shows what would happen without changes",
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

echo -e "  ${GREEN}Created${RESET} $FIXTURES_DIR/cmd-$CMD_NAME.json"

# --- Update Registry ---
if [ -f "$REGISTRY" ]; then
  python3 << PYEOF
import json

with open('$REGISTRY', 'r') as f:
    registry = json.load(f)

new_cmd = {
    "name": "$CMD_NAME",
    "type": "command",
    "purpose": "$CMD_DESC",
    "status": "born",
    "created": "$(date +%Y-%m-%d)",
    "last_used": None,
    "factory_generated": True
}

key = 'slash_commands'
existing = [c for c in registry.get(key, []) if c['name'] == '$CMD_NAME']
if not existing:
    if key not in registry:
        registry[key] = []
    registry[key].append(new_cmd)
    registry['meta']['total_tools'] = registry['meta']['total_tools'] + 1
    registry['meta']['counts']['slash_commands'] = registry['meta']['counts'].get('slash_commands', 0) + 1

with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2, default=str)

print("Registry updated")
PYEOF
  echo -e "  ${GREEN}Updated${RESET} registry/index.json"
fi

# --- Summary ---
echo ""
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
echo -e "${WHITE}Command generated: /$CMD_NAME${RESET}"
echo -e "${GRAY}Location:  $CMD_FILE${RESET}"
echo -e "${GRAY}Invoke:    /$CMD_NAME${RESET}"
echo -e "${GRAY}Status:    BORN (customize workflow, then test)${RESET}"
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
