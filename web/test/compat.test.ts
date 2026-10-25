import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { decodeLayoutString, encodeLayoutString, getSetting } from "../src/editmode/layoutString";
import { remapRetailToForever, previewRetailRemaps } from "../src/editmode/compat";
import { systemLabel } from "../src/editmode/describe";
import { Enum } from "../src/editmode/schema.generated";
import { frameDef } from "../src/editmode/frames";
import { computeRects } from "../src/editor/geometry";
import { currentScreen, exportString, initialState, reducer } from "../src/editor/store";

// A real export from a live retail client (12.x, Oct 2026): version 2, 52 systems, 46 moved frames.
const RETAIL = readFileSync(new URL("./fixtures/retail-export-2026-10.txt", import.meta.url), "utf8").trim();

describe("retail export", () => {
  it("decodes and re-encodes byte-exact", () => {
    const layout = decodeLayoutString(RETAIL);
    expect(layout.version).toBe(2);
    expect(layout.headerKind).toBe("plain");
    expect(layout.systems).toHaveLength(52);
    expect(encodeLayoutString(layout)).toBe(RETAIL);
  });

  it("moves Loss of Control from retail id 26 to Forever id 28 and nothing else", () => {
    const layout = decodeLayoutString(RETAIL);
    const before = layout.systems.map((s) => s.system);
    expect(previewRetailRemaps(layout)).toEqual([{ from: 26, to: 28, name: "Loss of Control" }]);
    expect(before).toContain(26);
    const remaps = remapRetailToForever(layout);
    expect(remaps).toHaveLength(1);
    const after = layout.systems.map((s) => s.system);
    expect(after.filter((x, i) => x !== before[i])).toEqual([28]);
    const loc = layout.systems.find((s) => s.system === Enum.EditModeSystem.LossOfControl)!;
    expect(getSetting(loc, 0)).toBe(5); // Size stays with the frame
    // Every system now has a frame in the catalog
    for (const s of layout.systems) expect(frameDef(s.system, s.systemIndex), `${s.system}/${s.systemIndex}`).toBeTruthy();
  });

  it("does not remap Forever strings", () => {
    const layout = decodeLayoutString("5 0 1 26 0 1 7 7 UIParent 0.0 0.0 -1 ##");
    expect(remapRetailToForever(layout)).toEqual([]);
    expect(layout.systems[0].system).toBe(26);
  });

  it("imports into the editor as a Forever layout and lays out on screen", () => {
    const st = reducer(initialState(), { type: "importString", text: RETAIL });
    const out = exportString(st);
    expect(out.split(" ").slice(0, 3)).toEqual(["5", "0", "52"]);
    expect(out.endsWith(" 28 -1 1 4 4 UIParent 0.0 0.0 -1 #(")).toBe(true);
    // Body is otherwise identical to the retail string
    expect(out.split(" ").slice(3).join(" ").replace(" 28 -1 1 4 4 ", " 26 -1 1 4 4 ")).toBe(RETAIL.split(" ").slice(2).join(" "));

    // The offsets only fit a 2133 x 1200 UIParent: a 1440p (or 4K) monitor at UI scale 0.64.
    expect(st.screenId).toBe("1440p");
    expect(st.uiScale).toBeNull();
    const screen = currentScreen(st);
    expect(screen).toEqual({ width: 2133.3, height: 1200 });
    const rects = computeRects(st.layout, screen, { isShown: () => true });
    expect(rects.size).toBe(52);
    for (const [key, r] of rects) {
      expect(r.rect.width, key).toBeGreaterThan(0);
      // Everything the player placed is on that screen (allow a little slack for footprint guesses)
      expect(r.rect.left + r.rect.width, key).toBeGreaterThan(-50);
      expect(r.rect.left, key).toBeLessThan(screen.width + 50);
      expect(r.rect.bottom + r.rect.height, key).toBeGreaterThan(-50);
      expect(r.rect.bottom, key).toBeLessThan(screen.height + 50);
    }
    // Chained anchors resolve: Bar 2 hangs off Bar 3, Target hangs off the Essential cooldown viewer
    const bar2 = rects.get("0/2")!.rect, bar3 = rects.get("0/3")!.rect;
    expect(bar2.left + bar2.width).toBeCloseTo(bar3.left - 4, 3);
  });
});

describe("systemLabel", () => {
  it("numbers action bars by system index", () => {
    expect(systemLabel({ system: 0, systemIndex: 1 })).toBe("Action Bar 1");
    expect(systemLabel({ system: 0, systemIndex: 4 })).toBe("Action Bar 4");
    expect(systemLabel({ system: 0, systemIndex: 8 })).toBe("Action Bar 8");
    expect(systemLabel({ system: 0, systemIndex: 11 })).toBe("Stance Bar");
    expect(systemLabel({ system: 15, systemIndex: 2 })).toBe("Status Bar 2");
  });
});
