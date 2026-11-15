// Guildhall Files (cloned from Herdr's files): a lazy file browser for the folder the focused
// terminal is in now, on Windows or in WSL (see place.js), with bounded read-only previews.
// Click a file: preview it, text or image (other media, documents and archives open in their program).
// Right-click, or the header's buttons: Edit (Windows' default text editor; nvim in WSL) or
// Open (the file's default program). + File / + Folder create one (a path like src/a.ts makes
// its folders too); a new file opens in the editor.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input } from "gpui-base";
import { watchFolder, theme, settings, window, exec, appHome } from "herdr";
import { Beacons, location, execAt, readAt, openFile, isMedia, extOf, uncPath } from "./place.js";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
// Images Files draws itself (a copy in .preview/, which image() can read: it only reads Herdr's folder).
const PICTURE = new Set("png jpg jpeg gif webp bmp ico svg".split(" "));
const isPicture = (path) => PICTURE.has(extOf(path));
let previews = 0;
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, place) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await execAt({ on: place.on }, "powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"]);
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!place.on && !place.wsl && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await execAt(place, "sh", ["-c", script, "files", path]); }
  catch (e) {
    if (place.on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.beacons = new Beacons();
    this.beacons.start(cx, (cx) => { if (this.key() !== this.context?.key) this.refresh(cx); cx.notify(); });
    this.width = 360;
    // + File / + Folder: what's being made (null, "file" or "dir") and its name field.
    this.making = null;
    this.nameInput = InputState.new({ placeholder: "name, or path/to/name" });
    this.nameInput.on("submit", (_e, cx) => this.make(cx));
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  place() { return location(this.beacons); }

  // Creates the file or folder typed in the name field, under the root; never replaces one.
  make(cx) {
    const kind = this.making, rel = this.nameInput.value().trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!kind || !rel || this.context?.on) return;
    if (rel.split("/").some((p) => p === ".." || p === "")) { this.note = "Use a name inside this folder"; cx.notify(); return; }
    const context = this.context, full = `${context.cwd}/${rel}`;
    this.note = null;
    cx.spawn(async (cx) => {
      try {
        const r = context.wsl
          ? await execAt(context, "sh", ["-c", '[ -e "$1" ] && { echo "Already exists: $1" >&2; exit 1; }; if [ "$2" = dir ]; then mkdir -p -- "$1"; else mkdir -p -- "$(dirname -- "$1")" && : > "$1"; fi', "make", full, kind])
          : await exec("powershell", ["-NoProfile", "-Command", "& { param($p, $k) if (Test-Path -LiteralPath $p) { [Console]::Error.WriteLine(\"Already exists: $p\"); exit 1 }; " +
            "if ($k -eq 'dir') { New-Item -ItemType Directory -Path $p | Out-Null } else { $d = Split-Path -Parent $p; if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }; New-Item -ItemType File -Path $p | Out-Null } } " +
            `'${full.replace(/\//g, "\\").replace(/'/g, "''")}' '${kind}'`]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "Couldn't create it").trim());
        // Show it: unfold the folders on its way, then a new file goes to the editor.
        const parts = rel.split("/");
        for (let i = 1; i < parts.length + (kind === "dir" ? 1 : 0); i++) this.folders.add(parts.slice(0, i).join("/"));
        this.making = null; this.nameInput.set_value("");
        this.refresh(cx);
        if (kind === "file") this.launch(rel, "edit", cx);
      } catch (e) { this.note = String(e.message ?? e); }
      cx.notify();
    });
  }
  key() { return JSON.stringify(this.place()); }

  watch(root, cx) {
    // Windows folders only: WSL and other machines refresh on the timer.
    if (this.on || this.wsl || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && this.key() === context.key;
  }

  async loadFolder(path, context) {
    const { cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, context);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const place = this.place(), { cwd } = place, next = JSON.stringify(place);
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, ...place }; this.root = cwd; this.on = place.on; this.wsl = place.wsl;
      this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false; this.note = null;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await execAt(context, "git", ["rev-parse", "--show-toplevel"], { cwd }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await execAt(context, "git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  // Edit or open a file (relative to the root) outside Herdr; a failure shows under the header.
  launch(path, how, cx) {
    const context = this.context;
    this.note = null;
    cx.spawn(async cx => {
      try { await openFile(context, `${context.cwd}/${path}`, how); }
      catch (e) { if (this.context === context) this.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null; this.picture = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root;
    if (isPicture(path) && !context.on) {
      // A copy beside the mod (a new name each time, so image() never shows an old one), and its size.
      const name = `p${++previews}.${extOf(path)}`, source = context.wsl ? uncPath(context.wsl, `${root}/${path}`) : `${root}/${path}`.replace(/\//g, "\\");
      cx.spawn(async cx => {
        try {
          const r = await exec("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `${appHome()}/mods/guildhall-files/preview.ps1`,
            "-Path", source, "-Dir", `${appHome()}/mods/guildhall-files/.preview`, "-Name", name]);
          if (this.file !== path || !this.current(context)) return;
          if (r.code !== 0) { this.fileError = (r.stderr || "Cannot preview this image").trim(); return; }
          const [w, h] = r.stdout.trim().split(/\s+/).map(Number);
          this.picture = { src: `mods/guildhall-files/.preview/${name}`, w: w || 0, h: h || 0 };
        } catch { if (this.file === path) this.fileError = "Cannot preview this image"; }
        finally { cx.notify(); }
      });
      return;
    }
    if (isMedia(path)) { this.fileError = "Opens in its own program: use Open above"; return; }
    cx.spawn(async cx => {
      try {
        const text = await readAt(context, `${root}/${path}`);
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        // Click: a folder unfolds, text and images preview, other media opens in its program.
        // Right-click: straight to the editor (text) or the program (media).
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : isMedia(path) && !isPicture(path) ? this.launch(path, "open", cx) : this.show(path, cx))
        .when(!entry.dir, el => el.tooltip(isPicture(path) ? "Click: preview · Right-click: open" : isMedia(path) ? "Click: open" : "Click: preview · Right-click: edit")
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.launch(path, "auto", cx); }))
        .child(entry.dir ? svg(`mods/guildhall-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/guildhall-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (this.key() !== this.context?.key) this.refresh(cx);
    const t = theme();
    const action = (id, label, tip, how) => div().id(id).flex_none().px(7).py(2).rounded(5).border_1().border_color(t.border)
      .text_size(11).text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => this.launch(this.file, how, cx)).child(label);
    const editTip = this.wsl ? "Edit in nvim, in a split beside the terminal" : "Edit in Windows' default text editor";
    const makeButton = (kind, label) => div().id(`files-new-${kind}`).flex_none().px(6).py(2).rounded(5).text_size(11)
      .text_color(this.making === kind ? t.foreground : t.muted).when(this.making === kind, el => el.bg(t.selected))
      .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip(kind === "dir" ? "New folder here" : "New file here (opens in the editor)")
      .on_click((_e, cx) => { this.making = this.making === kind ? null : kind; this.note = null; if (this.making) this.nameInput.focus(); cx.notify(); })
      .child(label);
    // An image fits the panel's width (never enlarged past 4x its pixels, which stay crisp).
    const pic = this.picture, room = Math.max(80, this.width - 28);
    const scale = pic?.w ? Math.min(room / pic.w, 4) : 1;
    const picW = pic?.w ? Math.round(pic.w * scale) : Math.min(room, 256), picH = pic?.h ? Math.round(pic.h * scale) : picW;
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); this.note = null; cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .when(Boolean(this.wsl), el => el.child(div().flex_none().px(3).border_1().border_color(t.accent).text_size(9).text_color(t.accent).tooltip(`WSL: ${this.wsl}`).child("WSL")))
        .child(div().id("files-where").flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).tooltip(this.root ?? "")
          .child(this.file ?? this.root?.split(/[\\/]/).filter(Boolean).pop() ?? ""))
        .when(Boolean(this.file) && !this.on, el => el
          .when(!isMedia(this.file), el => el.child(action("files-edit", "Edit", editTip, "edit")))
          .child(action("files-open", "Open", "Open in its default program", "open")))
        .when(!this.file && Boolean(this.root) && !this.on, el => el.child(makeButton("file", "+ File")).child(makeButton("dir", "+ Folder"))))
      .when(Boolean(this.making) && !this.file, el => el.child(h_flex().flex_none().px(10).py(6).gap(6).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().text_size(11).text_color(t.dim).child(this.making === "dir" ? "Folder:" : "File:"))
        .child(div().id("files-name").flex_1().min_w(0).h(26).px(8).flex().items_center().rounded(6).border_1().border_color(t.accent)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.nameInput).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("files-make").flex_none().px(8).py(3).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).cursor_pointer()
          .on_click((_e, cx) => this.make(cx)).child("Create"))
        .child(div().id("files-make-cancel").flex_none().px(4).text_color(t.dim).cursor_pointer().hover(s => s.text_color(t.foreground)).tooltip("Cancel")
          .on_click((_e, cx) => { this.making = null; this.nameInput.set_value(""); this.note = null; cx.notify(); }).child("×"))))
      .when(Boolean(this.note), el => el.child(div().px(12).py(4).text_size(11).text_color(t.ansi1).child(this.note)))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(
        pic ? v_flex().id("files-picture").flex_1().min_h(0).overflow_y_scrollbar().p(14).items_center().gap(8)
          .child(div().flex_none().p(1).border_1().border_color(t.border).child(image(pic.src).w(picW).h(picH)))
          .when(pic.w > 0, el => el.child(div().text_size(11).text_color(t.dim).child(`${pic.w} × ${pic.h} px`)))
        : this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || (isPicture(this.file) ? "Loading image…" : "Loading file…"))));
  }
}
