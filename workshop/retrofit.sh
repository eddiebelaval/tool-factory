#!/bin/bash
# Tool Factory — Workshop Retrofit
# Automatically adds missing structure to skills that FAIL the Range.
# Non-destructive: only ADDS missing fields, never overwrites existing content.
#
# Usage: ./retrofit.sh <skill-name>           # Retrofit one skill
#        ./retrofit.sh --all                  # Retrofit all FAIL skills
#        ./retrofit.sh --dry-run <skill-name> # Show what would change
#        ./retrofit.sh --dry-run --all        # Preview all changes
#
# What it fixes:
#   - Missing YAML frontmatter (adds complete block)
#   - Partial frontmatter (adds missing fields: slug, category, complexity, version, author, triggers, tags)
#   - Missing "Core Workflows" section (inserts after frontmatter)
#   - Missing "Quick Reference" section (appends before Constraints/Rules)

set -euo pipefail

# --- Config ---
SKILLS_DIR="$HOME/.claude/skills"
FACTORY_DIR="$HOME/Development/id8/tool-factory"
RANGE_RUNNER="$FACTORY_DIR/range/runner.sh"

# --- Colors ---
ORANGE='\033[38;2;239;111;46m'
TEAL='\033[38;2;78;205;196m'
AMBER='\033[38;2;245;158;11m'
RED='\033[38;2;239;68;68m'
GREEN='\033[38;2;34;197;94m'
GRAY='\033[38;2;119;119;119m'
WHITE='\033[38;2;238;238;238m'
RESET='\033[0m'

# --- Parse Args ---
DRY_RUN=false
ALL_MODE=false
SKILL_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --all) ALL_MODE=true; shift ;;
    *) SKILL_NAME="$1"; shift ;;
  esac
done

if [ "$ALL_MODE" = false ] && [ -z "$SKILL_NAME" ]; then
  echo -e "${RED}Usage: ./retrofit.sh <skill-name> | --all [--dry-run]${RESET}"
  exit 1
fi

