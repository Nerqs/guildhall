// Guildhall HUD: the top bar of an 8-bit adventure.
// Left: LIFE, 10 hearts for the Claude weekly limit left (a quarter per 2.5%), and a SESSION bar for the 5-hour limit.
// Center: a hanging wooden sign with the current space and tab.
// Right: round gem buttons with pixel item icons.

import { View, div, image } from "gpui-kit";
import { wslArgv, wslDir } from "./wsl.js";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, focused, run, theme, themes, shared, setShared, layout, openOverlay, nextCommand } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
// The Ninja Adventure pack font (CC0) has no space glyph: only for one-word titles.
const TITLE = "NinjaAdventure";
const AV = "mods/guildhall-agents/avatar";
const ME = "mods/guildhall-hud";
const INK = "#1b1420";
const PARCH = "#fff0c8";
const MAX_HEARTS = 10;
const SEGMENTS = 12;

// Stops the press so the HUD's window drag doesn't swallow the click.
const press = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// LIFE: the Claude weekly limit left, as 10 hearts. Each heart is 10%, each quarter 2.5%, rounded up:
// any usage left shows at least a quarter (12% = 1 heart and a quarter; empty only at 0%).
// With one heart or less left, what remains blinks.
// Hearts from the Ninja Adventure pack (CC0): ui/heart0..4.png = empty, 1/4, 1/2, 3/4, full (16px drawn 2x).
function weeklyHearts(left) {
  const known = typeof left === "number";
  const quarters = known ? Math.max(0, Math.min(40, Math.ceil(left / 2.5))) : 0;
  const low = known && quarters <= 4;
  return Array.from({ length: MAX_HEARTS }, (_, i) => {
    const q = Math.max(0, Math.min(4, quarters - i * 4));
    let el = image(`${ME}/ui/heart${q}.png`).w(32).h(32).flex_none();
    if (low && q > 0) el = el.loop("opacity", { from: 1, to: 0.15, period: 600 });
    return el;
  });
}

// A label plate: dark inset with a pixel outline.
const plate = (text, color) => div().px(5).py(1).bg("#0a0f1c").border(1).border_color(INK)
  .font_family(TITLE).text_size(13).text_color(color).child(text);

// The Claude 5-hour session limit left (0..1), shared by guildhall-agents from the
// status line. Blue like a mana bar; gold under half, red and blinking under a fifth.
function sessionBar(t, left, working) {
  const known = typeof left === "number";
  const lit = known ? Math.ceil(SEGMENTS * left) : 0;
  const [top, body] = !known ? ["#1f2a22", "#162019"] : left > 0.5 ? ["#a8d8ff", "#4878d8"] : left > 0.2 ? ["#ffe8a0", t.working] : ["#ffb0a0", t.blocked];
  let bar = h_flex().p(2).gap(1).bg(INK).border(1).border_color("#b89a5e")
    .children(Array.from({ length: SEGMENTS }, (_, i) => {
      const on = i < lit;
      let seg = v_flex().w(11).h(10)
        .child(div().h(3).bg(on ? top : "#1f2a22"))
        .child(div().flex_1().bg(on ? body : "#162019"));
      // The last lit segment flickers while agents work: the session is being spent.
      if (on && i === lit - 1 && working) seg = seg.loop("opacity", { from: 1, to: 0.5, period: 700 });
      return seg;
    }));
  if (known && left <= 0.2) bar = bar.loop("opacity", { from: 1, to: 0.4, period: 800 });
  return bar;
}

// "resets Mon 09:00" from unix seconds, in local time (the weekly window).
function resetsDay(s) {
  if (!s) return "";
  const d = new Date(s * 1000);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `resets ${day} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "resets 14:05" from unix seconds, in local time.
function resetsAt(s) {
  if (!s) return "";
  const d = new Date(s * 1000);
  return `resets ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// The wood pieces in the shown theme's colors: ui/wood/<theme>/ (made by src/recolor.ps1) for the
// guildhall-* themes, the pack's own orange wood (ui/wood/) for Wood and anything else.
// The theme in use is found by its colors: Herdr's theme picker keeps its choice apart from the
// layout file, so layout().theme can still say "guildhall" while another palette shows.
function themeInUse() {
  const t = theme();
  return themes().find((x) => x.name.startsWith("guildhall") && x.colors.border === t.border
    && x.colors.accent === t.accent && x.colors.chrome === t.chrome)?.name ?? null;
}
function woodArt(piece) {
  const name = themeInUse();
  const skin = name && name.startsWith("guildhall-") ? `${name}/` : "";
  return `${ME}/ui/wood/${skin}${piece}.png`;
}

// A wood button from the Ninja Adventure "Theme Wood" (CC0), 112x40, with a pack icon and a label.
// hover: the lighter plank; held: the pressed plank, nudged down a pixel.
function woodButton(view, id, icon, label, action) {
  const state = view.pressed === id ? "pressed" : view.hovered === id ? "hover" : "normal";
  return div().id(id).relative().w(112).h(40).flex_none().cursor_pointer()
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); view.pressed = id; cx.notify(); })
    .on_mouse_up("left", (_e, cx) => { view.pressed = null; cx.notify(); })
    .on_hover((on, cx) => { view.hovered = on ? id : view.hovered === id ? null : view.hovered; if (!on && view.pressed === id) view.pressed = null; cx.notify(); })
    .on_click(action)
    .child(image(woodArt(`button-${state}`)).absolute().top(0).left(0).w(112).h(40))
    .child(h_flex().absolute().top(state === "pressed" ? 5 : 4).left(6).h(32).gap(4).items_center()
      .child(image(`${ME}/ui/icons/${icon}.png`).w(32).h(32).flex_none())
      .child(div().font_family(TITLE).text_size(13).text_color(state === "pressed" ? "#fff4e0" : theme().accent_foreground ?? "#3a1e10").child(label)));
}

