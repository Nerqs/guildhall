// Guildhall side bar fold: a small wood button under Settings and Add machine that turns the
// side bar into its rail (map icons, hero squares, footer icons) and back.
// The rail goes by width (the sidebar mods draw it under 160px), so dragging the edge works too.

import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, run, shared, setShared, theme, themes } from "herdr";

const PX = "PxPlus IBM VGA 8x16";
const RAIL_PX = 64;
const SIZE = 20;

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}
const sidebarPx = () => findNode(layout(), "sidebar")?.size?.px ?? 280;

// The same toggle as guildhall-hud's "compact-sidebar" command; the wide width is kept in shared "sidebar.width".
function toggleRail() {
  const px = sidebarPx();
  if (px >= 160) { setShared("sidebar.width", px); run("layout.resize", { id: "sidebar", px: RAIL_PX }); }
  else run("layout.resize", { id: "sidebar", px: Math.max(160, shared("sidebar.width") ?? 280) });
}

// The wood art in the shown theme's colors (as guildhall-hud picks it).
function woodArt(piece) {
  const t = theme();
  const name = themes().find((x) => x.name.startsWith("guildhall") && x.colors.border === t.border
    && x.colors.accent === t.accent && x.colors.chrome === t.chrome)?.name ?? null;
  const skin = name && name.startsWith("guildhall-") ? `${name}/` : "";
  return `mods/guildhall-hud/ui/wood/${skin}${piece}.png`;
}

export default class Fold extends View {
  init() { this.hovered = false; this.pressed = false; }

  render() {
    const t = theme();
    const rail = sidebarPx() < 160;
    const state = this.pressed ? "pressed" : this.hovered ? "hover" : "normal";
    const button = div().id("fold").relative().w(SIZE).h(SIZE).flex_none().cursor_pointer()
      .tooltip(rail ? "Widen the side bar" : "Narrow the side bar to icons")
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.pressed = true; cx.notify(); })
      .on_mouse_up("left", (_e, cx) => { this.pressed = false; cx.notify(); })
      .on_hover((on, cx) => { this.hovered = on; if (!on) this.pressed = false; cx.notify(); })
      .on_click(() => toggleRail())
      .child(image(woodArt(`button-sq-${state}`)).absolute().top(0).left(0).w(SIZE).h(SIZE))
      .child(div().absolute().top(this.pressed ? 1 : 0).left(0).w(SIZE).h(SIZE).flex().items_center().justify_center()
        .font_family(PX).text_size(12).text_color(t.accent_foreground ?? "#3a1e10").child(rail ? "►" : "◄"));
    return h_flex().size_full().bg(t.chrome).items_center().pb(4)
      .when(rail, (el) => el.justify_center())
      .when(!rail, (el) => el.justify_end().pr(10))
      .child(button);
  }
}
