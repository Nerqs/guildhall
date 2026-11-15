// Where the focused terminal really is, and how to act there: Windows or WSL.
// Copied into guildhall-files and guildhall-changes: keep the copies the same.
//
// Herdr only knows the folder a terminal started in (PowerShell's `cd` and a shell inside
// wsl.exe don't change the process folder). A prompt hook in each shell (extras/guildhall-cwd.ps1
// for PowerShell, extras/guildhall-cwd.sh for WSL bash) writes the folder it is in now to
//   ~/.guildhall/cwd/<HC_TERMINAL_ID>   two lines: the WSL distro ("" on Windows), the folder.
// Without a beacon yet (an agent that hasn't returned to the prompt), a WSL space falls back to
// its project folder (shared "guildhall.wsl"), anything else to what Herdr reports.

import * as fs from "fs/promises";
import { spaces, panes, focused, exec, readTextFile, home, shared, terminals, appHome, run } from "herdr";

const beaconDir = () => `${home()}/.guildhall/cwd`;

// The beacons, per terminal address: { wsl, cwd }. start() keeps them current while the copy lives.
export class Beacons {
  constructor() { this.map = new Map(); this.distro = null; }

  start(cx, changed) {
    cx.spawn(async (cx) => {
      await this.readAll(true);
      changed(cx);
      // The default distro, for WSL spaces whose shell hasn't reported yet.
      try {
        const r = await exec("wsl.exe", ["--exec", "sh", "-c", "printf %s \"$WSL_DISTRO_NAME\""], { timeout: 15000 });
        if (r.code === 0 && r.stdout.trim()) this.distro = r.stdout.trim();
      } catch {}
      changed(cx);
    });
    // A light poll (a folder of a few tiny files): the folder watch doesn't report every rewrite.
    cx.timer.every(2000, (cx) => {
      if (this.reading) return;
      this.reading = true;
      cx.spawn(async (cx) => {
        try { if (await this.readAll(false)) changed(cx); }
        finally { this.reading = false; }
      });
    });
  }

  // Reads every beacon of a live terminal; at start, deletes the ones whose terminal is gone.
  async readAll(prune) {
    const live = new Set(terminals().map((t) => t.address));
    let names = [];
    try {
      if (!(await fs.exists(beaconDir()))) return false;
      names = await fs.readdir(beaconDir());
    } catch { return false; }
    // Mods may only write under Herdr's folder: PowerShell removes the beacons of ended terminals.
    if (prune) {
      const dead = names.filter((n) => !live.has(n));
      if (dead.length) exec("powershell", ["-NoProfile", "-Command",
        dead.map((n) => `Remove-Item -LiteralPath '${`${beaconDir()}/${n}`.replace(/'/g, "''")}' -ErrorAction SilentlyContinue`).join("; ")]).catch(() => {});
    }
    let changed = false;
    const next = new Map();
    for (const n of names.filter((n) => live.has(n))) {
      const text = await fs.readFile(`${beaconDir()}/${n}`, "utf8").catch(() => null);
      if (!text) continue;
      const [wsl, cwd] = text.replace(/\r/g, "").split("\n");
      if (!cwd) continue;
      next.set(n, { wsl: wsl || null, cwd });
    }
    if (next.size !== this.map.size) changed = true;
    else for (const [k, v] of next) { const o = this.map.get(k); if (!o || o.cwd !== v.cwd || o.wsl !== v.wsl) changed = true; }
    this.map = next;
    return changed;
  }
}

// { cwd, on, wsl }: wsl is the distro name when the folder is a WSL (Linux) path.
export function location(beacons) {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const address = pane?.terminal ?? f?.terminal ?? null;
  if (!on) {
    const b = address ? beacons.map.get(address) : null;
    if (b) return { cwd: b.cwd, on: null, wsl: b.wsl };
    const dir = (shared("guildhall.wsl") ?? {})[space?.id];
    if (dir && beacons.distro) return { cwd: dir, on: null, wsl: beacons.distro };
  }
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, wsl: null };
}

