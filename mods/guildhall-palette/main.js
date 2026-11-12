// Guildhall command palette: Ctrl+Shift+P in the Guildhall layout (keys.json "layout:guildhall").
// The theme's own commands come first, in their own groups; Herdr's base commands follow.
// Type to filter, Up/Down to move, Enter to run, Esc to close.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { ROSTER } from "./roster.js";
import {
  commands, layouts, keys, run, theme, props, closeOverlay, openOverlay, shared, setShared, focused, agents, layout,
} from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
const UI = "mods/guildhall-hud/ui";
// Wood colors come from the theme, so the theme picker recolors the frames:
// rim = border, shine = accent, bevel = selected, fill = chrome; the outline stays dark.
const WOOD = {
  outline: "#131b1b",
  get rim() { return theme().border; },
  get shine() { return theme().accent; },
  get bevel() { return theme().selected; },
  get fill() { return theme().chrome; },
};
const MAPS = ["village", "camp", "snowfield", "shrine"];
const HEROES = ["hunter", "princess", "knight", "sorcererblack", "oldman", "monk", "woman", "ninjagreen"];
// Same pick as guildhall-agents: a hand pick, else the address hash.
function hero(addr) {
  let h = 0;
  for (const ch of addr ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return shared("guildhall.heroes")?.[addr] ?? HEROES[h % HEROES.length];
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
const shown = (id) => { const n = find(layout(), id); return Boolean(n && !n.hidden); };
const questsOpen = () => shown("panel") && find(layout(), "panel-body")?.active === "quests";
const focusedAgent = () => {
  const t = focused()?.terminal;
  return t && agents().some((a) => a.address === t) ? t : null;
};
const setHeroes = (fn) => setShared("guildhall.heroes", fn({ ...(shared("guildhall.heroes") ?? {}) }));
const setXp = (fn) => setShared("guildhall.xp", fn({ ...(shared("guildhall.xp") ?? {}) }));

// The theme's commands: { group, title, words, icon, act, when? }.
function guildhall() {
  const agent = focusedAgent();
  const list = [
    { group: "Guildhall: Map", bind: "layout.toggle:overworld", icon: "Scroll", title: shown("overworld") ? "Hide the overworld map" : "Show the overworld map",
      words: "world bottom strip toggle", act: () => run("layout.toggle", { id: "overworld" }) },
    { group: "Guildhall: Map", bind: "guildhall-hud.next-map", icon: "Permutation", title: "Next map", words: "world change cycle",
      act: () => { const m = shared("guildhall.map"); setShared("guildhall.map", MAPS[(MAPS.indexOf(m) + 1) % MAPS.length]); run("layout.show", { id: "overworld" }); } },
    ...MAPS.map((m) => ({ group: "Guildhall: Map", icon: "Scroll", title: `Map: ${m.charAt(0).toUpperCase() + m.slice(1)}`, words: "world",
      act: () => { setShared("guildhall.map", m); run("layout.show", { id: "overworld" }); } })),

    { group: "Guildhall: Quests", bind: "guildhall-hud.quests", icon: "Scroll", title: questsOpen() ? "Hide the quest board" : "Show the quest board",
      words: "tasks todo panel side", act: () => {
        if (questsOpen()) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: "quests" }); run("layout.show", { id: "panel" }); }
      } },
    { group: "Guildhall: Quests", icon: "Repair", title: "Clear finished quests in this space", words: "tasks done remove",
      act: () => {
        // Quest boards are per space (guildhall-quests).
        const sp = focused()?.space; const all = { ...(shared("guildhall.quests") ?? {}) };
        if (sp && all[sp]) { all[sp] = all[sp].filter((q) => !q.done); if (!all[sp].length) delete all[sp]; setShared("guildhall.quests", all); }
      } },

    { group: "Guildhall: Heroes", bind: "guildhall-hud.pick-hero", icon: "Interact", title: "Change this agent's hero…", words: "pick choose avatar character", when: agent,
      act: () => openOverlay({ mod: "guildhall-picker", kind: "dialog", width: 620, height: 520, props: { address: agent } }) },
    { group: "Guildhall: Heroes", icon: "Permutation", title: "Random hero for this agent", words: "reroll avatar", when: agent,
      act: () => setHeroes((m) => { delete m[agent]; return m; }) },
    { group: "Guildhall: Heroes", icon: "LuckUpgrade", title: "Shuffle every hero", words: "random party avatars", act: () => {
      setHeroes((m) => { for (const a of agents()) m[a.address] = ROSTER[Math.floor(Math.random() * ROSTER.length)]; return m; });
    } },
    { group: "Guildhall: Heroes", icon: "Downgrade", title: "Forget every hero pick", words: "reset random default avatars",
      act: () => setShared("guildhall.heroes", {}) },
    { group: "Guildhall: Heroes", icon: "Downgrade", title: "Reset this hero's level", words: "xp experience", when: agent,
      act: () => setXp((m) => { delete m[hero(agent)]; return m; }) },
    { group: "Guildhall: Heroes", bind: "guildhall-hud.needs-you", icon: "Upgrade", title: "Go to the next agent that needs you", words: "blocked waiting attention",
      act: () => { const a = agents().find((x) => x.status === "blocked" || x.status === "error"); if (a) run("pane.focus", { pane: a.pane }); } },

    { group: "Guildhall: Window", bind: "layout.toggle:sidebar", icon: "Vision", title: shown("sidebar") ? "Hide the side bar (map and party)" : "Show the side bar (map and party)",
      words: "sidebar left party spaces", act: () => run("layout.toggle", { id: "sidebar" }) },
    { group: "Guildhall: Window", bind: "mod.open:guildhall-themes", icon: "OrbLight", title: "Change the theme colors…", words: "color palette wood forest tokyo catppuccin dracula gruvbox nord rose pine look",
      act: () => openOverlay({ mod: "guildhall-themes", kind: "dialog", width: 560, height: 430 }) },
    { group: "Guildhall: Window", bind: "layout.toggle:hud", icon: "Vision", title: shown("hud") ? "Hide the HUD" : "Show the HUD", words: "top bar hearts life session",
      act: () => run("layout.toggle", { id: "hud" }) },
  ];
  return list.filter((e) => e.when !== null && e.when !== undefined ? Boolean(e.when) : !("when" in e) || Boolean(e.when));
}

