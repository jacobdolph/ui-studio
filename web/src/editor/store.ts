/**
 * Editor state: the layout being edited plus view options, with undo/redo and localStorage
 * persistence. Pure reducer so it is easy to test.
 */
import {
  type Anchor, type AnchorPoint, type Layout, type LayoutSystem,
  createLayout, decodeLayoutString, encodeLayoutString, setSetting,
} from "../editmode/layoutString";
import { Presets, type PresetSystem } from "../editmode/schema.generated";
import { FRAMES, frameDef, frameKey } from "../editmode/frames";
import { type Rect, type Screen, anchorFromRect, computeRects, round1 } from "./geometry";

export interface ScreenPreset {
  id: string;
  label: string;
  pixelWidth: number;
  pixelHeight: number;
}

/**
 * UIParent is 768 / uiScale units tall. With "Use UI Scale" off the client picks
 * 768 / screenHeight clamped to [0.64, 1], so 1080p is a 1920x1080 UIParent and
 * 1440p is clamped to 0.64 (2133x1200).
 */
export const SCREEN_PRESETS: ScreenPreset[] = [
  { id: "1080p", label: "1920 × 1080 (16:9)", pixelWidth: 1920, pixelHeight: 1080 },
  { id: "1200p", label: "1920 × 1200 (16:10)", pixelWidth: 1920, pixelHeight: 1200 },
  { id: "1440p", label: "2560 × 1440 (16:9)", pixelWidth: 2560, pixelHeight: 1440 },
  { id: "uw1440", label: "3440 × 1440 (21:9)", pixelWidth: 3440, pixelHeight: 1440 },
  { id: "4k", label: "3840 × 2160 (16:9)", pixelWidth: 3840, pixelHeight: 2160 },
  { id: "suw", label: "5120 × 1440 (32:9)", pixelWidth: 5120, pixelHeight: 1440 },
  { id: "steamdeck", label: "1280 × 800 (Steam Deck)", pixelWidth: 1280, pixelHeight: 800 },
];

export function defaultUiScale(pixelHeight: number): number {
  return Math.min(1, Math.max(0.64, 768 / pixelHeight));
}

export function uiParentSize(preset: ScreenPreset, uiScale: number): Screen {
  const height = 768 / uiScale;
  return { width: round1((preset.pixelWidth / preset.pixelHeight) * height), height: round1(height) };
}

export interface EditorState {
  name: string;
  presetName: string;
  screenId: string;
  /** null = client default for the resolution */
  uiScale: number | null;
  layout: Layout;
  visible: Record<string, boolean>;
  selected: string | null;
  showGrid: boolean;
  gridSize: number;
  snap: boolean;
  past: Layout[];
  future: Layout[];
  dirty: boolean;
}

export type Action =
  | { type: "select"; key: string | null }
  | { type: "move"; key: string; rect: Rect; screen: Screen }
  | { type: "nudge"; key: string; dx: number; dy: number; screen: Screen }
  | { type: "setAnchor"; key: string; anchor: Partial<Anchor> }
  | { type: "resetPosition"; key: string }
  | { type: "setSetting"; key: string; settingId: number; raw: number }
  | { type: "toggleVisible"; key: string; visible?: boolean }
  | { type: "setAllVisible"; visible: boolean }
  | { type: "loadPreset"; preset: string }
  | { type: "importString"; text: string; name?: string }
  | { type: "setName"; name: string }
  | { type: "setScreen"; screenId: string }
  | { type: "setUiScale"; uiScale: number | null }
  | { type: "setInterfaceStyle"; style: number }
  | { type: "toggleGrid" }
  | { type: "setGridSize"; size: number }
  | { type: "toggleSnap" }
  | { type: "undo" }
  | { type: "redo" };

export function layoutFromPreset(preset: string): Layout {
  const systems = Presets[preset] ?? Presets.Modern;
  return createLayout(systems.map(presetToSystem), { version: 5, interfaceStyle: preset === "Gamepad" ? 1 : 0 });
}

