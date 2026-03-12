#!/bin/bash
# Tool Factory — Range Runner
# Scores a tool against its test fixture and lexicon compliance.
#
# Usage: ./runner.sh <tool-name> [--type skill|agent|hook|mcp|plugin]
#        ./runner.sh --all          # Run all pending fixtures
#        ./runner.sh --report       # Show summary of all scores
#
# The Range runs three test categories:
#   1. Lexicon Compliance — Does the tool follow the rules?
#   2. Structure Validation — Is it properly formed?
#   3. Fixture Tests — Does it solve its stated problem?

set -euo pipefail

# ─── Config ───
FACTORY_DIR="$HOME/Development/id8/tool-factory"
SKILLS_DIR="$HOME/.claude/skills"
AGENTS_DIR="$HOME/.claude/agents"
HOOKS_DIR="$HOME/.claude/hooks"
FIXTURES_DIR="$FACTORY_DIR/range/fixtures"
REPORTS_DIR="$FACTORY_DIR/range/reports"
REGISTRY="$FACTORY_DIR/registry/index.json"

# ─── Colors ───
ORANGE='\033[38;2;239;111;46m'
TEAL='\033[38;2;78;205;196m'
AMBER='\033[38;2;245;158;11m'
RED='\033[38;2;239;68;68m'
GREEN='\033[38;2;34;197;94m'
GRAY='\033[38;2;119;119;119m'
WHITE='\033[38;2;238;238;238m'
BLUE='\033[38;2;59;130;246m'
RESET='\033[0m'

# ─── Functions ───

