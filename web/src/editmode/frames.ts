/**
 * Frame catalog for the visual editor: for every Edit Mode system (and system index) the
 * Blizzard global frame name, a label, a category, and an approximate footprint derived
 * from Blizzard's FrameXML defaults (wow-ui-source `forever` branch, build 70532).
 *
 * Sizes are the Edit Mode selection footprint at scale 1, before the system's own scale
 * setting. They are approximations: Blizzard sizes many of these frames at runtime from
 * live game data (buff counts, raid members, text). The export string is exact regardless
 * of how we draw the frame, so these only affect the canvas preview.
 */
import { Systems, Enum } from "./schema.generated";
import type { SettingPair } from "./layoutString";

export type Category =
  | "Action Bars"
  | "Unit Frames"
  | "HUD"
  | "Auras & Cooldowns"
  | "Chat & Info"
  | "Encounter"
  | "Misc";

export interface Footprint {
  w: number;
  h: number;
  /** Frame scale applied by its size setting (offsets in the string are at scale 1). */
  scale: number;
}

/** Reads a setting's *display* value (what GetSettingValue returns in Lua), or a fallback. */
export type SettingGetter = (settingName: string, fallback: number) => number;

export interface ManagedInfo {
  container: "bottom" | "right" | "player";
  layoutIndex: number;
}

export interface FrameDef {
  key: string;
  system: number;
  systemIndex: number | null;
  /** Global frame name as used in `relativeTo`, or null when the frame is unnamed. */
  frameName: string | null;
  label: string;
  short: string;
  category: Category;
  defaultVisible: boolean;
  /** Frames that Blizzard's managed frame containers position while in default position. */
  managed?: ManagedInfo;
  /** Member of the Forever bottom action bar stack (EditModeUtil.GetBottomActionBars order). */
  bottomStackOrder?: number;
  /** Member of the right action bar column (MultiBarRight, MultiBarLeft). */
  rightStackOrder?: number;
  size: (get: SettingGetter) => Footprint;
}

const S = Enum.EditModeSystem as Record<string, number>;

/** Convert a raw stored value to the display value using the generated schema. */
export function displayNumber(system: number, settingId: number, raw: number): number {
  const s = Systems[String(system)]?.settings[String(settingId)];
  if (!s) return raw;
  if (s.type === "dropdown" || s.type === "checkbox") return raw;
  let v = raw;
  if (s.convert === "scaled") v = (s.min ?? 0) + raw * (s.step ?? 1);
  else if (s.convert === "offset") v = (s.min ?? 0) + raw;
  if (s.min !== undefined && s.max !== undefined && s.convert !== "raw") v = Math.min(Math.max(v, s.min), s.max);
  return v;
}

/** Convert a display value back to the raw stored value. */
export function rawFromDisplay(system: number, settingId: number, display: number): number {
  const s = Systems[String(system)]?.settings[String(settingId)];
  if (!s) return display;
  if (s.type === "dropdown" || s.type === "checkbox") return display;
  if (s.convert === "scaled") return Math.round((display - (s.min ?? 0)) / (s.step ?? 1));
  if (s.convert === "offset") return Math.round(display - (s.min ?? 0));
  return display;
}

export function settingIdByName(system: number, name: string): number | undefined {
  const sys = Systems[String(system)];
  if (!sys) return undefined;
  for (const st of Object.values(sys.settings)) if (st.name === name) return st.id;
  return undefined;
}

export function makeGetter(system: number, settings: SettingPair[]): SettingGetter {
  return (name, fallback) => {
    const id = settingIdByName(system, name);
    if (id === undefined) return fallback;
    const pair = settings.find((p) => p.id === id);
    if (!pair) return fallback;
    return displayNumber(system, id, pair.value);
  };
}

function pct(get: SettingGetter, name: string, fallback = 100): number {
  return get(name, fallback) / 100;
}

/** Grid of `count` cells of `cell` px laid out `rows` deep with `pad` between cells. */
function grid(count: number, rows: number, cell: number, pad: number, horizontal: boolean): { w: number; h: number } {
  const n = Math.max(1, count);
  const r = Math.max(1, Math.min(rows, n));
  const stride = Math.ceil(n / r);
  const actualRows = Math.ceil(n / stride);
  const along = stride * cell + (stride - 1) * pad;
  const across = actualRows * cell + (actualRows - 1) * pad;
  return horizontal ? { w: along, h: across } : { w: across, h: along };
}