// exec, in WSL when the place is: the program runs in that distro, in `cwd` (a Linux path).
export function execAt(place, cmd, args, opts = {}) {
  if (!place.wsl) return exec(cmd, args, { cwd: opts.cwd, on: place.on, timeout: opts.timeout });
  const cd = opts.cwd ? ["--cd", opts.cwd] : [];
  return exec("wsl.exe", ["-d", place.wsl, ...cd, "--exec", cmd, ...args], { timeout: opts.timeout });
}

// readTextFile, in WSL when the place is (at most 2 MB, as text).
export async function readAt(place, path) {
  if (!place.wsl) return readTextFile(path, { on: place.on });
  const r = await execAt(place, "sh", ["-c", "test -f \"$1\" || exit 3; head -c 2000000 -- \"$1\"", "read", path]);
  if (r.code === 3) return null;
  if (r.code !== 0) throw new Error(r.stderr || "Cannot read this file");
  return r.stdout;
}

// How Windows reaches a WSL file: \\wsl.localhost\<distro>\home\me\x.
export const uncPath = (distro, path) => `\\\\wsl.localhost\\${distro}${path.replace(/\//g, "\\")}`;

// Files that open in their own program (a viewer, a spreadsheet), not a text editor.
const MEDIA = new Set(("png jpg jpeg gif webp bmp ico tif tiff avif heic svg psd pdf epub " +
  "csv tsv xls xlsx xlsm ods doc docx odt ppt pptx odp rtf " +
  "mp3 wav ogg flac m4a aac opus mp4 mkv webm mov avi wmv " +
  "zip 7z rar tar gz tgz bz2 xz iso ttf otf woff woff2 sqlite db blend fbx glb gltf").split(" "));
// Never handed to Windows to "open": they would run. Shown in Explorer instead.
const RUNS = new Set("exe msi com scr bat cmd ps1 vbs vbe js jse wsf wsh hta lnk reg jar msc cpl pif appref-ms".split(" "));
export const extOf = (path) => (/\.([^./\\]+)$/.exec(path)?.[1] ?? "").toLowerCase();
export const isMedia = (path) => MEDIA.has(extOf(path));

// Opens a file outside Herdr.
//   "edit": Windows: the default text editor (whatever opens .txt); WSL: nvim in a split beside
//           the terminal (else $EDITOR, vim, nano, vi; with none, the split says so).
//   "open": the file's default program on Windows (WSL files too, through \\wsl.localhost);
//           programs and scripts are shown in Explorer instead of run.
//   "auto": "open" for media, documents and archives, "edit" for everything else.
// Returns a promise that rejects with a message when Windows couldn't open it.
export async function openFile(place, path, how = "auto") {
  const mode = how === "auto" ? (isMedia(path) ? "open" : "edit") : how;
  if (place.on) throw new Error("Opening files on another machine isn't supported");
  if (place.wsl && mode === "edit") {
    const dir = path.replace(/\/[^/]*$/, "") || "/";
    run("pane.split", { direction: "right", argv: ["wsl.exe", "-d", place.wsl, "--cd", dir, "--exec", "bash", "-lc",
      'for e in nvim "$EDITOR" vim nano vi; do [ -n "$e" ] && command -v "$e" >/dev/null && exec "$e" -- "$1"; done; ' +
      'echo "No terminal editor in this WSL (install neovim: sudo pacman -S neovim)."; read -r -p "Press Enter to close."', "guildhall-edit", path] });
    return;
  }
  const target = place.wsl ? uncPath(place.wsl, path) : path.replace(/\//g, "\\");
  const safe = mode === "open" && RUNS.has(extOf(path)) ? "reveal" : mode;
  const r = await exec("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    `${appHome()}/mods/guildhall-files/open.ps1`, "-Mode", safe, "-Path", target], { timeout: 20000 });
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "Windows couldn't open it").trim());
}