function presetToSystem(p: PresetSystem): LayoutSystem {
  return {
    system: p.system,
    systemIndex: p.systemIndex,
    isInDefaultPosition: true,
    anchor: {
      point: p.anchor.point as AnchorPoint,
      relativeTo: p.anchor.relativeTo,
      relativePoint: p.anchor.relativePoint as AnchorPoint,
      offsetX: p.anchor.offsetX,
      offsetY: p.anchor.offsetY,
    },
    anchor2: null,
    settings: Object.entries(p.settings)
      .map(([id, value]) => ({ id: Number(id), value }))
      .sort((a, b) => a.id - b.id),
  };
}

export function presetAnchor(preset: string, system: number, systemIndex: number | null): Anchor | undefined {
  const p = (Presets[preset] ?? Presets.Modern).find((x) => x.system === system && x.systemIndex === systemIndex);
  if (!p) return undefined;
  return {
    point: p.anchor.point as AnchorPoint,
    relativeTo: p.anchor.relativeTo,
    relativePoint: p.anchor.relativePoint as AnchorPoint,
    offsetX: p.anchor.offsetX,
    offsetY: p.anchor.offsetY,
  };
}

export function defaultVisibility(): Record<string, boolean> {
  const v: Record<string, boolean> = {};
  for (const f of FRAMES) v[f.key] = f.defaultVisible;
  return v;
}

export function initialState(): EditorState {
  return {
    name: "My Layout",
    presetName: "Modern",
    screenId: "1080p",
    uiScale: null,
    layout: layoutFromPreset("Modern"),
    visible: defaultVisibility(),
    selected: null,
    showGrid: false,
    gridSize: 10,
    snap: false,
    past: [],
    future: [],
    dirty: false,
  };
}

export function currentScreen(state: EditorState): Screen {
  const preset = SCREEN_PRESETS.find((s) => s.id === state.screenId) ?? SCREEN_PRESETS[0];
  return uiParentSize(preset, state.uiScale ?? defaultUiScale(preset.pixelHeight));
}

function cloneLayout(layout: Layout): Layout {
  return structuredClone(layout);
}

function findSystem(layout: Layout, key: string): LayoutSystem | undefined {
  return layout.systems.find((s) => frameKey(s.system, s.systemIndex) === key);
}

const HISTORY_LIMIT = 100;

function commit(state: EditorState, layout: Layout): EditorState {
  return {
    ...state,
    layout,
    past: [...state.past.slice(-HISTORY_LIMIT + 1), state.layout],
    future: [],
    dirty: true,
  };
}