function actionBar(index: number): (get: SettingGetter) => Footprint {
  const button = index === 11 || index === 12 || index === 13 ? 30 : 45;
  const defaultIcons = index === 11 ? 6 : index === 12 ? 10 : index === 13 ? 2 : 12;
  return (get) => {
    const horizontal = get("Orientation", 0) === 0;
    const icons = get("NumIcons", defaultIcons);
    const rows = get("NumRows", 1);
    const pad = Math.max(2, get("IconPadding", 2));
    const scale = pct(get, "IconSize");
    // Buttons scale individually; padding is between unscaled containers, so scale only the cells.
    const g = grid(Math.min(icons, defaultIcons === 12 ? 12 : defaultIcons), rows, button * scale, pad, horizontal);
    return { w: g.w, h: g.h, scale: 1 };
  };
}

const fixed = (w: number, h: number, scaleSetting?: string) => (get: SettingGetter): Footprint => ({
  w,
  h,
  scale: scaleSetting ? pct(get, scaleSetting) : 1,
});

const defs: FrameDef[] = [];
function add(def: Omit<FrameDef, "key">): void {
  defs.push({ ...def, key: `${def.system}/${def.systemIndex ?? -1}` });
}

// ---- Action bars (system 0) ---------------------------------------------------------------
const bars: [number, string, string, string, boolean, number | undefined][] = [
  // index, frameName, label, short, visible, bottom stack order
  [1, "MainActionBar", "Action Bar 1", "Bar 1", true, 1],
  [2, "MultiBarBottomLeft", "Action Bar 2", "Bar 2", true, 5],
  [3, "MultiBarBottomRight", "Action Bar 3", "Bar 3", true, 4],
  [4, "MultiBarRight", "Action Bar 4", "Bar 4", true, undefined],
  [5, "MultiBarLeft", "Action Bar 5", "Bar 5", true, undefined],
  [6, "MultiBar5", "Action Bar 6", "Bar 6", false, undefined],
  [7, "MultiBar6", "Action Bar 7", "Bar 7", false, undefined],
  [8, "MultiBar7", "Action Bar 8", "Bar 8", false, undefined],
  [11, "StanceBar", "Stance Bar", "Stance", true, 6],
  [12, "PetActionBar", "Pet Action Bar", "Pet Bar", true, 7],
  [13, "PossessActionBar", "Possess Bar", "Possess", false, 8],
];
for (const [index, frameName, label, short, visible, stack] of bars) {
  add({
    system: S.ActionBar, systemIndex: index, frameName, label, short, category: "Action Bars",
    defaultVisible: visible, bottomStackOrder: stack,
    rightStackOrder: index === 4 ? 1 : index === 5 ? 2 : undefined,
    size: actionBar(index),
  });
}

// ---- Single HUD frames -------------------------------------------------------------------
add({
  system: S.CastBar, systemIndex: null, frameName: "PlayerCastingBarFrame", label: "Cast Bar", short: "Cast Bar",
  category: "HUD", defaultVisible: true, managed: { container: "bottom", layoutIndex: 2 },
  size: (get) => ({ w: 208, h: 22, scale: pct(get, "BarSize") }),
});
add({
  system: S.Minimap, systemIndex: null, frameName: "MinimapCluster", label: "Minimap", short: "Minimap",
  category: "HUD", defaultVisible: true,
  size: (get) => ({ w: 256, h: 256, scale: pct(get, "Size") }),
});

// ---- Unit frames (system 3) --------------------------------------------------------------
const unitScale = (get: SettingGetter) => pct(get, "FrameSize");
add({ system: S.UnitFrame, systemIndex: 1, frameName: "PlayerFrame", label: "Player Frame", short: "Player", category: "Unit Frames", defaultVisible: true,
  size: (get) => ({ w: 232, h: 100, scale: unitScale(get) }) });
add({ system: S.UnitFrame, systemIndex: 2, frameName: "TargetFrame", label: "Target Frame", short: "Target", category: "Unit Frames", defaultVisible: true,
  size: (get) => ({ w: 232, h: 100, scale: unitScale(get) }) });