// The town sign, centered on the window: a wood board from the pack with a flag on each side.
const SIGN_W = 264 + 2 * 36;
function townSign(name, chapter) {
  const flag = (side) => div().relative().w(32).h(32).flex_none().mt(side === "l" ? 6 : 6)
    .child(image(`${ME}/ui/wood/flag0.png`).absolute().top(0).left(0).w(32).h(32))
    .child(image(`${ME}/ui/wood/flag1.png`).absolute().top(0).left(0).w(32).h(32)
      .loop("opacity", { from: 0, to: 1, period: side === "l" ? 700 : 820, easing: "linear" }));
  return h_flex().w(SIGN_W).h(64).items_center().justify_center().gap(4)
    .child(flag("l"))
    .child(div().relative().w(264).h(56).flex_none()
      .child(image(woodArt("sign")).absolute().top(0).left(0).w(264).h(56))
      .child(image(woodArt("sign-inset")).absolute().top(8).left(20).w(224).h(40))
      .child(v_flex().absolute().top(8).left(20).w(224).h(40).items_center().justify_center()
        .child(div().max_w(210).truncate().font_family(PX).text_size(18).text_color("#fff4e0").child(name))
        .when(Boolean(chapter), (el) => el.child(div().font_family(PX).text_size(11).text_color("#ffd8a0").child(chapter)))))
    .child(flag("r"));
}

// The wood panel from the Ninja Adventure "Theme Wood" (CC0), rebuilt as layers so it scales:
// dark outline, orange rim with a bright top edge, a red-brown bevel, then dark wood.
// rim: the rim color (lighter when hovered or focused). Put these first, then the content.
// Wood colors come from the theme, so the theme picker recolors the frames:
// rim = border, shine = accent, bevel = selected, fill = chrome; the outline stays dark.
const WOOD = {
  outline: "#131b1b",
  get rim() { return theme().border; },
  get shine() { return theme().accent; },
  get bevel() { return theme().selected; },
  get fill() { return theme().chrome; },
};
function woodLayers(rim = WOOD.rim, fill = WOOD.fill) {
  const at = (n) => div().absolute().top(n).left(n).right(n).bottom(n);
  return [
    at(0).bg(WOOD.outline),
    at(1).bg(rim),
    div().absolute().top(1).left(2).right(2).h(1).bg(WOOD.shine),
    at(3).bg(WOOD.bevel),
    at(4).bg(fill),
  ];
}

// The theme's keyboard commands.
const MAPS = ["village", "camp", "snowfield", "shrine"];
function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}
// A new tab in the shown space: a WSL shell in its folder for a WSL space (or when asked), else Herdr's default.
function newTab(wsl) {
  const dir = wslDir(shared, focused()?.space);
  if (dir || wsl) run("tab.new", { name: "WSL", argv: wslArgv(dir, null) });
  else run("tab.new", {});
}

// Forget WSL spaces that were closed (shared "guildhall.wsl" = { spaceId: dir }).
function pruneWsl() {
  const map = shared("guildhall.wsl") ?? {};
  const live = new Set(spaces().map((s) => s.id));
  const keep = Object.fromEntries(Object.entries(map).filter(([id]) => live.has(id)));
  if (Object.keys(keep).length !== Object.keys(map).length) setShared("guildhall.wsl", keep);
}

