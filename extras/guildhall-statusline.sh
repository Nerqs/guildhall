#!/usr/bin/env bash
# Guildhall status line (Linux/macOS): prints a short status line for Claude Code and, inside
# Herdr (HC_TERMINAL_ID set), saves this session's stamina for the Guildhall layout:
#   ~/.guildhall/stamina/<terminal>.json  { context_left, session_used, resets_at, week_used, week_resets, at }
# Needs jq.
raw=$(cat)
printf '%s' "$raw" | jq -e . >/dev/null 2>&1 || exit 0

if [ -n "$HC_TERMINAL_ID" ]; then
  dir="$HOME/.guildhall/stamina"
  mkdir -p "$dir"
  at=$(date +%s%3N 2>/dev/null)
  case "$at" in *N) at=$(( $(date +%s) * 1000 )) ;; esac   # date without %N (macOS)
  file="$dir/${HC_TERMINAL_ID//\//_}.json"
  tmp="$file.tmp.$$"
  printf '%s' "$raw" | jq -c --argjson at "$at" '{
      context_left: .context_window.remaining_percentage,
      session_used: .rate_limits.five_hour.used_percentage,
      resets_at:    .rate_limits.five_hour.resets_at,
      week_used:    .rate_limits.seven_day.used_percentage,
      week_resets:  .rate_limits.seven_day.resets_at,
      at: $at
    }' > "$tmp" && mv -f "$tmp" "$file"
fi

printf '%s' "$raw" | jq -r '[
    .model.display_name // empty,
    (.context_window.remaining_percentage | select(. != null) | "ctx \(. + 0.5 | floor)% left"),
    (.rate_limits.five_hour.used_percentage | select(. != null) | "5h \(. + 0.5 | floor)% used")
  ] | join(" | ")'
