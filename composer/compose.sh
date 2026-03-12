#!/bin/bash
# Tool Factory — Composer
# Chain tools into pipelines. Define compositions as YAML, run them as single workflows.
#
# Usage:
#   ./compose.sh run <composition.yaml>     # Run a composition
#   ./compose.sh new <name>                 # Create a new composition template
#   ./compose.sh list                       # List all compositions
#   ./compose.sh validate <composition.yaml> # Validate without running
#
# Composition format (YAML-like, parsed with bash):
#   name: my-pipeline
#   description: What this pipeline does
#   steps:
#     - type: skill
#       name: verify
#       args: quick
#     - type: command
#       name: ship
#       args: --no-merge
#     - type: hook
#       name: play-sound
#       args: success
#
# Step types: skill | command | hook | agent | shell
# Each step runs sequentially. If a step fails, the pipeline stops.

set -euo pipefail

# --- Config ---
FACTORY_DIR="$HOME/Development/id8/tool-factory"
COMPOSITIONS_DIR="$FACTORY_DIR/composer/compositions"
SKILLS_DIR="$HOME/.claude/skills"
COMMANDS_DIR="$HOME/.claude/commands"
HOOKS_DIR="$HOME/.claude/hooks"
AGENTS_DIR="$HOME/.claude/agents"

# --- Colors ---
source "$FACTORY_DIR/lib/colors.sh"

# --- Shared Functions ---

# Resolve composition file path (raw, compositions dir, +.yaml)
resolve_comp_file() {
  local file="$1"
  if [ -f "$file" ]; then
    echo "$file"
  elif [ -f "$COMPOSITIONS_DIR/$file" ]; then
    echo "$COMPOSITIONS_DIR/$file"
  elif [ -f "$COMPOSITIONS_DIR/$file.yaml" ]; then
    echo "$COMPOSITIONS_DIR/$file.yaml"
  else
    echo ""
  fi
}

# Parse YAML steps into JSON lines (one JSON object per step)
parse_steps() {
  local file="$1"
  python3 -c "
import re, json, sys

with open(sys.argv[1]) as f:
    content = f.read()

steps = []
current_step = None
for line in content.split('\n'):
    line = line.rstrip()
    if line.strip().startswith('#') or not line.strip():
        continue
    if re.match(r'  - type:', line):
        if current_step:
            steps.append(current_step)
        current_step = {'type': line.split(':', 1)[1].strip()}
    elif current_step and re.match(r'    \w+:', line):
        key, val = line.strip().split(':', 1)
        v = val.strip()
        if (v.startswith('\"') and v.endswith('\"')) or (v.startswith(\"'\") and v.endswith(\"'\")):
            v = v[1:-1]
        current_step[key.strip()] = v

if current_step:
    steps.append(current_step)

for s in steps:
    print(json.dumps(s))
" "$file"
}

# --- Parse Args ---
ACTION="${1:-help}"
shift || true

case "$ACTION" in

# ─────────────────────────────────────────────
# NEW — Create a composition template
# ─────────────────────────────────────────────
new)
  COMP_NAME="${1:?Usage: ./compose.sh new <name>}"

  mkdir -p "$COMPOSITIONS_DIR"
  COMP_FILE="$COMPOSITIONS_DIR/$COMP_NAME.yaml"

  if [ -f "$COMP_FILE" ]; then
    echo -e "${AMBER}Composition '$COMP_NAME' already exists${RESET}"
    exit 1
  fi

  cat > "$COMP_FILE" << YAML_EOF
# Composition: $COMP_NAME
# Created: $(date +%Y-%m-%d)
#
# Step types:
#   skill   — Invokes a Claude Code skill (by slug)
#   command — Invokes a slash command
#   hook    — Runs a hook script directly
#   agent   — References an agent (for documentation/routing)
#   shell   — Runs a raw bash command
#
# Each step runs sequentially. Pipeline stops on first failure.
# Use 'continue_on_fail: true' to skip failures.

name: $COMP_NAME
description: Describe what this pipeline does
version: "1.0.0"

steps:
  - type: shell
    name: preflight
    command: "echo 'Starting pipeline: $COMP_NAME'"

  # - type: skill
  #   name: verify
  #   args: "quick"

  # - type: command
  #   name: ship
  #   args: "--no-merge"

  # - type: hook
  #   name: play-sound
  #   args: "success"

  # - type: shell
  #   name: cleanup
  #   command: "echo 'Pipeline complete'"
  #   continue_on_fail: true
YAML_EOF

  echo -e "${GREEN}Created${RESET} $COMP_FILE"
  echo -e "${GRAY}Edit the YAML to define your pipeline steps.${RESET}"
  ;;

# ─────────────────────────────────────────────
# LIST — Show all compositions
# ─────────────────────────────────────────────
list)
  mkdir -p "$COMPOSITIONS_DIR"
  echo -e "${ORANGE}Composer${RESET} ${WHITE}— Compositions${RESET}"
  echo ""

  count=0
  shopt -s nullglob
  for f in "$COMPOSITIONS_DIR"/*.yaml; do
    comp_name=$(basename "$f" .yaml)
    desc=$(grep "^description:" "$f" | sed 's/^description:[[:space:]]*//' | head -1)
    step_count=$(grep -c "^  - type:" "$f" || echo "0")
    echo -e "  ${TEAL}$comp_name${RESET} — $desc ($step_count steps)"
    count=$((count + 1))
  done

  if [ $count -eq 0 ]; then
    echo -e "  ${GRAY}No compositions yet. Create one: ./compose.sh new <name>${RESET}"
  fi
  echo ""
  ;;

