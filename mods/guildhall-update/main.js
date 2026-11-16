// Guildhall updater: a dialog that compares the installed Guildhall with the latest one on
// GitHub and, on "Update", downloads it and copies its layout, themes and mods into Herdr's
// folder (update.sh on Linux and macOS, update.ps1 on Windows, both next to this file).
// The update runs in the background and writes <home>/data/guildhall-update/last.log, which
// this dialog reads, so it keeps showing progress even when the update replaces this very mod
// and Herdr reloads it. A backup is saved first; keys.json only gains new keys.
// Opened from the palette ("Update Guildhall…") or with Ctrl+Shift+R.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { exec, appHome, readTextFile, theme, notify, checking, props, closeOverlay, window as win } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
const UI = "mods/guildhall-hud/ui";
const REPO = "Nerqs/guildhall";

const isWindows = () => win()?.platform === "windows";
const here = () => `${appHome()}/mods/guildhall-update`;
const logPath = () => `${appHome()}/data/guildhall-update/last.log`;

// Runs the platform's script with the given options (POSIX spelling; Windows gets its own).
function script(opts, timeout) {
  if (isWindows()) {
    const map = { "--check": "-Check", "--yes": "-Yes", "--detach": "-Detach" };
    return exec("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", `${here()}/update.ps1`,
      "-HerdrHome", appHome(), ...opts.map((o) => map[o] ?? o)], { timeout });
  }
  return exec("bash", [`${here()}/update.sh`, "--home", appHome(), ...opts], { timeout });
}

