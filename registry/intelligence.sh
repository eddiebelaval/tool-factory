#!/bin/bash
# Tool Factory — Usage Intelligence
# Surfaces actionable insights from usage data, Range scores, and registry state.
# The brain that turns raw data into maintenance decisions.
#
# Usage:
#   ./intelligence.sh                # Full intelligence report
#   ./intelligence.sh --top          # Top used tools
#   ./intelligence.sh --dormant      # Tools with zero usage
#   ./intelligence.sh --decay        # High-value tools losing quality
#   ./intelligence.sh --ghost        # High-score tools nobody uses
#   ./intelligence.sh --health       # Fleet health summary
#   ./intelligence.sh --trends       # Score trends + regression detection

set -euo pipefail

# --- Config ---
FACTORY_DIR="$HOME/Development/id8/tool-factory"
REGISTRY="$FACTORY_DIR/registry/index.json"
USAGE_DIR="$FACTORY_DIR/registry/usage"
RANGE_RUNNER="$FACTORY_DIR/range/runner.sh"
SKILLS_DIR="$HOME/.claude/skills"
API_URL="https://id8labs.app/api/claude-stats"

# --- Colors ---
source "$FACTORY_DIR/lib/colors.sh"

ACTION="${1:-full}"

# --- Gather Data ---
# Collect usage from both API and local JSONL
gather_usage() {
  python3 << 'PYEOF'
import json, os, glob, sys
from collections import defaultdict

factory_dir = os.path.expanduser("~/Development/id8/tool-factory")
usage_dir = os.path.join(factory_dir, "registry", "usage")
skills_dir = os.path.expanduser("~/.claude/skills")

# Source 1: Local JSONL files
local_usage = defaultdict(int)
if os.path.isdir(usage_dir):
    for f in sorted(glob.glob(os.path.join(usage_dir, "*.jsonl"))):
        with open(f) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    tool = entry.get("tool", "")
                    if tool:
                        local_usage[tool] += 1
                except json.JSONDecodeError:
                    pass

# Source 2: API data (cached or live)
api_usage = {}
api_cache = os.path.join(factory_dir, "registry", ".api-cache.json")
try:
    import urllib.request
    req = urllib.request.Request("https://id8labs.app/api/claude-stats")
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read())["stats"]
        api_usage = data.get("skills_used", {})
        # Cache it
        with open(api_cache, "w") as cf:
            json.dump({"skills_used": api_usage, "agents_used": data.get("agents_used", {}), "mcp_used": data.get("mcp_used", {})}, cf)
except Exception:
    # Fall back to cache
    if os.path.exists(api_cache):
        with open(api_cache) as cf:
            cached = json.load(cf)
            api_usage = cached.get("skills_used", {})

# Merge: local takes priority for recent, API for historical
merged = defaultdict(int)
for k, v in api_usage.items():
    merged[k] += v
for k, v in local_usage.items():
    merged[k] += v

# Get all skills
all_skills = []
if os.path.isdir(skills_dir):
    for d in sorted(os.listdir(skills_dir)):
        skill_file = os.path.join(skills_dir, d, "SKILL.md")
        if os.path.isfile(skill_file):
            all_skills.append(d)

# Get Range scores (run range in report mode and parse)
scores = {}
try:
    import subprocess
    runner = os.path.join(factory_dir, "range", "runner.sh")
    result = subprocess.run(["bash", runner, "--report"], capture_output=True, text=True, timeout=120)
    import re
    # Parse lines like "  skill-name                  85/100   85% PASS"
    for line in result.stdout.split("\n"):
        # Strip ANSI codes
        clean = re.sub(r'\033\[[0-9;]*m', '', line).strip()
        match = re.match(r'^(\S+)\s+(\d+)/100\s+\d+%\s+(PASS|PARTIAL|FAIL)', clean)
        if match:
            scores[match.group(1)] = {"score": int(match.group(2)), "verdict": match.group(3)}
except Exception as e:
    print(f"Warning: Could not run Range: {e}", file=sys.stderr)