add({ system: S.UnitFrame, systemIndex: 3, frameName: "FocusFrame", label: "Focus Frame", short: "Focus", category: "Unit Frames", defaultVisible: true,
  size: (get) => ({ w: 232, h: 100, scale: unitScale(get) * (get("UseLargerFrame", 0) ? 1 : 0.75) }) });
add({ system: S.UnitFrame, systemIndex: 4, frameName: "PartyFrame", label: "Party Frames", short: "Party", category: "Unit Frames", defaultVisible: true,
  size: (get) => {
    if (get("UseRaidStylePartyFrames", 0)) {
      const fw = get("FrameWidth", 72), fh = get("FrameHeight", 36);
      const horizontal = !!get("UseHorizontalGroups", 0);
      return horizontal ? { w: fw * 5, h: fh, scale: unitScale(get) } : { w: fw, h: fh * 5, scale: unitScale(get) };
    }
    return { w: 144, h: 4 * 53 + 3 * 8, scale: unitScale(get) };
  } });
add({ system: S.UnitFrame, systemIndex: 5, frameName: "CompactRaidFrameContainer", label: "Raid Frames", short: "Raid", category: "Unit Frames", defaultVisible: false,
  size: (get) => {
    const fw = get("FrameWidth", 72), fh = get("FrameHeight", 36);
    const groups = [2, 5, 8][get("ViewRaidSize", 1)] ?? 5;
    const type = get("RaidGroupDisplayType", 0); // 0/2 vertical groups, 1/3 horizontal groups
    const vertical = type === 0 || type === 2;
    return vertical ? { w: fw * groups, h: fh * 5, scale: unitScale(get) } : { w: fw * 5, h: fh * groups, scale: unitScale(get) };
  } });
add({ system: S.UnitFrame, systemIndex: 6, frameName: "BossTargetFrameContainer", label: "Boss Frames", short: "Boss", category: "Unit Frames", defaultVisible: true,
  managed: { container: "right", layoutIndex: 4 },
  size: (get) => ({ w: 232, h: 5 * 100 + 4 * 10, scale: unitScale(get) * (get("UseLargerFrame", 0) ? 1 : 0.8) }) });
add({ system: S.UnitFrame, systemIndex: 7, frameName: "ArenaEnemyFramesContainer", label: "Arena Frames", short: "Arena", category: "Unit Frames", defaultVisible: false,
  managed: { container: "right", layoutIndex: 12 },
  size: (get) => ({ w: 232, h: 3 * 100, scale: unitScale(get) }) });
add({ system: S.UnitFrame, systemIndex: 8, frameName: "PetFrame", label: "Pet Frame", short: "Pet", category: "Unit Frames", defaultVisible: true,
  managed: { container: "player", layoutIndex: 48 },
  size: (get) => ({ w: 120, h: 49, scale: unitScale(get) }) });

add({ system: S.EncounterBar, systemIndex: null, frameName: "EncounterBar", label: "Encounter Bar", short: "Encounter Bar", category: "Encounter", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 6 }, size: fixed(250, 30) });
add({ system: S.ExtraAbilities, systemIndex: null, frameName: "ExtraAbilityContainer", label: "Extra Abilities", short: "Extra Ability", category: "HUD", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 15 }, size: fixed(76, 76) });

// ---- Aura frames (system 6) --------------------------------------------------------------
function auraSize(limitSetting: string, defaultLimit: number, rows: number) {
  return (get: SettingGetter): Footprint => {
    const horizontal = get("Orientation", 0) === 0;
    const limit = get(limitSetting, defaultLimit);
    const scale = pct(get, "IconSize");
    const pad = get("IconPadding", 5);
    const g = grid(limit * rows, rows, 30 * scale, pad, horizontal);
    return { w: g.w + (horizontal ? 15 : 0), h: g.h + (horizontal ? 0 : 15), scale: 1 };
  };
}
add({ system: S.AuraFrame, systemIndex: 1, frameName: "BuffFrame", label: "Buffs", short: "Buffs", category: "Auras & Cooldowns", defaultVisible: true, size: auraSize("IconLimitBuffFrame", 11, 2) });
add({ system: S.AuraFrame, systemIndex: 2, frameName: "DebuffFrame", label: "Debuffs", short: "Debuffs", category: "Auras & Cooldowns", defaultVisible: true, size: auraSize("IconLimitDebuffFrame", 8, 1) });
add({ system: S.AuraFrame, systemIndex: 3, frameName: "ExternalDefensivesFrame", label: "External Defensives", short: "Ext. Defensives", category: "Auras & Cooldowns", defaultVisible: false, size: auraSize("IconLimitBuffFrame", 4, 1) });

