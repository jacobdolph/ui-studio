#!/usr/bin/env node
/**
 * Generates src/editmode/schema.generated.ts from Blizzard's own FrameXML sources.
 *
 * We execute the real Lua files (API documentation enums, preset layouts, setting
 * display info) inside fengari (Lua 5.3 in JS) with light stubs, then dump the
 * resulting tables. That way enum values, slider ranges, step sizes, and default
 * anchors are copied from Blizzard, not retyped by hand.
 *
 * Usage:
 *   node scripts/gen-schema.mjs <wow-ui-source root> [--flavor camelot|standard] [--strings enUS.lua]
 *
 * The wow-ui-source root is a checkout of https://github.com/Gethe/wow-ui-source
 * (branch `forever` for WoW Forever). Strings come from
 * https://github.com/Ketho/BlizzardInterfaceResources (Resources/GlobalStrings/enUS.lua).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: gen-schema.mjs <wow-ui-source root> [--flavor camelot|standard] [--strings enUS.lua]");
  process.exit(2);
}
const root = args[0];
const flavor = args.includes("--flavor") ? args[args.indexOf("--flavor") + 1] : "camelot";
const stringsFile = args.includes("--strings") ? args[args.indexOf("--strings") + 1] : null;

const addons = path.join(root, "Interface", "AddOns");
const docs = path.join(addons, "Blizzard_APIDocumentationGenerated");
const em = path.join(addons, "Blizzard_EditMode");
const constantsDir = flavor === "camelot" ? "Camelot" : "Standard";

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

function run(src, name) {
  const status = lauxlib.luaL_loadbuffer(L, to_luastring(src), src.length, to_luastring(name));
  if (status !== lua.LUA_OK) throw new Error(`load ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
  const r = lua.lua_pcall(L, 0, 0, 0);
  if (r !== lua.LUA_OK) throw new Error(`run ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
}
function runFile(p) { run(fs.readFileSync(p, "utf8"), path.basename(p)); }

// API documentation files reference Enum.* inside their own table constructors (the game
// populates Enum from C++ before FrameXML loads), so pre-seed Enum from a regex pass first.
function seedEnumsFromDoc(p) {
  const src = fs.readFileSync(p, "utf8");
  const re = /Name = "(\w+)",\s*Type = "Enumeration",\s*NumValues = (\d+),\s*MinValue = (-?\d+),\s*MaxValue = (-?\d+),\s*Fields =\s*\{([\s\S]*?)\n\t\t\t\},/g;
  let m; const chunks = [];
  while ((m = re.exec(src))) {
    const fields = [...m[5].matchAll(/Name = "(\w+)", Type = "\w+", EnumValue = (-?\d+)/g)].map(f => `["${f[1]}"]=${f[2]}`);
    chunks.push(`Enum["${m[1]}"] = { ${fields.join(", ")} }; Enum["${m[1]}Meta"] = { NumValues=${m[2]}, MinValue=${m[3]}, MaxValue=${m[4]} }`);
  }
  run(chunks.join("\n"), `seed:${path.basename(p)}`);
}
function runDoc(p) { seedEnumsFromDoc(p); runFile(p); }

// --- Stubs -----------------------------------------------------------------
run(`
Enum = Enum or {}
Constants = Constants or {}
APIDocumentation = {}
function APIDocumentation:AddDocumentationTable(t)
  for _, tbl in ipairs(t.Tables or {}) do
    if tbl.Type == "Enumeration" then
      local e = {}
      for _, f in ipairs(tbl.Fields) do e[f.Name] = f.EnumValue end
      Enum[tbl.Name] = e
      Enum[tbl.Name .. "Meta"] = { NumValues = tbl.NumValues, MinValue = tbl.MinValue, MaxValue = tbl.MaxValue }
    elseif tbl.Type == "Constants" then
      local c = {}
      for _, v in ipairs(tbl.Values) do c[v.Name] = v.Value end
      Constants[tbl.Name] = c
    end
  end
end
TableUtil = { GetHighestNumericalValueInTable = function(t) local m = -math.huge; for _, v in pairs(t) do if type(v) == "number" and v > m then m = v end end; return m end }
function FormatPercentage(v) return tostring(v) end
function Clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi end return v end
function CreateAtlasMarkup() return "" end
-- Unknown globals (HUD_EDIT_MODE_* string keys, NARROW, WIDE, ...) resolve to their own name
setmetatable(_G, { __index = function(_, k) if type(k) == "string" and k:match("^[A-Z][A-Z0-9_]+$") then return "@@" .. k end return nil end })
`, "stubs");

// Enum docs first (every other file indexes Enum.*)
runDoc(path.join(docs, "EditModeManagerConstantsDocumentation.lua"));
const mainlineDoc = path.join(docs, "EditModeManagerConstants_MainlineDocumentation.lua");
if (fs.existsSync(mainlineDoc)) runDoc(mainlineDoc);
runDoc(path.join(docs, "InputConstantsDocumentation.lua"));
runDoc(path.join(docs, "UISharedDocumentation.lua")); // FramePoint

// Preset layouts
runFile(path.join(em, "Shared", "EditModePresetLayoutSystemUtils.lua"));
runFile(path.join(em, constantsDir, "EditModePresetLayoutConstants.lua"));
runFile(path.join(em, "Mainline", "EditModePresetLayouts.lua"));
// Setting display info (defines EditModeSettingDisplayInfoManager.systemSettingDisplayInfo)
runFile(path.join(em, "Shared", "EditModeSettingDisplayInfo.lua"));

// --- Lua -> JS -------------------------------------------------------------
function luaToJs(idx) {
  const t = lua.lua_type(L, idx);
  switch (t) {
    case lua.LUA_TNIL: return null;
    case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, idx);
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, idx);
    case lua.LUA_TSTRING: return to_jsstring(lua.lua_tostring(L, idx));
    case lua.LUA_TFUNCTION: return "<function>";
    case lua.LUA_TTABLE: {
      const abs = lua.lua_absindex(L, idx);
      const obj = {};
      let isArray = true, n = 0;
      lua.lua_pushnil(L);
      while (lua.lua_next(L, abs) !== 0) {
        const k = luaToJs(-2);
        const v = luaToJs(-1);
        if (typeof k !== "number" || !Number.isInteger(k) || k < 1) isArray = false;
        obj[k] = v; n++;
        lua.lua_pop(L, 1);
      }
      if (isArray && n > 0) {
        const arr = [];
        for (let i = 1; i <= n; i++) { if (!(i in obj)) { isArray = false; break; } arr.push(obj[i]); }
        if (isArray) return arr;
      }
      return obj;
    }
    default: return `<${lua.lua_typename(L, t)}>`;
  }
}
function getGlobal(name) {
  lua.lua_getglobal(L, to_luastring(name));
  const v = luaToJs(-1);
  lua.lua_pop(L, 1);
  return v;
}

const Enum = getGlobal("Enum");
const displayInfo = getGlobal("EditModeSettingDisplayInfoManager").systemSettingDisplayInfo;
const maps = {
  Modern: getGlobal("EDIT_MODE_MODERN_SYSTEM_MAP"),
  Classic: getGlobal("EDIT_MODE_CLASSIC_SYSTEM_MAP"),
  Gamepad: getGlobal("EDIT_MODE_GAMEPAD_SYSTEM_MAP"),
};

// --- Strings ---------------------------------------------------------------
const strings = {};
if (stringsFile) {
  const src = fs.readFileSync(stringsFile, "utf8");
  const re = /^([A-Z][A-Z0-9_]+) = "((?:[^"\\]|\\.)*)";/gm;
  let m;
  while ((m = re.exec(src))) strings[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n");
}
function str(ref) {
  if (typeof ref !== "string") return ref;
  if (!ref.startsWith("@@")) return ref;
  const key = ref.slice(2);
  return strings[key] ?? key;
}

// --- Build schema ----------------------------------------------------------
const invert = (e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [v, k]));
const systemNames = invert(Enum.EditModeSystem);

// Per-system settings enum + system indices enum, by naming convention.
const settingEnumFor = {};
const indicesEnumFor = {};
for (const [sysName] of Object.entries(Enum.EditModeSystem)) {
  const se = Enum[`EditMode${sysName}Setting`];
  const ie = Enum[`EditMode${sysName}SystemIndices`];
  if (se) settingEnumFor[sysName] = se;
  if (ie) indicesEnumFor[sysName] = ie;
}
// Aliases Blizzard does not follow the pattern for:
if (!settingEnumFor.Bags && Enum.EditModeBagsSetting) settingEnumFor.Bags = Enum.EditModeBagsSetting;

const LABEL_ALIASES = {
  AuraFrame: "@@HUD_EDIT_MODE_BUFFS_AND_DEBUFFS_LABEL",
  UnitFrame: "Unit Frames",
  MainActionBarEndCap: "Action Bar End Caps",
};
const systems = {};
for (const [idStr, sysName] of Object.entries(systemNames)) {
  const id = Number(idStr);
  const settingEnum = settingEnumFor[sysName] ?? {};
  const indicesEnum = indicesEnumFor[sysName] ?? null;
  const diRaw = displayInfo[id]; const di = Array.isArray(diRaw) ? diRaw : [];
  const settings = {};
  for (const [name, value] of Object.entries(settingEnum)) {
    settings[value] = { id: value, name };
  }
  for (const d of di) {
    const entry = settings[d.setting] ?? (settings[d.setting] = { id: d.setting, name: `DisplayOnly_${d.setting}` });
    entry.label = str(d.name);
    if (d.altName) entry.altLabel = str(d.altName);
    entry.type = d.type === Enum.EditModeSettingDisplayType.Dropdown ? "dropdown" : d.type === Enum.EditModeSettingDisplayType.Checkbox ? "checkbox" : "slider";
    if (d.options) entry.options = d.options.map((o) => ({ value: o.value, label: str(o.text) }));
    if (d.minValue !== undefined) entry.min = d.minValue;
    if (d.maxValue !== undefined) entry.max = d.maxValue;
    if (d.stepSize !== undefined) entry.step = d.stepSize;
    // How the stored raw value maps to the displayed value
    if (d.ConvertValue === "<function>") {
      // Distinguish the two converters by probing: ConvertValueDefault uses stepSize, DiffFromMin does not.
      // We detect by name via a second pass in Lua below.
      entry.convert = "__probe__";
    } else entry.convert = "raw";
    if (d.formatter === "<function>") entry.percent = true;
    if (d.isCompositeNumberSetting) {
      entry.composite = { hundreds: d.compositeNumberHundredsSetting, tensAndOnes: d.compositeNumberTensAndOnesSetting };
    }
    if (d.hideValue) entry.hideValue = true;
    if (d.minText) entry.minText = str(d.minText);
    if (d.maxText) entry.maxText = str(d.maxText);
  }
  systems[id] = {
    id, name: sysName,
    label: str(LABEL_ALIASES[sysName] ?? `@@HUD_EDIT_MODE_${sysName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}_LABEL`),
    indices: indicesEnum ? Object.fromEntries(Object.entries(indicesEnum).map(([k, v]) => [v, k])) : null,
    settings,
  };
}

// Probe ConvertValue identity: call ConvertValue(self, 0, true) → Default gives minValue, DiffFromMin gives minValue too...
// so instead probe with value 1: Default → stepSize*1+min, DiffFromMin → 1+min. When stepSize==1 both agree, so also probe raw.
run(`
__probe = {}
for system, list in pairs(EditModeSettingDisplayInfoManager.systemSettingDisplayInfo) do
  for _, d in ipairs(list) do
    if d.ConvertValue and d.minValue then
      local forDisplay = true
      local v1 = d:ConvertValue(1, forDisplay)
      local step = d.stepSize or 1
      __probe[system .. ":" .. d.setting] = (v1 == (d.minValue + step) and step ~= 1) and "scaled" or ((v1 == d.minValue + 1) and "offset" or "scaled")
    end
  end
end
`, "probe");
const probe = getGlobal("__probe");
for (const sys of Object.values(systems)) {
  for (const s of Object.values(sys.settings)) {
    if (s.convert === "__probe__") s.convert = probe[`${sys.id}:${s.id}`] ?? "scaled";
  }
}

// Preset layouts → list of systems with default anchors/settings
function flattenMap(map) {
  const out = [];
  for (const [sysIdStr, info] of Object.entries(map)) {
    const sysId = Number(sysIdStr);
    const add = (systemIndex, sub) => out.push({
      system: sysId,
      systemIndex,
      anchor: sub.anchorInfo,
      settings: Object.fromEntries(Object.entries(sub.settings ?? {}).map(([k, v]) => [Number(k), v])),
    });
    if (info.settings !== undefined) add(null, info);
    else if (Array.isArray(info)) info.forEach((sub, i) => add(i + 1, sub)); // contiguous 1-based Lua keys became a JS array
    else for (const [idx, sub] of Object.entries(info)) add(Number(idx), sub);
  }
  out.sort((a, b) => a.system - b.system || (a.systemIndex ?? 0) - (b.systemIndex ?? 0));
  return out;
}
const presets = {};
for (const [name, map] of Object.entries(maps)) if (map) presets[name] = flattenMap(map);

const enumsOut = {};
for (const [k, v] of Object.entries(Enum)) if (!k.endsWith("Meta") && (k.startsWith("EditMode") || ["InputDeviceInterfaceType", "FramePoint", "ActionBarOrientation", "ActionBarVisibleSetting", "AuraFrameVisibleSetting", "CooldownViewerVisibleSetting", "RaidGroupDisplayType", "SortPlayersBy", "ViewRaidSize", "ViewArenaSize"].includes(k))) enumsOut[k] = v;

const header = `// AUTO-GENERATED by scripts/gen-schema.mjs — do not edit by hand.
// Source: Blizzard FrameXML (Gethe/wow-ui-source), flavor=${flavor}; strings from Ketho/BlizzardInterfaceResources.
// Regenerate: node scripts/gen-schema.mjs <wow-ui-source> --flavor ${flavor} --strings <enUS.lua>
/* eslint-disable */
`;
const body = `export const Enum = ${JSON.stringify(enumsOut, null, 1)} as const;

