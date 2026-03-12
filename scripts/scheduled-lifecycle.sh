#!/bin/bash
# Tool Factory — Scheduled Lifecycle Wrapper
# Runs via launchd (daily 2 AM). Report mode by default, live on Sundays.
# Dispatches notifications via HYDRA's notify-eddie.sh on decay/regression.
#
# Usage:
#   ./scheduled-lifecycle.sh           # Auto-detect mode (report or live)
#   ./scheduled-lifecycle.sh --force   # Force live run regardless of day

set -euo pipefail

# --- Config ---
FACTORY_DIR="$HOME/Development/id8/tool-factory"
LIFECYCLE="$FACTORY_DIR/registry/lifecycle.sh"
INTELLIGENCE="$FACTORY_DIR/registry/intelligence.sh"
NOTIFY="$HOME/.hydra/daemons/notify-eddie.sh"
SCORE_HISTORY="$FACTORY_DIR/registry/score-history.jsonl"
REPORTS_DIR="$FACTORY_DIR/registry/lifecycle-reports"

# --- Colors (not used for output but available) ---
source "$FACTORY_DIR/lib/colors.sh"

DATE=$(date +%Y-%m-%d)
DAY_OF_WEEK=$(date +%u)  # 7 = Sunday

# --- Mode Selection ---
# Sunday = live (apply fixes). All other days = report (dry run).
MODE="--report"
if [ "${1:-}" = "--force" ] || [ "$DAY_OF_WEEK" = "7" ]; then
  MODE="full"
fi

echo "[scheduled-lifecycle] $DATE mode=$MODE"

# --- Run Lifecycle ---
OUTPUT=$(bash "$LIFECYCLE" $MODE 2>&1) || true

# Strip ANSI for parsing
CLEAN=$(echo "$OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

# --- Parse for Alerts ---
# Extract actual count from "N used tool(s) need attention" line
DECAY_COUNT=$(echo "$CLEAN" | grep "need attention" | grep -oE '[0-9]+' | head -1 || echo "0")
DECAY_COUNT="${DECAY_COUNT:-0}"
DORMANT_LINE=$(echo "$CLEAN" | grep "tools dormant" || echo "")

# --- Regression Detection ---
# Compare latest two dates in score-history.jsonl
REGRESSION_MSG=""
if [ -f "$SCORE_HISTORY" ] && [ -s "$SCORE_HISTORY" ]; then
  REGRESSION_MSG=$(python3 << 'PYEOF'
import json, os
from collections import defaultdict

history_path = os.path.expanduser("~/Development/id8/tool-factory/registry/score-history.jsonl")
by_date = defaultdict(dict)

with open(history_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            by_date[entry["date"]][entry["tool"]] = entry["score"]
        except (json.JSONDecodeError, KeyError, ValueError):
            pass

dates = sorted(by_date.keys())
if len(dates) < 2:
    exit(0)

prev = by_date[dates[-2]]
curr = by_date[dates[-1]]

critical = []
for tool, score in curr.items():
    if tool in prev:
        drop = prev[tool] - score
        if drop >= 20:
            critical.append(f"{tool}: {prev[tool]}->{score} (-{drop})")

if critical:
    print("; ".join(critical[:5]))
PYEOF
  ) || true
fi

# --- Dispatch Notifications ---
if [ -x "$NOTIFY" ]; then
  # Critical regression (>20pt drop)
  if [ -n "$REGRESSION_MSG" ]; then
    bash "$NOTIFY" urgent "Score Regression" "$REGRESSION_MSG"
    echo "[scheduled-lifecycle] URGENT notification sent: $REGRESSION_MSG"
  fi

  # Decay alerts (used tools with bad scores)
  if [ "$DECAY_COUNT" -gt 0 ]; then
    DECAY_TOOLS=$(echo "$CLEAN" | grep -A20 "need attention" | grep "^\s*\[" | head -5 | tr '\n' ', ' || echo "check report")
    bash "$NOTIFY" normal "Tool Factory" "${DECAY_COUNT} tool(s) decaying: ${DECAY_TOOLS}"
    echo "[scheduled-lifecycle] Decay notification sent"
  fi

  # Dormant alert (weekly only, on live runs)
  if [ "$MODE" = "full" ] && [ -n "$DORMANT_LINE" ]; then
    bash "$NOTIFY" silent "Tool Factory" "Weekly: $DORMANT_LINE"
  fi

  # Squire sync (weekly only, on live runs)
  if [ "$MODE" = "full" ]; then
    SQUIRE_SYNC="$FACTORY_DIR/scripts/squire-sync.sh"
    if [ -x "$SQUIRE_SYNC" ]; then
      echo "[scheduled-lifecycle] Running weekly Squire sync..."
      SYNC_OUTPUT=$(bash "$SQUIRE_SYNC" --counts 2>&1) || true
      # Parse counts: type\tnew\tstale\tupdated\tlocal\trepo
      TOTAL_NEW=$(echo "$SYNC_OUTPUT" | awk -F'\t' '{s+=$2} END {print s+0}')
      TOTAL_STALE=$(echo "$SYNC_OUTPUT" | awk -F'\t' '{s+=$3} END {print s+0}')
      TOTAL_UPDATED=$(echo "$SYNC_OUTPUT" | awk -F'\t' '{s+=$4} END {print s+0}')
      TOTAL_DRIFT=$((TOTAL_NEW + TOTAL_STALE + TOTAL_UPDATED))

      if [ "$TOTAL_DRIFT" -gt 0 ]; then
        bash "$NOTIFY" normal "Squire Sync" "+${TOTAL_NEW} new, -${TOTAL_STALE} stale, ~${TOTAL_UPDATED} updated tools drifted from repo"
        echo "[scheduled-lifecycle] Squire drift: +$TOTAL_NEW -$TOTAL_STALE ~$TOTAL_UPDATED"
        # Auto-sync
        bash "$SQUIRE_SYNC" --sync 2>&1 | tail -5
      else
        echo "[scheduled-lifecycle] Squire: in sync"
      fi
    fi
  fi
else
  echo "[scheduled-lifecycle] notify-eddie.sh not found, skipping notifications"
fi

# --- Summary ---
REPORT_FILE="$REPORTS_DIR/$DATE.md"
echo "[scheduled-lifecycle] Complete. Report: $REPORT_FILE"
echo "[scheduled-lifecycle] Mode: $MODE | Regressions: ${REGRESSION_MSG:-none} | Decay alerts: $DECAY_COUNT"