# Build intelligence
output = {
    "total_skills": len(all_skills),
    "tracked_skills": sum(1 for s in all_skills if s in merged),
    "untracked_skills": sum(1 for s in all_skills if s not in merged),
    "total_invocations": sum(merged.values()),
    "usage": dict(sorted(merged.items(), key=lambda x: -x[1])),
    "scores": scores,
    "dormant": sorted([s for s in all_skills if s not in merged]),
    "top_used": sorted(merged.items(), key=lambda x: -x[1])[:20],
    "ghost_tools": [],  # High score, zero usage
    "decay_risk": [],   # High usage, low score
}

# Ghost tools: score >= 85 but zero usage
for s in all_skills:
    if s not in merged and s in scores and scores[s]["score"] >= 85:
        output["ghost_tools"].append({"name": s, "score": scores[s]["score"]})

# Decay risk: has usage but score < 60
for tool, count in merged.items():
    if tool in scores and scores[tool]["score"] < 60:
        output["decay_risk"].append({"name": tool, "uses": count, "score": scores[tool]["score"]})

# Sort
output["ghost_tools"] = sorted(output["ghost_tools"], key=lambda x: -x["score"])
output["decay_risk"] = sorted(output["decay_risk"], key=lambda x: -x["uses"])

print(json.dumps(output))
PYEOF
}

# --- Display Functions ---
show_header() {
  echo -e "${ORANGE}Intelligence${RESET} ${WHITE}— Tool Factory Usage Report${RESET}"
  echo -e "${GRAY}$(date +%Y-%m-%d)${RESET}"
  echo ""
}