add({ system: S.TalkingHeadFrame, systemIndex: null, frameName: "TalkingHeadFrame", label: "Talking Head", short: "Talking Head", category: "Misc", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 8 }, size: fixed(570, 155) });
add({ system: S.ChatFrame, systemIndex: null, frameName: "ChatFrame1", label: "Chat Frame", short: "Chat", category: "Chat & Info", defaultVisible: true,
  size: (get) => {
    const w = get("WidthHundreds", 4) * 100 + get("WidthTensAndOnes", 30);
    const h = get("HeightHundreds", 1) * 100 + get("HeightTensAndOnes", 20);
    return { w, h: h + 30, scale: 1 };
  } });
add({ system: S.VehicleLeaveButton, systemIndex: null, frameName: "MainMenuBarVehicleLeaveButton", label: "Vehicle Leave Button", short: "Leave Vehicle", category: "Misc", defaultVisible: false,
  bottomStackOrder: 9, size: fixed(32, 32) });
add({ system: S.LootFrame, systemIndex: null, frameName: "LootFrame", label: "Loot Window", short: "Loot", category: "Misc", defaultVisible: false, size: fixed(220, 290) });
add({ system: S.HudTooltip, systemIndex: null, frameName: "GameTooltipDefaultContainer", label: "Tooltip", short: "Tooltip", category: "Chat & Info", defaultVisible: true, size: fixed(250, 150) });
add({ system: S.ObjectiveTracker, systemIndex: null, frameName: "ObjectiveTrackerFrame", label: "Objective Tracker", short: "Objectives", category: "Chat & Info", defaultVisible: true,
  managed: { container: "right", layoutIndex: 50 },
  size: (get) => ({ w: 260, h: get("Height", 600), scale: 1 }) });
add({ system: S.MicroMenu, systemIndex: null, frameName: "MicroMenuContainer", label: "Micro Menu", short: "Micro Menu", category: "HUD", defaultVisible: true,
  size: (get) => {
    const horizontal = get("Orientation", 0) === 0;
    const n = 14, bw = 32, bh = 40, pad = -5;
    const w = horizontal ? n * bw + (n - 1) * pad : bw;
    const h = horizontal ? bh : n * bh + (n - 1) * pad;
    return { w, h, scale: pct(get, "Size") };
  } });
add({ system: S.Bags, systemIndex: null, frameName: "BagsBar", label: "Bags", short: "Bags", category: "HUD", defaultVisible: true,
  size: (get) => {
    // 7 slots (backpack, 4 bags, keyring, reagent) of 45 with bagPadding 2. Together with the
    // 562-wide main bar and 383-wide micro menu this centers the preset's 116.5 micro menu offset.
    const horizontal = get("Orientation", 0) === 0;
    const n = 7, pad = get("BagSlotPadding", 2);
    const w = n * 45 + (n - 1) * pad, h = 45;
    return horizontal ? { w, h, scale: pct(get, "Size") } : { w: h, h: w, scale: pct(get, "Size") };
  } });
add({ system: S.StatusTrackingBar, systemIndex: 1, frameName: "MainStatusTrackingBarContainer", label: "Experience Bar", short: "XP Bar", category: "HUD", defaultVisible: true,
  bottomStackOrder: 3, size: (get) => ({ w: 1192, h: 17, scale: pct(get, "Size") }) });
add({ system: S.StatusTrackingBar, systemIndex: 2, frameName: "SecondaryStatusTrackingBarContainer", label: "Reputation Bar", short: "Rep Bar", category: "HUD", defaultVisible: false,
  bottomStackOrder: 2, size: (get) => ({ w: 1192, h: 17, scale: pct(get, "Size") }) });
add({ system: S.DurabilityFrame, systemIndex: null, frameName: "DurabilityFrame", label: "Durability", short: "Durability", category: "Misc", defaultVisible: false,
  managed: { container: "right", layoutIndex: 9 }, size: fixed(60, 75, "Size") });
