// Guildhall quest board: the shown tab's quests on a wood board, in the side panel next to
// Files and Changes. Type a quest and press Enter; click the box to finish it (struck through);
// x removes it. Quests are kept per tab in shared "guildhall.quests" ({ [tabId]: [{ id, text, done }] }).
// Wood and checkboxes: Ninja Adventure "Theme Wood" (CC0).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { focused, spaces, shared, setShared, theme } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
const UI = "mods/guildhall-hud/ui";
const WOOD = { outline: "#131b1b", rim: "#f06733", shine: "#ffad55", bevel: "#9b513c", fill: "#46402e" };

export default class Quests extends View {
  init() {
    this.input = InputState.new({ placeholder: "New quest, then Enter" });
    this.input.on("submit", (_e, cx) => {
      const text = this.input.value().trim();
      if (!text) return;
      this.update((list) => [...list, { id: `${Date.now()}`, text, done: false }]);
      this.input.set_value("");
      cx.notify();
    });
  }

  tab() { return focused()?.tab ?? null; }

  list() { return (shared("guildhall.quests") ?? {})[this.tab()] ?? []; }

  update(fn) {
    const tab = this.tab();
    if (!tab) return;
    const all = { ...(shared("guildhall.quests") ?? {}) };
    const next = fn(all[tab] ?? []);
    if (next.length) all[tab] = next; else delete all[tab];
    // Drop boards of tabs that no longer exist.
    const live = new Set(spaces().flatMap((s) => s.tabs.map((x) => x.id)));
    for (const k of Object.keys(all)) if (!live.has(k)) delete all[k];
    setShared("guildhall.quests", all);
  }

  render() {
    const t = theme();
    const list = this.list();
    const done = list.filter((q) => q.done).length;
    const tabName = spaces().flatMap((s) => s.tabs).find((x) => x.id === this.tab())?.name ?? "";
    const row = (q) => h_flex().id(`quest-${q.id}`).gap(8).items_center().py(4).px(6)
      .border_b(1).border_color("#5c5140")
      .child(div().id(`quest-box-${q.id}`).flex_none().cursor_pointer()
        .on_click(() => this.update((l) => l.map((x) => (x.id === q.id ? { ...x, done: !x.done } : x))))
        .child(image(`${UI}/wood/${q.done ? "checked" : "unchecked"}.png`).w(24).h(24)))
      .child(div().flex_1().min_w(0).font_family(PX).text_size(13)
        .text_color(q.done ? t.dim : "#fff4e0").when(q.done, (el) => el.line_through()).child(q.text))
      .child(div().id(`quest-x-${q.id}`).flex_none().px(4).cursor_pointer().font_family(PX).text_size(12)
        .text_color(t.dim).hover((s) => s.text_color(t.blocked))
        .on_click(() => this.update((l) => l.filter((x) => x.id !== q.id))).child("x"));
    return v_flex().size_full().p(4).bg(WOOD.outline)
      .child(v_flex().size_full().p(3).bg(WOOD.rim)
        .child(v_flex().size_full().p(12).gap(10).bg(WOOD.fill)
          .child(h_flex().items_center().justify_between()
            .child(h_flex().gap(8).items_center()
              .child(image(`${UI}/icons/Scroll.png`).w(32).h(32))
              .child(v_flex()
                .child(div().font_family(TITLE).text_size(16).text_color(WOOD.shine).child("QUESTS"))
                .child(div().font_family(PX).text_size(11).text_color(t.muted).child(tabName ? `chapter ${tabName}` : ""))))
            .child(div().font_family(PX).text_size(12).text_color(t.muted).child(`${done}/${list.length}`)))
          .child(Input.new(this.input).h(34).px(8).bg("#2a251c").border(2).border_color(WOOD.bevel)
            .font_family(PX).text_size(13).text_color("#fff4e0"))
          .child(div().id("quest-list").flex_1().min_h(0).overflow_y_scrollbar()
            .child(v_flex().children(list.map(row)))
            .when(list.length === 0, (el) => el.child(div().pt(8).font_family(PX).text_size(12).text_color(t.dim)
              .child("No quests on this board yet."))))));
  }
}
