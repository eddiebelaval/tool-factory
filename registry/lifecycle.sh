#!/bin/bash
# Tool Factory — Self-Healing Lifecycle
# Automated maintenance that acts on intelligence data.
# Designed to run on schedule (launchd) or manually.
#
# Usage:
#   ./lifecycle.sh                    # Full maintenance cycle
#   ./lifecycle.sh --score            # Re-score all skills (Range batch)
#   ./lifecycle.sh --fix              # Auto-retrofit any new FAILs
#   ./lifecycle.sh --flag-dormant     # Flag tools dormant after N days unused
#   ./lifecycle.sh --report           # Generate maintenance report (no changes)
#   ./lifecycle.sh --dry-run          # Preview all actions without executing

set -euo pipefail

# --- Config ---
FACTORY_DIR="$HOME/Development/id8/tool-factory"
REGISTRY="$FACTORY_DIR/registry/index.json"
RANGE_RUNNER="$FACTORY_DIR/range/runner.sh"
RETROFIT="$FACTORY_DIR/workshop/retrofit.sh"
INTELLIGENCE="$FACTORY_DIR/registry/intelligence.sh"
USAGE_DIR="$FACTORY_DIR/registry/usage"
REPORTS_DIR="$FACTORY_DIR/registry/lifecycle-reports"
SKILLS_DIR="$HOME/.claude/skills"

DORMANT_THRESHOLD_DAYS=60  # Flag as dormant after this many days unused

# --- Colors ---
source "$FACTORY_DIR/lib/colors.sh"

ACTION="${1:-full}"
DRY_RUN=false
if [ "$ACTION" = "--dry-run" ]; then
  DRY_RUN=true
  ACTION="${2:-full}"
fi

mkdir -p "$REPORTS_DIR"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REPORT_FILE="$REPORTS_DIR/$DATE.md"

echo -e "${ORANGE}Lifecycle${RESET} ${WHITE}— Self-Healing Maintenance${RESET}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${AMBER}(dry run — no changes will be made)${RESET}"
fi
echo -e "${GRAY}$DATE${RESET}"
echo ""

# --- Phase 1: Score ---
run_scoring() {
  echo -e "${TEAL}[1/4]${RESET} ${WHITE}Range Scoring${RESET}"

  # Run Range once
  local output
  output=$(bash "$RANGE_RUNNER" --report 2>&1)

  # Parse results (strip ANSI)
  local clean
  clean=$(echo "$output" | sed 's/\x1b\[[0-9;]*m//g')

  local total=$(echo "$clean" | grep "Total:" | awk '{print $2}')
  local pass=$(echo "$clean" | grep "Pass:" | awk '{print $4}')
  local partial=$(echo "$clean" | grep "Partial:" | awk '{print $6}')
  local fail=$(echo "$clean" | grep "Fail:" | awk '{print $8}')

  echo -e "    ${GREEN}$pass PASS${RESET}  ${AMBER}$partial PARTIAL${RESET}  ${RED}$fail FAIL${RESET}  (of $total)"

  # Collect FAIL list
  FAIL_SKILLS=$(echo "$clean" | grep "FAIL" | awk '{print $1}')
  FAIL_COUNT=$(echo "$clean" | grep -c "FAIL" || echo "0")

  echo -e "    ${GRAY}$FAIL_COUNT skills below threshold${RESET}"

  # --- Snapshot scores to history + build scores cache for Phase 4 ---
  SCORE_HISTORY="$FACTORY_DIR/registry/score-history.jsonl"
  SCORES_CACHE="$FACTORY_DIR/registry/.scores-cache.json"
  snapshot_count=$(python3 << PYEOF
import re, json

clean_output = """$(echo "$clean" | sed "s/'/\\\\'/g")"""
date = "$DATE"

scores = {}
count = 0
for line in clean_output.split('\n'):
    line = line.strip()
    m = re.match(r'^(\S+)\s+(\d+)/100\s+\d+%\s+(PASS|PARTIAL|FAIL)$', line)
    if m:
        tool, score, verdict = m.group(1), int(m.group(2)), m.group(3)
        entry = {"date": date, "tool": tool, "score": score, "verdict": verdict}
        with open('$SCORE_HISTORY', 'a') as f:
            f.write(json.dumps(entry) + '\n')
        scores[tool] = {"score": score, "verdict": verdict}
        count += 1

# Write scores cache for run_decay_alerts (avoids re-running Range)
with open('$SCORES_CACHE', 'w') as f:
    json.dump(scores, f)

print(count)
PYEOF
  )
  echo -e "    ${GRAY}$snapshot_count scores written to score-history.jsonl${RESET}"
  echo ""

  # Write to report
  cat >> "$REPORT_FILE" << EOF
## Range Scoring
- Total: $total
- PASS: $pass | PARTIAL: $partial | FAIL: $fail
- Skills below threshold: $FAIL_COUNT
- Score history snapshot: $snapshot_count tools

EOF
}

