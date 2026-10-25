/**
 * Human-readable helpers on top of the raw codec: system/setting names, display values,
 * and frame names, driven by the generated schema (WoW Forever enum IDs).
 */
import { Systems, Presets, type SettingSchema, type SystemSchema } from "./schema.generated";
import type { Layout, LayoutSystem } from "./layoutString";

export function systemSchema(system: number): SystemSchema | undefined {
  return Systems[String(system)];
}

/** "Action Bar 2", "Player Frame", "Minimap" … */
export function systemLabel(sys: Pick<LayoutSystem, "system" | "systemIndex">): string {
  const schema = systemSchema(sys.system);
  if (!schema) return `Unknown system ${sys.system}${sys.systemIndex ? ` #${sys.systemIndex}` : ""}`;
  if (sys.systemIndex === null || !schema.indices) return schema.label.includes("%d") ? schema.label.replace("%d", "") .trim() : schema.label;
  const indexName = schema.indices[String(sys.systemIndex)];
  if (!indexName) return `${schema.name} #${sys.systemIndex}`;
  const pretty = indexName.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
  if (schema.label.includes("%d")) {
    const m = indexName.match(/(\d+)$/);
    if (m) return schema.label.replace("%d", m[1]);
    if (indexName === "MainBar") return schema.label.replace("%d", "1");
    return pretty;
  }
  return pretty;
}

export function settingSchema(system: number, settingId: number): SettingSchema | undefined {
  return systemSchema(system)?.settings[String(settingId)];
}

/** Convert a raw stored value to what the Edit Mode UI shows (percent, px, option label…). */
export function displayValue(system: number, settingId: number, raw: number): string {
  const s = settingSchema(system, settingId);
  if (!s) return String(raw);
  if (s.type === "dropdown" && s.options) return s.options.find((o) => o.value === raw)?.label ?? String(raw);
  if (s.type === "checkbox") return raw === 1 ? "on" : "off";
  let v = raw;
  if (s.convert === "scaled") v = (s.min ?? 0) + raw * (s.step ?? 1);
  else if (s.convert === "offset") v = (s.min ?? 0) + raw;
  if (s.min !== undefined && s.max !== undefined && s.convert !== "raw") v = Math.min(Math.max(v, s.min), s.max);
  return s.percent ? `${v}%` : String(v);
}

export interface DescribedSetting { id: number; name: string; label: string; raw: number; display: string; known: boolean }

export function describeSettings(sys: LayoutSystem): DescribedSetting[] {
  const schema = systemSchema(sys.system);
  return sys.settings.map((p) => {
    const s = schema?.settings[String(p.id)];
    return {
      id: p.id,
      name: s?.name ?? `setting${p.id}`,
      label: s?.label ?? s?.name ?? `Setting ${p.id}`,
      raw: p.value,
      display: displayValue(sys.system, p.id, p.value),
      known: !!s,
    };
  });
}

/** Systems/indices that exist in the Forever client (from the Modern preset). */
export function knownSystemKeys(): Set<string> {
  return new Set(Presets.Modern.map((p) => `${p.system}/${p.systemIndex ?? -1}`));
}

export interface LayoutSummary {
  version: number; interfaceStyle: number | null; headerKind: string; systems: number;
  unknownSystems: string[]; unknownSettings: string[]; warnings: string[];
}

export function summarize(layout: Layout): LayoutSummary {
  const known = knownSystemKeys();
  const unknownSystems: string[] = [];
  const unknownSettings: string[] = [];
  for (const s of layout.systems) {
    const key = `${s.system}/${s.systemIndex ?? -1}`;
    if (!known.has(key)) unknownSystems.push(key);
    const schema = systemSchema(s.system);
    for (const p of s.settings) if (schema && !schema.settings[String(p.id)]) unknownSettings.push(`${key}:${p.id}`);
  }
  return {
    version: layout.version, interfaceStyle: layout.interfaceStyle, headerKind: layout.headerKind,
    systems: layout.systems.length, unknownSystems, unknownSettings, warnings: layout.warnings,
  };
}
