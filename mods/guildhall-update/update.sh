#!/usr/bin/env bash
# Guildhall updater (Linux and macOS). Windows uses update.ps1 next to this file.
# Downloads the latest Guildhall from GitHub and copies its layout, themes and mods into
# Herdr's folder. Herdr reloads them by itself. The same script runs from the palette
# ("Update Guildhall…") and from a terminal:
#
#   bash ~/.config/herdr-app/mods/guildhall-update/update.sh           # show changes, ask, apply
#   bash ~/.config/herdr-app/mods/guildhall-update/update.sh --check   # only compare versions
#   bash ~/.config/herdr-app/mods/guildhall-update/update.sh -n        # only list what would change
#   bash ~/.config/herdr-app/mods/guildhall-update/update.sh -y        # apply without asking
#
# Options: --home DIR (Herdr's folder; default $HERDR_APP_HOME or ~/.config/herdr-app),
#          --source DIR (copy from a local clone instead of downloading),
#          --repo OWNER/NAME (default Nerqs/guildhall), --ref BRANCH|SHA (default the latest),
#          --detach (with -y: run in the background, writing to <home>/data/guildhall-update/last.log;
#          the palette's dialog uses it and reads that log), --log FILE (append the output there).
#
# Before changing anything it saves a backup in <home>/data/guildhall-update/backups (the last 10).
# keys.json only gains the repo's new keys; a key you already use is never replaced.
# Everything runs inside main(), so the script can safely replace its own file while running.
set -euo pipefail