function detachAnchor(sys: LayoutSystem): void {
  sys.anchor2 = null;
  if (sys.raw) {
    delete sys.raw.offsetX;
    delete sys.raw.offsetY;
    delete sys.raw.anchor2OffsetX;
    delete sys.raw.anchor2OffsetY;
  }
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.key };

    case "move": {
      const layout = cloneLayout(state.layout);
      const sys = findSystem(layout, action.key);
      if (!sys) return state;
      sys.anchor = anchorFromRect(action.rect, action.screen);
      sys.isInDefaultPosition = false;
      detachAnchor(sys);
      return commit(state, layout);
    }

    case "nudge": {
      const rects = computeRects(state.layout, action.screen, { isShown: (k) => state.visible[k] ?? true });
      const placed = rects.get(action.key);
      if (!placed) return state;
      const rect = { ...placed.rect, left: placed.rect.left + action.dx, bottom: placed.rect.bottom + action.dy };
      return reducer(state, { type: "move", key: action.key, rect, screen: action.screen });
    }

    case "setAnchor": {
      const layout = cloneLayout(state.layout);
      const sys = findSystem(layout, action.key);
      if (!sys) return state;
      sys.anchor = { ...sys.anchor, ...action.anchor };
      sys.anchor.offsetX = round1(sys.anchor.offsetX);
      sys.anchor.offsetY = round1(sys.anchor.offsetY);
      sys.isInDefaultPosition = false;
      detachAnchor(sys);
      return commit(state, layout);
    }

    case "resetPosition": {
      const layout = cloneLayout(state.layout);
      const sys = findSystem(layout, action.key);
      if (!sys) return state;
      const anchor = presetAnchor(state.presetName, sys.system, sys.systemIndex);
      if (anchor) sys.anchor = anchor;
      sys.isInDefaultPosition = true;
      detachAnchor(sys);
      return commit(state, layout);
    }

    case "setSetting": {
      const layout = cloneLayout(state.layout);
      const sys = findSystem(layout, action.key);
      if (!sys) return state;
      setSetting(sys, action.settingId, action.raw);
      return commit(state, layout);
    }

    case "toggleVisible":
      return { ...state, visible: { ...state.visible, [action.key]: action.visible ?? !(state.visible[action.key] ?? true) } };

    case "setAllVisible": {
      const visible: Record<string, boolean> = {};
      for (const f of FRAMES) visible[f.key] = action.visible;
      return { ...state, visible };
    }

    case "loadPreset":
      return {
        ...commit(state, layoutFromPreset(action.preset)),
        presetName: action.preset,
        selected: null,
        visible: action.preset === "Gamepad" ? { ...defaultVisibility(), [frameKey(30, null)]: true } : defaultVisibility(),
      };

    case "importString": {
      const layout = decodeLayoutString(action.text);
      // Always export as a WoW Forever string.
      layout.version = Math.max(layout.version, 5);
      layout.headerKind = "style";
      layout.grammar = "modern";
      if (layout.interfaceStyle === null) layout.interfaceStyle = 0;
      return { ...commit(state, layout), selected: null, name: action.name ?? state.name };
    }

    case "setName":
      return { ...state, name: action.name, dirty: true };
    case "setScreen":
      return { ...state, screenId: action.screenId };
    case "setUiScale":
      return { ...state, uiScale: action.uiScale };
    case "setInterfaceStyle": {
      const layout = cloneLayout(state.layout);
      layout.interfaceStyle = action.style;
      return commit(state, layout);
    }
    case "toggleGrid":
      return { ...state, showGrid: !state.showGrid };
    case "setGridSize":
      return { ...state, gridSize: action.size };
    case "toggleSnap":
      return { ...state, snap: !state.snap };

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { ...state, layout: prev, past: state.past.slice(0, -1), future: [state.layout, ...state.future], dirty: true };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, layout: next, past: [...state.past, state.layout], future: state.future.slice(1), dirty: true };
    }
  }
}

export function exportString(state: EditorState): string {
  return encodeLayoutString(state.layout, { headerKind: "style" });
}

// ---- persistence ----------------------------------------------------------------------------
const STORAGE_KEY = "uistudio.editor.v1";

interface Persisted {
  name: string;
  presetName: string;
  screenId: string;
  uiScale: number | null;
  layout: Layout;
  visible: Record<string, boolean>;
  showGrid: boolean;
  gridSize: number;
  snap: boolean;
}

export function saveState(state: EditorState): void {
  try {
    const data: Persisted = {
      name: state.name, presetName: state.presetName, screenId: state.screenId, uiScale: state.uiScale,
      layout: state.layout, visible: state.visible, showGrid: state.showGrid, gridSize: state.gridSize, snap: state.snap,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode etc.)
  }
}

export function loadState(): EditorState {
  const base = initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Persisted>;
    if (!data.layout || !Array.isArray(data.layout.systems)) return base;
    return {
      ...base,
      name: data.name ?? base.name,
      presetName: data.presetName ?? base.presetName,
      screenId: SCREEN_PRESETS.some((s) => s.id === data.screenId) ? (data.screenId as string) : base.screenId,
      uiScale: data.uiScale ?? null,
      layout: data.layout,
      visible: { ...base.visible, ...(data.visible ?? {}) },
      showGrid: data.showGrid ?? false,
      gridSize: data.gridSize ?? 10,
      snap: data.snap ?? false,
    };
  } catch {
    return base;
  }
}

/** Human label for a system key, e.g. "Action Bar 2". */
export function labelFor(key: string): string {
  const [s, i] = key.split("/").map(Number);
  return frameDef(s, i === -1 ? null : i)?.label ?? `System ${key}`;
}
