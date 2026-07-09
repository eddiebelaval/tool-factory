#!/usr/bin/env bash
# Uninstall Shipped. cron jobs from launchd.
set -euo pipefail

LAUNCHD_DIR="$HOME/Library/LaunchAgents"
JOBS=("com.id8labs.shipped-friday" "com.id8labs.shipped-notify")

for job in "${JOBS[@]}"; do
  dst="$LAUNCHD_DIR/$job.plist"
  if [[ -f "$dst" ]]; then
    launchctl bootout "gui/$(id -u)" "$dst" 2>/dev/null || true
    rm "$dst"
    echo "  ✓ Removed $job"
  else
    echo "  · $job not installed"
  fi
done
