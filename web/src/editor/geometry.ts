/**
 * Screen geometry for the editor canvas.
 *
 * Coordinates are UIParent units: origin at the bottom-left of the screen, y grows upward,
 * exactly like WoW. A 1920x1080 display at the default UI scale is a 1920x1080 UIParent.
 *
 * Positioning rules mirror Blizzard_EditMode (forever branch):
 *  - A system with isInDefaultPosition=false sits where its anchor says.
 *  - The bottom action bar stack (MainActionBar, status bars, Bar2/Bar3, stance/pet/possess…)
 *    is laid out by EditModeManagerFrame:UpdateBottomActionBarPositions relative to the main
 *    bar when in default position (ACTION_BARS_RELATIVE_TO_BASE_POSITIONING).
 *  - MultiBarRight/MultiBarLeft in default position stack against the right screen edge.
 *  - BottomManagedFrameTemplate / RightManagedFrameTemplate frames in default position are
 *    laid out by the managed frame containers (ManagedFrameSystem.lua + FramePositionDelegate).
 */
import type { Anchor, AnchorPoint, Layout, LayoutSystem } from "../editmode/layoutString";
import { type FrameDef, type Footprint, frameDef, frameDefByName, frameKey, makeGetter } from "../editmode/frames";

export interface Screen {
  /** UIParent width/height in UI units */
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export type PlacementMode = "anchor" | "bottomStack" | "rightStack" | "managedBottom" | "managedRight" | "managedPlayer";

export interface Placed {
  key: string;
  sys: LayoutSystem;
  def: FrameDef;
  footprint: Footprint;
  rect: Rect;
  mode: PlacementMode;
}

// Forever layout constants (Blizzard_EditMode/Camelot/EditModePresetLayoutConstants.lua)
const BOTTOM_ACTION_BARS_SPACER_Y = 4;
const PRIMARY_AND_SECONDARY_STATUS_TRACKING_BAR_SPACER_Y = -1;
const BOTTOM_ACTION_BAR_DEFAULT_OFFSET_X = 30;
const BOTTOM_BAR_OFFSET_X: Record<number, number> = { 2: 22, 3: 606, 11: 30, 12: 30, 13: 30, 25: 30 };
const BOTTOM_BAR_EXCLUDE_FROM_STACK: Record<number, boolean> = { 3: true };
const RIGHT_ACTION_BAR_DEFAULT_OFFSET_X = -5;
const RIGHT_ACTION_BAR_DEFAULT_OFFSET_Y = -77;
const RIGHT_ACTION_BAR_DEFAULT_PADDING_X = 0;
const RIGHT_CONTAINER_OFFSET_Y = -260;
const BOTTOM_FRAME_CONTAINER_MARGIN = 15;
const MANAGED_SPACING = 10;

export function screenRect(screen: Screen): Rect {
  return { left: 0, bottom: 0, width: screen.width, height: screen.height };
}

/** Absolute coordinates of one of the nine anchor points of a rect. */
export function pointOf(rect: Rect, point: AnchorPoint): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.bottom + rect.height / 2;
  const right = rect.left + rect.width;
  const top = rect.bottom + rect.height;
  switch (point) {
    case "TOPLEFT": return { x: rect.left, y: top };
    case "TOP": return { x: cx, y: top };
    case "TOPRIGHT": return { x: right, y: top };
    case "LEFT": return { x: rect.left, y: cy };
    case "CENTER": return { x: cx, y: cy };
    case "RIGHT": return { x: right, y: cy };
    case "BOTTOMLEFT": return { x: rect.left, y: rect.bottom };
    case "BOTTOM": return { x: cx, y: rect.bottom };
    case "BOTTOMRIGHT": return { x: right, y: rect.bottom };
  }
}

