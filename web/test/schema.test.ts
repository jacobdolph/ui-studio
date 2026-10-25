import { describe, it, expect } from "vitest";
import corpus from "./fixtures/wago-corpus.json";
import { decodeLayoutString } from "../src/editmode/layoutString";
import { Enum, Systems, Presets } from "../src/editmode/schema.generated";
import { summarize, systemLabel, displayValue } from "../src/editmode/describe";

type Fixture = { id: string; version: number; string: string };
const fixtures = corpus as Fixture[];

describe("generated schema (WoW Forever 1.60.1 / build 70532)", () => {
  it("has the Forever system enum, which diverges from live 12.1.5 at id 26", () => {
    expect(Enum.EditModeSystem.LossOfControl).toBe(28);
    expect(Enum.EditModeSystem.MainActionBarEndCap).toBe(26);
    expect(Enum.EditModeSystem.SwingTimer).toBe(29);
    expect(Enum.EditModeSystem.GamepadMainActionBar).toBe(30);
    expect(Object.keys(Systems)).toHaveLength(31);
  });

  it("carries slider ranges from EditModeSettingDisplayInfo.lua", () => {
    const iconSize = Systems["0"].settings["3"];
    expect(iconSize).toMatchObject({ name: "IconSize", min: 50, max: 200, step: 10, convert: "scaled", percent: true });
    expect(displayValue(0, 3, 5)).toBe("100%");
    const frameWidth = Systems["3"].settings["10"];
    expect(frameWidth).toMatchObject({ name: "FrameWidth", min: 72, max: 144, convert: "offset" });
    expect(displayValue(3, 10, 0)).toBe("72");
    expect(displayValue(0, 0, 1)).toBe("Vertical");
  });

  it("has Modern, Classic and Gamepad presets with Forever's anchors", () => {
    expect(Presets.Modern.length).toBe(59);
    expect(Presets.Gamepad.some((p) => p.system === Enum.EditModeSystem.GamepadMainActionBar)).toBe(true);
    const mainBar = Presets.Modern.find((p) => p.system === 0 && p.systemIndex === 1)!;
    expect(mainBar.anchor).toMatchObject({ point: "BOTTOMRIGHT", relativeTo: "MicroMenuContainer", relativePoint: "BOTTOMLEFT", offsetX: -4.5, offsetY: -4 });
  });

  it("labels systems like the in-game UI", () => {
    expect(systemLabel({ system: 0, systemIndex: 1 })).toBe("Action Bar 1");
    expect(systemLabel({ system: 0, systemIndex: 12 })).toBe("Pet Action Bar");
    expect(systemLabel({ system: 3, systemIndex: 1 })).toBe("Player");
    expect(systemLabel({ system: 2, systemIndex: null })).toBe("Minimap");
  });
});

describe("Forever strings vs. schema", () => {
  const forever = fixtures.filter((f) => f.version >= 3 && !f.string.startsWith("5 26 "));

  it("every system/index in a Forever export exists in the Modern preset", () => {
    for (const f of forever) {
      const s = summarize(decodeLayoutString(f.string));
      expect(s.unknownSystems, f.id).toEqual([]);
    }
  });

  it("every setting id in a Forever export is a known enum value", () => {
    for (const f of forever) {
      const s = summarize(decodeLayoutString(f.string));
      expect(s.unknownSettings, f.id).toEqual([]);
    }
  });

  it("a Forever export covers all 59 Modern preset systems", () => {
    const want = new Set(Presets.Modern.map((p) => `${p.system}/${p.systemIndex ?? -1}`));
    for (const f of forever.filter((x) => x.version === 5)) {
      const have = new Set(decodeLayoutString(f.string).systems.map((s) => `${s.system}/${s.systemIndex ?? -1}`));
      expect([...want].filter((k) => !have.has(k)), f.id).toEqual([]);
    }
  });

  it("documents the live-vs-Forever id collision: live 12.x writes LossOfControl as 26", () => {
    const live = fixtures.filter((f) => f.version === 2 && f.string.includes(" 26 -1 "));
    expect(live.length).toBeGreaterThan(0);
    // In the Forever schema 26 is MainActionBarEndCap (an indexed system), so a live string is NOT safe to import as-is.
    expect(Systems["26"].name).toBe("MainActionBarEndCap");
  });
});
