// Guildhall Changes (cloned from Herdr's changes): the git changes of the folder the focused
// terminal is in now, on Windows or in WSL (see place.js); git runs where the folder is.
// Right-click a changed file: edit it (Windows' default text editor; nvim in WSL) or, for
// media, open it in its program.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { watchFolder, theme, settings } from "herdr";
import { Beacons, location, execAt, readAt, openFile } from "./place.js";
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    // The branch list (picking), its "new branch" field, and what git is doing now (working).
    this.picking = false; this.branches = null; this.working = null;
    this.branchInput = InputState.new({ placeholder: "new-branch-name" });
    this.branchInput.on("submit", (_e, cx) => this.gitAction("create", this.branchInput.value().trim(), cx));
    this.beacons = new Beacons();
    this.beacons.start(cx, (cx) => { if (this.key() !== this.context) this.refresh(cx); cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  place() { return location(this.beacons); }
  key() { return JSON.stringify(this.place()); }

  // The local branches, newest commit first, and remote ones with no local branch yet.
  loadBranches(cx) {
    const at = this.at, root = this.root, context = this.context;
    if (!at || !root) return;
    cx.spawn(async (cx) => {
      const list = await execAt(at, "git", ["for-each-ref", "--sort=-committerdate", "--format=%(refname)%09%(refname:short)%09%(committerdate:relative)", "refs/heads", "refs/remotes"], { cwd: root }).catch(() => null);
      if (this.context !== context || list?.code !== 0) { cx.notify(); return; }
      const local = [], remote = [];
      for (const line of list.stdout.split("\n").filter(Boolean)) {
        const [ref, name, when] = line.split("\t");
        if (ref.startsWith("refs/heads/")) local.push({ name, when });
        else if (!ref.endsWith("/HEAD")) remote.push({ name, short: name.replace(/^[^/]+\//, ""), when });
      }
      const mine = new Set(local.map((b) => b.name));
      this.branches = { local, remote: remote.filter((b) => !mine.has(b.short)) };
      cx.notify();
    });
  }

  // switch <branch> | create <name> (switch -c) | track <remote/branch> (a local copy) | pull | push | fetch.
  // Git's own refusal (changes that would be overwritten, a non-fast-forward push) shows as the note.
  gitAction(what, arg, cx) {
    const at = this.at, root = this.root;
    if (!at || !root || this.working) return;
    if (what === "create" && !arg) return;
    const g = this.git ?? {};
    const args = {
      switch: ["switch", arg],
      create: ["switch", "-c", arg],
      track: ["switch", "--track", arg],
      pull: ["pull", "--ff-only"],
      push: g.upstream ? ["push"] : ["push", "-u", "origin", g.branch ?? "HEAD"],
      fetch: ["fetch", "--all", "--prune"],
    }[what];
    this.working = what; this.note = null;
    cx.spawn(async (cx) => {
      try {
        // Never waits for a password prompt nobody can see.
        const r = await execAt(at, "git", ["-c", "core.askPass=", ...args], { cwd: root, timeout: 120000 });
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").filter(Boolean).slice(-3).join(" · "));
        if (["switch", "create", "track"].includes(what)) { this.picking = false; this.branchInput.set_value(""); this.open = null; this.closed = false; }
      } catch (e) { this.note = `${what[0].toUpperCase()}${what.slice(1)} failed: ${e.message ?? e}`; }
      finally { this.working = null; this.branches = null; if (this.picking) this.loadBranches(cx); this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  // Edit or open a changed file outside Herdr; a failure shows as the note.
  launch(path, cx) {
    const at = this.at, root = this.root;
    if (!at || !root) return;
    this.note = null;
    cx.spawn(async (cx) => {
      try { await openFile(at, `${root}/${path}`, "auto"); }
      catch (e) { this.note = String(e.message ?? e); }
      cx.notify();
    });
  }

  watch(root, cx) {
    // Windows folders only: WSL and other machines refresh on the timer.
    if (this.on || this.wsl || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const place = this.place(), { cwd, on } = place, context = JSON.stringify(place);
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null; this.git = null; this.branches = null; this.picking = false;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await execAt(place, "git", ["rev-parse", "--show-toplevel"], { cwd });
        if (this.key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => execAt(place, "git", [...READ, ...args], { cwd: root });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        // The branch, and how far it is from its upstream (no upstream: never pushed).
        const [branch, counts] = await Promise.all([git(["symbolic-ref", "-q", "--short", "HEAD"]), git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])]);
        const [ahead, behind] = counts.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
        const git_ = { branch: branch.code === 0 ? branch.stdout.trim() : null, upstream: counts.code === 0, ahead, behind };
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (this.key() !== context) return;
        this.root = root; this.on = on; this.wsl = place.wsl; this.at = place; this.hasHead = head.code === 0; this.files = files; this.git = git_; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (this.key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (this.key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, at = this.at;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readAt(at, `${root}/${path}`).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await execAt(at, "git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (this.key() === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (this.key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== this.key()) return;
    const root = this.root, at = this.at, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await execAt(at, "git", args, { cwd: root });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (this.key() === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (this.key() === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  // The branch bar: the branch (click: the list), how far from its upstream, and Fetch / Pull / Push.
  branchBar(t) {
    const g = this.git, busy = Boolean(this.working);
    const button = (id, label, tip, what, enabled = true) => div().id(id).flex_none().px(7).py(2).rounded(5).border_1().border_color(t.border).text_size(11)
      .text_color(enabled && !busy ? t.muted : t.dim).tooltip(tip)
      .when(enabled && !busy, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => this.gitAction(what, null, cx)))
      .child(this.working === what ? "…" : label);
    return h_flex().h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border).text_size(12)
      .child(h_flex().id("branch-pick").flex_1().min_w(0).h(24).px(6).gap(6).items_center().rounded(5).cursor_pointer()
        .when(this.picking, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .tooltip("Switch or create a branch")
        .on_click((_e, cx) => { this.picking = !this.picking; this.note = null; if (this.picking) { this.loadBranches(cx); this.branchInput.focus(); } cx.notify(); })
        .child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.accent))
        .child(div().min_w(0).truncate().text_color(t.foreground).child(g.branch ?? "(detached HEAD)"))
        .when(g.ahead > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi2).child(`↑${g.ahead}`)))
        .when(g.behind > 0, (e) => e.child(div().flex_none().text_size(11).text_color(t.ansi1).child(`↓${g.behind}`)))
        .when(Boolean(g.branch) && !g.upstream, (e) => e.child(div().flex_none().text_size(10).text_color(t.dim).child("not pushed")))
        .child(svg(`mods/workspace-chrome/chevron-${this.picking ? "down" : "right"}.svg`).size(10).flex_none().text_color(t.dim)))
      .child(button("git-fetch", "Fetch", "Fetch every remote", "fetch"))
      .child(button("git-pull", g.behind > 0 ? `Pull ${g.behind}` : "Pull", "Pull (fast-forward only)", "pull", g.upstream))
      .child(button("git-push", g.ahead > 0 ? `Push ${g.ahead}` : "Push", g.upstream ? "Push to the upstream" : "Push and set the upstream (origin)", "push", Boolean(g.branch) && (g.ahead > 0 || !g.upstream)));
  }

  // The branch list: a new branch from here, the local branches, then remote ones to check out.
  branchList(t) {
    const g = this.git ?? {}, list = this.branches;
    const row = (id, name, when, current, action, tip) => h_flex().id(id).h(26).flex_none().px(8).gap(8).items_center().rounded(5)
      .when(current, (e) => e.bg(t.selected)).when(!current, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(action)).tooltip(tip)
      .child(div().w(10).flex_none().text_color(t.accent).child(current ? "✓" : ""))
      .child(div().flex_1().min_w(0).truncate().text_color(current ? t.foreground : t.muted).child(name))
      .child(div().flex_none().text_size(10).text_color(t.dim).child(when ?? ""));
    const head = (label) => div().px(8).pt(6).pb(2).text_size(10).text_color(t.dim).child(label);
    return v_flex().id("branch-list").flex_none().max_h(260).overflow_y_scrollbar().p(6).gap(1).border_b(1).border_color(t.border).bg(t.raised).text_size(12)
      .child(h_flex().flex_none().gap(6).pb(4).items_center()
        .child(div().id("branch-name").flex_1().min_w(0).h(26).px(8).flex().items_center().rounded(6).border_1().border_color(t.border)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.branchInput).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("branch-create").flex_none().px(8).py(3).rounded(5).bg(t.solid).text_color(t.solid_foreground).text_size(11).cursor_pointer()
          .tooltip("New branch from here (your changes come along)").on_click((_e, cx) => this.gitAction("create", this.branchInput.value().trim(), cx))
          .child(this.working === "create" ? "…" : "Create")))
      .when(!list, (e) => e.child(div().px(8).py(4).text_color(t.dim).child("Loading branches…")))
      .when(Boolean(list), (e) => e
        .child(head("LOCAL"))
        .children(list.local.map((b) => row(`br-${b.name}`, b.name, b.when, b.name === g.branch, (_e, cx) => this.gitAction("switch", b.name, cx), "Switch to this branch")))
        .when(list.remote.length > 0, (e) => e.child(head("REMOTE"))
          .children(list.remote.map((b) => row(`brr-${b.name}`, b.name, b.when, false, (_e, cx) => this.gitAction("track", b.name, cx), `Check out ${b.short} from ${b.name}`)))));
  }

  render(cx) {
    if (this.key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .when(Boolean(this.root && this.git), (el) => el.child(this.branchBar(t)))
      .when(Boolean(this.root && this.picking), (el) => el.child(this.branchList(t)))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().p(6).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
          .when(f.status !== "D", (e) => e.tooltip("Click: diff · Right-click: edit or open").on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.launch(f.path, cx); }))
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("commit").h(32).px(14).flex().items_center().rounded(8).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(12).when(enabled, (e) => e.cursor_pointer()).on_click((_e, cx) => this.commit(cx)).child(this.busy ? "Committing…" : "Commit")));
  }
}