# --- Phase 2: Auto-Retrofit ---
run_retrofit() {
  echo -e "${TEAL}[2/4]${RESET} ${WHITE}Auto-Retrofit${RESET}"

  if [ -z "${FAIL_SKILLS:-}" ]; then
    echo -e "    ${GREEN}No failing skills to retrofit${RESET}"
    echo ""
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    echo -e "    ${AMBER}Would retrofit $FAIL_COUNT skills:${RESET}"
    echo "$FAIL_SKILLS" | head -10 | while read -r skill; do
      echo -e "      ${GRAY}$skill${RESET}"
    done
    if [ "$FAIL_COUNT" -gt 10 ]; then
      echo -e "      ${GRAY}... and $((FAIL_COUNT - 10)) more${RESET}"
    fi
  else
    echo -e "    Running batch retrofit..."
    local output
    output=$(bash "$RETROFIT" --all 2>&1)

    local fixed=$(echo "$output" | grep -c "FIXED" || echo "0")
    local skipped=$(echo "$output" | grep -c "SKIP" || echo "0")

    echo -e "    ${GREEN}$fixed fixed${RESET}, ${GRAY}$skipped skipped${RESET}"

    cat >> "$REPORT_FILE" << EOF
## Auto-Retrofit
- Fixed: $fixed
- Skipped: $skipped

EOF
  fi
  echo ""
}

# --- Phase 3: Dormant Detection ---
run_dormant_check() {
  echo -e "${TEAL}[3/4]${RESET} ${WHITE}Dormant Detection${RESET}"

  python3 << PYEOF
import json, os, glob
from datetime import datetime, timedelta

factory_dir = os.path.expanduser("~/Development/id8/tool-factory")
usage_dir = os.path.join(factory_dir, "registry", "usage")
skills_dir = os.path.expanduser("~/.claude/skills")
registry_path = os.path.join(factory_dir, "registry", "index.json")
threshold = $DORMANT_THRESHOLD_DAYS
dry_run = $( [ "$DRY_RUN" = true ] && echo "True" || echo "False" )

# Collect last-used dates from JSONL
last_used = {}
if os.path.isdir(usage_dir):
    for f in glob.glob(os.path.join(usage_dir, "*.jsonl")):
        with open(f) as fh:
            for line in fh:
                try:
                    entry = json.loads(line.strip())
                    tool = entry.get("tool", "")
                    ts = entry.get("timestamp", "")
                    if tool and ts:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        if tool not in last_used or dt > last_used[tool]:
                            last_used[tool] = dt
                except (json.JSONDecodeError, KeyError, ValueError):
                    pass

# Also check API cache
api_cache = os.path.join(factory_dir, "registry", ".api-cache.json")
if os.path.exists(api_cache):
    with open(api_cache) as f:
        cached = json.load(f)
        # API doesn't have dates, but if a tool has usage we mark it as "known active"
        for tool in cached.get("skills_used", {}):
            if tool not in last_used:
                # Mark as active but with old date (we don't know when)
                last_used[tool] = datetime.now() - timedelta(days=1)

# All skills
all_skills = []
if os.path.isdir(skills_dir):
    for d in sorted(os.listdir(skills_dir)):
        if os.path.isfile(os.path.join(skills_dir, d, "SKILL.md")):
            all_skills.append(d)

# Find dormant (has usage data but hasn't been used in threshold days)
cutoff = datetime.now(last_used[next(iter(last_used))].tzinfo if last_used else None) - timedelta(days=threshold) if last_used else None
dormant = []
never_used = []

for skill in all_skills:
    if skill in last_used:
        if cutoff and last_used[skill] < cutoff:
            days_ago = (datetime.now(last_used[skill].tzinfo) - last_used[skill]).days
            dormant.append((skill, days_ago))
    else:
        never_used.append(skill)

# Report
if dormant:
    print(f"    \033[38;2;245;158;11m{len(dormant)} tools dormant (>{threshold} days since last use):\033[0m")
    for name, days in sorted(dormant, key=lambda x: -x[1])[:10]:
        print(f"      \033[38;2;119;119;119m{name:<30} last used {days} days ago\033[0m")
else:
    print(f"    \033[38;2;34;197;94mNo dormant tools (all active within {threshold} days)\033[0m")

print(f"    \033[38;2;119;119;119m{len(never_used)} tools have never been tracked (will surface as data accumulates)\033[0m")
PYEOF

  echo ""
}

