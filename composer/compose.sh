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
# Adjacent steps flagged 'parallel: true' fan out and run concurrently,
# then the pipeline joins (waits for all) before the next sequential step.

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

# Execute a single step. Used by both the sequential engine and the parallel
# group runner. Writes indented display output to <display_file>, and — on
# success with export_as set — writes a "VAR='value'" directive to <export_file>
# (the caller decides when to append it to ENV_FILE, so parallel exports stay
# ordered). Reads accumulated env from the run-scoped ENV_FILE. Returns the
# step's exit code.
execute_step() {
  local step_json="$1" display_file="$2" export_file="$3"
  : > "$display_file"
  : > "$export_file"

  local FIELDS STEP_TYPE STEP_NAME STEP_ARGS STEP_CMD EXPORT_AS STEP_ENV
  FIELDS=$(echo "$step_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('\t'.join([
    d.get('type', ''),
    d.get('name', d.get('command', '')),
    d.get('args', ''),
    d.get('command', ''),
    d.get('export_as', ''),
    d.get('env', ''),
]))
")
  STEP_TYPE=$(echo "$FIELDS" | cut -f1)
  STEP_NAME=$(echo "$FIELDS" | cut -f2)
  STEP_ARGS=$(echo "$FIELDS" | cut -f3)
  STEP_CMD=$(echo "$FIELDS" | cut -f4)
  EXPORT_AS=$(echo "$FIELDS" | cut -f5)
  STEP_ENV=$(echo "$FIELDS" | cut -f6)

  # Build a temp env script combining accumulated + step-level env
  local STEP_ENV_FILE
  STEP_ENV_FILE=$(mktemp /tmp/composer-step-env.XXXXXX)
  if [ -s "$ENV_FILE" ]; then
    cat "$ENV_FILE" >> "$STEP_ENV_FILE"
  fi
  if [ -n "$STEP_ENV" ]; then
    echo "$STEP_ENV" >> "$STEP_ENV_FILE"
  fi

  local EXIT_CODE=0 STEP_OUTPUT=""
  case "$STEP_TYPE" in
    shell)
      STEP_OUTPUT=$(bash -c "set -a; source '$STEP_ENV_FILE' 2>/dev/null; set +a; $STEP_CMD" 2>&1) || EXIT_CODE=$?
      echo "$STEP_OUTPUT" | sed 's/^/    /' >> "$display_file"
      ;;
    hook)
      HOOK_FILE="$HOOKS_DIR/$STEP_NAME.sh"
      if [ -x "$HOOK_FILE" ]; then
        STEP_OUTPUT=$(bash -c "set -a; source '$STEP_ENV_FILE' 2>/dev/null; set +a; bash '$HOOK_FILE' $STEP_ARGS" 2>&1) || EXIT_CODE=$?
        echo "$STEP_OUTPUT" | sed 's/^/    /' >> "$display_file"
      else
        echo -e "    ${RED}Hook not found or not executable: $HOOK_FILE${RESET}" >> "$display_file"
        EXIT_CODE=1
      fi
      ;;
    skill)
      echo -e "    ${GRAY}Skill '$STEP_NAME' queued (invoke via /$STEP_NAME $STEP_ARGS)${RESET}" >> "$display_file"
      ;;
    command)
      echo -e "    ${GRAY}Command '/$STEP_NAME' queued (invoke via /$STEP_NAME $STEP_ARGS)${RESET}" >> "$display_file"
      ;;
    agent)
      echo -e "    ${GRAY}Agent '$STEP_NAME' referenced (invoke via Agent tool)${RESET}" >> "$display_file"
      ;;
    *)
      echo -e "    ${RED}Unknown step type: $STEP_TYPE${RESET}" >> "$display_file"
      EXIT_CODE=1
      ;;
  esac

  rm -f "$STEP_ENV_FILE"

  # Capture first line of output as an exported variable (on success)
  if [ $EXIT_CODE -eq 0 ] && [ -n "$EXPORT_AS" ] && [ -n "$STEP_OUTPUT" ]; then
    local EXPORT_VAL
    EXPORT_VAL=$(echo "$STEP_OUTPUT" | head -1 | tr -d '\r' | tr -d "'" | tr -cd '[:print:]')
    echo "${EXPORT_AS}='${EXPORT_VAL}'" >> "$export_file"
    echo -e "    ${GRAY}(exported \$$EXPORT_AS)${RESET}" >> "$display_file"
  fi

  return $EXIT_CODE
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
#
# Flow control fields (optional, per step):
#   continue_on_fail: true   — keep going even if this step fails
#   on_fail: <step-name>      — jump to a named step on failure
#   skip: true                — jump-only target (not run in normal flow)
#   export_as: VAR            — capture stdout's first line into \$VAR
#   env: KEY=value            — inject a per-step environment variable
#   parallel: true            — run concurrently with adjacent parallel steps
#                               (a run of parallel steps fans out, then joins
#                                before the next sequential step)