# ─────────────────────────────────────────────
# VALIDATE — Check composition without running
# ─────────────────────────────────────────────
validate)
  COMP_FILE=$(resolve_comp_file "${1:?Usage: ./compose.sh validate <file.yaml>}")
  if [ -z "$COMP_FILE" ]; then
    echo -e "${RED}Composition not found: $1${RESET}"
    exit 1
  fi

  echo -e "${ORANGE}Composer${RESET} ${WHITE}— Validating: $(basename "$COMP_FILE")${RESET}"
  echo ""

  # Use shared parser, then validate tool paths
  parse_steps "$COMP_FILE" | python3 -c "
import sys, json, os

skills_dir = os.path.expanduser('~/.claude/skills')
commands_dir = os.path.expanduser('~/.claude/commands')
hooks_dir = os.path.expanduser('~/.claude/hooks')
agents_dir = os.path.expanduser('~/.claude/agents')

path_map = {
    'skill': lambda n: os.path.join(skills_dir, n, 'SKILL.md'),
    'command': lambda n: os.path.join(commands_dir, n + '.md'),
    'hook': lambda n: os.path.join(hooks_dir, n + '.sh'),
    'agent': lambda n: os.path.join(agents_dir, n + '.md'),
}

errors = 0
steps = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    step = json.loads(line)
    steps.append(step)
    stype = step.get('type', '?')
    sname = step.get('name', step.get('command', '?'))

    if stype == 'shell':
        exists, location = True, 'inline'
    elif stype in path_map:
        location = path_map[stype](sname)
        exists = os.path.exists(location)
    else:
        exists, location = False, f'unknown type: {stype}'

    if exists:
        print(f'  \033[38;2;34;197;94mOK\033[0m  Step {len(steps)}: [{stype}] {sname}')
    else:
        print(f'  \033[38;2;239;68;68mERR\033[0m Step {len(steps)}: [{stype}] {sname} — not found at {location}')
        errors += 1

print()
if errors == 0:
    print(f'  \033[38;2;34;197;94mVALID\033[0m — {len(steps)} steps, all tools exist')
else:
    print(f'  \033[38;2;239;68;68mINVALID\033[0m — {errors} missing tool(s)')
    sys.exit(1)
"
  ;;

