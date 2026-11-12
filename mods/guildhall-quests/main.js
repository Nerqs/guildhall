// Guildhall quest board: the shown space's quests on a wood board, in the side panel next to
// Files and Changes. Write a quest (and, optionally, details for the hero), press Enter.
// "Send hero" opens a new tab named after the quest with an agent that gets the quest as its
// first message; the row then shows that hero and its status, and ticks itself when the hero
// finishes. Click the box to finish or reopen a quest by hand; x removes it.
// Quests are kept per space in shared "guildhall.quests":
//   { [spaceId]: [{ id, text, details, done, sent?: { tab, name, worked } }] }
// Wood, checkboxes and emotes: Ninja Adventure (CC0).

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { focused, spaces, agents, shared, setShared, theme, run } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
const UI = "mods/guildhall-hud/ui";
const HR = "mods/guildhall-agents/heroes";
const WOOD = { outline: "#131b1b", rim: "#f06733", shine: "#ffad55", bevel: "#9b513c", fill: "#46402e" };
const HEROES = ["hunter", "princess", "knight", "sorcererblack", "oldman", "monk", "woman", "ninjagreen"];
// The agent a quest is sent to.
const AGENT = ["claude"];

// Same pick as guildhall-agents: a hand pick, else the address hash.
function hero(addr) {
  let h = 0;
  for (const ch of addr ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return shared("guildhall.heroes")?.[addr] ?? HEROES[h % HEROES.length];
}

// The message the hero gets: the quest, then its details.
const brief = (q) => (q.details ? `${q.text}\n\n${q.details}` : q.text);

export default class Quests extends View {
  init(_p, cx) {
    this.title = InputState.new({ placeholder: "New quest" });
    this.details = InputState.new({ placeholder: "Details for the hero (optional)" });
    const add = (cx) => {
      const text = this.title.value().trim();
      if (!text) return;
      const details = this.details.value().trim();
      this.update((list) => [...list, { id: `${Date.now()}`, text, details, done: false }]);
      this.title.set_value("");
      this.details.set_value("");
      this.title.focus();
      cx.notify();
    };
    this.title.on("submit", (_e, cx) => add(cx));
    this.details.on("submit", (_e, cx) => add(cx));
    this.migrate();
    // Follow the heroes on their quests: a quest whose hero worked and then stopped is done.
    cx.timer.every(3000, () => this.follow());
  }

  space() { return focused()?.space ?? null; }

  list() { return (shared("guildhall.quests") ?? {})[this.space()] ?? []; }

  update(fn, space = this.space()) {
    if (!space) return;
    const all = { ...(shared("guildhall.quests") ?? {}) };
    const next = fn(all[space] ?? []);
    if (next.length) all[space] = next; else delete all[space];
    // Drop boards of spaces that no longer exist.
    const live = new Set(spaces().map((s) => s.id));
    for (const k of Object.keys(all)) if (!live.has(k)) delete all[k];
    setShared("guildhall.quests", all);
  }

  // Boards used to be per tab: move each one to its tab's space.
  migrate() {
    const all = shared("guildhall.quests") ?? {};
    const tabSpace = new Map(spaces().flatMap((s) => s.tabs.map((t) => [t.id, s.id])));
    if (!Object.keys(all).some((k) => tabSpace.has(k))) return;
    const moved = {};
    for (const [k, list] of Object.entries(all)) {
      const sp = tabSpace.get(k) ?? k;
      moved[sp] = [...(moved[sp] ?? []), ...list];
    }
    setShared("guildhall.quests", moved);
  }

  // The agent working on a sent quest: the agent in the tab it was sent to.
  agentFor(q) {
    if (!q.sent) return null;
    return agents().find((a) => a.tab === q.sent.tab) ?? null;
  }

  // Resolve sent quests to their tab, note when their hero starts working, and tick them when it stops.
  follow() {
    const all = shared("guildhall.quests") ?? {};
    let changed = false;
    const next = {};
    for (const [sp, list] of Object.entries(all)) {
      const space = spaces().find((s) => s.id === sp);
      next[sp] = list.map((q) => {
        if (!q.sent || q.done) return q;
        let sent = q.sent;
        if (!sent.tab) {
          const tab = space?.tabs.find((t) => t.name === sent.name);
          if (!tab) return q;
          sent = { ...sent, tab: tab.id };
        }
        const a = agents().find((x) => x.tab === sent.tab);
        if (a?.status === "working" && !sent.worked) sent = { ...sent, worked: true };
        const finished = sent.worked && (a?.status === "idle" || a?.status === "done");
        if (sent !== q.sent || finished) { changed = true; return { ...q, sent, done: finished || q.done }; }
        return q;
      });
    }
    if (changed) setShared("guildhall.quests", next);
  }

  // Opens a tab named after the quest, with the agent and the quest as its first message.
  send(q) {
    const space = spaces().find((s) => s.id === this.space());
    const taken = new Set(space?.tabs.map((t) => t.name) ?? []);
    let name = q.text.length > 28 ? `${q.text.slice(0, 27)}…` : q.text;
    for (let n = 2; taken.has(name); n++) name = `${name.replace(/ #\d+$/, "")} #${n}`;
    run("tab.new", { name, space: this.space(), argv: AGENT, task: brief(q) });
    this.update((l) => l.map((x) => (x.id === q.id ? { ...x, sent: { tab: null, name, worked: false } } : x)));
  }

  render() {
    const t = theme();
    const list = this.list();
    const done = list.filter((q) => q.done).length;
    const space = spaces().find((s) => s.id === this.space());
    const place = !space?.name || space.name === "~" ? "Home" : space.name;
    const input = (state, h) => Input.new(state).h(h).px(8).bg("#2a251c").border(2).border_color(WOOD.bevel)
      .font_family(PX).text_size(13).text_color("#fff4e0");

    const row = (q) => {
      const a = this.agentFor(q);
      const st = a?.status === "error" ? "blocked" : a?.status;
      return v_flex().id(`quest-${q.id}`).py(5).px(6).gap(3).border_b(1).border_color("#5c5140")
        .child(h_flex().gap(8).items_center()
          .child(div().id(`quest-box-${q.id}`).flex_none().cursor_pointer()
            .on_click(() => this.update((l) => l.map((x) => (x.id === q.id ? { ...x, done: !x.done } : x))))
            .child(image(`${UI}/wood/${q.done ? "checked" : "unchecked"}.png`).w(24).h(24)))
          .child(div().flex_1().min_w(0).font_family(PX).text_size(13)
            .text_color(q.done ? t.dim : "#fff4e0").when(q.done, (el) => el.line_through()).child(q.text))
          // Not sent yet: the Send button. Sent: the hero on it, with its status; click goes there.
          .when(!q.sent && !q.done, (el) => el.child(div().id(`quest-send-${q.id}`).flex_none().px(6).py(2).cursor_pointer()
            .bg(WOOD.rim).border(1).border_color(WOOD.outline).hover((s) => s.bg(WOOD.shine))
            .font_family(PX).text_size(11).text_color("#1b1420").tooltip("Open a new tab with an agent on this quest")
            .on_click(() => this.send(q)).child("Send hero")))
          .when(Boolean(q.sent), (el) => el.child(h_flex().id(`quest-hero-${q.id}`).flex_none().gap(2).items_center()
            .when(Boolean(a), (e) => e.cursor_pointer().on_click(() => run("pane.focus", { pane: a.pane })))
            .tooltip(a ? `On this quest: ${q.sent.name}` : q.done ? "Quest finished" : "The hero is on the way…")
            .child(a ? div().border(1).border_color(WOOD.outline).child(image(`${HR}/${hero(a.address)}/face.png`).w(24).h(24))
              : image(`${UI}/icons/Boot.png`).w(20).h(20))
            .when(Boolean(st), (e) => e.child(image(`${UI}/emote-${st === "blocked" ? "blocked" : st === "working" ? "working" : st === "done" ? "done" : "idle"}.png`).w(20).h(19)
              .when(st === "blocked", (x) => x.loop("opacity", { from: 1, to: 0.25, period: 600 }))))))
          .child(div().id(`quest-x-${q.id}`).flex_none().px(4).cursor_pointer().font_family(PX).text_size(12)
            .text_color(t.dim).hover((s) => s.text_color(t.blocked))
            .on_click(() => this.update((l) => l.filter((x) => x.id !== q.id))).child("x")))
        .when(Boolean(q.details), (el) => el.child(div().pl(32).font_family(PX).text_size(11).text_color(t.dim)
          .when(q.done, (e) => e.line_through()).child(q.details)));
    };

    return v_flex().size_full().p(4).bg(WOOD.outline)
      .child(v_flex().size_full().p(3).bg(WOOD.rim)
        .child(v_flex().size_full().p(12).gap(8).bg(WOOD.fill)
          .child(h_flex().items_center().justify_between()
            .child(h_flex().gap(8).items_center()
              .child(image(`${UI}/icons/Scroll.png`).w(32).h(32))
              .child(v_flex()
                .child(div().font_family(TITLE).text_size(16).text_color(WOOD.shine).child("QUESTS"))
                .child(div().font_family(PX).text_size(11).text_color(t.muted).child(place))))
            .child(div().font_family(PX).text_size(12).text_color(t.muted).child(`${done}/${list.length}`)))
          .child(input(this.title, 32))
          .child(input(this.details, 28))
          .child(div().font_family(PX).text_size(10).text_color(t.dim).child("Enter adds the quest. Send hero puts an agent on it."))
          .child(div().id("quest-list").flex_1().min_h(0).overflow_y_scrollbar()
            .child(v_flex().children(list.map(row)))
            .when(list.length === 0, (el) => el.child(div().pt(8).font_family(PX).text_size(12).text_color(t.dim)
              .child("No quests on this board yet."))))));
  }
}