/** Rect of a `width`x`height` frame whose `point` sits at absolute (x, y). */
export function rectFromPoint(point: AnchorPoint, x: number, y: number, width: number, height: number): Rect {
  let left = x;
  let bottom = y;
  if (point === "TOP" || point === "CENTER" || point === "BOTTOM") left = x - width / 2;
  else if (point.endsWith("RIGHT")) left = x - width;
  if (point === "LEFT" || point === "CENTER" || point === "RIGHT") bottom = y - height / 2;
  else if (point.startsWith("TOP")) bottom = y - height;
  return { left, bottom, width, height };
}

export function scaledSize(fp: Footprint): { width: number; height: number } {
  return { width: fp.w * fp.scale, height: fp.h * fp.scale };
}

/**
 * Convert a dragged frame's rect to the anchor the game would store after StopMovingOrSizing:
 * the frame is anchored to UIParent at the point matching the screen third its center lies in,
 * relativePoint == point, offsets rounded to one decimal.
 */
export function anchorFromRect(rect: Rect, screen: Screen): Anchor {
  const c = pointOf(rect, "CENTER");
  const col = c.x < screen.width / 3 ? "LEFT" : c.x > (screen.width * 2) / 3 ? "RIGHT" : "";
  const row = c.y > (screen.height * 2) / 3 ? "TOP" : c.y < screen.height / 3 ? "BOTTOM" : "";
  const point = ((row + col) || "CENTER") as AnchorPoint;
  const fp = pointOf(rect, point);
  const sp = pointOf(screenRect(screen), point);
  return {
    point,
    relativeTo: "UIParent",
    relativePoint: point,
    offsetX: round1(fp.x - sp.x),
    offsetY: round1(fp.y - sp.y),
  };
}

export function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/** Re-express a frame's current rect as an anchor with the given point/relativeTo, keeping it in place. */
export function reanchorRect(rect: Rect, point: AnchorPoint, relativeTo: string, relativePoint: AnchorPoint, rects: Map<string, Placed>, screen: Screen): Anchor {
  const target = targetRect(relativeTo, rects, screen);
  const fp = pointOf(rect, point);
  const tp = pointOf(target, relativePoint);
  return { point, relativeTo, relativePoint, offsetX: round1(fp.x - tp.x), offsetY: round1(fp.y - tp.y) };
}

function targetRect(relativeTo: string, rects: Map<string, Placed>, screen: Screen): Rect {
  if (relativeTo === "UIParent") return screenRect(screen);
  const def = frameDefByName(relativeTo);
  if (def) {
    const placed = rects.get(def.key);
    if (placed) return placed.rect;
  }
  const alias = aliasRect(relativeTo, rects, screen);
  return alias ?? screenRect(screen);
}

/** Frames that layouts anchor to but that are not Edit Mode systems themselves. */
function aliasRect(name: string, rects: Map<string, Placed>, screen: Screen): Rect | null {
  switch (name) {
    case "Minimap": {
      const cluster = rects.get(frameKey(2, null))?.rect;
      if (!cluster) return null;
      const s = cluster.width / 256;
      // The round map sits in the upper part of the 256x256 cluster.
      return { left: cluster.left + 29 * s, bottom: cluster.bottom + 38 * s, width: 198 * s, height: 198 * s };
    }
    case "CompactRaidFrameManager":
      // Collapsed raid manager tab at the left edge: TOPRIGHT of the 222x140 frame at (40, top-140)
      return { left: 40 - 222, bottom: screen.height - 140 - 140, width: 222, height: 140 };
    case "MicroButtonAndBagsBar": {
      const micro = rects.get(frameKey(13, null))?.rect;
      return micro ?? null;
    }
    case "PlayerCastingBarFrame":
    case "MainMenuBar":
      return null;
    default:
      return null;
  }
}

export interface LayoutOptions {
  /** Whether a frame is shown in game (drives managed stacks). Defaults to the frame's defaultVisible. */
  isShown?: (key: string) => boolean;
}

/**
 * Compute the rect of every known system in the layout. Unknown systems (ids this build does
 * not know) are skipped. Frames remain resolvable as relativeTo targets even when hidden.
 */