score_skill() {
  local SKILL_NAME="$1"
  local SKILL_FILE="$SKILLS_DIR/$SKILL_NAME/SKILL.md"
  local SCORE=0
  local MAX_SCORE=0
  local PASSED=0
  local FAILED=0
  local WARNINGS=0
  local DETAILS=""

  if [ ! -f "$SKILL_FILE" ]; then
    echo -e "  ${RED}SKIP${RESET} $SKILL_NAME — file not found"
    return 1
  fi

  echo -e "${TEAL}Range${RESET} ${WHITE}— Scoring: $SKILL_NAME${RESET}"
  echo ""

  # ── Lexicon Compliance (40 points) ──
  echo -e "  ${GRAY}[Lexicon Compliance]${RESET}"

  # Frontmatter (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  if head -1 "$SKILL_FILE" | grep -q "^---"; then
    SCORE=$((SCORE + 10))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [10] Frontmatter present"
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] Missing frontmatter"
  fi

  # Triggers defined (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  if grep -q "^triggers:" "$SKILL_FILE"; then
    TRIGGER_COUNT=$(grep -c "^  - " "$SKILL_FILE" 2>/dev/null || echo "0")
    if [ "$TRIGGER_COUNT" -ge 2 ]; then
      SCORE=$((SCORE + 10))
      PASSED=$((PASSED + 1))
      echo -e "    ${GREEN}PASS${RESET} [10] $TRIGGER_COUNT triggers defined"
    else
      SCORE=$((SCORE + 5))
      WARNINGS=$((WARNINGS + 1))
      echo -e "    ${AMBER}WARN${RESET} [ 5] Only $TRIGGER_COUNT trigger (need 2+)"
    fi
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] No triggers defined"
  fi

  # No emojis (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  if grep -P '[\x{1F600}-\x{1F64F}\x{1F300}-\x{1F5FF}\x{1F680}-\x{1F6FF}\x{1F1E0}-\x{1F1FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]' "$SKILL_FILE" 2>/dev/null; then
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] Contains emojis (brand violation)"
  else
    SCORE=$((SCORE + 10))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [10] No emojis"
  fi

  # Token budget (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  local CHARS=$(wc -c < "$SKILL_FILE")
  local APPROX_TOKENS=$((CHARS / 4))
  if [ "$APPROX_TOKENS" -lt 1500 ]; then
    SCORE=$((SCORE + 10))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [10] ~$APPROX_TOKENS tokens (under 1500)"
  elif [ "$APPROX_TOKENS" -lt 2000 ]; then
    SCORE=$((SCORE + 7))
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 7] ~$APPROX_TOKENS tokens (under 2000 but heavy)"
  elif [ "$APPROX_TOKENS" -lt 3000 ]; then
    SCORE=$((SCORE + 3))
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 3] ~$APPROX_TOKENS tokens (over 2000)"
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] ~$APPROX_TOKENS tokens (way over budget)"
  fi

  # ── Structure (30 points) ──
  echo -e "  ${GRAY}[Structure]${RESET}"

  # Has description in frontmatter (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "^description:" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Description in frontmatter"
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] Missing description"
  fi

  # Has Core Workflows (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  if grep -q "## Core Workflows\|## Workflows\|## Core Actions" "$SKILL_FILE"; then
    SCORE=$((SCORE + 10))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [10] Workflow section present"
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] No workflow section"
  fi

  # Has Quick Reference (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "## Quick Reference\|## Reference\|## Commands" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Quick reference present"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No quick reference"
  fi

  # Has Best Practices or Constraints (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "## Best Practices\|## Constraints\|## Guidelines\|## Rules" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Practices/constraints present"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No practices/constraints section"
  fi

  # Has numbered steps in workflows (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -qE "^[0-9]+\." "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Numbered workflow steps"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No numbered steps"
  fi

  # ── Content Quality (30 points) ──
  echo -e "  ${GRAY}[Content Quality]${RESET}"

  # Has category field (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "^category:" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Category defined"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No category"
  fi

  # Has tags (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "^tags:" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Tags defined"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No tags"
  fi

  # Has version (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "^version:" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Version field"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No version"
  fi

  # Content length reasonable — not just boilerplate (10 pts)
  MAX_SCORE=$((MAX_SCORE + 10))
  local LINES=$(wc -l < "$SKILL_FILE")
  if [ "$LINES" -ge 30 ]; then
    SCORE=$((SCORE + 10))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [10] $LINES lines — substantive content"
  elif [ "$LINES" -ge 15 ]; then
    SCORE=$((SCORE + 5))
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 5] $LINES lines — light content"
  else
    FAILED=$((FAILED + 1))
    echo -e "    ${RED}FAIL${RESET} [ 0] $LINES lines — too thin"
  fi

  # Has at least one example or table (5 pts)
  MAX_SCORE=$((MAX_SCORE + 5))
  if grep -q "^|" "$SKILL_FILE" || grep -q '```' "$SKILL_FILE" || grep -qi "example" "$SKILL_FILE"; then
    SCORE=$((SCORE + 5))
    PASSED=$((PASSED + 1))
    echo -e "    ${GREEN}PASS${RESET} [ 5] Has examples/tables"
  else
    WARNINGS=$((WARNINGS + 1))
    echo -e "    ${AMBER}WARN${RESET} [ 0] No examples or tables"
  fi

  # ── Score Summary ──
  echo ""
  local PCT=$((SCORE * 100 / MAX_SCORE))
  local RECOMMENDATION=""
  local COLOR=""

  if [ "$PCT" -ge 85 ]; then
    RECOMMENDATION="PASS"
    COLOR="$GREEN"
  elif [ "$PCT" -ge 60 ]; then
    RECOMMENDATION="PARTIAL"
    COLOR="$AMBER"
  else
    RECOMMENDATION="FAIL"
    COLOR="$RED"
  fi

  echo -e "  ${WHITE}Score: ${COLOR}$SCORE/$MAX_SCORE ($PCT%)${RESET}"
  echo -e "  ${GREEN}Passed: $PASSED${RESET}  ${AMBER}Warnings: $WARNINGS${RESET}  ${RED}Failed: $FAILED${RESET}"
  echo -e "  ${WHITE}Recommendation: ${COLOR}$RECOMMENDATION${RESET}"
  echo ""

  # ── Write Report ──
  mkdir -p "$REPORTS_DIR"
  cat > "$REPORTS_DIR/$SKILL_NAME.json" << REPORT_EOF
{
  "tool": "$SKILL_NAME",
  "type": "skill",
  "scored_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "score": $SCORE,
  "max_score": $MAX_SCORE,
  "percentage": $PCT,
  "passed": $PASSED,
  "warnings": $WARNINGS,
  "failed": $FAILED,
  "recommendation": "$RECOMMENDATION",
  "token_estimate": $APPROX_TOKENS,
  "line_count": $LINES
}
REPORT_EOF

  echo -e "  ${GRAY}Report: $REPORTS_DIR/$SKILL_NAME.json${RESET}"
}