// Herdr's base commands, with readable names; anything else the app has is listed after.
const BASE = [
  ["tab.new", {}, "Tab", "New tab"], ["mod.open", { name: "picker" }, "Tab", "Go to space or tab…"],
  ["tab.rename", {}, "Tab", "Rename tab"], ["tab.close", {}, "Tab", "Close tab"],
  ["tab.next", {}, "Tab", "Next tab"], ["tab.prev", {}, "Tab", "Previous tab"],
  ["pane.split", { direction: "right" }, "Pane", "Split right"], ["pane.split", { direction: "down" }, "Pane", "Split down"],
  ["pane.close", {}, "Pane", "Close pane"], ["pane.zoom", {}, "Pane", "Zoom pane"],
  ["space.new", {}, "Space", "New space"], ["space.rename", {}, "Space", "Rename space"], ["space.close", {}, "Space", "Close space"],
  ["space.next", {}, "Space", "Next space"], ["space.prev", {}, "Space", "Previous space"],
  ["terminal.open", {}, "Terminal", "New terminal"], ["terminal.search", {}, "Terminal", "Find in terminal"],
  ["agent.next", {}, "Agent", "Next agent"], ["agent.prev", {}, "Agent", "Previous agent"],
  ["layout.switch", {}, "Layout", "Next layout"],
  ["window.minimize", {}, "Window", "Minimize window"], ["window.maximize", {}, "Window", "Maximize window"],
  ["app.settings", {}, "App", "Settings"], ["app.help", {}, "App", "Keys"], ["app.zoom_in", {}, "App", "Zoom in"],
  ["app.zoom_out", {}, "App", "Zoom out"], ["app.zoom_reset", {}, "App", "Reset zoom"], ["app.palette", {}, "App", "Herdr's own palette"],
];
const SKIP = new Set(["space.move", "tab.move", "space.select", "tab.select", "pane.focus", "terminal.keep", "terminal.park",
  "terminal.kill", "terminal.show", "agent.focus", "layout.set", "layout.toggle", "layout.show", "layout.hide", "layout.resize",
  "layout.select", "mod.open", "overlay.close", "tab.settle", "tab.unsettle", "app.hide", "app.hide_others", "app.show_all", "app.theme"]);

function base() {
  const known = new Set(commands().map((c) => c.name));
  const list = BASE.filter(([n]) => known.has(n)).map(([name, args, group, title]) => ({ group, title, name, args, words: name }));
  for (const l of layouts()) list.push({ group: "Layout", title: `Layout: ${l}`, name: "layout.switch", args: { name: l }, words: "look" });
  const named = new Set(BASE.map(([n]) => n));
  for (const c of commands()) {
    if (named.has(c.name) || SKIP.has(c.name) || c.args.some((a) => a.required)) continue;
    const [noun, verb] = c.name.split(".");
    list.push({ group: noun.charAt(0).toUpperCase() + noun.slice(1), title: `${verb.replace(/_/g, " ")} ${noun}`.replace(/^./, (x) => x.toUpperCase()), name: c.name, args: {}, words: c.about });
  }
  return list.map((e) => ({ ...e, act: () => run(e.name, e.args) }));
}

