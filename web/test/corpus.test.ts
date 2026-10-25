import { describe, it, expect } from "vitest";
import corpus from "./fixtures/wago-corpus.json";
import { decodeLayoutString, encodeLayoutString, tokenize } from "../src/editmode/layoutString";

type Fixture = { id: string; name: string | null; version: number; string: string };
const fixtures = corpus as Fixture[];

describe("wago.io corpus (570 real Edit Mode exports, 2022–2026)", () => {
  it("has every expected version present", () => {
    const versions = new Set(fixtures.map((f) => f.version));
    expect([...versions].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("decodes every string without throwing", () => {
    const failures: string[] = [];
    for (const f of fixtures) {
      try { decodeLayoutString(f.string); } catch (e) { failures.push(`${f.id}: ${(e as Error).message}`); }
    }
    expect(failures).toEqual([]);
  });

  it("round-trips every string byte-for-byte (after whitespace normalization)", () => {
    const failures: string[] = [];
    for (const f of fixtures) {
      const normalized = tokenize(f.string).join(" ");
      const out = encodeLayoutString(decodeLayoutString(f.string));
      if (out !== normalized) {
        // locate first difference for a useful message
        let i = 0; while (i < out.length && out[i] === normalized[i]) i++;
        failures.push(`${f.id} (v${f.version}) differs at ${i}: …${normalized.slice(Math.max(0, i - 20), i + 30)}… vs …${out.slice(Math.max(0, i - 20), i + 30)}…`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("header count matches the number of systems for every string", () => {
    for (const f of fixtures) {
      const t = tokenize(f.string);
      const l = decodeLayoutString(f.string);
      const countTok = l.headerKind === "plain" ? t[1] : t[2];
      expect(Number(countTok)).toBe(l.systems.length);
    }
  });

  it("WoW Forever strings (version >= 4) carry an interface style header", () => {
    for (const f of fixtures.filter((x) => x.version >= 4 && !x.string.startsWith("5 26 "))) {
      const l = decodeLayoutString(f.string);
      expect(l.headerKind).toBe("style");
      expect([0, 1]).toContain(l.interfaceStyle);
    }
  });
});
