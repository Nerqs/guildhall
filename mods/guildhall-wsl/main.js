// Guildhall WSL projects: the folders in your WSL home (default distro), each one opened as a
// Herdr space whose terminals run in WSL, in that folder. "Open" starts a shell; "Hero" starts
// Claude Code there. Spaces opened here are remembered in shared "guildhall.wsl"
// ({ spaceId: "/home/you/project" }), so the HUD's NEW button, the quest board and the palette
// open WSL terminals in them too, and the MAP marks them "WSL".
// Opened with Ctrl+Shift+D or from the palette ("Open a WSL project…").

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, spaces, shared, setShared, theme, props, closeOverlay } from "herdr";
import { wslArgv } from "./wsl.js";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
const UI = "mods/guildhall-hud/ui";

export default class Wsl extends View {
  init(_p, cx) {
    this.dirs = null;
    this.error = null;
    this.hovered = null;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("wsl.exe", ["-e", "sh", "-c", 'echo "$HOME"; for d in "$HOME"/*/; do [ -d "$d" ] && echo "${d%/}"; done'], { timeout: 20000 });
        const lines = r.stdout.replace(/\r/g, "").split("\n").map((s) => s.trim()).filter(Boolean);
        this.home = lines[0];
        this.dirs = lines.slice(1).filter((d) => !/\/\./.test(d));
      } catch (e) {
        this.error = `${e}`;
      }
      cx.notify();
    });
  }

  // Opens the folder as a new space, then remembers that space as a WSL one.
  open(dir, withHero, cx) {
    const name = dir === this.home ? "~ (WSL)" : dir.split("/").pop();
    const before = new Set(spaces().map((s) => s.id));
    run("space.new", { name, argv: wslArgv(dir, withHero ? "claude" : null) });
    // Stay open until the new space shows up: closing ends this copy's tasks.
    this.opening = name;
    cx.notify();
    cx.spawn(async (cx) => {
      for (let i = 0; i < 40; i++) {
        await new Promise((ok) => cx.timer.after(250, ok));
        const sp = spaces().find((s) => !before.has(s.id) && s.name === name);
        if (sp) { setShared("guildhall.wsl", { ...(shared("guildhall.wsl") ?? {}), [sp.id]: dir }); break; }
      }
      closeOverlay(props()?.overlay);
    });
  }

  render() {
    const t = theme();
    const row = (dir) => {
      const label = dir === this.home ? "~ (home)" : dir.replace(`${this.home}/`, "~/");
      return h_flex().id(`wsl-${dir}`).gap(8).items_center().py(5).px(6).border_b(1).border_color(t.selected)
        .child(image(`${UI}/icons/${dir === this.home ? "Helmet" : "Mine"}.png`).w(20).h(20).flex_none())
        .child(div().flex_1().min_w(0).truncate().font_family(PX).text_size(13).text_color(t.foreground).child(label))
        .child(div().id(`wsl-open-${dir}`).flex_none().px(6).py(2).cursor_pointer().bg(t.raised).border(1).border_color(t.border)
          .hover((s) => s.bg(t.hover)).font_family(PX).text_size(11).text_color(t.foreground)
          .tooltip("New space with a WSL shell in this folder")
          .on_click((_e, cx) => this.open(dir, false, cx)).child("Open"))
        .child(div().id(`wsl-hero-${dir}`).flex_none().px(6).py(2).cursor_pointer().bg(t.border).border(1).border_color("#131b1b")
          .hover((s) => s.bg(t.accent)).font_family(PX).text_size(11).text_color(t.accent_foreground)
          .tooltip("New space with Claude Code in this folder")
          .on_click((_e, cx) => this.open(dir, true, cx)).child("Hero"));
    };
    const body = this.opening
      ? div().font_family(PX).text_size(12).text_color(t.accent).child(`Opening ${this.opening}…`)
      : this.error
      ? div().font_family(PX).text_size(12).text_color(t.blocked).child(`Could not reach WSL: ${this.error}`)
      : !this.dirs
        ? div().font_family(PX).text_size(12).text_color(t.dim).child("Waking WSL up…")
        : v_flex().children([this.home, ...this.dirs].map(row));
    return v_flex().size_full().p(4).bg("#131b1b")
      .child(v_flex().size_full().p(3).bg(t.border)
        .child(v_flex().size_full().p(12).gap(8).bg(t.chrome)
          .child(h_flex().items_center().justify_between()
            .child(h_flex().gap(8).items_center()
              .child(image(`${UI}/icons/Mine.png`).w(28).h(28))
              .child(div().font_family(TITLE).text_size(16).text_color(t.accent).child("WSL")))
            .child(div().font_family(PX).text_size(11).text_color(t.muted).child("Your Linux projects")))
          .child(div().id("wsl-list").flex_1().min_h(0).overflow_y_scrollbar().child(body))));
  }
}
