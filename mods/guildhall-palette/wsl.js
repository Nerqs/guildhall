// How Guildhall starts a terminal in WSL (the default distro), in a folder, optionally running a
// command (an agent). WSLENV passes Herdr's HC_TERMINAL_ID into WSL, so the Linux status line
// (extras/guildhall-statusline.sh) can save the agent's stamina for the PARTY cards.
// The command runs in an interactive login bash (so ~/.bashrc puts ~/.local/bin on PATH), and a
// shell stays open after it ends, as Herdr does for agents it starts.
// Copied into guildhall-hud, guildhall-quests, guildhall-palette, guildhall-wsl and guildhall-new-menu:
// keep the copies the same.
import * as fs from "fs/promises";

export function wslArgv(dir, command) {
  const cd = `--cd "${dir || "~"}"`;
  const run = command ? ` -e bash -lic "${command}; exec bash -li"` : "";
  return ["cmd.exe", "/c", `set WSLENV=HC_TERMINAL_ID/u:USERPROFILE/pu&& wsl.exe ${cd}${run}`];
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
  return ["cmd.exe", "/c", `set WSLENV=HC_TERMINAL_ID/u:USERPROFILE/pu&& wsl.exe --cd "${dir || "~"}" -e bash -li "${hero}"${file}`];
}

// The WSL folder of a space opened as a WSL project, or null for a Windows space.
export function wslDir(shared, spaceId) {
  return (shared("guildhall.wsl") ?? {})[spaceId] ?? null;
}

// Where the focused terminal is now, from its prompt hook's beacon (~/.guildhall/cwd/<terminal>,
// see extras/guildhall-cwd.*): { wsl: distro or null, dir }, or null when it hasn't reported.
// h: herdr's { focused, panes, home }.
export async function here(h) {
  const f = h.focused();
  const pane = f?.pane ? h.panes().find((p) => p.pane === f.pane) : null;
  const address = pane?.terminal ?? f?.terminal;
  if (!address || address.includes("/")) return null;
  try {
    const [wsl, dir] = (await fs.readFile(`${h.home()}/.guildhall/cwd/${address}`, "utf8")).replace(/\r/g, "").split("\n");
    return dir ? { wsl: wsl || null, dir } : null;
  } catch { return null; }
}

// A new tab where the person is working: a WSL shell when the focused terminal is in WSL (in its
// folder), or in a WSL space whose terminal hasn't reported; else a Windows shell in the focused
// terminal's folder. wsl: always WSL (a Windows folder becomes its /mnt/c path).
// h: herdr's { focused, panes, home, shared, run }.
export async function newTabHere(h, wsl = false) {
  const at = await here(h);
  const spaceDir = wslDir(h.shared, h.focused()?.space);
  if (at?.wsl || wsl || (spaceDir && !at)) {
    const dir = at?.wsl ? at.dir : spaceDir ?? (at ? toWslPath(at.dir) : null);
    h.run("tab.new", { name: "WSL", argv: wslArgv(dir, null) });
  } else h.run("tab.new", at?.dir ? { folder: at.dir } : {});
}