name: $COMP_NAME
description: Describe what this pipeline does
version: "1.0.0"

steps:
  - type: shell
    name: preflight
    command: "echo 'Starting pipeline: $COMP_NAME'"

  # Parallel fan-out: these two run concurrently, then the pipeline joins.
  # - type: shell
  #   name: lint
  #   command: "echo 'linting...'"
  #   parallel: true
  # - type: shell
  #   name: unit-tests
  #   command: "echo 'testing...'"
  #   parallel: true

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

  # --- Load steps into an indexed array (bash 3.2 compatible: no mapfile) ---
  STEP_LIST=()
  while IFS= read -r step_json; do
    [ -z "$step_json" ] && continue
    STEP_LIST+=("$step_json")
  done < <(echo "$STEPS")
  N=${#STEP_LIST[@]}
  TOTAL_STEPS=$N

  # --- Execute steps (supports on_fail jumps, skip, and parallel groups) ---
  # Index-based loop: consecutive steps flagged 'parallel: true' fan out and
  # run concurrently, then join before the next sequential step.
  JUMP_TO=""
  PIPELINE_STOPPED=false
  i=0

  while [ $i -lt $N ]; do
    step_json="${STEP_LIST[$i]}"

    # Flow fields needed to route this step (tab-delimited, single Python call)
    FLOW=$(echo "$step_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('\t'.join([
    d.get('type', ''),
    d.get('name', d.get('command', '')),
    str(d.get('continue_on_fail', 'false')),
    d.get('on_fail', ''),
    str(d.get('skip', 'false')),
    str(d.get('parallel', 'false')),
]))
")
    STEP_TYPE=$(echo "$FLOW" | cut -f1)
    STEP_NAME=$(echo "$FLOW" | cut -f2)
    CONTINUE_ON_FAIL=$(echo "$FLOW" | cut -f3)
    ON_FAIL=$(echo "$FLOW" | cut -f4)
    SKIP=$(echo "$FLOW" | cut -f5)
    PARALLEL=$(echo "$FLOW" | cut -f6)

    # --- Skip logic: steps with skip=true only run via on_fail jump ---
    if [ "$SKIP" = "true" ] && [ -z "$JUMP_TO" ]; then
      i=$((i + 1))
      continue
    fi

    # --- Jump logic: if we're jumping, skip until we hit the target ---
    if [ -n "$JUMP_TO" ]; then
      if [ "$STEP_NAME" = "$JUMP_TO" ]; then
        JUMP_TO=""
        STEP_NUM=$((STEP_NUM + 1))
        echo -e "  ${AMBER}[jump]${RESET} ${WHITE}[$STEP_TYPE] $STEP_NAME${RESET} ${GRAY}(on_fail target)${RESET}"
      else
        i=$((i + 1))
        continue
      fi
    # --- Parallel group: gather consecutive parallel steps, run concurrently ---
    elif [ "$PARALLEL" = "true" ]; then
      GROUP=()
      g=$i
      while [ $g -lt $N ]; do
        gp=$(echo "${STEP_LIST[$g]}" | python3 -c "import sys,json;print(str(json.load(sys.stdin).get('parallel','false')))")
        [ "$gp" = "true" ] || break
        GROUP+=("${STEP_LIST[$g]}")
        g=$((g + 1))
      done
      GSIZE=${#GROUP[@]}
      START_IDX=$((STEP_NUM + 1))
      STEP_NUM=$((STEP_NUM + GSIZE))
      echo -e "  ${TEAL}[$START_IDX-$STEP_NUM/$TOTAL_STEPS parallel x$GSIZE]${RESET} ${WHITE}launching $GSIZE steps concurrently${RESET}"

      # Launch each group member in the background, capturing display/export/exit
      G_DISPLAY=(); G_EXPORT=(); G_CODE=(); G_PID=()
      for k in "${!GROUP[@]}"; do
        df=$(mktemp /tmp/composer-pd.XXXXXX)
        ef=$(mktemp /tmp/composer-pe.XXXXXX)
        cf=$(mktemp /tmp/composer-pc.XXXXXX)
        G_DISPLAY[$k]="$df"; G_EXPORT[$k]="$ef"; G_CODE[$k]="$cf"
        ( rc=0; execute_step "${GROUP[$k]}" "$df" "$ef" || rc=$?; echo "$rc" > "$cf" ) &
        G_PID[$k]=$!
      done
      # Join: wait for every member to finish
      for k in "${!GROUP[@]}"; do
        wait "${G_PID[$k]}" 2>/dev/null || true
      done

      # Report each member in declaration order; append exports deterministically
      GROUP_FAILED=false
      for k in "${!GROUP[@]}"; do
        g_meta=$(echo "${GROUP[$k]}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('\t'.join([d.get('type',''), d.get('name', d.get('command','')), str(d.get('continue_on_fail','false'))]))
")
        g_type=$(echo "$g_meta" | cut -f1)
        g_name=$(echo "$g_meta" | cut -f2)
        g_cof=$(echo "$g_meta" | cut -f3)
        g_rc=$(cat "${G_CODE[$k]}" 2>/dev/null || echo 1)

        echo -e "    ${TEAL}├─${RESET} ${WHITE}[$g_type] $g_name${RESET}"
        [ -s "${G_DISPLAY[$k]}" ] && sed 's/^/  /' "${G_DISPLAY[$k]}"
        if [ "$g_rc" -eq 0 ]; then
          [ -s "${G_EXPORT[$k]}" ] && cat "${G_EXPORT[$k]}" >> "$ENV_FILE"
          echo -e "      ${GREEN}OK${RESET}"
        else
          echo -e "      ${RED}FAILED${RESET} (exit $g_rc)"
          if [ "$g_cof" = "true" ]; then
            echo -e "      ${AMBER}(continue_on_fail: true — continuing)${RESET}"
          else
            GROUP_FAILED=true
          fi
        fi
        rm -f "${G_DISPLAY[$k]}" "${G_EXPORT[$k]}" "${G_CODE[$k]}"
      done
      echo ""

      i=$g
      if $GROUP_FAILED; then
        echo -e "  ${RED}Pipeline stopped: a parallel step failed${RESET}"
        PIPELINE_STOPPED=true
        break
      fi
      continue
    else
      STEP_NUM=$((STEP_NUM + 1))
      echo -e "  ${TEAL}[$STEP_NUM/$TOTAL_STEPS]${RESET} ${WHITE}[$STEP_TYPE] $STEP_NAME${RESET}"
    fi

    # --- Sequential single step ---
    SD=$(mktemp /tmp/composer-sd.XXXXXX)
    SE=$(mktemp /tmp/composer-se.XXXXXX)
    EXIT_CODE=0
    execute_step "$step_json" "$SD" "$SE" || EXIT_CODE=$?
    [ -s "$SD" ] && cat "$SD"

    # --- Export captured output as variable (on success) ---
    if [ $EXIT_CODE -eq 0 ] && [ -s "$SE" ]; then
      cat "$SE" >> "$ENV_FILE"
    fi
    rm -f "$SD" "$SE"

    # --- Failure handling ---
    if [ $EXIT_CODE -ne 0 ]; then
      echo -e "    ${RED}FAILED${RESET} (exit $EXIT_CODE)"
      if [ -n "$ON_FAIL" ]; then
        echo -e "    ${AMBER}Jumping to: $ON_FAIL${RESET}"
        JUMP_TO="$ON_FAIL"
      elif [ "$CONTINUE_ON_FAIL" != "true" ]; then
        echo -e "\n  ${RED}Pipeline stopped at step $STEP_NUM${RESET}"
        PIPELINE_STOPPED=true
        echo ""
        break
      else
        echo -e "    ${AMBER}(continue_on_fail: true — continuing)${RESET}"
      fi
    else
      echo -e "    ${GREEN}OK${RESET}"
    fi
    echo ""
    i=$((i + 1))
  done

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
  echo ""
  echo -e "  ${WHITE}Flow Control (per-step fields):${RESET}"
  echo -e "    ${TEAL}parallel: true${RESET}       Fan out with adjacent parallel steps, then join"
  echo -e "    ${TEAL}on_fail: <name>${RESET}      Jump to a named step on failure"
  echo -e "    ${TEAL}continue_on_fail${RESET}     Keep going if the step fails"
  echo -e "    ${TEAL}export_as: VAR${RESET}       Capture stdout into \$VAR for later steps"
  echo -e "    ${TEAL}env: KEY=value${RESET}       Inject a per-step environment variable"
  ;;

esac
