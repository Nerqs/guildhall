#!/bin/bash
# Guildhall status line for Claude Code running inside WSL (or any Linux).
# Prints a short status line and, inside Herdr (HC_TERMINAL_ID set, passed into WSL with
# WSLENV=HC_TERMINAL_ID/u), saves this session's stamina where the Guildhall mods read it:
#   $GUILDHALL_DIR/stamina/<terminal>.json  { context_left, session_used, resets_at, week_used, week_resets, at }
# GUILDHALL_DIR defaults to the Windows user's ~/.guildhall seen from WSL (/mnt/c/Users/<you>/.guildhall).
# Needs only bash, grep and sed (no jq).
json=$(cat)

# The first number after "key": in a piece of JSON.
num() { printf '%s' "$2" | grep -o "\"$1\":[ ]*[0-9.]*" | head -1 | sed 's/.*:[ ]*//'; }
# The {...} object after "key": (no nested objects inside the ones we read).
obj() { printf '%s' "$2" | grep -o "\"$1\":[ ]*{[^}]*}" | head -1; }

five=$(obj five_hour "$json")
week=$(obj seven_day "$json")
# remaining_percentage only exists in context_window: read it from the whole payload (the
# context_window object holds a nested current_usage object, which a flat match would cut).
context_left=$(num remaining_percentage "$json")
session_used=$(num used_percentage "$five")
resets_at=$(num resets_at "$five")
week_used=$(num used_percentage "$week")
week_resets=$(num resets_at "$week")
model=$(printf '%s' "$json" | grep -o '"display_name":[ ]*"[^"]*"' | head -1 | sed 's/.*:[ ]*"//; s/"$//')

if [ -n "$HC_TERMINAL_ID" ]; then
  if [ -z "$GUILDHALL_DIR" ]; then
    win_home=$(wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')" 2>/dev/null)
    GUILDHALL_DIR="${win_home:-$HOME}/.guildhall"
  fi
  dir="$GUILDHALL_DIR/stamina"
  mkdir -p "$dir"
  v() { [ -n "$1" ] && printf '%s' "$1" || printf 'null'; }
  printf '{"context_left":%s,"session_used":%s,"resets_at":%s,"week_used":%s,"week_resets":%s,"at":%s}' \
    "$(v "$context_left")" "$(v "$session_used")" "$(v "$resets_at")" "$(v "$week_used")" "$(v "$week_resets")" \
    "$(date +%s%3N)" > "$dir/$HC_TERMINAL_ID.json.tmp" && mv -f "$dir/$HC_TERMINAL_ID.json.tmp" "$dir/$HC_TERMINAL_ID.json"
fi

out="${model:-Claude}"
[ -n "$context_left" ] && out="$out | ctx ${context_left%.*}% left"
[ -n "$session_used" ] && out="$out | 5h ${session_used%.*}% used"
printf '%s\n' "$out"