export function computeRects(layout: Layout, screen: Screen, opts: LayoutOptions = {}): Map<string, Placed> {
  const isShown = opts.isShown ?? ((key: string) => rectsEntries.get(key)?.def.defaultVisible ?? false);
  const rectsEntries = new Map<string, { sys: LayoutSystem; def: FrameDef; footprint: Footprint }>();
  for (const sys of layout.systems) {
    const def = frameDef(sys.system, sys.systemIndex);
    if (!def) continue;
    const footprint = def.size(makeGetter(sys.system, sys.settings));
    rectsEntries.set(def.key, { sys, def, footprint });
  }

  const out = new Map<string, Placed>();
  const resolving = new Set<string>();
  const gamepad = layout.interfaceStyle === 1;

  const resolve = (key: string): Placed | undefined => {
    const hit = out.get(key);
    if (hit) return hit;
    const entry = rectsEntries.get(key);
    if (!entry) return undefined;
    if (resolving.has(key)) {
      // Anchor cycle: fall back to the screen center so everything still renders.
      return place(entry, rectFromPoint("CENTER", screen.width / 2, screen.height / 2, ...sizeTuple(entry.footprint)), "anchor");
    }
    resolving.add(key);
    try {
      const { sys, def } = entry;
      if (sys.isInDefaultPosition && !gamepad && def.bottomStackOrder !== undefined) {
        layoutBottomStack();
        const p = out.get(key);
        if (p) return p;
      }
      if (sys.isInDefaultPosition && !gamepad && def.rightStackOrder !== undefined) {
        layoutRightStack();
        const p = out.get(key);
        if (p) return p;
      }
      if (sys.isInDefaultPosition && def.managed && isShown(key)) {
        if (def.managed.container === "bottom") layoutManaged("bottom");
        else if (def.managed.container === "right") layoutManaged("right");
        else layoutPetFrame();
        const p = out.get(key);
        if (p) return p;
      }
      return place(entry, anchoredRect(entry, sys.anchor), "anchor");
    } finally {
      resolving.delete(key);
    }
  };

  const sizeTuple = (fp: Footprint): [number, number] => {
    const s = scaledSize(fp);
    return [s.width, s.height];
  };

  const place = (entry: { sys: LayoutSystem; def: FrameDef; footprint: Footprint }, rect: Rect, mode: PlacementMode): Placed => {
    const placed: Placed = { key: entry.def.key, sys: entry.sys, def: entry.def, footprint: entry.footprint, rect, mode };
    out.set(entry.def.key, placed);
    return placed;
  };

  const relativeRect = (name: string): Rect => {
    if (name === "UIParent") return screenRect(screen);
    const def = frameDefByName(name);
    if (def && rectsEntries.has(def.key)) {
      const p = resolve(def.key);
      if (p) return p.rect;
    }
    if (name === "Minimap") resolve(frameKey(2, null));
    if (name === "MicroButtonAndBagsBar") resolve(frameKey(13, null));
    return aliasRect(name, out, screen) ?? screenRect(screen);
  };

  const anchoredRect = (entry: { footprint: Footprint }, anchor: Anchor): Rect => {
    const target = relativeRect(anchor.relativeTo);
    const tp = pointOf(target, anchor.relativePoint);
    const [w, h] = sizeTuple(entry.footprint);
    return rectFromPoint(anchor.point, tp.x + anchor.offsetX, tp.y + anchor.offsetY, w, h);
  };

  // ---- Forever bottom action bar stack --------------------------------------------------
  let bottomStackDone = false;
  let bar2StackY: number | null = null;
  const layoutBottomStack = () => {
    if (bottomStackDone) return;
    bottomStackDone = true;
    const members = [...rectsEntries.values()]
      .filter((e) => e.def.bottomStackOrder !== undefined)
      .sort((a, b) => (a.def.bottomStackOrder ?? 0) - (b.def.bottomStackOrder ?? 0));
    const base = members.find((e) => e.def.bottomStackOrder === 1);
    if (!base) return;
    // The base bar sits at its layout anchor whether or not it is in default position.
    const baseRect = out.get(base.def.key)?.rect ?? anchoredRect(base, base.sys.anchor);
    if (base.sys.isInDefaultPosition) place(base, baseRect, "bottomStack");
    let stackY = 0;
    if (isShown(base.def.key) && !base.sys.isInDefaultPosition) stackY += baseRect.height + BOTTOM_ACTION_BARS_SPACER_Y;

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!isShown(m.def.key) || !m.sys.isInDefaultPosition) continue;
      const idx = m.def.systemIndex ?? -1;
      const isStatus = m.def.system === 15;
      const xOffset = isStatus ? 0 : (BOTTOM_BAR_OFFSET_X[m.def.system === 25 ? 25 : idx] ?? (m.def.system === 9 ? BOTTOM_ACTION_BAR_DEFAULT_OFFSET_X : 0));
      const exclude = !isStatus && !!BOTTOM_BAR_EXCLUDE_FROM_STACK[idx];
      const [w, h] = sizeTuple(m.footprint);
      if (m !== base) {
        // Status bars are centered on the main bar + micro menu + bags group rather than left aligned.
        const left = isStatus ? centerOfBottomUI(baseRect) - w / 2 : baseRect.left + xOffset;
        place(m, { left, bottom: baseRect.bottom + stackY, width: w, height: h }, "bottomStack");
      }
      if (m.def.system === 0 && idx === 2) bar2StackY = stackY;
      if (!exclude) {
        const next = members[i + 1];
        const secondaryThenMain = m.def.system === 15 && idx === 2 && next?.def.system === 15 && next.def.systemIndex === 1;
        stackY += h + (secondaryThenMain ? PRIMARY_AND_SECONDARY_STATUS_TRACKING_BAR_SPACER_Y : BOTTOM_ACTION_BARS_SPACER_Y);
      }
    }
  };

  /** Center x of the main bar + micro menu + bags group, which is what the XP bar is centered on. */
  const centerOfBottomUI = (baseRect: Rect): number => {
    const micro = out.get(frameKey(13, null)) ?? resolve(frameKey(13, null));
    const bags = out.get(frameKey(14, null)) ?? resolve(frameKey(14, null));
    const left = baseRect.left;
    const right = bags?.rect ? bags.rect.left + bags.rect.width : micro?.rect ? micro.rect.left + micro.rect.width : baseRect.left + baseRect.width;
    return (left + right) / 2;
  };

  // ---- Right action bars ---------------------------------------------------------------
  let rightStackDone = false;
  const layoutRightStack = () => {
    if (rightStackDone) return;
    rightStackDone = true;
    const members = [...rectsEntries.values()]
      .filter((e) => e.def.rightStackOrder !== undefined)
      .sort((a, b) => (a.def.rightStackOrder ?? 0) - (b.def.rightStackOrder ?? 0));
    let offsetX = RIGHT_ACTION_BAR_DEFAULT_OFFSET_X;
    let leftMostWidth: number | null = null;
    for (const m of members) {
      if (!isShown(m.def.key) || !m.sys.isInDefaultPosition) continue;
      if (leftMostWidth !== null) offsetX += -leftMostWidth - 5 + RIGHT_ACTION_BAR_DEFAULT_PADDING_X;
      const [w, h] = sizeTuple(m.footprint);
      const sp = pointOf(screenRect(screen), "RIGHT");
      place(m, rectFromPoint("RIGHT", sp.x + offsetX, sp.y + RIGHT_ACTION_BAR_DEFAULT_OFFSET_Y, w, h), "rightStack");
      leftMostWidth = w;
    }
  };

  const rightActionBarWidth = (): number => {
    layoutRightStack();
    for (const idx of [5, 4]) {
      const p = out.get(frameKey(0, idx));
      if (p && p.mode === "rightStack") return Math.abs(p.rect.left + p.rect.width - screen.width) + p.rect.width;
    }
    return 0;
  };

  const bottomActionBarHeight = (): number => {
    layoutBottomStack();
    const bar2 = out.get(frameKey(0, 2));
    if (bar2 && bar2.mode === "bottomStack" && bar2StackY !== null) return bar2StackY + bar2.rect.height;
    const micro = resolve(frameKey(13, null));
    if (micro && micro.sys.isInDefaultPosition) return Math.abs(micro.sys.anchor.offsetY) + micro.rect.height;
    return 0;
  };

  // ---- Managed frame containers --------------------------------------------------------
  const managedDone = { bottom: false, right: false };
  const layoutManaged = (which: "bottom" | "right") => {
    if (managedDone[which]) return;
    managedDone[which] = true;
    const members = [...rectsEntries.values()]
      .filter((e) => e.def.managed?.container === which && e.sys.isInDefaultPosition && isShown(e.def.key))
      .sort((a, b) => (a.def.managed?.layoutIndex ?? 0) - (b.def.managed?.layoutIndex ?? 0));
    if (members.length === 0) return;
    const sizes = members.map((m) => sizeTuple(m.footprint));
    const total = sizes.reduce((acc, [, h]) => acc + h, 0) + MANAGED_SPACING * (members.length - 1);
    if (which === "bottom") {
      const h = bottomActionBarHeight();
      const bottom = (h > 0 ? h + BOTTOM_FRAME_CONTAINER_MARGIN : BOTTOM_FRAME_CONTAINER_MARGIN);
      let top = bottom + total;
      members.forEach((m, i) => {
        const [w, hh] = sizes[i];
        place(m, { left: screen.width / 2 - w / 2, bottom: top - hh, width: w, height: hh }, "managedBottom");
        top -= hh + MANAGED_SPACING;
      });
    } else {
      const right = screen.width - rightActionBarWidth() - 5;
      let top = screen.height + RIGHT_CONTAINER_OFFSET_Y;
      // FramePositionDelegate gives the column a fixed height; the objective tracker shrinks to fit it.
      const minimap = rectsEntries.get(frameKey(2, null));
      const minimapHeight = minimap ? sizeTuple(minimap.footprint)[1] : 256;
      const bottomLimit = top - (screen.height - minimapHeight - 100);
      members.forEach((m, i) => {
        const [w, h0] = sizes[i];
        const hh = m.def.system === 12 ? Math.max(100, Math.min(h0, top - bottomLimit)) : h0;
        place(m, { left: right - w, bottom: top - hh, width: w, height: hh }, "managedRight");
        top -= hh + MANAGED_SPACING;
      });
    }
  };

  const layoutPetFrame = () => {
    const pet = rectsEntries.get(frameKey(3, 8));
    if (!pet) return;
    const player = resolve(frameKey(3, 1));
    const [w, h] = sizeTuple(pet.footprint);
    if (!player) {
      place(pet, anchoredRect(pet, pet.sys.anchor), "managedPlayer");
      return;
    }
    const s = player.rect.width / 232;
    place(pet, { left: player.rect.left + 60 * s, bottom: player.rect.bottom + 28 * s - h, width: w, height: h }, "managedPlayer");
  };

  for (const key of rectsEntries.keys()) resolve(key);
  return out;
}

/** Keys of systems whose anchor chain depends on `key` (direct or indirect). */
export function dependents(layout: Layout, key: string): Set<string> {
  const result = new Set<string>();
  const nameOf = new Map<string, string>();
  for (const sys of layout.systems) {
    const def = frameDef(sys.system, sys.systemIndex);
    if (def?.frameName) nameOf.set(def.key, def.frameName);
  }
  let changed = true;
  const targets = new Set<string>([key]);
  while (changed) {
    changed = false;
    for (const sys of layout.systems) {
      const def = frameDef(sys.system, sys.systemIndex);
      if (!def || result.has(def.key) || targets.has(def.key)) continue;
      const anchorTarget = frameDefByName(sys.anchor.relativeTo)?.key;
      if (anchorTarget && targets.has(anchorTarget) && !sys.isInDefaultPosition) {
        result.add(def.key);
        targets.add(def.key);
        changed = true;
      }
    }
  }
  return result;
}
