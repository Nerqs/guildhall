// Guildhall hero picker: a grid of every hero portrait (Ninja Adventure pack, CC0).
// Opened from a PARTY card's portrait with props { address }. Picking one saves it in the
// shared "guildhall.heroes" map, which every Guildhall mod reads; "Random" removes the pick.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, shared, setShared, theme } from "herdr";
import { ROSTER } from "./roster.js";

const PX = "PxPlus IBM VGA 8x16";
const HR = "mods/guildhall-agents/heroes";
// Leveling, as in guildhall-agents: level N needs N quests to reach N+1, up to 100.
const levelOf = (xp) => Math.min(100, Math.floor((1 + Math.sqrt(1 + 8 * Math.max(0, xp))) / 2));
// Wood colors come from the theme, so the theme picker recolors the frames:
// rim = border, shine = accent, bevel = selected, fill = chrome; the outline stays dark.
const WOOD = {
  outline: "#131b1b",
  get rim() { return theme().border; },
  get shine() { return theme().accent; },
  get bevel() { return theme().selected; },
  get fill() { return theme().chrome; },
};

export default class Picker extends View {
  init() { this.hovered = null; }

  pick(name) {
    const p = props() ?? {};
    const map = { ...(shared("guildhall.heroes") ?? {}) };
    if (name) map[p.address] = name; else delete map[p.address];
    setShared("guildhall.heroes", map);
    closeOverlay(p.overlay);
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const current = (shared("guildhall.heroes") ?? {})[p.address] ?? null;
    // Each hero's own level (1 XP per finished quest, a level every 5), shown when it has any XP.
    const xp = shared("guildhall.xp") ?? {};
    const cell = (name) => {
      const on = name === current;
      const lv = xp[name] ? levelOf(xp[name]) : 0;
      return div().id(`hero-${name}`).relative().size(56).flex_none().cursor_pointer()
        .bg(on ? WOOD.rim : "#2a251c").border(2).border_color(on ? WOOD.shine : this.hovered === name ? WOOD.rim : WOOD.outline)
        .flex().items_center().justify_center()
        .on_hover((h, cx) => { this.hovered = h ? name : this.hovered === name ? null : this.hovered; cx.notify(); })
        .on_click(() => this.pick(name))
        .child(image(`${HR}/${name}/face.png`).w(48).h(48))
        .when(lv > 0, (el) => el.child(div().absolute().bottom(1).right(1).px(2).bg(WOOD.outline).border(1).border_color(WOOD.shine)
          .font_family(PX).text_size(9).text_color(WOOD.shine).child(lv >= 100 ? "MAX" : `Lv ${lv}`)));
    };
    return v_flex().size_full().p(4).bg(WOOD.outline)
      .child(v_flex().size_full().p(3).bg(WOOD.rim)
        .child(v_flex().size_full().p(10).gap(8).bg(WOOD.fill)
          .child(h_flex().items_center().justify_between()
            .child(div().font_family("NinjaAdventure").text_size(16).text_color(WOOD.shine).child("HEROES"))
            .child(div().font_family(PX).text_size(12).text_color(t.muted)
              .child((() => { const n = this.hovered ?? current; return n ? `${n}${xp[n] ? `  Lv ${levelOf(xp[n]) >= 100 ? "MAX" : levelOf(xp[n])} (${xp[n]} XP)` : ""}` : "pick a hero for this agent"; })())))
          .child(div().id("hero-grid").flex_1().min_h(0).overflow_y_scrollbar()
            .child(h_flex().flex_wrap().gap(4).children(ROSTER.map(cell))))
          .child(h_flex().gap(8).justify_end()
            .child(div().id("hero-random").px(10).py(4).cursor_pointer().bg(current ? WOOD.bevel : "#2a251c")
              .border(2).border_color(WOOD.outline).font_family(PX).text_size(12).text_color("#fff4e0")
              .hover((s) => s.bg(WOOD.rim))
              .on_click(() => this.pick(null)).child("Random")))));
  }
}
