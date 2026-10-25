import { describe, it, expect } from "vitest";
import {
  decodeLayoutString, encodeLayoutString, decodeSettingsBlob, encodeSettingsBlob,
  formatOffset, getSetting, setSetting, createLayout, LayoutParseError, type LayoutSystem,
} from "../src/editmode/layoutString";

// josephxp, Blizzard forums (TBC Classic, Jan 2026), trimmed to a few systems
const V2 = "2 3 0 0 0 4 4 UIParent 0.0 -365.5 -1 ##$$%/&('))$+#,$ 2 -1 1 2 2 UIParent 0.0 0.0 -1 ##$#%( 3 4 1 0 2 CompactRaidFrameManager 0.0 -5.0 -1 ,%-#.#/#0%1#2-";
// WoW Forever beta, Oct 2026 (style header), trimmed
const V5 = "5 0 2 0 0 1 8 6 MicroMenuContainer -4.5 -4.0 -1 ##$$%/&('%)#+$,$ 3 3 1 0 2 CompactRaidFrameManager 0.0 12.0 -1 '$($)#-k.G/#1#3#7-7$8(";

describe("settings blob", () => {
  it("decodes '#' as no settings", () => {
    expect(decodeSettingsBlob("#").settings).toEqual([]);
    expect(encodeSettingsBlob([])).toBe("#");
  });
  it("decodes (id,value) character pairs offset by 35", () => {
    expect(decodeSettingsBlob("#'$A%$&7").settings).toEqual([
      { id: 0, value: 4, digits: 1 }, { id: 1, value: 30, digits: 1 }, { id: 2, value: 1, digits: 1 }, { id: 3, value: 20, digits: 1 },
    ]);
  });
  it("combines repeated ids as little-endian base-90 digits (Opacity 100 = 10 + 1*90)", () => {
    const { settings } = decodeSettingsBlob("7-7$");
    expect(settings).toEqual([{ id: 20, value: 100, digits: 2 }]);
    expect(encodeSettingsBlob([{ id: 20, value: 100 }])).toBe("7-7$");
    expect(encodeSettingsBlob([{ id: 3, value: 213 }])).toBe("&D&%"); // SwingTimer width 213 = 33 + 2*90
    expect(decodeSettingsBlob("&D&%").settings[0].value).toBe(213);
  });
  it("preserves a redundant leading-zero digit when re-encoding", () => {
    const blob = "-$-#"; // id 10: digits (1, 0) → value 1 written with two digits
    const { settings } = decodeSettingsBlob(blob);
    expect(settings).toEqual([{ id: 10, value: 1, digits: 2 }]);
    expect(encodeSettingsBlob(settings)).toBe(blob);
  });
  it("round-trips a pre-2023 single character >= 90 (code point 131)", () => {
    const blob = "$" + String.fromCodePoint(131); // id 1, value 96 in one char
    const { settings } = decodeSettingsBlob(blob);
    expect(settings).toEqual([{ id: 1, value: 96, digits: 1 }]);
    expect(encodeSettingsBlob(settings)).toBe(blob);
    // without the digits hint we write it the modern way
    expect(encodeSettingsBlob([{ id: 1, value: 96 }])).toBe("$)$$"); // 6 + 1*90
  });
  it("rejects negative or fractional values", () => {
    expect(() => encodeSettingsBlob([{ id: 0, value: -1 }])).toThrow();
    expect(() => encodeSettingsBlob([{ id: 0, value: 1.5 }])).toThrow();
  });
});

