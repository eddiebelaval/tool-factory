#!/bin/bash
# Tool Factory — MCP Server Generator
# Adds an MCP server configuration to mcpServers.json.
#
# Usage: ./mcp.sh "server-name" "Description" --command "npx" --args "arg1,arg2"
#        ./mcp.sh "server-name" "Description" --url "https://example.com/mcp"
#
# Modes:
#   Command-based: --command CMD --args "arg1,arg2" [--env "KEY=VAL,KEY2=VAL2"]
#   HTTP-based:    --url URL
#
# Output: Adds entry to ~/.claude/mcpServers.json
#         Updates tool-factory/registry/index.json

set -euo pipefail

# --- Config ---
MCP_CONFIG="$HOME/.claude/mcpServers.json"
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

# --- Parse Arguments ---
if [ $# -lt 2 ]; then
  echo -e "${RED}Usage:${RESET}"
  echo -e "  ${GRAY}Command-based: ./mcp.sh \"name\" \"description\" --command npx --args \"-y,@package/name\"${RESET}"
  echo -e "  ${GRAY}HTTP-based:    ./mcp.sh \"name\" \"description\" --url \"https://example.com/mcp\"${RESET}"
  exit 1
fi

MCP_NAME="$1"
MCP_DESC="$2"
shift 2

MCP_COMMAND=""
MCP_ARGS=""
MCP_ENV=""
MCP_URL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --command) MCP_COMMAND="$2"; shift 2 ;;
    --args) MCP_ARGS="$2"; shift 2 ;;
    --env) MCP_ENV="$2"; shift 2 ;;
    --url) MCP_URL="$2"; shift 2 ;;
    *) echo -e "${RED}Unknown flag: $1${RESET}"; exit 1 ;;
  esac
done

# Validate: must have either command or url
if [ -z "$MCP_COMMAND" ] && [ -z "$MCP_URL" ]; then
  echo -e "${RED}Must specify --command or --url${RESET}"
  exit 1
fi

# Validate name (lowercase with hyphens)
if ! echo "$MCP_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
  echo -e "${RED}Server name must be lowercase with hyphens (e.g., my-server)${RESET}"
  exit 1
fi

echo -e "${ORANGE}Tool Factory${RESET} ${WHITE}— Generating MCP server: $MCP_NAME${RESET}"
echo ""

# --- Check for duplicates ---
if [ -f "$MCP_CONFIG" ]; then
  if python3 -c "
import json
with open('$MCP_CONFIG') as f:
    config = json.load(f)
if '$MCP_NAME' in config.get('mcpServers', {}):
    exit(0)
exit(1)
" 2>/dev/null; then
    echo -e "${AMBER}Warning: MCP server '$MCP_NAME' already exists in mcpServers.json${RESET}"
    exit 1
  fi
fi

# --- Add to mcpServers.json ---
if [ ! -f "$MCP_CONFIG" ]; then
  echo '{"mcpServers":{}}' > "$MCP_CONFIG"
fi

python3 << PYEOF
import json

with open('$MCP_CONFIG', 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

server = {
    "description": "$MCP_DESC"
}

url = "$MCP_URL"
command = "$MCP_COMMAND"
args_str = "$MCP_ARGS"
env_str = "$MCP_ENV"

if url:
    server["type"] = "http"
    server["url"] = url
elif command:
    server["command"] = command
    if args_str:
        server["args"] = [a.strip() for a in args_str.split(",")]
    if env_str:
        env_dict = {}
        for pair in env_str.split(","):
            if "=" in pair:
                k, v = pair.split("=", 1)
                env_dict[k.strip()] = v.strip()
        if env_dict:
            server["env"] = env_dict

config['mcpServers']['$MCP_NAME'] = server

with open('$MCP_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)

print("Added to mcpServers.json")
PYEOF

if [ -n "$MCP_URL" ]; then
  echo -e "  ${GREEN}Added${RESET} HTTP server: $MCP_URL"
else
  echo -e "  ${GREEN}Added${RESET} Command server: $MCP_COMMAND"
fi

# --- Generate Test Fixture ---
mkdir -p "$FIXTURES_DIR"

cat > "$FIXTURES_DIR/mcp-$MCP_NAME.json" << FIXTURE_EOF
{
  "tool": "$MCP_NAME",
  "type": "mcp",
  "created": "$(date +%Y-%m-%d)",
  "intake": {
    "problem": "$MCP_DESC",
    "mode": "$([ -n "$MCP_URL" ] && echo "http" || echo "command")"
  },
  "tests": [
    {
      "name": "server_starts",
      "type": "integration",
      "description": "Server process starts without error",
      "expected": "No crash on startup",
      "status": "pending"
    },
    {
      "name": "tools_list",
      "type": "integration",
      "description": "Server responds to tools/list request",
      "expected": "Returns tool definitions",
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

echo -e "  ${GREEN}Created${RESET} $FIXTURES_DIR/mcp-$MCP_NAME.json"

# --- Update Registry ---
if [ -f "$REGISTRY" ]; then
  python3 << PYEOF
import json

with open('$REGISTRY', 'r') as f:
    registry = json.load(f)

new_mcp = {
    "name": "$MCP_NAME",
    "type": "mcp",
    "purpose": "$MCP_DESC",
    "mode": "$([ -n "$MCP_URL" ] && echo "http" || echo "command")",
    "status": "born",
    "created": "$(date +%Y-%m-%d)",
    "last_used": None,
    "factory_generated": True
}

key = 'mcp_servers'
existing = [m for m in registry.get(key, []) if m['name'] == '$MCP_NAME']
if not existing:
    if key not in registry:
        registry[key] = []
    registry[key].append(new_mcp)
    registry['meta']['total_tools'] = registry['meta']['total_tools'] + 1
    if 'mcp_servers' in registry['meta']['counts']:
        registry['meta']['counts']['mcp_servers'] = registry['meta']['counts']['mcp_servers'] + 1

with open('$REGISTRY', 'w') as f:
    json.dump(registry, f, indent=2, default=str)

print("Registry updated")
PYEOF
  echo -e "  ${GREEN}Updated${RESET} registry/index.json"
fi

# --- Summary ---
echo ""
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
echo -e "${WHITE}MCP server generated: $MCP_NAME${RESET}"
if [ -n "$MCP_URL" ]; then
  echo -e "${GRAY}Type:      HTTP${RESET}"
  echo -e "${GRAY}URL:       $MCP_URL${RESET}"
else
  echo -e "${GRAY}Type:      Command${RESET}"
  echo -e "${GRAY}Command:   $MCP_COMMAND${RESET}"
fi
echo -e "${GRAY}Config:    $MCP_CONFIG${RESET}"
echo -e "${GRAY}Status:    BORN (restart Claude Code to activate)${RESET}"
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
