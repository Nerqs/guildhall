# Guildhall status line (stamina and session bars)

The STAMINA bar on each hero card and the SESSION bar in the HUD read
`~/.guildhall/stamina/<terminal>.json`, written by this Claude Code status line.

It only writes inside Herdr (it needs `HC_TERMINAL_ID`). `rate_limits` (the SESSION bar)
exists only for Claude Pro/Max subscribers.

## Linux and macOS

Needs `bash` and [`jq`](https://jqlang.org) (any version from 1.5):

| System | Install jq |
|---|---|
| Arch | `sudo pacman -S jq` |
| Debian / Ubuntu | `sudo apt install jq` |
| Fedora | `sudo dnf install jq` |
| openSUSE | `sudo zypper install jq` |
| Alpine | `sudo apk add jq bash` |
| macOS | `brew install jq` |

Copy `guildhall-statusline.sh` to `~/.claude/`, make it executable and add to
`~/.claude/settings.json`:

```sh
cp guildhall-statusline-wsl.sh ~/.claude/guildhall-statusline.sh && chmod +x ~/.claude/guildhall-statusline.sh
```

```json
"statusLine": {
  "type": "command",
  "command": "~/.claude/guildhall-statusline.sh",
  "refreshInterval": 30
}
```

Without `jq` the script prints nothing and writes nothing; the bars stay empty.

## Windows

Copy `guildhall-statusline.ps1` to `~/.claude/` and add to `~/.claude/settings.json`
(use forward slashes: Claude Code runs the command through Git Bash, which drops backslashes):

```json
"statusLine": {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/<you>/.claude/guildhall-statusline.ps1",
  "refreshInterval": 30
}
```

# Sounds (optional)

The layout ships two sounds from the Ninja Adventure pack (CC0). To use them, add this to
`~/.config/herdr-app/settings.json` (it applies to every layout):

```json
"sounds": { "enabled": true, "done": "mods/guildhall-hud/ui/sounds/done.wav", "blocked": "mods/guildhall-hud/ui/sounds/blocked.wav" }
```

# Agents in WSL (Linux status line)

For Claude Code running inside WSL, use `guildhall-statusline-wsl.sh` instead. It needs only bash, grep and sed, and writes to the **Windows** user's `~/.guildhall` (where Guildhall reads). Set it up inside WSL:

```sh
cp guildhall-statusline-wsl.sh ~/.claude/guildhall-statusline.sh && chmod +x ~/.claude/guildhall-statusline.sh
```

Then add to `~/.claude/settings.json` in WSL:

```json
"statusLine": { "type": "command", "command": "bash ~/.claude/guildhall-statusline.sh", "refreshInterval": 30 }
```

It writes to the Windows user's `~/.guildhall/stamina/` through `/mnt/c`. Guildhall's WSL terminals pass Herdr's `HC_TERMINAL_ID` into WSL with `WSLENV=HC_TERMINAL_ID/u`.