main() {
  local REPO="Nerqs/guildhall" REF="" HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  local SOURCE="" MODE="ask" DETACH=0
  local -a PASS=()
  while (($#)); do
    [[ "$1" != --detach && "$1" != --log ]] && PASS+=("$1")
    case "$1" in
      --check) MODE="check" ;;
      -n|--dry-run) MODE="dry" ;;
      -y|--yes) MODE="yes" ;;
      --home) HOME_DIR="$2"; PASS+=("$2"); shift ;;
      --source) SOURCE="$2"; PASS+=("$2"); shift ;;
      --repo) REPO="$2"; PASS+=("$2"); shift ;;
      --ref) REF="$2"; PASS+=("$2"); shift ;;
      --detach) DETACH=1 ;;
      --log) LOG="$2"; shift ;;
      -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
      *) echo "unknown option: $1" >&2; return 2 ;;
    esac
    shift
  done

  local STATE="$HOME_DIR/data/guildhall-update"
  local STAMP="$STATE/installed"

  # In the background: start a copy of this script that writes to last.log, and return at once.
  if ((DETACH)); then
    mkdir -p "$STATE"
    local log="$STATE/last.log"
    echo "STARTED $(date +%s)" >"$log"
    nohup bash "${BASH_SOURCE[0]}" "${PASS[@]}" --yes --log "$log" >/dev/null 2>&1 </dev/null &
    echo "started $log"
    return 0
  fi
  [[ -n "$LOG" ]] && exec >>"$LOG" 2>&1 </dev/null

  TMP="$(mktemp -d)"

  local installed="none"
  [[ -f "$STAMP" ]] && installed="$(head -n1 "$STAMP")"

  # ---- 1. The latest version ----------------------------------------------------------
  local latest="" subject="" date=""
  if [[ -z "$SOURCE" ]]; then
    local api
    if api="$(fetch "https://api.github.com/repos/$REPO/commits/${REF:-HEAD}" 2>/dev/null)"; then
      # The first "sha" is the commit's; the first "message" and "date" are in its "commit".
      latest="$(grep -o '"sha": *"[0-9a-f]\{40\}"' <<<"$api" | head -n1 | grep -o '[0-9a-f]\{40\}' || true)"
      subject="$(grep -o '"message": *"\([^"\\]\|\\.\)*"' <<<"$api" | head -n1 \
        | sed -E 's/^"message": *"//; s/"$//; s/\\n.*//; s/\\"/"/g' || true)"
      date="$(grep -o '"date": *"[^"]*"' <<<"$api" | head -n1 | sed -E 's/.*"([^"]+)"$/\1/' || true)"
    fi
  else
    latest="$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo local)"
    subject="$(git -C "$SOURCE" log -1 --format=%s 2>/dev/null || echo "local folder $SOURCE")"
  fi

  if [[ "$MODE" == "check" ]]; then
    echo "installed=$installed"
    echo "latest=${latest:-unknown}"
    echo "subject=$subject"
    echo "date=$date"
    if [[ -z "$latest" ]]; then echo "status=offline"
    elif [[ "$latest" == "$installed" ]]; then echo "status=up-to-date"
    else echo "status=update-available"; fi
    return 0
  fi

  # ---- 2. Get the files ---------------------------------------------------------------
  local SRC
  if [[ -n "$SOURCE" ]]; then
    SRC="$SOURCE"
    say "Using local folder $SRC"
  else
    say "Downloading $REPO ${latest:0:7}"
    fetch "https://codeload.github.com/$REPO/tar.gz/${latest:-${REF:-HEAD}}" >"$TMP/repo.tar.gz"
    mkdir "$TMP/repo"
    tar -xzf "$TMP/repo.tar.gz" -C "$TMP/repo"
    SRC="$(find "$TMP/repo" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  fi
  [[ -n "$subject" ]] && say "Version: ${latest:0:7} $subject"
  for d in layouts themes mods; do
    [[ -d "$SRC/$d" ]] || { echo "error: '$d' missing in $SRC" >&2; return 1; }
  done

  # ---- 3. What changes ----------------------------------------------------------------
  # Files: layouts/guildhall*, themes/guildhall*.json, mods/guildhall-*/** (paths relative to home).
  ( cd "$SRC" && find layouts themes mods -type f \
      \( -path 'layouts/guildhall*' -o -path 'themes/guildhall*.json' -o -path 'mods/guildhall-*/*' \) \
      ! -name '*.tmp' ! -name Thumbs.db ! -name desktop.ini ! -path '*/.preview/*' | LC_ALL=C sort ) >"$TMP/files"

  : >"$TMP/plan"
  local f
  while IFS= read -r f; do
    if [[ ! -e "$HOME_DIR/$f" ]]; then echo "+ $f" >>"$TMP/plan"
    elif ! cmp -s "$SRC/$f" "$HOME_DIR/$f"; then echo "~ $f" >>"$TMP/plan"; fi
  done <"$TMP/files"
  # Files gone from a mod in the repo (Herdr's own generated files stay).
  local m
  for m in "$SRC"/mods/guildhall-*/; do
    m="mods/$(basename "$m")"
    [[ -d "$HOME_DIR/$m" ]] || continue
    ( cd "$HOME_DIR" && find "$m" -type f ! -name gpui-kit.d.ts ! -name jsconfig.json ! -name '*.tmp' \
        ! -path '*/.preview/*' ) | LC_ALL=C sort | while IFS= read -r f; do
      grep -qxF "$f" "$TMP/files" || echo "- $f"
    done >>"$TMP/plan"
  done

  local keys=""
  [[ -f "$SRC/keys.json" ]] && keys="$(merge_keys "$SRC/keys.json" "$HOME_DIR/keys.json" 0)"

  if [[ ! -s "$TMP/plan" && -z "$(grep '^+' <<<"$keys" || true)" ]]; then
    [[ -n "$keys" ]] && echo "$keys"
    [[ -n "$latest" ]] && { mkdir -p "$STATE"; printf '%s\n%s\n' "$latest" "$subject" >"$STAMP"; }
    say "Already up to date."
    return 0
  fi
  say "Changes in $HOME_DIR:"
  cat "$TMP/plan"
  [[ -n "$keys" ]] && { echo "keys.json:"; echo "$keys"; }

  [[ "$MODE" == "dry" ]] && { say "Dry run: nothing changed."; return 0; }
  if [[ "$MODE" == "ask" ]]; then
    local r; read -r -p "Apply? [y/N] " r
    [[ "$r" =~ ^[yYsS] ]] || { echo "Cancelled."; return 0; }
  fi

  # ---- 4. Backup ----------------------------------------------------------------------
  mkdir -p "$STATE/backups"
  local BK; BK="$STATE/backups/$(date +%Y%m%d-%H%M%S).tar.gz"
  ( cd "$HOME_DIR" && tar -czf "$BK" $(ls -d keys.json layouts/guildhall* themes/guildhall* mods/guildhall-* 2>/dev/null) ) || true
  ls -1t "$STATE"/backups/*.tar.gz 2>/dev/null | tail -n +11 | while IFS= read -r f; do rm -f "$f"; done
  say "Backup: $BK"

  # ---- 5. Apply -----------------------------------------------------------------------
  local op path
  while read -r op path; do
    case "$op" in
      '+'|'~') mkdir -p "$(dirname "$HOME_DIR/$path")"
           cp "$SRC/$path" "$HOME_DIR/$path.gh-new"
           mv -f "$HOME_DIR/$path.gh-new" "$HOME_DIR/$path" ;;   # a new file, never rewritten in place
      '-') rm -f "$HOME_DIR/$path" ;;
    esac
  done <"$TMP/plan"
  [[ -f "$SRC/keys.json" ]] && merge_keys "$SRC/keys.json" "$HOME_DIR/keys.json" 1 >/dev/null
  mkdir -p "$STATE"
  printf '%s\n%s\n' "${latest:-unknown}" "$subject" >"$STAMP"

  # ---- 6. Check the mods --------------------------------------------------------------
  local fail=0
  if command -v herdr-app >/dev/null 2>&1; then
    say "Checking mods"
    for m in "$SRC"/mods/guildhall-*/; do
      m="$(basename "$m")"
      local out
      if out="$(herdr-app check "$HOME_DIR/mods/$m" 2>&1)"; then echo "  ok    $m"
      else echo "  FAIL  $m"; sed 's/^/        /' <<<"$out"; fail=1; fi
    done
  fi
  if ((fail)); then
    say "Some mod failed its check. To go back: tar -xzf '$BK' -C '$HOME_DIR'"
    return 1
  fi
  say "Done. Herdr reloads the layout, themes and mods by itself."
}