add({ system: S.TimerBars, systemIndex: null, frameName: "MirrorTimerContainer", label: "Timer Bars", short: "Timers", category: "Misc", defaultVisible: false, size: fixed(206, 26, "Size") });
add({ system: S.VehicleSeatIndicator, systemIndex: null, frameName: "VehicleSeatIndicator", label: "Vehicle Seats", short: "Vehicle Seats", category: "Misc", defaultVisible: false,
  managed: { container: "right", layoutIndex: 3 }, size: fixed(128, 128, "Size") });
add({ system: S.ArchaeologyBar, systemIndex: null, frameName: "ArcheologyDigsiteProgressBar", label: "Archaeology Bar", short: "Archaeology", category: "Misc", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 7 }, size: fixed(200, 30, "Size") });

// ---- Cooldown viewers (system 20) --------------------------------------------------------
/**
 * The game sizes a cooldown viewer by how many cooldowns the spec actually has (at least 2) and
 * wraps rows at IconLimit, so the limit is a stride, not a count. We assume a typical spec
 * (`typicalCount` icons) to draw a footprint; the real width varies per spec.
 */
function cooldownIcons(icon: number, typicalCount: number, layoutIndex: number, useLimit = true) {
  return (get: SettingGetter): Footprint => {
    const horizontal = get("Orientation", 0) === 0;
    const limit = useLimit ? Math.max(1, get("IconLimit", typicalCount)) : typicalCount;
    const rows = Math.ceil(typicalCount / Math.min(limit, typicalCount));
    const scale = pct(get, "IconSize");
    const pad = get("IconPadding", 2);
    const g = grid(typicalCount, rows, icon * scale, pad, horizontal);
    void layoutIndex;
    return { w: g.w, h: g.h, scale: 1 };
  };
}
add({ system: S.CooldownViewer, systemIndex: 1, frameName: "EssentialCooldownViewer", label: "Essential Cooldowns", short: "Essential CDs", category: "Auras & Cooldowns", defaultVisible: true,
  managed: { container: "bottom", layoutIndex: 13 }, size: cooldownIcons(50, 8, 13) });
add({ system: S.CooldownViewer, systemIndex: 2, frameName: "UtilityCooldownViewer", label: "Utility Cooldowns", short: "Utility CDs", category: "Auras & Cooldowns", defaultVisible: true,
  managed: { container: "bottom", layoutIndex: 14 }, size: cooldownIcons(30, 8, 14) });
add({ system: S.CooldownViewer, systemIndex: 3, frameName: "BuffIconCooldownViewer", label: "Tracked Buffs (Icons)", short: "Buff Icons", category: "Auras & Cooldowns", defaultVisible: true,
  // Tracked buffs only show while active, so in Edit Mode the game draws the 2-item minimum. Its
  // settings panel has no Icon Limit control, so a stored limit is ignored.
  managed: { container: "bottom", layoutIndex: 12 }, size: cooldownIcons(40, 2, 12, false) });
add({ system: S.CooldownViewer, systemIndex: 4, frameName: "BuffBarCooldownViewer", label: "Tracked Buffs (Bars)", short: "Buff Bars", category: "Auras & Cooldowns", defaultVisible: true,
  size: (get) => ({ w: 220 * pct(get, "BarWidthScale"), h: 3 * 30 + 2 * get("IconPadding", 2), scale: pct(get, "IconSize") }) });

add({ system: S.PersonalResourceDisplay, systemIndex: null, frameName: "PersonalResourceDisplayFrame", label: "Personal Resource Display", short: "Resource Display", category: "Unit Frames", defaultVisible: true,
  size: (get) => ({ w: 200 * pct(get, "BarWidth"), h: get("HealthBarHeight", 20) + get("PowerBarHeight", 15) + get("Padding", 2) + 20, scale: pct(get, "Size") }) });

// ---- Encounter events (system 22) --------------------------------------------------------
add({ system: S.EncounterEvents, systemIndex: 1, frameName: "EncounterTimeline", label: "Encounter Timeline", short: "Timeline", category: "Encounter", defaultVisible: true,
  size: (get) => ({ w: 300 * pct(get, "BarWidth"), h: 60, scale: pct(get, "OverallSize") }) });