describe("decode", () => {
  it("parses a version 2 string (plain header)", () => {
    const l = decodeLayoutString(V2);
    expect(l.version).toBe(2);
    expect(l.headerKind).toBe("plain");
    expect(l.interfaceStyle).toBeNull();
    expect(l.systems).toHaveLength(3);
    const bar = l.systems[0];
    expect(bar.system).toBe(0);
    expect(bar.systemIndex).toBe(1); // string "0" → Lua 1 (MainBar)
    expect(bar.isInDefaultPosition).toBe(false);
    expect(bar.anchor).toEqual({ point: "CENTER", relativePoint: "CENTER", relativeTo: "UIParent", offsetX: 0, offsetY: -365.5 });
    expect(bar.anchor2).toBeNull();
    expect(getSetting(bar, 2)).toBe(12); // NumIcons
    expect(getSetting(bar, 3)).toBe(5); // IconSize raw 5 → 100%
    const minimap = l.systems[1];
    expect(minimap.systemIndex).toBeNull();
    expect(minimap.anchor.point).toBe("TOPRIGHT");
    const raid = l.systems[2];
    expect(raid.systemIndex).toBe(5); // Raid
    expect(raid.anchor.relativeTo).toBe("CompactRaidFrameManager");
  });

  it("parses a WoW Forever version 5 string (style header)", () => {
    const l = decodeLayoutString(V5);
    expect(l.version).toBe(5);
    expect(l.headerKind).toBe("style");
    expect(l.interfaceStyle).toBe(0);
    expect(l.systems[0].anchor).toEqual({ point: "BOTTOMRIGHT", relativePoint: "BOTTOMLEFT", relativeTo: "MicroMenuContainer", offsetX: -4.5, offsetY: -4 });
    expect(l.systems[0].isInDefaultPosition).toBe(true);
    const party = l.systems[1];
    expect(getSetting(party, 20)).toBe(100); // Opacity, two digits
    expect(getSetting(party, 10)).toBe(72); // FrameWidth 'k' = 107-35
  });

  it("parses the duplicated-count header some Oct-2026 live clients emit", () => {
    const s = "2 2 2 0 0 0 7 7 UIParent 0.0 45.0 -1 # 2 -1 0 2 2 UIParent 0.0 0.0 -1 #";
    const l = decodeLayoutString(s);
    expect(l.headerKind).toBe("dupCount");
    expect(l.systems).toHaveLength(2);
    expect(encodeLayoutString(l)).toBe(s);
  });

  it("parses the 2022 beta field order (decode only)", () => {
    const s = "5 2 0 0 7 7 UIParent -256.7 5.8 0 ##$$ 6 1 2 8 BuffFrame -13.0 -5.0 1 #";
    const l = decodeLayoutString(s);
    expect(l.grammar).toBe("beta2022");
    expect(l.systems[0].isInDefaultPosition).toBe(false);
    expect(l.systems[1].isInDefaultPosition).toBe(true);
    expect(l.systems[1].systemIndex).toBe(2);
    expect(encodeLayoutString(l)).toBe(s);
  });

  it("reads a secondary anchor when present", () => {
    const s = "2 1 12 -1 0 2 2 UIParent -10.0 -200.0 8 8 UIParent -10.0 20.0 #%$#%#";
    const l = decodeLayoutString(s);
    expect(l.systems[0].anchor2).toEqual({ point: "BOTTOMRIGHT", relativePoint: "BOTTOMRIGHT", relativeTo: "UIParent", offsetX: -10, offsetY: 20 });
    expect(encodeLayoutString(l)).toBe(s);
  });

  it("tolerates arbitrary whitespace between tokens", () => {
    const l = decodeLayoutString("  2\n1\t0 0 0 4 4 UIParent 0.0 -365.5 -1 #  ");
    expect(l.systems).toHaveLength(1);
  });

  it("rejects things that are not layout strings", () => {
    for (const bad of ["", "hello world", "2 1 0 0 0 4 4 UIParent 0.0", "2 2 0 0 0 4 4 UIParent 0.0 0.0 -1 #", "x 1 0", "2 1 0 0 0 9 4 UIParent 0.0 0.0 -1 #"]) {
      expect(() => decodeLayoutString(bad), bad).toThrow(LayoutParseError);
    }
  });
});

describe("encode", () => {
  it("formats offsets with one decimal like the game", () => {
    expect(formatOffset(0)).toBe("0.0");
    expect(formatOffset(-0)).toBe("0.0");
    expect(formatOffset(-365.5)).toBe("-365.5");
    expect(formatOffset(12.34)).toBe("12.3");
    expect(formatOffset(-0.04)).toBe("0.0");
  });

  it("keeps '-0.0' from the source until the value is changed", () => {
    const s = "2 1 2 -1 1 2 2 UIParent -0.0 -0.0 -1 #";
    const l = decodeLayoutString(s);
    expect(encodeLayoutString(l)).toBe(s);
    l.systems[0].anchor.offsetX = 5;
    expect(encodeLayoutString(l)).toBe("2 1 2 -1 1 2 2 UIParent 5.0 -0.0 -1 #");
  });

  it("re-sorts and regenerates the blob after setSetting", () => {
    const l = decodeLayoutString(V2);
    const bar = l.systems[0];
    setSetting(bar, 3, 10); // IconSize raw 10 → 150%
    setSetting(bar, 7, 1);
    expect(getSetting(bar, 3)).toBe(10);
    const again = decodeLayoutString(encodeLayoutString(l)).systems[0];
    expect(again.settings.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9]);
    expect(getSetting(again, 7)).toBe(1);
  });

  it("builds a fresh Forever layout with a style header", () => {
    const sys: LayoutSystem = {
      system: 2, systemIndex: null, isInDefaultPosition: false,
      anchor: { point: "TOPRIGHT", relativeTo: "UIParent", relativePoint: "TOPRIGHT", offsetX: -20, offsetY: -20.26 },
      anchor2: null, settings: [{ id: 2, value: 7 }, { id: 0, value: 1 }],
    };
    const out = encodeLayoutString(createLayout([sys]));
    expect(out).toBe("5 0 1 2 -1 0 2 2 UIParent -20.0 -20.3 -1 %*#$");
    const back = decodeLayoutString(out);
    expect(back.interfaceStyle).toBe(0);
    expect(back.systems[0].anchor.offsetY).toBe(-20.3);
  });

  it("can force a header kind", () => {
    const l = decodeLayoutString(V2);
    expect(encodeLayoutString(l, { headerKind: "style" }).startsWith("2 0 3 ")).toBe(true);
    expect(encodeLayoutString(l, { headerKind: "dupCount" }).startsWith("2 3 3 ")).toBe(true);
  });
});
