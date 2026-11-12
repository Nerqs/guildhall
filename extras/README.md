# Guildhall status line (stamina and session bars)

The STAMINA bar on each hero card and the SESSION bar in the HUD read
`~/.guildhall/stamina/<terminal>.json`, written by this Claude Code status line.

Windows: copy `guildhall-statusline.ps1` to `~/.claude/` and add to `~/.claude/settings.json`
(use forward slashes: Claude Code runs the command through Git Bash, which drops backslashes):

```json
"statusLine": {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/<you>/.claude/guildhall-statusline.ps1",
  "refreshInterval": 30
}
```

It only writes inside Herdr (it needs `HC_TERMINAL_ID`). `rate_limits` (the SESSION bar)
exists only for Claude Pro/Max subscribers.

# Sounds (optional)

The layout ships two sounds from the Ninja Adventure pack (CC0). To use them, add this to
`~/.config/herdr-app/settings.json` (it applies to every layout):

```json
"sounds": { "enabled": true, "done": "mods/guildhall-hud/ui/sounds/done.wav", "blocked": "mods/guildhall-hud/ui/sounds/blocked.wav" }
```