show_health() {
  local data="$1"
  echo -e "${WHITE}Fleet Health${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

  # Extract all health metrics in a single Python call (tab-delimited)
  local metrics
  metrics=$(echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['scores']
print('\t'.join(str(v) for v in [
    d['total_skills'], d['tracked_skills'], d['untracked_skills'],
    d['total_invocations'],
    sum(1 for x in s.values() if x['verdict']=='PASS'),
    sum(1 for x in s.values() if x['verdict']=='PARTIAL'),
    sum(1 for x in s.values() if x['verdict']=='FAIL'),
    len(d['ghost_tools']), len(d['decay_risk']),
]))
")
  local total=$(echo "$metrics" | cut -f1)
  local tracked=$(echo "$metrics" | cut -f2)
  local untracked=$(echo "$metrics" | cut -f3)
  local invocations=$(echo "$metrics" | cut -f4)
  local pass_count=$(echo "$metrics" | cut -f5)
  local partial_count=$(echo "$metrics" | cut -f6)
  local fail_count=$(echo "$metrics" | cut -f7)
  local ghost_count=$(echo "$metrics" | cut -f8)
  local decay_count=$(echo "$metrics" | cut -f9)

  echo -e "  ${WHITE}Skills:${RESET}       $total total"
  echo -e "  ${WHITE}Tracked:${RESET}      $tracked with usage data ($untracked dark)"
  echo -e "  ${WHITE}Invocations:${RESET}  $invocations total"
  echo ""
  echo -e "  ${WHITE}Range:${RESET}        ${GREEN}$pass_count PASS${RESET}  ${AMBER}$partial_count PARTIAL${RESET}  ${RED}$fail_count FAIL${RESET}"
  echo -e "  ${WHITE}Ghosts:${RESET}       ${GRAY}$ghost_count${RESET} (high score, zero usage)"
  echo -e "  ${WHITE}Decay Risk:${RESET}   ${RED}$decay_count${RESET} (has usage, failing score)"
  echo ""
}

show_top() {
  local data="$1"
  echo -e "${WHITE}Top Used Tools${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for name, count in d['top_used'][:15]:
    score_info = d['scores'].get(name, {})
    score = score_info.get('score', '?')
    verdict = score_info.get('verdict', '?')

    # Color verdict
    if verdict == 'PASS':
        v_color = '\033[38;2;34;197;94m'
    elif verdict == 'PARTIAL':
        v_color = '\033[38;2;245;158;11m'
    elif verdict == 'FAIL':
        v_color = '\033[38;2;239;68;68m'
    else:
        v_color = '\033[38;2;119;119;119m'

    bar = '#' * min(count, 40)
    print(f'  \033[38;2;78;205;196m{name:<30}\033[0m {count:>4}x  {v_color}{score}/100 {verdict}\033[0m  {bar}')
"
  echo ""
}

show_dormant() {
  local data="$1"

  echo -e "${WHITE}Dormant Tools${RESET} ${GRAY}(zero recorded usage)${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

  # Show count + examples in a single Python call
  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  \033[38;2;119;119;119m{len(d[\"dormant\"])} skills with no usage data\033[0m')
print()
dormant = d['dormant'][:30]
for name in dormant:
    score_info = d['scores'].get(name, {})
    score = score_info.get('score', '?')
    verdict = score_info.get('verdict', '?')
    if verdict == 'PASS':
        v_color = '\033[38;2;34;197;94m'
    elif verdict == 'FAIL':
        v_color = '\033[38;2;239;68;68m'
    else:
        v_color = '\033[38;2;119;119;119m'
    print(f'  \033[38;2;119;119;119m{name:<30}\033[0m {v_color}{score}/100 {verdict}\033[0m')

if len(d['dormant']) > 30:
    print(f'  \033[38;2;119;119;119m... and {len(d[\"dormant\"]) - 30} more\033[0m')
"
  echo ""
}

show_decay() {
  local data="$1"
  echo -e "${RED}Decay Risk${RESET} ${GRAY}(used tools with failing scores)${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
risks = d['decay_risk']
if not risks:
    print('  \033[38;2;34;197;94mNone — all used tools are passing\033[0m')
else:
    for r in risks:
        print(f'  \033[38;2;239;68;68m{r[\"name\"]:<30}\033[0m {r[\"uses\"]:>4}x used  {r[\"score\"]}/100 FAIL')
        print(f'    \033[38;2;245;158;11mAction: workshop/retrofit.sh {r[\"name\"]}\033[0m')
"
  echo ""
}

show_ghosts() {
  local data="$1"
  echo -e "${GRAY}Ghost Tools${RESET} ${GRAY}(high score, zero usage — candidates for retirement review)${RESET}"
  echo -e "${ORANGE}────────────────────────────────────────${RESET}"

  echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ghosts = d['ghost_tools'][:20]
if not ghosts:
    print('  \033[38;2;34;197;94mNone\033[0m')
else:
    for g in ghosts:
        print(f'  \033[38;2;119;119;119m{g[\"name\"]:<30}\033[0m {g[\"score\"]}/100 PASS  (never used)')
    if len(d['ghost_tools']) > 20:
        print(f'  \033[38;2;119;119;119m... and {len(d[\"ghost_tools\"]) - 20} more\033[0m')
    print()
    print(f'  \033[38;2;119;119;119m{len(d[\"ghost_tools\"])} total ghost tools. Consider: are these aspirational or dead weight?\033[0m')
"
  echo ""
}

# --- Trends ---
show_trends() {
  echo -e "${ORANGE}Score Trends${RESET}"
  echo -e "${GRAY}Comparing latest scores against previous run${RESET}"
  echo ""

  SCORE_HISTORY="$FACTORY_DIR/registry/score-history.jsonl"

  if [ ! -f "$SCORE_HISTORY" ] || [ ! -s "$SCORE_HISTORY" ]; then
    echo -e "  ${AMBER}No score history yet. Run lifecycle.sh --score to build baseline.${RESET}"
    echo ""
    return
  fi

  python3 << 'PYEOF'
import json, os
from collections import defaultdict

history_path = os.path.expanduser("~/Development/id8/tool-factory/registry/score-history.jsonl")

# Load all entries grouped by date
by_date = defaultdict(dict)
with open(history_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            by_date[entry["date"]][entry["tool"]] = {
                "score": entry["score"],
                "verdict": entry["verdict"]
            }
        except (json.JSONDecodeError, KeyError):
            pass

dates = sorted(by_date.keys())

if len(dates) < 2:
    print(f"  \033[38;2;245;158;11mOnly {len(dates)} snapshot(s). Need 2+ lifecycle runs for trend comparison.\033[0m")
    if dates:
        latest = by_date[dates[-1]]
        scores = [v["score"] for v in latest.values()]
        avg = sum(scores) / len(scores) if scores else 0
        print(f"  \033[38;2;119;119;119mLatest ({dates[-1]}): {len(latest)} tools, avg {avg:.0f}/100\033[0m")
    print()
else:
    prev_date = dates[-2]
    curr_date = dates[-1]
    prev = by_date[prev_date]
    curr = by_date[curr_date]

    regressions = []
    improvements = []

    for tool, data in curr.items():
        if tool in prev:
            delta = data["score"] - prev[tool]["score"]
            if delta <= -15:
                regressions.append((tool, prev[tool]["score"], data["score"], delta))
            elif delta >= 10:
                improvements.append((tool, prev[tool]["score"], data["score"], delta))

    # Fleet averages
    prev_scores = [v["score"] for v in prev.values()]
    curr_scores = [v["score"] for v in curr.values()]
    prev_avg = sum(prev_scores) / len(prev_scores) if prev_scores else 0
    curr_avg = sum(curr_scores) / len(curr_scores) if curr_scores else 0
    avg_delta = curr_avg - prev_avg

    if avg_delta > 1:
        trend_icon = "\033[38;2;34;197;94mIMPROVING\033[0m"
    elif avg_delta < -1:
        trend_icon = "\033[38;2;239;68;68mDECLINING\033[0m"
    else:
        trend_icon = "\033[38;2;245;158;11mSTABLE\033[0m"

    print(f"  Comparing: {prev_date} -> {curr_date}")
    print(f"  Fleet avg: {prev_avg:.1f} -> {curr_avg:.1f} ({avg_delta:+.1f}) {trend_icon}")
    print()

    # Regressions (sorted by severity)
    if regressions:
        regressions.sort(key=lambda x: x[3])
        print(f"  \033[38;2;239;68;68mRegressions (>{15}pt drop):\033[0m")
        for tool, old, new, delta in regressions[:15]:
            print(f"    \033[38;2;239;68;68m{tool:<30}\033[0m {old} -> {new}  ({delta:+d})")
        if len(regressions) > 15:
            print(f"    \033[38;2;119;119;119m... and {len(regressions) - 15} more\033[0m")
        print()
    else:
        print(f"  \033[38;2;34;197;94mNo regressions (no tools dropped >15pts)\033[0m")
        print()

    # Improvements
    if improvements:
        improvements.sort(key=lambda x: -x[3])
        print(f"  \033[38;2;34;197;94mImprovements (>10pt gain):\033[0m")
        for tool, old, new, delta in improvements[:15]:
            print(f"    \033[38;2;34;197;94m{tool:<30}\033[0m {old} -> {new}  ({delta:+d})")
        if len(improvements) > 15:
            print(f"    \033[38;2;119;119;119m... and {len(improvements) - 15} more\033[0m")
        print()
    else:
        print(f"  \033[38;2;119;119;119mNo significant improvements this cycle\033[0m")
        print()

    # Verdict distribution comparison
    prev_verdicts = defaultdict(int)
    curr_verdicts = defaultdict(int)
    for v in prev.values():
        prev_verdicts[v["verdict"]] += 1
    for v in curr.values():
        curr_verdicts[v["verdict"]] += 1

    print(f"  Distribution:")
    for verdict in ["PASS", "PARTIAL", "FAIL"]:
        p = prev_verdicts.get(verdict, 0)
        c = curr_verdicts.get(verdict, 0)
        d = c - p
        sign = f"({d:+d})" if d != 0 else "(=)"
        print(f"    {verdict:<10} {p} -> {c}  {sign}")
    print()

    # History depth
    print(f"  \033[38;2;119;119;119mHistory: {len(dates)} snapshots ({dates[0]} to {dates[-1]})\033[0m")
PYEOF

  echo ""
}

# --- Main ---
show_header

# Gather all data once
echo -e "${GRAY}Gathering intelligence (Range scoring + usage data)...${RESET}"
echo ""
DATA=$(gather_usage)

case "$ACTION" in
  --top)
    show_top "$DATA"
    ;;
  --dormant)
    show_dormant "$DATA"
    ;;
  --decay)
    show_decay "$DATA"
    ;;
  --ghost)
    show_ghosts "$DATA"
    ;;
  --health)
    show_health "$DATA"
    ;;
  --trends)
    show_trends
    ;;
  full|*)
    show_health "$DATA"
    show_top "$DATA"
    show_decay "$DATA"
    show_ghosts "$DATA"
    show_dormant "$DATA"
    show_trends
    ;;
esac