# --- Phase 4: Decay Alerts ---
run_decay_alerts() {
  echo -e "${TEAL}[4/4]${RESET} ${WHITE}Decay Alerts${RESET}"

  python3 << 'PYEOF'
import json, os

factory_dir = os.path.expanduser("~/Development/id8/tool-factory")
api_cache = os.path.join(factory_dir, "registry", ".api-cache.json")
scores_cache = os.path.join(factory_dir, "registry", ".scores-cache.json")

# Get usage data
usage = {}
if os.path.exists(api_cache):
    with open(api_cache) as f:
        usage = json.load(f).get("skills_used", {})

# Read scores from cache (written by run_scoring Phase 1)
scores = {}
if os.path.exists(scores_cache):
    try:
        with open(scores_cache) as f:
            scores = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"    \033[38;2;239;68;68mWarning: Could not read scores cache: {e}\033[0m")

if not scores:
    print("    \033[38;2;245;158;11mNo scores available — run Phase 1 (--score) first\033[0m")

# Cross-reference: used tools with bad scores
alerts = []
for tool, count in sorted(usage.items(), key=lambda x: -x[1]):
    if tool in scores and scores[tool]["verdict"] in ("FAIL", "PARTIAL"):
        alerts.append({
            "tool": tool,
            "uses": count,
            "score": scores[tool]["score"],
            "verdict": scores[tool]["verdict"]
        })

if alerts:
    print(f"    \033[38;2;239;68;68m{len(alerts)} used tool(s) need attention:\033[0m")
    for a in alerts:
        priority = "HIGH" if a["uses"] >= 10 else "MEDIUM" if a["uses"] >= 3 else "LOW"
        color = "\033[38;2;239;68;68m" if priority == "HIGH" else "\033[38;2;245;158;11m" if priority == "MEDIUM" else "\033[38;2;119;119;119m"
        print(f"      {color}[{priority}]\033[0m {a['tool']:<25} {a['uses']}x used  {a['score']}/100 {a['verdict']}")
        print(f"            \033[38;2;119;119;119mFix: workshop/retrofit.sh {a['tool']}\033[0m")
else:
    print("    \033[38;2;34;197;94mAll used tools are healthy\033[0m")
PYEOF

  echo ""
}

# --- Report Header ---
cat > "$REPORT_FILE" << EOF
# Lifecycle Report — $DATE

Run: $TIMESTAMP
Mode: $([ "$DRY_RUN" = true ] && echo "dry-run" || echo "live")

EOF

# --- Execute ---
case "$ACTION" in
  --score)
    run_scoring
    ;;
  --fix)
    run_scoring
    run_retrofit
    ;;
  --flag-dormant)
    run_dormant_check
    ;;
  --report)
    DRY_RUN=true
    run_scoring
    run_retrofit
    run_dormant_check
    run_decay_alerts
    ;;
  full|*)
    run_scoring
    run_retrofit
    run_dormant_check
    run_decay_alerts
    ;;
esac

# --- Summary ---
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
echo -e "${WHITE}Lifecycle Complete${RESET}"
echo -e "${GRAY}Report: $REPORT_FILE${RESET}"
echo -e "${ORANGE}────────────────────────────────────────${RESET}"