// All characters of q, in order, in text: a score (higher is better) or null.
function match(q, text) {
  const s = text.toLowerCase();
  let at = 0, score = 0;
  for (const ch of q) {
    const i = s.indexOf(ch, at);
    if (i < 0) return null;
    score += i === at ? 3 : 1;
    if (i === 0 || " :-".includes(s[i - 1])) score += 4;
    at = i + 1;
  }
  return score;
}

// The key bound to a base entry, from keys.json (global or this layout's section).
// Theme entries name their key action in `bind`; base entries are matched by command and argument.
// The Guildhall section wins over the global one, as it does when keys are pressed here.
function keyFor(e, bound) {
  let want = e.bind;
  if (!want && e.name) {
    const v = Object.values(e.args ?? {})[0];
    want = v === undefined ? e.name : `${e.name}:${v}`;
  }
  if (!want) return null;
  const hit = (section) => bound.find((b) => b.section === section && b.action === want)?.keys;
  return hit("layout:guildhall") ?? hit("global") ?? null;
}

export default class Palette extends View {
  init(_p, cx) {
    this.q = "";
    this.sel = 0;
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Type a command…" });
    this.input.on("change", (_e, cx) => { this.q = this.input.value(); this.sel = 0; cx.notify(); });
    this.input.on("submit", () => this.runSelected());
    this.input.focus();
    cx.timer.after(120, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  list() {
    const q = this.q.trim().toLowerCase();
    const all = [...guildhall(), ...base()];
    if (!q) return all;
    return all.map((e) => ({ e, s: match(q, `${e.title} ${e.group} ${e.words ?? ""}`) }))
      .filter((x) => x.s !== null).sort((a, b) => b.s - a.s).map((x) => x.e);
  }

  runSelected() {
    const e = this.list()[this.sel];
    if (!e) return;
    closeOverlay(props()?.overlay);
    e.act();
  }

  key(e, cx) {
    const n = this.list().length;
    if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); return; }
    if (e.key === "down") this.sel = Math.min(n - 1, this.sel + 1);
    else if (e.key === "up") this.sel = Math.max(0, this.sel - 1);
    else return;
    this.scroll.scroll_to_item(this.rowIndex ?? 0);
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const t = theme();
    const list = this.list();
    const bound = keys();
    const rows = [];
    let group = null;
    list.forEach((e, i) => {
      if (e.group !== group) {
        group = e.group;
        const ours = group.startsWith("Guildhall");
        rows.push(div().pt(8).pb(3).px(10).font_family(ours ? TITLE : PX).text_size(ours ? 13 : 11)
          .text_color(ours ? WOOD.shine : t.dim).child(ours ? group.replace("Guildhall: ", "GUILDHALL  ") : group.toUpperCase()));
      }
      if (i === this.sel) this.rowIndex = rows.length;
      const on = i === this.sel;
      const k = keyFor(e, bound);
      rows.push(h_flex().id(`cmd-${i}`).h(30).px(10).gap(8).items_center().cursor_pointer()
        .bg(on ? WOOD.bevel : "#00000000").border_l(3).border_color(on ? WOOD.shine : "#00000000")
        .hover((s) => s.bg(on ? WOOD.bevel : "#5c5140"))
        .on_click(() => { this.sel = i; this.runSelected(); })
        .when(Boolean(e.icon), (el) => el.child(image(`${UI}/icons/${e.icon}.png`).w(20).h(20).flex_none()))
        .when(!e.icon, (el) => el.child(div().w(20).flex_none()))
        .child(div().flex_1().min_w(0).truncate().font_family(PX).text_size(13).text_color(on ? "#fff4e0" : t.foreground).child(e.title))
        .when(Boolean(k), (el) => el.child(div().px(5).bg("#131b1b").border(1).border_color(WOOD.bevel)
          .font_family(PX).text_size(11).text_color(t.muted).child(k))));
    });
    return v_flex().id("gh-palette").size_full().p(4).bg(WOOD.outline).track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(v_flex().size_full().p(3).bg(WOOD.rim)
        .child(v_flex().size_full().bg(WOOD.fill)
          .child(h_flex().p(10).gap(8).items_center().border_b(2).border_color(WOOD.bevel)
            .child(image(`${UI}/icons/Scroll.png`).w(28).h(28).flex_none())
            .child(Input.new(this.input).flex_1().h(32).px(8).bg("#2a251c").border(2).border_color(WOOD.bevel)
              .font_family(PX).text_size(14).text_color("#fff4e0")))
          .child(div().id("gh-palette-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).pb(6)
            .children(rows)
            .when(list.length === 0, (el) => el.child(div().p(12).font_family(PX).text_size(12).text_color(t.dim).child("No command matches."))))));
  }
}
