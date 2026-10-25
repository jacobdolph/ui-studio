# Blizzard Edit Mode layout string format

What `C_EditMode.ConvertLayoutInfoToString` writes and `C_EditMode.ConvertStringToLayoutInfo` reads. Blizzard does not document it; this is derived from 570 real exports on wago.io (Oct 2022 – Oct 2026, every version 0–5) cross-checked against FrameXML in [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source) (branch `forever`, 1.60.1 build 70532, and `live`, 12.1.5). Implementation: `src/editmode/layoutString.ts`. Every one of the 570 strings round-trips byte-for-byte (`npm run eval`).

## Grammar

All tokens are separated by single spaces.

```
layout  := header system*
header  := <version> <numSystems>                      -- versions 0–3
         | <version> <interfaceStyle> <numSystems>     -- version >= 4 (WoW Forever); 0 = Mkb, 1 = Gamepad
         | <version> <numSystems> <numSystems>         -- live retail 12.1.x and Mists Classic clients since ~Oct 2026
system  := <system> <systemIndex> <isInDefaultPosition> <anchor> ( "-1" | <anchor> ) <settings>
anchor  := <point> <relativePoint> <relativeTo> <offsetX> <offsetY>
```

| Field | Meaning |
| --- | --- |
| `version` | Format/enum generation. 0 = Dragonflight 10.0 (Nov 2022), 1 = 10.2 (Nov 2023), 2 = 11.x/12.x live and Classic (Nov 2025 →), 3/4/5 = WoW Forever beta builds (Sep → Oct 2026). Live 12.1.5 still writes 2. |
| `interfaceStyle` | `Enum.InputDeviceInterfaceType`, new in Forever. The game keeps separate Mkb and Gamepad presets and filters the layout dropdown by the active style. |
| `system` | `Enum.EditModeSystem`. **Forever's enum differs from live from id 26 up** (see below). |
| `systemIndex` | 0-based in the string; Lua `Enum.EditMode<System>SystemIndices` is 1-based. `-1` for single-instance systems (Minimap, Chat, …). Action bars: 0–7 = bars 1–8, 10/11/12 = Stance/Pet/Possess (indices 8, 9 are unused). |
| `isInDefaultPosition` | 0/1. When 1 the client re-derives the position from the preset/frame manager and ignores the anchor for managed frames (bottom action bar stack, right-side containers). |
| `point`, `relativePoint` | Anchor point index in **this** order (not `Enum.FramePoint`): 0 TOPLEFT, 1 TOP, 2 TOPRIGHT, 3 LEFT, 4 CENTER, 5 RIGHT, 6 BOTTOMLEFT, 7 BOTTOM, 8 BOTTOMRIGHT. |
| `relativeTo` | Global frame name (`UIParent`, `MicroMenuContainer`, `CompactRaidFrameManager`, …). 58 distinct names in the corpus. |
| `offsetX/Y` | Always one decimal place (`-365.5`, `0.0`, `-0.0`). Offsets are stored at scale 1.0 (the Lua multiplies by frame scale before saving). +Y is up. |
| second anchor | `-1` when absent (every string in the corpus). Otherwise five more anchor tokens; Blizzard stores it as `anchorInfo2`. |
| `settings` | `#` when empty, otherwise a run of character pairs, see below. |

Layout **name** and **layoutType** are not in the string; the import dialog forces you to type a name.

### Settings blob

Each pair is `chr(35 + settingId) chr(35 + digit)`; ids come from the per-system `Enum.EditMode<System>Setting`. Values are stored **raw** (slider steps from the minimum, e.g. Icon Size raw 5 = 100% because `min 50 + 5 × step 10`), exactly like the `settings` table the Lua side sees. Pairs are sorted by id.

A value ≥ 90 is written as **little-endian base-90 digits, one pair per digit, repeating the id**. Opacity 100 is `7-7$` = (20,10)(20,1) = 10 + 1×90. Swing Timer width 213 is `&D&%` = 33 + 2×90. This is why the same id appears twice in a row in most modern strings; Blizzard's chat frame width/height are additionally split into separate hundreds and tens-and-ones settings, a leftover from before multi-digit values existed. Very old (2022) strings contain single raw bytes ≥ 127 for such values instead; the codec tolerates them.

### Variants worth knowing

- **2022 beta (`5 26 …`)**: six wago strings from the Dragonflight beta use first token 5, but with field order `system systemIndex anchor flag settings` and no second-anchor slot. Decoded for completeness, never emitted. Detected by the second header token not being 0/1.
- **Duplicated count (`2 52 52 …`)**: twelve strings exported 8–21 Oct 2026 from live retail and Mists Classic repeat the system count. Presumably the shared C++ writer gained the third header field for Forever's `interfaceStyle` and live fills it with the count. Decoded and re-encoded as-is.
- wago.io stores some strings as a JSON array of lines and escapes `\` (value 57) as `\\`; that is an artifact of the site, not the game.

## WoW Forever vs. live retail

The Forever client (game type `camelot`) is ahead of live 12.1.5 for Edit Mode:

| id | live 12.1.5 | Forever 1.60.1 |
| --- | --- | --- |
| 24 | RaidWarning | RaidWarning |
| 25 | TotemActionBar | TotemActionBar |
| 26 | LossOfControl | **MainActionBarEndCap** (indices 1 Left, 2 Right) |
| 27 | — | **GroupFinder** |
| 28 | — | **LossOfControl** |
| 29 | — | **SwingTimer** (indices 1 MainHand, 2 OffHand, 3 Ranged) |
| 30 | — | **GamepadMainActionBar** |

Consequences for UI Studio:

- A live string (version 2) with system 26 would be read by Forever as an end cap. We should treat versions < 3 as "import with ID remapping", not pass-through. The version number is what Blizzard's importer presumably keys migrations on, so **always emit version 5 with the style header** for Forever.
- Forever exports contain 59 systems (the whole Modern preset), including the Classic-only Totem bar and swing timers. Micro Menu lost its Eye Size setting (`DeprecatedEyeSize`); the Group Finder eye became its own system. The default main action bar is anchored `BOTTOMRIGHT → MicroMenuContainer.BOTTOMLEFT (-4.5, -4)`, not to UIParent.
- The schema in `src/editmode/schema.generated.ts` (systems, setting ids, slider min/max/step, dropdown labels, Modern/Classic/Gamepad preset anchors and defaults) is generated by executing Blizzard's own Lua with fengari, so a new Forever build is a re-run of `npm run gen:schema`, not a retyping job.

## Open questions (need the Forever client)

1. Does `ConvertStringToLayoutInfo` accept a version 5 string we built from scratch (not a re-export)? We follow the observed format exactly, but import-side validation is unknown.
2. How strictly does the importer treat missing systems? Exports always carry all 59; the Lua `ReconcileWithModern` fills gaps for saved layouts, and we assume the same for imports. Safer to always emit the full Modern set.
3. Whether raw values above what the slider allows are clamped or rejected (the Lua clamps for display only).
4. Round-trip of a Gamepad-style layout (`interfaceStyle` 1) — no wago sample exists yet.