// "key=value" lines from --check.
function parse(text) {
  const out = {};
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// The log of the last update: { started, lines, result } (result null while it runs).
function readLog(text) {
  const lines = (text ?? "").replace(/^﻿/, "").replace(/\r/g, "").split("\n").filter(Boolean);
  const started = Number(/^STARTED (\d+)/.exec(lines[0] ?? "")?.[1] ?? 0);
  const end = lines.findLast?.((l) => l.startsWith("RESULT ")) ?? [...lines].reverse().find((l) => l.startsWith("RESULT "));
  return {
    started,
    lines: lines.filter((l) => !l.startsWith("STARTED ") && !l.startsWith("RESULT ")),
    result: end ? Number(end.slice(7)) : null,
  };
}

const short = (sha) => (sha && /^[0-9a-f]{7,}$/.test(sha) ? sha.slice(0, 7) : sha || "?");

export default class Update extends View {
  init(_p, cx) {
    this.info = null;      // --check result
    this.error = null;
    this.log = null;       // readLog() while an update runs or just ran
    this.scroll = ScrollHandle.new();
    if (checking()) return;
    cx.spawn(async (cx) => {
      // An update started a moment ago (maybe by the copy of this dialog Herdr just reloaded)?
      const log = readLog(await readTextFile(logPath()).catch(() => null));
      if (log.started && Date.now() / 1000 - log.started < 600) { this.log = log; cx.notify(); if (log.result === null) this.follow(cx); }
      await this.check(cx);
    });
  }

  async check(cx) {
    this.error = null;
    try {
      const r = await script(["--check"], 60000);
      this.info = parse(r.stdout);
      if (r.code !== 0) this.error = (r.stderr || r.stdout).trim() || `exit ${r.code}`;
    } catch (e) {
      this.error = `${e}`;
    }
    cx.notify();
  }

  start(cx) {
    if (this.log && this.log.result === null) return;
    this.log = { started: Date.now() / 1000, lines: ["==> Starting…"], result: null };
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await script(["--yes", "--detach"], 60000);
        if (r.code !== 0) { this.log = { started: 0, lines: [(r.stderr || r.stdout).trim()], result: r.code }; cx.notify(); return; }
      } catch (e) {
        this.log = { started: 0, lines: [`${e}`], result: 1 }; cx.notify(); return;
      }
      this.follow(cx);
    });
  }

  // Reads last.log twice a second until it ends with RESULT (at most 10 minutes).
  follow(cx) {
    if (this.following) return;
    this.following = true;
    cx.spawn(async (cx) => {
      for (let i = 0; i < 1200; i++) {
        await new Promise((ok) => cx.timer.after(500, ok));
        const log = readLog(await readTextFile(logPath()).catch(() => null));
        if (log.lines.length || log.result !== null) { this.log = log; this.scroll.scroll_to_item(Math.max(0, log.lines.length - 1)); cx.notify(); }
        if (log.result !== null) {
          this.following = false;
          notify(log.result === 0
            ? { title: "Guildhall updated", body: log.lines.find((l) => l.startsWith("==> Version:"))?.slice(13) ?? "Up to date", level: "success" }
            : { title: "Guildhall update failed", body: log.lines.at(-1) ?? "", level: "error" });
          await this.check(cx);
          return;
        }
      }
      this.following = false;
    });
  }

  render() {
    const t = theme();
    const i = this.info;
    const running = this.log && this.log.result === null;
    const status = i?.status;
    const badge = (txt, c) => div().px(6).py(1).border(1).border_color(c).font_family(PX).text_size(11).text_color(c).child(txt);
    const button = (id, label, on, primary, act) => div().id(id).flex_none().px(10).py(4)
      .bg(!on ? t.selected : primary ? t.border : t.raised).border(1).border_color(primary ? "#131b1b" : t.border)
      .font_family(PX).text_size(12).text_color(!on ? t.dim : primary ? t.accent_foreground : t.foreground)
      .when(on, (el) => el.cursor_pointer().hover((s) => s.bg(primary ? t.accent : t.hover)).on_click((_e, cx) => act(cx)))
      .child(label);

    const summary = !i && !this.error
      ? div().font_family(PX).text_size(12).text_color(t.dim).child("Asking GitHub for the latest version…")
      : v_flex().gap(6)
        .child(h_flex().gap(8).items_center()
          .child(div().w(90).font_family(PX).text_size(12).text_color(t.muted).child("Installed"))
          .child(div().font_family(PX).text_size(12).text_color(t.foreground).child(i?.installed === "none" ? "unknown (first update)" : short(i?.installed))))
        .child(h_flex().gap(8).items_center()
          .child(div().w(90).font_family(PX).text_size(12).text_color(t.muted).child("Latest"))
          .child(div().font_family(PX).text_size(12).text_color(t.foreground).child(i?.latest === "unknown" ? "?" : short(i?.latest)))
          .when(status === "up-to-date", (el) => el.child(badge("up to date", t.done)))
          .when(status === "update-available", (el) => el.child(badge("new version", t.accent)))
          .when(status === "offline", (el) => el.child(badge("GitHub unreachable", t.blocked))))
        .when(Boolean(i?.subject), (el) => el.child(div().pl(98).font_family(PX).text_size(11).text_color(t.dim).truncate()
          .child(`${i.subject}${i.date ? `  (${i.date.slice(0, 10)})` : ""}`)))
        .when(Boolean(this.error), (el) => el.child(div().font_family(PX).text_size(11).text_color(t.blocked).child(this.error)));

    const logBox = this.log
      ? div().id("gh-update-log").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
        .p(6).bg(t.background).border(1).border_color(t.selected)
        .children(this.log.lines.map((l, n) => div().id(`l${n}`).font_family(PX).text_size(11)
          .text_color(l.startsWith("==>") ? t.accent : /FAIL|error/.test(l) ? t.blocked : l.startsWith("- ") ? t.muted : t.foreground)
          .child(l)))
      : div().flex_1().font_family(PX).text_size(11).text_color(t.dim)
        .child(`Downloads ${REPO} from GitHub and copies its layout, themes and mods here. A backup is saved first; your keys stay yours.`);

    const footer = h_flex().gap(8).items_center().justify_end()
      .when(Boolean(running), (el) => el.child(div().flex_1().font_family(PX).text_size(11).text_color(t.accent).child("Updating… you can close this, it keeps going.")))
      .when(this.log?.result === 0, (el) => el.child(div().flex_1().font_family(PX).text_size(11).text_color(t.done).child("Updated.")))
      .when(Boolean(this.log) && this.log.result > 0, (el) => el.child(div().flex_1().font_family(PX).text_size(11).text_color(t.blocked).child("Update failed: see the log.")))
      .child(button("gh-update-check", "Check again", !running, false, (cx) => { this.info = null; cx.notify(); this.check(cx); }))
      .child(button("gh-update-go", status === "up-to-date" ? "Reinstall" : "Update", !running && status !== "offline", true, (cx) => this.start(cx)))
      .child(button("gh-update-close", "Close", true, false, () => closeOverlay(props()?.overlay)));

    return v_flex().size_full().p(4).bg("#131b1b")
      .child(v_flex().size_full().p(3).bg(t.border)
        .child(v_flex().size_full().p(12).gap(10).bg(t.chrome)
          .child(h_flex().items_center().justify_between()
            .child(h_flex().gap(8).items_center()
              .child(image(`${UI}/icons/Upgrade.png`).w(24).h(24).flex_none())
              .child(div().font_family(TITLE).text_size(16).text_color(t.accent).child("UPDATE")))
            .child(div().font_family(PX).text_size(11).text_color(t.muted).child(`github.com/${REPO}`)))
          .child(summary)
          .child(logBox)
          .child(footer)));
  }
}
