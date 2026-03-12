#!/bin/bash
# Tool Factory — Squire Sync
# Diffs ~/.claude/ tools against the Squire repo.
# Reports new, stale, and updated tools. Optionally syncs.
#
# Usage:
#   ./squire-sync.sh              # Report mode (dry run)
#   ./squire-sync.sh --sync       # Sync all changes
#   ./squire-sync.sh --sync-new   # Only add new tools (safe)
#   ./squire-sync.sh --counts     # Just print counts (for pipelines)

set -euo pipefail

FACTORY_DIR="$HOME/Development/id8/tool-factory"
SQUIRE_DIR="$HOME/Development/squire"
LOCAL_DIR="$HOME/.claude"

source "$FACTORY_DIR/lib/colors.sh"

ACTION="${1:-report}"

# --- Diff Logic ---
diff_tools() {
  local type="$1"      # commands | agents | skills
  local local_path="$2"
  local squire_path="$3"
  local match="$4"     # file glob or dir check

  local new=() stale=() updated=()

  # New: in local but not in Squire
  if [ "$match" = "dir" ]; then
    for d in "$local_path"/*/; do
      [ -d "$d" ] || continue
      local name=$(basename "$d")
      if [ ! -d "$squire_path/$name" ]; then
        new+=("$name")
      fi
    done
  else
    for f in "$local_path"/*.$match; do
      [ -f "$f" ] || continue
      local name=$(basename "$f")
      if [ ! -f "$squire_path/$name" ]; then
        new+=("$name")
      fi
    done
  fi

  # Stale: in Squire but not local
  if [ "$match" = "dir" ]; then
    for d in "$squire_path"/*/; do
      [ -d "$d" ] || continue
      local name=$(basename "$d")
      if [ ! -d "$local_path/$name" ]; then
        stale+=("$name")
      fi
    done
  else
    for f in "$squire_path"/*.$match; do
      [ -f "$f" ] || continue
      local name=$(basename "$f")
      if [ ! -f "$local_path/$name" ]; then
        stale+=("$name")
      fi
    done
  fi

  # Updated: in both but different
  if [ "$match" = "dir" ]; then
    for d in "$local_path"/*/; do
      [ -d "$d" ] || continue
      local name=$(basename "$d")
      if [ -d "$squire_path/$name" ]; then
        if ! diff -rq "$d" "$squire_path/$name" > /dev/null 2>&1; then
          updated+=("$name")
        fi
      fi
    done
  else
    for f in "$local_path"/*.$match; do
      [ -f "$f" ] || continue
      local name=$(basename "$f")
      if [ -f "$squire_path/$name" ]; then
        if ! diff -q "$f" "$squire_path/$name" > /dev/null 2>&1; then
          updated+=("$name")
        fi
      fi
    done
  fi

  # --- Output ---
  local total_local=0 total_squire=0
  if [ "$match" = "dir" ]; then
    total_local=$(find "$local_path" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')
    total_squire=$(find "$squire_path" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')
  else
    total_local=$(ls "$local_path"/*."$match" 2>/dev/null | wc -l | tr -d ' ')
    total_squire=$(ls "$squire_path"/*."$match" 2>/dev/null | wc -l | tr -d ' ')
  fi

  if [ "$ACTION" = "--counts" ]; then
    echo "$type	${#new[@]}	${#stale[@]}	${#updated[@]}	$total_local	$total_squire"
    return
  fi

  echo -e "  ${WHITE}$type${RESET} — local: $total_local | repo: $total_squire"

  if [ ${#new[@]} -gt 0 ]; then
    echo -e "    ${GREEN}+${#new[@]} new${RESET} (local only):"
    for n in "${new[@]}"; do
      echo -e "      ${GREEN}+${RESET} $n"
    done
  fi

  if [ ${#stale[@]} -gt 0 ]; then
    echo -e "    ${RED}-${#stale[@]} stale${RESET} (repo only):"
    for s in "${stale[@]}"; do
      echo -e "      ${RED}-${RESET} $s"
    done
  fi

  if [ ${#updated[@]} -gt 0 ]; then
    echo -e "    ${AMBER}~${#updated[@]} updated${RESET} (differ):"
    for u in "${updated[@]}"; do
      echo -e "      ${AMBER}~${RESET} $u"
    done
  fi

  if [ ${#new[@]} -eq 0 ] && [ ${#stale[@]} -eq 0 ] && [ ${#updated[@]} -eq 0 ]; then
    echo -e "    ${GREEN}In sync${RESET}"
  fi

  echo ""

  # --- Sync ---
  if [ "$ACTION" = "--sync" ] || [ "$ACTION" = "--sync-new" ]; then
    # Add new
    for n in "${new[@]}"; do
      if [ "$match" = "dir" ]; then
        cp -r "$local_path/$n" "$squire_path/$n"
      else
        cp "$local_path/$n" "$squire_path/$n"
      fi
      echo -e "    ${GREEN}synced${RESET} +$n"
    done

    if [ "$ACTION" = "--sync" ]; then
      # Update changed
      for u in "${updated[@]}"; do
        if [ "$match" = "dir" ]; then
          rsync -a --delete "$local_path/$u/" "$squire_path/$u/"
        else
          cp "$local_path/$u" "$squire_path/$u"
        fi
        echo -e "    ${AMBER}synced${RESET} ~$u"
      done

      # Remove stale
      for s in "${stale[@]}"; do
        rm -rf "$squire_path/$s"
        echo -e "    ${RED}removed${RESET} -$s"
      done
    fi
  fi
}

# --- Header ---
if [ "$ACTION" != "--counts" ]; then
  echo -e "${ORANGE}Squire Sync${RESET} ${WHITE}— Tool Drift Report${RESET}"
  echo -e "${GRAY}Local: ~/.claude/ | Repo: ~/Development/squire/${RESET}"
  if [ "$ACTION" = "--sync" ]; then
    echo -e "${GREEN}Mode: SYNC (full)${RESET}"
  elif [ "$ACTION" = "--sync-new" ]; then
    echo -e "${AMBER}Mode: SYNC (new only)${RESET}"
  else
    echo -e "${GRAY}Mode: REPORT (dry run)${RESET}"
  fi
  echo ""
fi

# --- Run Diffs ---
diff_tools "commands" "$LOCAL_DIR/commands" "$SQUIRE_DIR/commands" "md"
diff_tools "agents" "$LOCAL_DIR/agents" "$SQUIRE_DIR/agents" "md"
diff_tools "skills" "$LOCAL_DIR/skills" "$SQUIRE_DIR/skills" "dir"

# --- Summary ---
if [ "$ACTION" != "--counts" ]; then
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"
  if [ "$ACTION" = "--sync" ] || [ "$ACTION" = "--sync-new" ]; then
    echo -e "${WHITE}Sync complete.${RESET} Run ${GRAY}cd ~/Development/squire && git diff --stat${RESET} to review."
  else
    echo -e "${WHITE}Dry run complete.${RESET} Use ${GRAY}--sync${RESET} to apply or ${GRAY}--sync-new${RESET} for new tools only."
  fi
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"
fi