export type SettingSchema = {
  id: number; name: string; label?: string; altLabel?: string;
  type?: "dropdown" | "checkbox" | "slider";
  options?: { value: number; label: string }[];
  min?: number; max?: number; step?: number;
  /** raw: stored==displayed; scaled: displayed = min + raw*step; offset: displayed = min + raw */
  convert?: "raw" | "scaled" | "offset";
  percent?: boolean; hideValue?: boolean; minText?: string; maxText?: string;
  composite?: { hundreds: number; tensAndOnes: number };
};
export type SystemSchema = {
  id: number; name: string; label: string;
  /** 1-based Lua systemIndex → name, or null for single-instance systems */
  indices: Record<string, string> | null;
  settings: Record<string, SettingSchema>;
};
export const Systems: Record<string, SystemSchema> = ${JSON.stringify(systems, null, 1)};

export type PresetSystem = {
  system: number; systemIndex: number | null;
  anchor: {
    point: string; relativeTo: string; relativePoint: string; offsetX: number; offsetY: number;
    /** Forever-only hints for the bottom action bar stack (not part of the export string) */
    bottomBarOffsetX?: number; bottomBarExcludeFromStackIncrement?: boolean;
  };
  settings: Record<string, number>;
};
export const Presets: Record<string, PresetSystem[]> = ${JSON.stringify(presets, null, 1)};
`;

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "editmode", "schema.generated.ts");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body);
console.log(`wrote ${path.relative(process.cwd(), outPath)}: ${Object.keys(systems).length} systems, presets: ${Object.keys(presets).join(", ")}`);
