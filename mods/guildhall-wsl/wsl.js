// How Guildhall starts a terminal in WSL (the default distro), in a folder, optionally running a
// command (an agent). WSLENV passes Herdr's HC_TERMINAL_ID into WSL, so the Linux status line
// (extras/guildhall-statusline.sh) can save the agent's stamina for the PARTY cards.
// The command runs in an interactive login bash (so ~/.bashrc puts ~/.local/bin on PATH), and a
// shell stays open after it ends, as Herdr does for agents it starts.
// Copied into guildhall-hud, guildhall-quests and guildhall-palette: keep the copies the same.
export function wslArgv(dir, command) {
  const cd = `--cd "${dir || "~"}"`;
  const run = command ? ` -e bash -lic "${command}; exec bash -li"` : "";
  return ["cmd.exe", "/c", `set WSLENV=HC_TERMINAL_ID/u&& wsl.exe ${cd}${run}`];
}

// A Windows path as WSL sees it: C:\Users\me\x -> /mnt/c/Users/me/x.
export function toWslPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p ?? "");
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : p;
}

// Claude Code in WSL with a quest as its first message. The quest is in a file (questFile, a
// Windows path) that guildhall-wsl/hero.sh reads: a task passed on the command line would be
// appended by Herdr and break the quoting. appHome: herdr's appHome().
export function wslHeroArgv(dir, questFile, appHome) {
  const hero = toWslPath(`${appHome}/mods/guildhall-wsl/hero.sh`);
  const file = questFile ? ` "${toWslPath(questFile)}"` : "";
  return ["cmd.exe", "/c", `set WSLENV=HC_TERMINAL_ID/u&& wsl.exe --cd "${dir || "~"}" -e bash -li "${hero}"${file}`];
}

// The WSL folder of a space opened as a WSL project, or null for a Windows space.
export function wslDir(shared, spaceId) {
  return (shared("guildhall.wsl") ?? {})[spaceId] ?? null;
}
