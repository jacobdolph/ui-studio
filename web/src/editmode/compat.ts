/**
 * Cross-client compatibility for Edit Mode strings.
 *
 * Live retail (12.x) and WoW Forever share Enum.EditModeSystem ids 0..25 and, as of the Oct 2026
 * builds, every per-system setting id for those systems (diffed from the two clients'
 * EditModeManagerConstantsDocumentation.lua; the only difference is MicroMenu.EyeSize, which is
 * merely renamed DeprecatedEyeSize in Forever). Forever inserts MainActionBarEndCap=26 and
 * GroupFinder=27 ahead of LossOfControl, which therefore moves from 26 (retail) to 28 (Forever).
 *
 * A retail string imported into Forever unchanged would have its Loss of Control entry read as
 * the End Cap system (and the real Loss of Control frame would fall back to the preset). This
 * module rewrites the id so the string means the same thing in Forever.
 *
 * Retail strings are recognised by their format version: live clients still write version 2,
 * every Forever build writes >= 3.
 */
import type { Layout } from "./layoutString";
import { Enum } from "./schema.generated";

const RETAIL_LOSS_OF_CONTROL = 26;

export interface SystemRemap {
  from: number;
  to: number;
  name: string;
}

/** True when the string's ids are in the live-retail / Classic space rather than Forever's. */
export function isRetailIdSpace(layout: Pick<Layout, "version">): boolean {
  return layout.version <= 2;
}

/** Remaps a retail string's system ids to Forever's. Returns what changed; the layout is edited in place. */
export function remapRetailToForever(layout: Layout): SystemRemap[] {
  if (!isRetailIdSpace(layout)) return [];
  const remaps: SystemRemap[] = [];
  for (const sys of layout.systems) {
    if (sys.system === RETAIL_LOSS_OF_CONTROL) {
      sys.system = Enum.EditModeSystem.LossOfControl;
      remaps.push({ from: RETAIL_LOSS_OF_CONTROL, to: Enum.EditModeSystem.LossOfControl, name: "Loss of Control" });
    }
  }
  return remaps;
}

/** What `remapRetailToForever` would do, without touching the layout (for import previews). */
export function previewRetailRemaps(layout: Layout): SystemRemap[] {
  if (!isRetailIdSpace(layout)) return [];
  return layout.systems
    .filter((s) => s.system === RETAIL_LOSS_OF_CONTROL)
    .map(() => ({ from: RETAIL_LOSS_OF_CONTROL, to: Enum.EditModeSystem.LossOfControl, name: "Loss of Control" }));
}
