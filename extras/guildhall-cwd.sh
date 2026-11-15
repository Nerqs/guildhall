# Guildhall: tells the Files and Changes panels which folder this WSL bash is in.
# Herdr sees only wsl.exe, which never moves. Each prompt (when the folder changed) writes the
# Windows user's ~/.guildhall/cwd/<HC_TERMINAL_ID> (HC_TERMINAL_ID reaches WSL through
# WSLENV, as Guildhall's WSL tabs set it):
#   line 1: this distro ($WSL_DISTRO_NAME), line 2: the folder.
# Install: copy it into WSL and source it from ~/.bashrc, e.g.
#   [ -f ~/.config/guildhall/cwd.sh ] && . ~/.config/guildhall/cwd.sh
# GUILDHALL_DIR overrides where it writes (default: /mnt/c/Users/<you>/.guildhall).
if [ -n "$HC_TERMINAL_ID" ] && [ -z "$__guildhall_cwd_file" ]; then
  __guildhall_dir=${GUILDHALL_DIR:-}
  if [ -z "$__guildhall_dir" ]; then
    if [ -n "$USERPROFILE" ] && [ -d "$USERPROFILE" ]; then
      __guildhall_dir="$USERPROFILE/.guildhall"
    else
      __guildhall_dir="$(wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')" 2>/dev/null)/.guildhall"
    fi
  fi
  mkdir -p "$__guildhall_dir/cwd" 2>/dev/null
  __guildhall_cwd_file="$__guildhall_dir/cwd/$HC_TERMINAL_ID"
  __guildhall_cwd() {
    [ "$PWD" = "$__guildhall_cwd_last" ] && return
    __guildhall_cwd_last=$PWD
    printf '%s\n%s\n' "$WSL_DISTRO_NAME" "$PWD" > "$__guildhall_cwd_file" 2>/dev/null
  }
  PROMPT_COMMAND="__guildhall_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
