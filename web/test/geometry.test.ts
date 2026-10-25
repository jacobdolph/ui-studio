import { describe, expect, it } from "vitest";
import { anchorFromRect, computeRects, pointOf, rectFromPoint } from "../src/editor/geometry";
import { currentScreen, exportString, initialState, layoutFromPreset, reducer, uiParentSize, SCREEN_PRESETS, defaultUiScale } from "../src/editor/store";
import { decodeLayoutString } from "../src/editmode/layoutString";
import { FRAMES, frameKey } from "../src/editmode/frames";
import { Presets } from "../src/editmode/schema.generated";
import corpus from "./fixtures/wago-corpus.json";

const screen = { width: 1920, height: 1080 };

describe("anchor math", () => {
  it("rectFromPoint and pointOf are inverse", () => {
    for (const p of ["TOPLEFT", "TOP", "TOPRIGHT", "LEFT", "CENTER", "RIGHT", "BOTTOMLEFT", "BOTTOM", "BOTTOMRIGHT"] as const) {
      const r = rectFromPoint(p, 100, 200, 50, 30);
      expect(pointOf(r, p)).toEqual({ x: 100, y: 200 });
    }
  });

  it("drag end picks the anchor point by screen thirds like StopMovingOrSizing", () => {
    expect(anchorFromRect({ left: 10, bottom: 10, width: 100, height: 40 }, screen).point).toBe("BOTTOMLEFT");
    expect(anchorFromRect({ left: 900, bottom: 500, width: 100, height: 40 }, screen).point).toBe("CENTER");
    expect(anchorFromRect({ left: 1700, bottom: 900, width: 100, height: 40 }, screen).point).toBe("TOPRIGHT");
    expect(anchorFromRect({ left: 900, bottom: 20, width: 100, height: 40 }, screen).point).toBe("BOTTOM");
    const a = anchorFromRect({ left: 10.26, bottom: 10, width: 100, height: 40 }, screen);
    expect(a).toMatchObject({ relativeTo: "UIParent", relativePoint: "BOTTOMLEFT", offsetX: 10.3, offsetY: 10 });
  });

  it("UIParent is 1920x1080 units at 1080p and clamps to uiScale 0.64 at 1440p", () => {
    expect(uiParentSize(SCREEN_PRESETS[0], defaultUiScale(1080))).toEqual({ width: 1920, height: 1080 });
    const q = SCREEN_PRESETS.find((s) => s.id === "1440p")!;
    expect(defaultUiScale(q.pixelHeight)).toBe(0.64);
    expect(uiParentSize(q, 0.64).height).toBe(1200);
  });
});

describe("preset geometry", () => {
  const layout = layoutFromPreset("Modern");
  const rects = computeRects(layout, screen);

  it("places every Modern preset system", () => {
    expect(layout.systems).toHaveLength(Presets.Modern.length);
    expect(rects.size).toBe(Presets.Modern.length);
    for (const p of rects.values()) {
      expect(Number.isFinite(p.rect.left)).toBe(true);
      expect(Number.isFinite(p.rect.bottom)).toBe(true);
      expect(p.rect.width).toBeGreaterThan(0);
      expect(p.rect.height).toBeGreaterThan(0);
    }
  });

  it("has a frame definition for every preset system and vice versa", () => {
    const presetKeys = new Set(Presets.Modern.map((p) => frameKey(p.system, p.systemIndex)));
    for (const f of FRAMES) if (f.system !== 30) expect(presetKeys.has(f.key), f.key).toBe(true);
    for (const k of presetKeys) expect(FRAMES.some((f) => f.key === k), k).toBe(true);
  });

  it("builds the Forever bottom bar: main bar left of the micro menu, bags to its right, centered", () => {
    const main = rects.get(frameKey(0, 1))!.rect;
    const micro = rects.get(frameKey(13, null))!.rect;
    const bags = rects.get(frameKey(14, null))!.rect;
    expect(main.left + main.width).toBeCloseTo(micro.left - 4.5, 5);
    expect(bags.left).toBeCloseTo(micro.left + micro.width + 7, 5);
    expect(main.width).toBe(12 * 45 + 11 * 2);
    // The whole group is symmetric around the screen center.
    const groupLeft = main.left;
    const groupRight = bags.left + bags.width;
    expect((groupLeft + groupRight) / 2).toBeCloseTo(960, 0);
  });

  it("stacks Bar 2 above the main bar and Bar 3 beside it, with the XP bar in between", () => {
    const main = rects.get(frameKey(0, 1))!;
    const xp = rects.get(frameKey(15, 1))!;
    const bar2 = rects.get(frameKey(0, 2))!;
    const bar3 = rects.get(frameKey(0, 3))!;
    expect(main.mode).toBe("bottomStack");
    expect(main.rect.height).toBe(45);
    expect(xp.rect.bottom).toBeCloseTo(main.rect.bottom + 45 + 4, 5);
    expect(bar2.rect.bottom).toBeCloseTo(xp.rect.bottom + 17 + 4, 5);
    expect(bar3.rect.bottom).toBeCloseTo(bar2.rect.bottom, 5);
    expect(bar2.rect.left).toBeCloseTo(main.rect.left + 22, 5);
    expect(bar3.rect.left).toBeCloseTo(main.rect.left + 606, 5);
  });

  it("puts the right bars against the right edge and the minimap top right", () => {
    const right1 = rects.get(frameKey(0, 4))!.rect;
    const right2 = rects.get(frameKey(0, 5))!.rect;
    expect(right1.left + right1.width).toBeCloseTo(1920 - 5, 5);
    expect(right2.left + right2.width).toBeCloseTo(right1.left - 5, 5);
    const mm = rects.get(frameKey(2, null))!.rect;
    expect(mm.left + mm.width).toBe(1920);
    expect(mm.bottom + mm.height).toBe(1080);
  });

  it("resolves anchors to other frames (group finder eye on the minimap, end caps on the bars)", () => {
    const eye = rects.get(frameKey(27, null))!.rect;
    const mm = rects.get(frameKey(2, null))!.rect;
    expect(eye.left).toBeGreaterThan(mm.left);
    expect(eye.left + eye.width).toBeLessThan(mm.left + mm.width);
    const capL = rects.get(frameKey(26, 1))!.rect;
    const main = rects.get(frameKey(0, 1))!.rect;
    expect(capL.left + capL.width).toBeCloseTo(main.left + 30, 5);
  });

  it("falls back to plain anchors for the Gamepad preset", () => {
    const gp = layoutFromPreset("Gamepad");
    const r = computeRects(gp, screen);
    expect(gp.interfaceStyle).toBe(1);
    expect(r.size).toBe(gp.systems.length);
    expect([...r.values()].every((p) => p.mode === "anchor" || p.mode.startsWith("managed"))).toBe(true);
  });
});