function hudCommand(c) {
  if (c === "wsl-tab") { newTab(true); return; }
  if (c === "next-map") {
    const m = shared("guildhall.map");
    setShared("guildhall.map", MAPS[(MAPS.indexOf(m) + 1) % MAPS.length]);
    run("layout.show", { id: "overworld" });
  } else if (c === "quests") {
    const panel = findNode(layout(), "panel");
    const open = panel && !panel.hidden && findNode(layout(), "panel-body")?.active === "quests";
    if (open) run("layout.hide", { id: "panel" });
    else { run("layout.select", { stack: "panel-body", child: "quests" }); run("layout.show", { id: "panel" }); }
  } else if (c === "pick-hero") {
    const t = focused()?.terminal;
    if (t && agents().some((a) => a.address === t)) {
      openOverlay({ mod: "guildhall-picker", kind: "dialog", width: 620, height: 520, props: { address: t } });
    }
  } else if (c === "needs-you") {
    const a = agents().find((x) => x.status === "blocked" || x.status === "error");
    if (a) run("pane.focus", { pane: a.pane });
  }
}

export default class Hud extends View {
  init(_props, cx) {
    this.width = 0; this.hovered = null; this.pressed = null;
    this.now = new Date();
    // Day and night follow the clock: check once a minute.
    cx.timer.every(60000, (cx) => { this.now = new Date(); pruneWsl(); cx.notify(); });
    pruneWsl();
    // Keyboard commands for the theme (keys.json "layout:guildhall": "guildhall-hud.<command>").
    // The HUD answers them because it is always shown; the palette lists the same keys.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        hudCommand(c);
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    const list = agents();
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space);
    const tab = space?.tabs?.find((x) => x.id === f?.tab);
    const working = list.filter((a) => a.status === "working").length;
    const needs = list.filter((a) => a.status === "blocked" || a.status === "error").length;
    const name = !space?.name || space.name === "~" ? "Home" : space.name;
    const session = shared("guildhall.session");
    const weekLeft = typeof session?.week_used === "number" ? Math.max(0, 100 - session.week_used) : null;

    const left = v_flex().gap(2).flex_none().w(500)
      .child(h_flex().gap(2).items_center()
        .child(div().mr(4).child(plate("LIFE", t.blocked)))
        .children(weeklyHearts(weekLeft))
        .child(div().ml(6).font_family(PX).text_size(10).text_color(t.dim)
          .child(weekLeft == null ? "?" : `${Math.round(weekLeft)}% ${resetsDay(session.week_resets)}`)))
      .child(h_flex().gap(6).items_center()
        .child(plate("SESSION", "#78a8ff"))
        .child(sessionBar(t, session ? Math.max(0, 100 - session.used) / 100 : null, working > 0))
        .child(div().font_family(PX).text_size(10).text_color(t.dim)
          .child(session ? `${Math.round(100 - session.used)}% ${resetsAt(session.resets_at)}` : "?"))
        .when(needs > 0, (el) => el.child(plate(`! ${needs}`, t.blocked).loop("opacity", { from: 1, to: 0.3, period: 600 }))));

    // Day 06:00-19:00, night otherwise: a sun or moon from the pack, the time, darker wood at night.
    const hour = this.now.getHours();
    const night = hour >= 19 || hour < 6;
    const clock = h_flex().gap(6).items_center().flex_none().mr(6)
      .child(image(`${ME}/ui/icons/${night ? "Moon" : "Sun"}.png`).w(32).h(32))
      .child(v_flex()
        .child(div().font_family(TITLE).text_size(13).text_color(night ? "#a8c8ff" : "#ffd860").child(night ? "NIGHT" : "DAY"))
        .child(div().font_family(PX).text_size(11).text_color(t.muted)
          .child(`${String(hour).padStart(2, "0")}:${String(this.now.getMinutes()).padStart(2, "0")}`)));

    const right = h_flex().gap(10).items_center().flex_none()
      .child(clock)
      .child(woodButton(this, "btn-new", "Scroll", "NEW", () => newTab(false)))
      .child(woodButton(this, "btn-split", "Guard", "SPLIT", () => run("pane.split", { direction: "right" })))
      .child(woodButton(this, "btn-find", "Vision", "SEARCH", () => run("mod.open", { name: "picker" })));

    // The sign sits at the window's center, not between the side blocks (they differ in width).
    const signLeft = Math.max(0, Math.round((this.width - SIGN_W) / 2));
    return h_flex().id("hud").relative().size_full().pl(16).pr(20).gap(16).items_center()
      .children(woodLayers(WOOD.rim, night ? theme().canvas : WOOD.fill))
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .child(left)
      .child(div().flex_1())
      .child(right)
      .when(this.width > 0, (el) => el.child(div().absolute().top(2).left(signLeft)
        .child(townSign(name, tab ? `chapter ${tab.name}` : ""))));
  }
}