# ─────────────────────────────────────────────
# RUN — Execute a composition
# ─────────────────────────────────────────────
run)
  COMP_FILE=$(resolve_comp_file "${1:?Usage: ./compose.sh run <file.yaml>}")
  if [ -z "$COMP_FILE" ]; then
    echo -e "${RED}Composition not found: $1${RESET}"
    exit 1
  fi

  COMP_NAME=$(grep "^name:" "$COMP_FILE" | sed 's/^name:[[:space:]]*//' | head -1)
  echo -e "${ORANGE}Composer${RESET} ${WHITE}— Running: $COMP_NAME${RESET}"
  echo ""

  STEPS=$(parse_steps "$COMP_FILE")

  STEP_NUM=0
  START_TIME=$(date +%s)
  TOTAL_STEPS=$(echo "$STEPS" | wc -l | tr -d ' ')

  # --- Temp files for env injection and step indexing ---
  ENV_FILE=$(mktemp /tmp/composer-env.XXXXXX)
  STEPS_FILE=$(mktemp /tmp/composer-steps.XXXXXX)
  : > "$ENV_FILE"
  echo "$STEPS" > "$STEPS_FILE"
  trap "rm -f '$ENV_FILE' '$STEPS_FILE'" EXIT

  # --- Execute steps (supports on_fail jumps + skip) ---
  JUMP_TO=""

  while IFS= read -r step_json; do
    [ -z "$step_json" ] && continue

    STEP_NUM=$((STEP_NUM + 1))
    # Extract all fields in a single Python call (tab-delimited)
    FIELDS=$(echo "$step_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
fields = [
    d.get('type', ''),
    d.get('name', d.get('command', '')),
    d.get('args', ''),
    d.get('command', ''),
    str(d.get('continue_on_fail', 'false')),
    d.get('export_as', ''),
    d.get('on_fail', ''),
    str(d.get('skip', 'false')),
    d.get('env', ''),
]
print('\t'.join(fields))
")
    STEP_TYPE=$(echo "$FIELDS" | cut -f1)
    STEP_NAME=$(echo "$FIELDS" | cut -f2)
    STEP_ARGS=$(echo "$FIELDS" | cut -f3)
    STEP_CMD=$(echo "$FIELDS" | cut -f4)
    CONTINUE_ON_FAIL=$(echo "$FIELDS" | cut -f5)
    EXPORT_AS=$(echo "$FIELDS" | cut -f6)
    ON_FAIL=$(echo "$FIELDS" | cut -f7)
    SKIP=$(echo "$FIELDS" | cut -f8)
    STEP_ENV=$(echo "$FIELDS" | cut -f9)

    # --- Skip logic: steps with skip=true only run via on_fail jump ---
    if [ "$SKIP" = "true" ] && [ -z "$JUMP_TO" ]; then
      continue
    fi

    # --- Jump logic: if we're jumping, skip until we hit the target ---
    if [ -n "$JUMP_TO" ]; then
      if [ "$STEP_NAME" = "$JUMP_TO" ]; then
        JUMP_TO=""
        echo -e "  ${AMBER}[jump]${RESET} ${WHITE}[$STEP_TYPE] $STEP_NAME${RESET} ${GRAY}(on_fail target)${RESET}"
      else
        continue
      fi
    else
      echo -e "  ${TEAL}[$STEP_NUM/$TOTAL_STEPS]${RESET} ${WHITE}[$STEP_TYPE] $STEP_NAME${RESET}"
    fi

    # --- Load accumulated env vars + step-level env ---
    # Build a temp env script that sources safely (no string interpolation into bash -c)
    STEP_ENV_FILE=$(mktemp /tmp/composer-step-env.XXXXXX)
    if [ -s "$ENV_FILE" ]; then
      cat "$ENV_FILE" >> "$STEP_ENV_FILE"
    fi
    if [ -n "$STEP_ENV" ]; then
      echo "$STEP_ENV" >> "$STEP_ENV_FILE"
    fi

    EXIT_CODE=0
    STEP_OUTPUT=""
    case "$STEP_TYPE" in
      shell)
        STEP_OUTPUT=$(bash -c "set -a; source '$STEP_ENV_FILE' 2>/dev/null; set +a; $STEP_CMD" 2>&1) || EXIT_CODE=$?
        echo "$STEP_OUTPUT" | sed 's/^/    /'
        ;;
      hook)
        HOOK_FILE="$HOOKS_DIR/$STEP_NAME.sh"
        if [ -x "$HOOK_FILE" ]; then
          STEP_OUTPUT=$(bash -c "set -a; source '$STEP_ENV_FILE' 2>/dev/null; set +a; bash '$HOOK_FILE' $STEP_ARGS" 2>&1) || EXIT_CODE=$?
          echo "$STEP_OUTPUT" | sed 's/^/    /'
        else
          echo -e "    ${RED}Hook not found or not executable: $HOOK_FILE${RESET}"
          EXIT_CODE=1
        fi
        ;;
      skill)
        echo -e "    ${GRAY}Skill '$STEP_NAME' queued (invoke via /$STEP_NAME $STEP_ARGS)${RESET}"
        ;;
      command)
        echo -e "    ${GRAY}Command '/$STEP_NAME' queued (invoke via /$STEP_NAME $STEP_ARGS)${RESET}"
        ;;
      agent)
        echo -e "    ${GRAY}Agent '$STEP_NAME' referenced (invoke via Agent tool)${RESET}"
        ;;
      *)
        echo -e "    ${RED}Unknown step type: $STEP_TYPE${RESET}"
        EXIT_CODE=1
        ;;
    esac

    rm -f "$STEP_ENV_FILE"

    # --- Export captured output as variable ---
    if [ $EXIT_CODE -eq 0 ] && [ -n "$EXPORT_AS" ] && [ -n "$STEP_OUTPUT" ]; then
      # Capture first line of output as the variable value
      # Sanitize: strip control chars, single-quote the value to prevent injection
      EXPORT_VAL=$(echo "$STEP_OUTPUT" | head -1 | tr -d '\r' | tr -d "'" | tr -cd '[:print:]')
      echo "${EXPORT_AS}='${EXPORT_VAL}'" >> "$ENV_FILE"
      echo -e "    ${GRAY}(exported \$$EXPORT_AS)${RESET}"
    fi

    # --- Failure handling ---
    if [ $EXIT_CODE -ne 0 ]; then
      echo -e "    ${RED}FAILED${RESET} (exit $EXIT_CODE)"
      if [ -n "$ON_FAIL" ]; then
        echo -e "    ${AMBER}Jumping to: $ON_FAIL${RESET}"
        JUMP_TO="$ON_FAIL"
      elif [ "$CONTINUE_ON_FAIL" != "true" ]; then
        echo -e "\n  ${RED}Pipeline stopped at step $STEP_NUM${RESET}"
        break
      else
        echo -e "    ${AMBER}(continue_on_fail: true — continuing)${RESET}"
      fi
    else
      echo -e "    ${GREEN}OK${RESET}"
    fi
    echo ""
  done < <(echo "$STEPS")

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo -e "${ORANGE}────────────────────────────────────────${RESET}"
  echo -e "${WHITE}Pipeline: $COMP_NAME${RESET}"
  echo -e "${GRAY}Steps:    $TOTAL_STEPS${RESET}"
  echo -e "${GRAY}Duration: ${DURATION}s${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"
  ;;

# ─────────────────────────────────────────────
# HELP
# ─────────────────────────────────────────────
help|*)
  echo -e "${ORANGE}Composer${RESET} ${WHITE}— Pipeline Chaining${RESET}"
  echo ""
  echo -e "  ${WHITE}Usage:${RESET}"
  echo -e "    ./compose.sh new <name>        Create a composition template"
  echo -e "    ./compose.sh list              List all compositions"
  echo -e "    ./compose.sh validate <file>   Validate a composition"
  echo -e "    ./compose.sh run <file>        Run a composition"
  echo ""
  echo -e "  ${WHITE}Step Types:${RESET}"
  echo -e "    ${TEAL}skill${RESET}    Invoke a Claude Code skill"
  echo -e "    ${TEAL}command${RESET}  Invoke a slash command"
  echo -e "    ${TEAL}hook${RESET}     Run a hook script"
  echo -e "    ${TEAL}agent${RESET}    Reference an agent"
  echo -e "    ${TEAL}shell${RESET}    Run a bash command"
  ;;

esac
