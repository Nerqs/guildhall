// Guildhall toast: every notification as an RPG dialog box, styled after the Ninja Adventure
// pack's portrait dialog (CC0): a dark portrait frame on the left, a light speech box with an
// orange rim on the right. When the notification is about an agent, its hero speaks.
// Click runs its action (e.g. go to the agent) and dismisses it.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, panes, agents, shared } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const HR = "mods/guildhall-agents/heroes";
const UI = "mods/guildhall-hud/ui";
const HEROES = ["hunter", "princess", "knight", "sorcererblack", "oldman", "monk", "woman", "ninjagreen"];
const INK = "#1b1420";

function hero(addr) {
  let h = 0;
  for (const ch of addr ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // A hero picked by hand (the PARTY card's portrait) wins over the address pick.
  return shared("guildhall.heroes")?.[addr] ?? HEROES[h % HEROES.length];
}

// The agent a notification is about: its action's terminal, or the terminal in its pane.
function agentOf(p) {
  const args = p.action?.args ?? {};
  if (args.terminal) return args.terminal;
  if (args.pane) return panes().find((x) => x.pane === args.pane)?.terminal ?? null;
  return null;
}

// Status emote from the notification's level, or from the agent's live status.
function emoteFor(p, addr) {
  const live = addr ? agents().find((a) => a.address === addr)?.status : null;
  if (live === "blocked" || live === "error" || p.level === "error" || p.level === "warning") return "blocked";
  if (live === "done" || p.level === "success") return "done";
  return "working";
}

export default class Toast extends View {
  render() {
    const t = theme();
    const p = props() ?? {};
    const addr = agentOf(p);
    const portrait = addr
      ? image(`${HR}/${hero(addr)}/face.png`).w(56).h(56)
      : image(`${UI}/emote-${emoteFor(p, null)}.png`).w(42).h(39);
    const em = emoteFor(p, addr);
    return h_flex().id("toast").size_full().p(4).gap(6).items_center().bg(INK).cursor_pointer()
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      // Portrait frame: dark inset with a grey-green rim.
      .child(div().relative().size(64).flex_none().bg("#141b1b").border(3).border_color("#8fa89a")
        .flex().items_center().justify_center().child(portrait)
        .when(Boolean(addr), (el) => el.child(image(`${UI}/emote-${em}.png`).absolute().top(-6).right(-10).w(28).h(26)
          .when(em === "blocked", (e) => e.loop("opacity", { from: 1, to: 0.25, period: 600 })))))
      // Speech box: light paper with an orange rim.
      .child(h_flex().flex_1().h_full().min_w(0).px(10).gap(8).items_center().bg("#efe9f0").border(3).border_color("#f39a52")
        .hover((s) => s.border_color("#f8c060"))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().truncate().font_family(PX).text_size(14).text_color("#a8401c").child(p.title ?? ""))
          .when(Boolean(p.body), (el) => el.child(div().truncate().font_family(PX).text_size(12).text_color("#3a2a30").child(p.body))))
        .child(div().flex_none().self_end().mb(4).font_family(PX).text_size(12).text_color("#a8401c")
          .loop("opacity", { from: 1, to: 0, period: 800 }).child("▼")));
  }
}