add({ system: S.EncounterEvents, systemIndex: 2, frameName: "CriticalEncounterWarnings", label: "Critical Warnings", short: "Critical Warnings", category: "Encounter", defaultVisible: true, size: fixed(600, 48, "OverallSize") });
add({ system: S.EncounterEvents, systemIndex: 3, frameName: "MediumEncounterWarnings", label: "Medium Warnings", short: "Medium Warnings", category: "Encounter", defaultVisible: false, size: fixed(550, 36, "OverallSize") });
add({ system: S.EncounterEvents, systemIndex: 4, frameName: "MinorEncounterWarnings", label: "Minor Warnings", short: "Minor Warnings", category: "Encounter", defaultVisible: false, size: fixed(500, 36, "OverallSize") });

add({ system: S.DamageMeter, systemIndex: null, frameName: "DamageMeter", label: "Damage Meter", short: "Damage Meter", category: "Chat & Info", defaultVisible: true,
  size: (get) => ({ w: get("FrameWidth", 400), h: get("FrameHeight", 200), scale: 1 }) });
add({ system: S.RaidWarning, systemIndex: null, frameName: "RaidWarningFrame", label: "Raid Warnings", short: "Raid Warning", category: "Encounter", defaultVisible: false, size: fixed(800, 100) });
add({ system: S.TotemActionBar, systemIndex: null, frameName: "MultiCastActionBarFrame", label: "Totem Bar", short: "Totems", category: "Action Bars", defaultVisible: false,
  bottomStackOrder: 10, size: fixed(230, 38) });
add({ system: S.MainActionBarEndCap, systemIndex: 1, frameName: null, label: "Left End Cap", short: "Gryphon L", category: "HUD", defaultVisible: true, size: fixed(154, 95) });
add({ system: S.MainActionBarEndCap, systemIndex: 2, frameName: null, label: "Right End Cap", short: "Gryphon R", category: "HUD", defaultVisible: true, size: fixed(154, 95) });
add({ system: S.GroupFinder, systemIndex: null, frameName: "QueueStatusButton", label: "Group Finder Eye", short: "Eye", category: "HUD", defaultVisible: true, size: fixed(45, 45, "Size") });
add({ system: S.LossOfControl, systemIndex: null, frameName: "LossOfControlFrame", label: "Loss of Control", short: "Loss of Control", category: "Encounter", defaultVisible: false, size: fixed(256, 58, "Size") });
add({ system: S.SwingTimer, systemIndex: 1, frameName: "SwingTimerMainHandFrame", label: "Swing Timer (Main Hand)", short: "Swing MH", category: "HUD", defaultVisible: true,
  managed: { container: "bottom", layoutIndex: 9 }, size: (get) => ({ w: get("Width", 213), h: get("Height", 15), scale: pct(get, "Scale") }) });
add({ system: S.SwingTimer, systemIndex: 2, frameName: "SwingTimerOffHandFrame", label: "Swing Timer (Off Hand)", short: "Swing OH", category: "HUD", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 10 }, size: (get) => ({ w: get("Width", 213), h: get("Height", 15), scale: pct(get, "Scale") }) });
add({ system: S.SwingTimer, systemIndex: 3, frameName: "SwingTimerRangedFrame", label: "Swing Timer (Ranged)", short: "Swing Ranged", category: "HUD", defaultVisible: false,
  managed: { container: "bottom", layoutIndex: 11 }, size: (get) => ({ w: get("Width", 213), h: get("Height", 15), scale: pct(get, "Scale") }) });
add({ system: S.GamepadMainActionBar, systemIndex: null, frameName: "GamepadMainActionBarFrame", label: "Gamepad Action Bar", short: "Gamepad Bar", category: "Action Bars", defaultVisible: false, size: fixed(656, 202) });

export const FRAMES: readonly FrameDef[] = defs;

const byKey = new Map(defs.map((d) => [d.key, d]));
const byName = new Map(defs.filter((d) => d.frameName).map((d) => [d.frameName as string, d]));

export function frameKey(system: number, systemIndex: number | null): string {
  return `${system}/${systemIndex ?? -1}`;
}
export function frameDef(system: number, systemIndex: number | null): FrameDef | undefined {
  return byKey.get(frameKey(system, systemIndex));
}
export function frameDefByName(name: string): FrameDef | undefined {
  return byName.get(name);
}

export const CATEGORIES: Category[] = ["Action Bars", "Unit Frames", "HUD", "Auras & Cooldowns", "Chat & Info", "Encounter", "Misc"];