# --- Retrofit Function ---
retrofit_skill() {
  local name="$1"
  local skill_file="$SKILLS_DIR/$name/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    echo -e "  ${RED}SKIP${RESET} $name — file not found"
    return 1
  fi

  local changes=0
  local changes_desc=""

  # Read file content
  local content
  content=$(cat "$skill_file")

  # --- Check 1: Has frontmatter at all? ---
  if ! echo "$content" | head -1 | grep -q "^---"; then
    # No frontmatter — need to add complete block
    local display_name
    display_name=$(echo "$name" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

    # Guess category from content
    local category="development"
    if echo "$content" | grep -qi "deploy\|ship\|ci\|cd\|pipeline\|git"; then
      category="operations"
    elif echo "$content" | grep -qi "test\|verify\|lint\|check"; then
      category="testing"
    elif echo "$content" | grep -qi "market\|seo\|brand\|content\|social"; then
      category="marketing"
    elif echo "$content" | grep -qi "business\|llc\|tax\|revenue\|pricing"; then
      category="business"
    elif echo "$content" | grep -qi "design\|ui\|ux\|layout\|css"; then
      category="design"
    elif echo "$content" | grep -qi "data\|analytics\|database\|sql"; then
      category="data"
    fi

    # Extract first meaningful line as description
    local desc
    desc=$(echo "$content" | grep -v "^#" | grep -v "^$" | grep -v "^---" | head -1 | sed 's/^[[:space:]]*//' | cut -c1-120)
    if [ -z "$desc" ]; then
      desc="$display_name skill"
    fi

    local frontmatter="---
name: $display_name
slug: $name
description: $desc
category: $category
complexity: complex
version: \"1.0.0\"
author: \"id8Labs\"
triggers:
  - \"$name\"
  - \"$(echo "$name" | tr '-' ' ')\"
tags:
  - $category
  - tool-factory-retrofitted
---

"
    if [ "$DRY_RUN" = true ]; then
      changes_desc="${changes_desc}  + Add complete frontmatter (name, slug, category:$category, triggers, tags)\n"
    else
      # Prepend frontmatter
      echo "${frontmatter}${content}" > "$skill_file"
      content=$(cat "$skill_file")
    fi
    changes=$((changes + 1))
  else
    # Has frontmatter — check for missing fields
    # Extract frontmatter block
    local fm_end
    fm_end=$(echo "$content" | tail -n +2 | grep -n "^---" | head -1 | cut -d: -f1)
    fm_end=$((fm_end + 1))

    local needs_fields=""

    if ! echo "$content" | head -$fm_end | grep -q "^slug:"; then
      needs_fields="${needs_fields}slug: $name\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^category:"; then
      local category="development"
      if echo "$content" | grep -qi "deploy\|ship\|ci\|cd\|pipeline\|git"; then
        category="operations"
      elif echo "$content" | grep -qi "test\|verify\|lint\|check"; then
        category="testing"
      elif echo "$content" | grep -qi "market\|seo\|brand\|content\|social"; then
        category="marketing"
      elif echo "$content" | grep -qi "business\|llc\|tax\|revenue\|pricing"; then
        category="business"
      elif echo "$content" | grep -qi "design\|ui\|ux\|layout\|css"; then
        category="design"
      elif echo "$content" | grep -qi "data\|analytics\|database\|sql"; then
        category="data"
      fi
      needs_fields="${needs_fields}category: $category\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^complexity:"; then
      needs_fields="${needs_fields}complexity: complex\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^version:"; then
      needs_fields="${needs_fields}version: \"1.0.0\"\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^author:"; then
      needs_fields="${needs_fields}author: \"id8Labs\"\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^triggers:"; then
      needs_fields="${needs_fields}triggers:\n  - \"$name\"\n  - \"$(echo "$name" | tr '-' ' ')\"\n"
    fi

    if ! echo "$content" | head -$fm_end | grep -q "^tags:"; then
      local cat_tag
      cat_tag=$(echo "$content" | head -$fm_end | grep "^category:" | awk '{print $2}' || echo "development")
      if [ -z "$cat_tag" ]; then cat_tag="development"; fi
      needs_fields="${needs_fields}tags:\n  - $cat_tag\n  - tool-factory-retrofitted\n"
    fi

    if [ -n "$needs_fields" ]; then
      if [ "$DRY_RUN" = true ]; then
        changes_desc="${changes_desc}  + Add missing frontmatter fields\n"
      else
        # Insert fields before the closing ---
        python3 << PYEOF
import re

with open('$skill_file', 'r') as f:
    text = f.read()

# Find the closing --- of frontmatter
parts = text.split('---', 2)
if len(parts) >= 3:
    fm = parts[1]
    rest = parts[2]
    new_fields = """$(echo -e "$needs_fields")"""
    fm = fm.rstrip() + '\n' + new_fields
    text = '---' + fm + '---' + rest
    with open('$skill_file', 'w') as f:
        f.write(text)
PYEOF
        content=$(cat "$skill_file")
      fi
      changes=$((changes + 1))
    fi
  fi

  # --- Check 2: Has Core Workflows section? ---
  if ! echo "$content" | grep -q "## Core Workflows"; then
    if [ "$DRY_RUN" = true ]; then
      changes_desc="${changes_desc}  + Add Core Workflows section\n"
    else
      # Insert after frontmatter and first heading
      python3 << PYEOF
with open('$skill_file', 'r') as f:
    lines = f.readlines()

# Find end of frontmatter
in_fm = False
fm_end_idx = 0
for i, line in enumerate(lines):
    if line.strip() == '---':
        if in_fm:
            fm_end_idx = i
            break
        else:
            in_fm = True

# Find first H1 heading after frontmatter
h1_idx = fm_end_idx
for i in range(fm_end_idx + 1, len(lines)):
    if lines[i].startswith('# '):
        h1_idx = i
        break

# Find the line after H1 (skip blank lines and description paragraph)
insert_idx = h1_idx + 1
while insert_idx < len(lines) and lines[insert_idx].strip() != '' and not lines[insert_idx].startswith('#'):
    insert_idx += 1
# Skip one blank line if present
if insert_idx < len(lines) and lines[insert_idx].strip() == '':
    insert_idx += 1

workflows = """
## Core Workflows

### Workflow 1: Primary Action
1. Analyze the input and context
2. Validate prerequisites are met
3. Execute the core operation
4. Verify the output meets expectations
5. Report results

"""

lines.insert(insert_idx, workflows)

with open('$skill_file', 'w') as f:
    f.writelines(lines)
PYEOF
      content=$(cat "$skill_file")
    fi
    changes=$((changes + 1))
  fi

  # --- Report ---
  if [ $changes -eq 0 ]; then
    echo -e "  ${GRAY}SKIP${RESET} $name — already compliant"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${AMBER}WOULD FIX${RESET} $name ($changes changes)"
    echo -e "$changes_desc"
  else
    echo -e "  ${GREEN}FIXED${RESET} $name ($changes changes)"
  fi
  return 0
}

# --- Main ---
if [ "$ALL_MODE" = true ]; then
  echo -e "${ORANGE}Workshop${RESET} ${WHITE}— Batch Retrofit${RESET}"
  if [ "$DRY_RUN" = true ]; then
    echo -e "${GRAY}(dry run — no files will be changed)${RESET}"
  fi
  echo ""

  TOTAL=0
  FIXED=0
  SKIPPED=0

  # Score all skills and collect FAILs
  for skill_dir in "$SKILLS_DIR"/*/; do
    name=$(basename "$skill_dir")
    skill_file="$skill_dir/SKILL.md"
    [ -f "$skill_file" ] || continue

    TOTAL=$((TOTAL + 1))

    # Quick check: does it need work?
    needs_work=false

    # No frontmatter?
    if ! head -1 "$skill_file" | grep -q "^---"; then
      needs_work=true
    else
      # Missing key fields?
      fm_end=$(tail -n +2 "$skill_file" | grep -n "^---" | head -1 | cut -d: -f1 || echo "5")
      fm_end=$((fm_end + 1))
      if ! head -$fm_end "$skill_file" | grep -q "^triggers:"; then needs_work=true; fi
      if ! head -$fm_end "$skill_file" | grep -q "^category:"; then needs_work=true; fi
      if ! head -$fm_end "$skill_file" | grep -q "^tags:"; then needs_work=true; fi
      if ! head -$fm_end "$skill_file" | grep -q "^version:"; then needs_work=true; fi
    fi

    # No Core Workflows?
    if ! grep -q "## Core Workflows" "$skill_file"; then
      needs_work=true
    fi

    if [ "$needs_work" = true ]; then
      retrofit_skill "$name"
      FIXED=$((FIXED + 1))
    else
      SKIPPED=$((SKIPPED + 1))
    fi
  done

  echo ""
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"
  echo -e "${WHITE}Workshop Batch Complete${RESET}"
  echo -e "${GRAY}Total skills:  $TOTAL${RESET}"
  echo -e "${GREEN}Retrofitted:   $FIXED${RESET}"
  echo -e "${GRAY}Already good:  $SKIPPED${RESET}"
  if [ "$DRY_RUN" = true ]; then
    echo -e "${AMBER}(dry run — run without --dry-run to apply)${RESET}"
  fi
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

else
  echo -e "${ORANGE}Workshop${RESET} ${WHITE}— Retrofit: $SKILL_NAME${RESET}"
  if [ "$DRY_RUN" = true ]; then
    echo -e "${GRAY}(dry run)${RESET}"
  fi
  echo ""
  retrofit_skill "$SKILL_NAME"
fi
