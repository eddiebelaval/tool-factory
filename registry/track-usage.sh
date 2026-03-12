#!/bin/bash
# Tool Factory — Usage Tracker
# Logs skill/agent/tool invocations to the registry's usage directory.
# Designed to be called from hooks or manually.
#
# Usage: ./track-usage.sh <tool-name> <tool-type>
# Example: ./track-usage.sh "ship" "skill"
#          ./track-usage.sh "operations-manager" "agent"
#
# Also callable via pipe from hook stdin:
#   echo '{"tool_input":{"skill":"ship"}}' | ./track-usage.sh

set -euo pipefail

FACTORY_DIR="$HOME/Development/id8/tool-factory"
USAGE_DIR="$FACTORY_DIR/registry/usage"
REGISTRY="$FACTORY_DIR/registry/index.json"

mkdir -p "$USAGE_DIR"

# ─── Determine tool name ───
TOOL_NAME="${1:-}"
TOOL_TYPE="${2:-skill}"

# If no args, try reading from stdin (hook mode)
if [ -z "$TOOL_NAME" ]; then
  HOOK_INPUT=$(cat 2>/dev/null || true)
  if [ -n "$HOOK_INPUT" ]; then
    TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.skill // .tool_input.name // empty' 2>/dev/null || true)
    TOOL_NAME=$(echo "$TOOL_NAME" | sed 's/^.*://' | tr '[:upper:]' '[:lower:]')
  fi
fi

if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# ─── Log the usage event ───
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
USAGE_FILE="$USAGE_DIR/$DATE.jsonl"

echo "{\"tool\":\"$TOOL_NAME\",\"type\":\"$TOOL_TYPE\",\"timestamp\":\"$TIMESTAMP\"}" >> "$USAGE_FILE"

# ─── Update last_used in registry (if python3 available) ───
if command -v python3 &>/dev/null && [ -f "$REGISTRY" ]; then
  python3 << PYEOF 2>/dev/null || true
import json

with open('$REGISTRY', 'r') as f:
    registry = json.load(f)

tool_name = '$TOOL_NAME'
tool_type = '${TOOL_TYPE}s'  # pluralize: skill -> skills

# Map type to registry key
type_map = {
    'skills': 'skills',
    'agents': 'agents',
    'plugins': 'plugins',
    'hooks': 'hooks',
    'mcp_servers': 'mcp_servers'
}

key = type_map.get(tool_type, 'skills')
tools = registry.get(key, [])

for tool in tools:
    if tool.get('name') == tool_name:
        tool['last_used'] = '$DATE'
        break

with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2, default=str)
PYEOF
fi

exit 0