show_report() {
  echo -e "${TEAL}Range Report${RESET} — All Scored Tools"
  echo ""

  if [ ! -d "$REPORTS_DIR" ] || [ -z "$(ls -A "$REPORTS_DIR" 2>/dev/null)" ]; then
    echo -e "  ${GRAY}No reports yet. Run: ./runner.sh <tool-name>${RESET}"
    return
  fi

  # Header
  printf "  ${GRAY}%-30s %6s %6s %12s${RESET}\n" "TOOL" "SCORE" "PCT" "RECOMMENDATION"
  echo -e "  ${GRAY}$(printf '%.0s─' {1..60})${RESET}"

  local TOTAL=0
  local PASS_COUNT=0
  local PARTIAL_COUNT=0
  local FAIL_COUNT=0

  for report in "$REPORTS_DIR"/*.json; do
    [ -f "$report" ] || continue
    TOTAL=$((TOTAL + 1))

    local NAME=$(python3 -c "import json; d=json.load(open('$report')); print(d['tool'])")
    local SCORE=$(python3 -c "import json; d=json.load(open('$report')); print(d['score'])")
    local MAX=$(python3 -c "import json; d=json.load(open('$report')); print(d['max_score'])")
    local PCT=$(python3 -c "import json; d=json.load(open('$report')); print(d['percentage'])")
    local REC=$(python3 -c "import json; d=json.load(open('$report')); print(d['recommendation'])")

    local COLOR="$GREEN"
    if [ "$REC" = "PARTIAL" ]; then COLOR="$AMBER"; PARTIAL_COUNT=$((PARTIAL_COUNT + 1)); fi
    if [ "$REC" = "FAIL" ]; then COLOR="$RED"; FAIL_COUNT=$((FAIL_COUNT + 1)); fi
    if [ "$REC" = "PASS" ]; then PASS_COUNT=$((PASS_COUNT + 1)); fi

    printf "  %-30s %3s/%-3s %4s%% ${COLOR}%s${RESET}\n" "$NAME" "$SCORE" "$MAX" "$PCT" "$REC"
  done

  echo ""
  echo -e "  ${WHITE}Total: $TOTAL${RESET}  ${GREEN}Pass: $PASS_COUNT${RESET}  ${AMBER}Partial: $PARTIAL_COUNT${RESET}  ${RED}Fail: $FAIL_COUNT${RESET}"
}

run_all_pending() {
  echo -e "${TEAL}Range${RESET} ${WHITE}— Scoring all pending fixtures${RESET}"
  echo ""

  local COUNT=0
  for fixture in "$FIXTURES_DIR"/*.json; do
    [ -f "$fixture" ] || continue
    local TOOL_NAME=$(basename "$fixture" .json)
    local TOOL_TYPE=$(python3 -c "import json; d=json.load(open('$fixture')); print(d.get('type','skill'))")

    if [ "$TOOL_TYPE" = "skill" ]; then
      score_skill "$TOOL_NAME"
      COUNT=$((COUNT + 1))
      echo ""
    fi
  done

  if [ "$COUNT" -eq 0 ]; then
    echo -e "  ${GRAY}No pending fixtures. Generate tools first.${RESET}"
  else
    echo -e "${WHITE}Scored $COUNT tools.${RESET}"
  fi
}

# ─── Main ───
case "${1:-}" in
  --all)
    run_all_pending
    ;;
  --report)
    show_report
    ;;
  "")
    echo -e "${RED}Usage: ./runner.sh <tool-name> | --all | --report${RESET}"
    exit 1
    ;;
  *)
    TOOL_NAME="$1"
    TOOL_TYPE="${2:---type}"

    # Default to skill
    if [ "$TOOL_TYPE" = "--type" ]; then
      score_skill "$TOOL_NAME"
    else
      case "$TOOL_TYPE" in
        skill) score_skill "$TOOL_NAME" ;;
        *) echo -e "${AMBER}Only skill scoring implemented. Agent/hook/MCP coming soon.${RESET}" ;;
      esac
    fi
    ;;
esac
