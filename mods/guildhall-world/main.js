// Guildhall overworld: a 112px strip where each agent's hero shows what it is doing, on one of
// several maps (shared "guildhall.map": village, camp, snowfield, shrine). Every map has the same
// landmarks: heroes that need you wait at the door on the left, working heroes walk the road,
// finished heroes cheer by the open chest, idle heroes rest by the campfire. Click a hero to go
// to it; click the map plate to change map. Art: Ninja Adventure (CC0), built by src/maps.ps1.

import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, run, theme, shared, setShared } from "herdr";

const ME = "mods/guildhall-world";
const HR = "mods/guildhall-agents/heroes";
const PX = "PxPlus IBM VGA 8x16";
const TITLE = "NinjaAdventure";
export const MAPS = ["village", "camp", "snowfield", "shrine"];
const HEROES = ["hunter", "princess", "knight", "sorcererblack", "oldman", "monk", "woman", "ninjagreen"];
const SIZE = 32;          // hero sprites: 16px drawn 2x, like the map
const STRIP_W = 1600;     // maps: 800x56 drawn 2x
const STRIP_H = 112;

// Same pick as guildhall-agents, so a hero looks the same everywhere.
function hero(addr) {
  let h = 0;
  for (const ch of addr ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // A hero picked by hand (the PARTY card's portrait) wins over the address pick.
  return shared("guildhall.heroes")?.[addr] ?? HEROES[h % HEROES.length];
}
// A stable small number per agent, to spread heroes inside their zone.
function seed(addr) {
  let h = 7;
  for (const ch of addr ?? "") h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// Zones in strip pixels (x range, sprite top), matching the landmarks every map shares.
const ZONE = {
  blocked: { x0: 60, x1: 170, top: 56 },
  working: { x0: 240, x1: 1080, top: 54 },
  done: { x0: 1150, x1: 1260, top: 54 },
  idle: { x0: 1320, x1: 1520, top: 40 },
};

function sprite(t, a, i) {
  const st = a.status === "error" ? "blocked" : ["working", "blocked", "done"].includes(a.status) ? a.status : "idle";
  const z = ZONE[st];
  const s = seed(a.address);
  let x = z.x0 + ((s + i * 37) % Math.max(1, z.x1 - z.x0));
  // Idle heroes sit on either side of the fire pit (x 1392-1456), not in it.
  if (st === "idle" && x > 1376 && x < 1460) x = x < 1418 ? 1356 : 1468;
  const h = hero(a.address);
  const pic = (f) => image(`${HR}/${h}/${f}.png`).absolute().top(0).left(0).w(SIZE).h(SIZE);
  const body = div().relative().w(SIZE).h(SIZE);
  if (st === "working") body.child(pic("walk1")).child(pic("walk3").loop("opacity", { from: 0, to: 1, period: 520, easing: "linear" }));
  else if (st === "idle") body.child(pic("idle").loop("top", { from: 0, to: 1, period: 2600 }));
  else body.child(pic("item"));
  const bubble = (name) => image(`mods/guildhall-hud/ui/emote-${name}.png`).absolute().top(-22).left(10).w(28).h(26);
  let el = div().id(`hero-${a.address}`).absolute().left(x).top(z.top).w(SIZE).h(SIZE).cursor_pointer()
    .on_click(() => run("pane.focus", { pane: a.pane }))
    .child(div().absolute().bottom(0).left(6).w(20).h(4).rounded(4).bg("#00000044"))
    .child(st === "working" ? body.loop("top", { from: 0, to: -2, period: 260 }) : body);
  // Working heroes stroll along the road.
  if (st === "working") el = el.loop("left", { from: x, to: Math.min(z.x1, x + 140 + (s % 90)), period: 5200 + (s % 2400), easing: "linear" });
  if (st === "blocked") el = el.child(bubble("blocked").loop("opacity", { from: 1, to: 0.2, period: 600 }));
  if (st === "done") el = el.child(bubble("done").loop("top", { from: -22, to: -27, period: 900 }));
  if (st === "idle") el = el.child(bubble("idle").loop("opacity", { from: 0.3, to: 1, period: 2400 }));
  return el;
}

export default class World extends View {
  init() { this.width = STRIP_W; }

  render() {
    const t = theme();
    const list = agents();
    const map = MAPS.includes(shared("guildhall.map")) ? shared("guildhall.map") : MAPS[0];
    const copies = Math.max(1, Math.ceil(this.width / STRIP_W));
    const next = () => setShared("guildhall.map", MAPS[(MAPS.indexOf(map) + 1) % MAPS.length]);
    return div().id("world").relative().size_full().overflow_hidden().bg("#46402e")
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .children(Array.from({ length: copies }, (_, i) => image(`${ME}/maps/${map}.png`).absolute().top(0).left(i * STRIP_W).w(STRIP_W).h(STRIP_H)))
      // The campfire on the pit: two flame frames trading places.
      .child(div().absolute().left(1412).top(34).w(24).h(24)
        .child(image(`${ME}/maps/fire0.png`).absolute().top(0).left(0).w(24).h(24))
        .child(image(`${ME}/maps/fire1.png`).absolute().top(0).left(0).w(24).h(24).loop("opacity", { from: 0, to: 1, period: 360, easing: "linear" })))
      .children(list.map((a, i) => sprite(t, a, i)))
      .child(h_flex().id("map-plate").absolute().top(4).left(6).px(6).py(1).gap(6).items_center().cursor_pointer()
        .bg("#131b1bdd").border(1).border_color("#f06733").hover((s) => s.border_color("#ffad55"))
        .tooltip("Change map").on_click(next)
        .child(div().font_family(TITLE).text_size(12).text_color("#ffad55").child("MAP"))
        .child(div().font_family(PX).text_size(11).text_color("#fff4e0").child(map)));
  }
}
