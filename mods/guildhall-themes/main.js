// Guildhall theme picker: every "guildhall*" theme as a card with swatches of its own colors.
// Click a card to apply it to the shown layout (app.theme). The wood frames, cards and panels
// follow at once, because the Guildhall mods read their colors from the theme.
// Opened from the palette or with Ctrl+Shift+G.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { themes, theme, run, layout, props, closeOverlay } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
// Names and order shown in the picker; anything else named guildhall-* follows.
const NAMES = {
  guildhall: "Wood", "guildhall-forest": "Forest", "guildhall-tokyo": "Tokyo Night",
  "guildhall-catppuccin": "Catppuccin", "guildhall-dracula": "Dracula", "guildhall-gruvbox": "Gruvbox",
  "guildhall-nord": "Nord", "guildhall-rosepine": "Rosé Pine",
};

export default class Themes extends View {
  init() { this.hovered = null; }

  render() {
    const t = theme();
    const current = typeof layout()?.theme === "string" ? layout().theme : null;
    const order = Object.keys(NAMES);
    const list = themes().filter((x) => x.name.startsWith("guildhall"))
      .sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
    const swatch = (c) => div().w(14).h(14).bg(c).border(1).border_color("#131b1b");
    const card = (x) => {
      const c = x.colors;
      const on = x.name === current;
      return v_flex().id(`theme-${x.name}`).w(124).flex_none().p(3).gap(0).cursor_pointer()
        .bg("#131b1b")
        .on_hover((h, cx) => { this.hovered = h ? x.name : this.hovered === x.name ? null : this.hovered; cx.notify(); })
        .on_click(() => { run("app.theme", { name: x.name }); closeOverlay(props()?.overlay); })
        // A tiny wood frame in the theme's own colors.
        .child(v_flex().p(2).bg(on || this.hovered === x.name ? c.accent : c.border)
          .child(v_flex().p(8).gap(6).bg(c.chrome)
            .child(div().font_family(PX).text_size(12).text_color(c.accent).child(NAMES[x.name] ?? x.name.replace("guildhall-", "")))
            .child(div().h(18).bg(c.background).border(1).border_color(c.selected).px(4).flex().items_center()
              .font_family(PX).text_size(10).text_color(c.foreground).child("> quest"))
            .child(h_flex().gap(2).children([c.working, c.blocked, c.done, c.idle, c.selected].map(swatch)))))
        .when(on, (el) => el.child(div().pt(2).font_family(PX).text_size(10).text_color(c.accent).child("in use")));
    };
    return v_flex().size_full().p(4).bg("#131b1b")
      .child(v_flex().size_full().p(3).bg(t.border)
        .child(v_flex().size_full().p(12).gap(10).bg(t.chrome)
          .child(h_flex().items_center().justify_between()
            .child(div().font_family(TITLE).text_size(16).text_color(t.accent).child("COLORS"))
            .child(div().font_family(PX).text_size(11).text_color(t.muted).child("Pick the guild's colors")))
          .child(div().id("theme-grid").flex_1().min_h(0).overflow_y_scrollbar()
            .child(h_flex().flex_wrap().gap(8).children(list.map(card))))));
  }
}