describe("editor reducer", () => {
  it("exports an untouched Modern preset as a valid version 5 string with the style header", () => {
    const st = initialState();
    const text = exportString(st);
    expect(text.startsWith("5 0 59 ")).toBe(true);
    const back = decodeLayoutString(text);
    expect(back.systems).toHaveLength(59);
    expect(back.systems.every((s) => s.isInDefaultPosition)).toBe(true);
    expect(back.systems[0].anchor).toEqual({ point: "BOTTOMRIGHT", relativeTo: "MicroMenuContainer", relativePoint: "BOTTOMLEFT", offsetX: -4.5, offsetY: -4 });
  });

  it("moving a frame anchors it to the screen and clears the default flag; undo restores it", () => {
    let st = initialState();
    const scr = currentScreen(st);
    const key = frameKey(3, 1);
    st = reducer(st, { type: "move", key, rect: { left: 100, bottom: 100, width: 232, height: 100 }, screen: scr });
    const player = st.layout.systems.find((s) => s.system === 3 && s.systemIndex === 1)!;
    expect(player.isInDefaultPosition).toBe(false);
    expect(player.anchor).toEqual({ point: "BOTTOMLEFT", relativeTo: "UIParent", relativePoint: "BOTTOMLEFT", offsetX: 100, offsetY: 100 });
    const text = exportString(st);
    const back = decodeLayoutString(text);
    expect(back.systems.find((s) => s.system === 3 && s.systemIndex === 1)!.anchor.offsetX).toBe(100);
    st = reducer(st, { type: "undo" });
    expect(st.layout.systems.find((s) => s.system === 3 && s.systemIndex === 1)!.isInDefaultPosition).toBe(true);
    st = reducer(st, { type: "redo" });
    expect(st.layout.systems.find((s) => s.system === 3 && s.systemIndex === 1)!.isInDefaultPosition).toBe(false);
  });

  it("nudging moves the on-screen rect by the requested units", () => {
    let st = initialState();
    const scr = currentScreen(st);
    const key = frameKey(2, null);
    const before = computeRects(st.layout, scr).get(key)!.rect;
    st = reducer(st, { type: "nudge", key, dx: -10, dy: -20, screen: scr });
    const after = computeRects(st.layout, scr).get(key)!.rect;
    expect(after.left).toBeCloseTo(before.left - 10, 5);
    expect(after.bottom).toBeCloseTo(before.bottom - 20, 5);
  });

  it("changing a setting re-sizes the frame and survives export", () => {
    let st = initialState();
    const scr = currentScreen(st);
    const key = frameKey(0, 1);
    const w0 = computeRects(st.layout, scr).get(key)!.rect.width;
    st = reducer(st, { type: "setSetting", key, settingId: 3, raw: 10 }); // IconSize 150%
    const w1 = computeRects(st.layout, scr).get(key)!.rect.width;
    expect(w1).toBeGreaterThan(w0);
    const back = decodeLayoutString(exportString(st));
    expect(back.systems[0].settings.find((p) => p.id === 3)!.value).toBe(10);
  });

  it("reset to default position restores the preset anchor", () => {
    let st = initialState();
    const scr = currentScreen(st);
    const key = frameKey(0, 1);
    st = reducer(st, { type: "move", key, rect: { left: 0, bottom: 0, width: 10, height: 10 }, screen: scr });
    st = reducer(st, { type: "resetPosition", key });
    expect(st.layout.systems[0].isInDefaultPosition).toBe(true);
    expect(st.layout.systems[0].anchor.relativeTo).toBe("MicroMenuContainer");
  });

  it("imports every corpus string and computes geometry without throwing", () => {
    let fails = 0;
    for (const entry of corpus as { string: string }[]) {
      const st = reducer(initialState(), { type: "importString", text: entry.string });
      expect(exportString(st).startsWith("5 ")).toBe(true);
      const rects = computeRects(st.layout, currentScreen(st));
      for (const p of rects.values()) if (!Number.isFinite(p.rect.left) || !Number.isFinite(p.rect.bottom)) fails++;
    }
    expect(fails).toBe(0);
  });

  it("re-exports an imported Forever string byte-for-byte when nothing was touched", () => {
    const forever = (corpus as { string: string; version: number }[]).filter((e) => e.version === 5 && e.string.startsWith("5 0 "));
    expect(forever.length).toBeGreaterThan(0);
    for (const e of forever) {
      const st = reducer(initialState(), { type: "importString", text: e.string });
      expect(exportString(st)).toBe(e.string);
    }
  });
});