TMP="" LOG=""
# Cleans up and, when writing a log, ends it with "RESULT <exit code>" (the dialog waits for it).
finish() {
  local rc=$?
  [[ -n "$TMP" ]] && rm -rf "$TMP"
  [[ -n "$LOG" ]] && echo "RESULT $rc" >>"$LOG"
  return $rc
}
trap finish EXIT

say() { printf '==> %s\n' "$*"; }

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL -H 'User-Agent: guildhall-update' "$1"
  elif command -v wget >/dev/null 2>&1; then wget -qO- --header='User-Agent: guildhall-update' "$1"
  else echo "error: curl or wget is needed" >&2; return 1; fi
}

# Adds the repo's keys that keys.json doesn't have yet; a key already in use is kept and reported.
# $3: 1 writes keys.json, 0 only prints. Needs python3 (else it only says so).
merge_keys() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "! python3 not found: merge $1 into $2 by hand"; return 0
  fi
  python3 -I - "$1" "$2" "$3" <<'PY'
import json, os, sys
src, dst, write = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
new = json.load(open(src, encoding="utf-8"))
cur = json.load(open(dst, encoding="utf-8")) if os.path.exists(dst) else {}
added = []
for section, keys in new.items():
    have = cur.setdefault(section, {})
    for k, v in keys.items():
        if k not in have:
            have[k] = v
            added.append(f"+ {section}: {k} -> {v}")
        elif have[k] != v:
            print(f"! {section}: {k} stays '{have[k]}' (repo has '{v}')")
for line in added:
    print(line)
if write and added:
    with open(dst + ".gh-new", "w", encoding="utf-8") as f:
        json.dump(cur, f, indent=2)
        f.write("\n")
    os.replace(dst + ".gh-new", dst)
PY
}

main "$@"
exit $?
